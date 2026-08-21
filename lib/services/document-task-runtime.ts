import type { DocumentTaskPriority, DocumentTaskStatus } from "@/lib/services/document-task-service";

export interface DocumentTaskRuntimeJob {
  taskId: string;
  runId: string;
  priority: DocumentTaskPriority;
  createdAt: string;
  run: (input: { signal: AbortSignal }) => Promise<void>;
}

type InterruptIntent = "paused" | "cancelled";

export class DocumentTaskRuntime {
  private active: {
    job: DocumentTaskRuntimeJob;
    controller: AbortController;
    intent: InterruptIntent | null;
  } | null = null;
  private readonly queued = new Map<string, DocumentTaskRuntimeJob>();
  private readonly idleWaiters = new Set<() => void>();
  private readonly onStatusChange?: (
    taskId: string,
    runId: string,
    status: DocumentTaskStatus,
    error?: unknown
  ) => void;

  constructor(input: {
    onStatusChange?: (
      taskId: string,
      runId: string,
      status: DocumentTaskStatus,
      error?: unknown
    ) => void;
  } = {}) {
    this.onStatusChange = input.onStatusChange;
  }

  get activeTaskId(): string | null {
    return this.active?.job.taskId ?? null;
  }

  enqueue(job: DocumentTaskRuntimeJob): void {
    if (this.active?.job.taskId === job.taskId) {
      return;
    }

    if (this.queued.get(job.taskId)?.runId === job.runId) {
      return;
    }

    this.queued.set(job.taskId, job);
    this.onStatusChange?.(job.taskId, job.runId, "queued");
    this.pump();
  }

  pause(taskId: string): void {
    const queuedJob = this.queued.get(taskId);
    if (queuedJob) {
      this.queued.delete(taskId);
      this.onStatusChange?.(taskId, queuedJob.runId, "paused");
      this.resolveIdleWaitersIfNeeded();
      return;
    }

    if (this.active?.job.taskId !== taskId) {
      return;
    }

    this.active.intent = "paused";
    this.onStatusChange?.(taskId, this.active.job.runId, "pausing");
    this.active.controller.abort(new Error("Document task paused"));
  }

  cancel(taskId: string): void {
    const queuedJob = this.queued.get(taskId);
    if (queuedJob) {
      this.queued.delete(taskId);
      this.onStatusChange?.(taskId, queuedJob.runId, "cancelled");
      this.resolveIdleWaitersIfNeeded();
      return;
    }

    if (this.active?.job.taskId !== taskId) {
      return;
    }

    this.active.intent = "cancelled";
    this.onStatusChange?.(taskId, this.active.job.runId, "cancelling");
    this.active.controller.abort(new Error("Document task cancelled"));
  }

  async whenIdle(): Promise<void> {
    if (!this.active && this.queued.size === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }

  private selectNextJob(): DocumentTaskRuntimeJob | null {
    return (
      Array.from(this.queued.values()).sort(
        (left, right) =>
          (left.priority === right.priority
            ? 0
            : left.priority === "restored"
              ? -1
              : 1) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.taskId.localeCompare(right.taskId)
      )[0] ?? null
    );
  }

  private pump(): void {
    if (this.active) {
      return;
    }

    const job = this.selectNextJob();
    if (!job) {
      this.resolveIdleWaitersIfNeeded();
      return;
    }

    this.queued.delete(job.taskId);
    const controller = new AbortController();
    const active = { job, controller, intent: null as InterruptIntent | null };
    this.active = active;
    this.onStatusChange?.(job.taskId, job.runId, "running");

    void job
      .run({ signal: controller.signal })
      .then(() => {
        this.onStatusChange?.(job.taskId, job.runId, active.intent ?? "done");
      })
      .catch((error: unknown) => {
        if (active.intent) {
          this.onStatusChange?.(job.taskId, job.runId, active.intent);
          return;
        }

        this.onStatusChange?.(job.taskId, job.runId, "failed", error);
      })
      .finally(() => {
        if (this.active === active) {
          this.active = null;
        }
        this.pump();
      });
  }

  private resolveIdleWaitersIfNeeded(): void {
    if (this.active || this.queued.size > 0) {
      return;
    }

    for (const resolve of this.idleWaiters) {
      resolve();
    }
    this.idleWaiters.clear();
  }
}
