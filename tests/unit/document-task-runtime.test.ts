import { describe, expect, it, vi } from "vitest";

import { DocumentTaskRuntime } from "@/lib/services/document-task-runtime";

function abortableJob(started: () => void) {
  return ({ signal }: { signal: AbortSignal }) =>
    new Promise<void>((resolve, reject) => {
      started();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      void resolve;
    });
}

describe("document task runtime", () => {
  it("runs one document at a time and lets the next task run after pausing", async () => {
    const events: string[] = [];
    const runtime = new DocumentTaskRuntime({
      onStatusChange: (taskId, runId, status) =>
        events.push(`${taskId}:${runId}:${status}`)
    });

    runtime.enqueue({
      taskId: "task-1",
      runId: "run-1",
      priority: "new",
      createdAt: "2026-08-17T08:00:00.000Z",
      run: abortableJob(() => events.push("task-1:started"))
    });
    runtime.enqueue({
      taskId: "task-2",
      runId: "run-2",
      priority: "new",
      createdAt: "2026-08-17T08:01:00.000Z",
      run: abortableJob(() => events.push("task-2:started"))
    });

    await vi.waitFor(() => expect(runtime.activeTaskId).toBe("task-1"));
    expect(events).not.toContain("task-2:started");

    runtime.pause("task-1");

    await vi.waitFor(() => expect(runtime.activeTaskId).toBe("task-2"));
    expect(events).toContain("task-1:run-1:paused");
    runtime.cancel("task-2");
    await runtime.whenIdle();
  });

  it("cancels queued work without starting it", async () => {
    const secondRun = vi.fn();
    const runtime = new DocumentTaskRuntime();

    runtime.enqueue({
      taskId: "task-active",
      runId: "run-active",
      priority: "new",
      createdAt: "2026-08-17T08:00:00.000Z",
      run: abortableJob(() => undefined)
    });
    runtime.enqueue({
      taskId: "task-cancelled",
      runId: "run-cancelled",
      priority: "new",
      createdAt: "2026-08-17T08:01:00.000Z",
      run: secondRun
    });

    runtime.cancel("task-cancelled");
    runtime.cancel("task-active");
    await runtime.whenIdle();

    expect(secondRun).not.toHaveBeenCalled();
  });

  it("does not emit another queued update when the same queued task is registered again", async () => {
    const events: string[] = [];
    const runtime = new DocumentTaskRuntime({
      onStatusChange: (taskId, runId, status) =>
        events.push(`${taskId}:${runId}:${status}`)
    });
    const queuedJob = {
      taskId: "task-queued-once",
      runId: "run-queued-once",
      priority: "new" as const,
      createdAt: "2026-08-17T08:01:00.000Z",
      run: vi.fn(async () => undefined)
    };

    runtime.enqueue({
      taskId: "task-blocking",
      runId: "run-blocking",
      priority: "new",
      createdAt: "2026-08-17T08:00:00.000Z",
      run: abortableJob(() => undefined)
    });
    runtime.enqueue(queuedJob);
    runtime.enqueue(queuedJob);

    expect(
      events.filter((event) => event === "task-queued-once:run-queued-once:queued")
    ).toHaveLength(1);

    runtime.cancel("task-blocking");
    await runtime.whenIdle();
  });
});
