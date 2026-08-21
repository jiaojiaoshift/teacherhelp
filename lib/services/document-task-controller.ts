import { DocumentTaskRuntime, type DocumentTaskRuntimeJob } from "@/lib/services/document-task-runtime";
import { createWorkflowRunId } from "@/lib/services/workflow-event-service";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

function getSafeTaskErrorMessage(error: unknown): string {
  if (!(error instanceof Error) || !error.message.trim()) {
    return "整卷处理失败";
  }

  return error.message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/(?:api[_-]?key|authorization|bearer)\s*[:=]?\s*\S+/gi, "[redacted-secret]")
    .slice(0, 500);
}

const runtime = new DocumentTaskRuntime({
  onStatusChange: (taskId, runId, status, error) => {
    useWorkbenchStore
      .getState()
      .updateDocumentTaskStatus(
        taskId,
        runId,
        status,
        status === "failed" ? getSafeTaskErrorMessage(error) : null
      );
  }
});

export function registerDocumentTaskJob(job: DocumentTaskRuntimeJob): void {
  runtime.enqueue(job);
}

export function pauseDocumentTaskExecution(taskId: string): void {
  const task = useWorkbenchStore
    .getState()
    .documentTasks.find((item) => item.id === taskId);

  if (!task || ["done", "cancelled", "cancelling"].includes(task.status)) {
    return;
  }

  runtime.pause(taskId);

  const latestTask = useWorkbenchStore
    .getState()
    .documentTasks.find((item) => item.id === taskId);
  if (latestTask?.runId === task.runId && latestTask.status === task.status) {
    useWorkbenchStore
      .getState()
      .updateDocumentTaskStatus(taskId, task.runId, "paused");
  }
}

export function cancelDocumentTaskExecution(taskId: string): void {
  const task = useWorkbenchStore
    .getState()
    .documentTasks.find((item) => item.id === taskId);

  if (!task || task.status === "cancelled") {
    return;
  }

  runtime.cancel(taskId);

  const latestTask = useWorkbenchStore
    .getState()
    .documentTasks.find((item) => item.id === taskId);
  if (
    latestTask?.runId === task.runId &&
    !["cancelling", "cancelled"].includes(latestTask.status)
  ) {
    useWorkbenchStore
      .getState()
      .updateDocumentTaskStatus(taskId, task.runId, "cancelled");
  }
}

export function resumeDocumentTaskExecution(
  taskId: string,
  runId = createWorkflowRunId()
): void {
  useWorkbenchStore.getState().resumeDocumentTask(taskId, runId);
}

export function isDocumentTaskRunWritable(taskId: string, runId: string): boolean {
  const task = useWorkbenchStore
    .getState()
    .documentTasks.find((item) => item.id === taskId);

  return task?.runId === runId && task.status === "running";
}

export function waitForDocumentTaskRuntimeIdle(): Promise<void> {
  return runtime.whenIdle();
}
