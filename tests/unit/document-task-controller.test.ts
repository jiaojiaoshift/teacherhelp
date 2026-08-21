import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelDocumentTaskExecution,
  isDocumentTaskRunWritable,
  pauseDocumentTaskExecution,
  registerDocumentTaskJob,
  resumeDocumentTaskExecution,
  waitForDocumentTaskRuntimeIdle
} from "@/lib/services/document-task-controller";
import { createDocumentProcessingTask } from "@/lib/services/document-task-service";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

function addTask(input: {
  id: string;
  runId: string;
  status?: "queued" | "paused";
}) {
  const task = {
    ...createDocumentProcessingTask({
      id: input.id,
      runId: input.runId,
      documentId: `doc-${input.id}`,
      documentName: `${input.id}.pdf`
    }),
    ...(input.status ? { status: input.status } : {})
  };
  useWorkbenchStore.getState().enqueueDocumentTask(task);
  return task;
}

describe("document task controller", () => {
  beforeEach(async () => {
    await waitForDocumentTaskRuntimeIdle();
    useWorkbenchStore.getState().hydrateDocumentTasks([]);
  });

  it("maps runtime completion back to the matching persisted task", async () => {
    const task = addTask({ id: "task-complete", runId: "run-complete" });

    registerDocumentTaskJob({
      taskId: task.id,
      runId: task.runId,
      priority: task.priority,
      createdAt: task.createdAt,
      run: async () => undefined
    });

    await waitForDocumentTaskRuntimeIdle();

    expect(useWorkbenchStore.getState().documentTasks[0].status).toBe("done");
  });

  it("pauses an active task and prevents its old run from writing", async () => {
    const task = addTask({ id: "task-pause", runId: "run-pause" });
    const started = vi.fn();

    registerDocumentTaskJob({
      taskId: task.id,
      runId: task.runId,
      priority: task.priority,
      createdAt: task.createdAt,
      run: ({ signal }) =>
        new Promise<void>((_resolve, reject) => {
          started();
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        })
    });

    await vi.waitFor(() => expect(started).toHaveBeenCalledTimes(1));
    pauseDocumentTaskExecution(task.id);
    await waitForDocumentTaskRuntimeIdle();

    expect(useWorkbenchStore.getState().documentTasks[0].status).toBe("paused");
    expect(isDocumentTaskRunWritable(task.id, task.runId)).toBe(false);
  });

  it("resumes with a new run id and cancels paused work without starting it", () => {
    const task = addTask({
      id: "task-resume",
      runId: "run-old",
      status: "paused"
    });

    resumeDocumentTaskExecution(task.id, "run-new");
    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      runId: "run-new",
      status: "queued",
      priority: "restored"
    });

    pauseDocumentTaskExecution(task.id);
    cancelDocumentTaskExecution(task.id);

    expect(useWorkbenchStore.getState().documentTasks[0].status).toBe("cancelled");
  });
});
