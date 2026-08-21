import { beforeEach, describe, expect, it } from "vitest";

import { createDocumentProcessingTask } from "@/lib/services/document-task-service";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

function createTask(overrides: {
  id?: string;
  runId?: string;
  status?: "queued" | "running" | "paused";
} = {}) {
  return {
    ...createDocumentProcessingTask({
      id: overrides.id ?? "task-1",
      runId: overrides.runId ?? "run-1",
      documentId: "doc-1",
      documentName: "测试文件.pdf",
      createdAt: "2026-08-17T08:00:00.000Z"
    }),
    ...(overrides.status ? { status: overrides.status } : {})
  };
}

describe("workbench document task store", () => {
  beforeEach(() => {
    useWorkbenchStore.getState().hydrateDocumentTasks([]);
  });

  it("normalizes interrupted tasks as restored work during hydration", () => {
    useWorkbenchStore.getState().hydrateDocumentTasks([
      createTask({ status: "running" })
    ]);

    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      id: "task-1",
      status: "queued",
      priority: "restored"
    });
  });

  it("ignores progress from an obsolete run of the same task", () => {
    useWorkbenchStore.getState().enqueueDocumentTask(
      createTask({ runId: "run-current" })
    );

    useWorkbenchStore.getState().updateDocumentTaskProgress(
      "task-1",
      "run-obsolete",
      {
        stage: "ocr",
        current: 9,
        total: 10,
        message: "obsolete",
        summary: null
      }
    );

    expect(useWorkbenchStore.getState().documentTasks[0].progress.stage).toBe(
      "question_boxes"
    );

    useWorkbenchStore.getState().updateDocumentTaskProgress(
      "task-1",
      "run-current",
      {
        stage: "ocr",
        current: 3,
        total: 10,
        message: "current",
        summary: null
      }
    );

    expect(useWorkbenchStore.getState().documentTasks[0].progress).toMatchObject({
      stage: "ocr",
      current: 3,
      message: "current"
    });
  });

  it("persists page checkpoints without duplicating page ids", () => {
    useWorkbenchStore.getState().enqueueDocumentTask(createTask());

    useWorkbenchStore.getState().recordDocumentTaskPageResult(
      "task-1",
      "run-1",
      "page-1",
      "completed"
    );
    useWorkbenchStore.getState().recordDocumentTaskPageResult(
      "task-1",
      "run-1",
      "page-1",
      "completed"
    );
    useWorkbenchStore.getState().recordDocumentTaskPageResult(
      "task-1",
      "run-1",
      "page-2",
      "failed"
    );

    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      completedPageIds: ["page-1"],
      failedPageIds: ["page-2"]
    });
  });

  it("resumes a paused task with a new run id and restored priority", () => {
    useWorkbenchStore.getState().enqueueDocumentTask(
      createTask({ status: "paused" })
    );

    useWorkbenchStore.getState().resumeDocumentTask("task-1", "run-2");

    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      runId: "run-2",
      status: "queued",
      priority: "restored",
      errorMessage: null
    });
  });

  it("accepts status and checkpoints only from the current run", () => {
    useWorkbenchStore.getState().enqueueDocumentTask(
      createTask({ runId: "run-current" })
    );

    useWorkbenchStore.getState().updateDocumentTaskStatus(
      "task-1",
      "run-obsolete",
      "failed",
      "obsolete error"
    );
    useWorkbenchStore.getState().updateDocumentTaskCheckpoint(
      "task-1",
      "run-obsolete",
      {
        nextStage: "ocr",
        summary: {
          questionCount: 20,
          crossPageMergeCount: 2,
          classifiedQuestionCount: 0,
          autoMatchedAnswerCount: 0,
          pendingAnswerCount: 0,
          specializedDocumentCount: 0
        }
      }
    );

    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      status: "queued",
      checkpoint: { nextStage: "question_boxes" }
    });

    useWorkbenchStore.getState().updateDocumentTaskStatus(
      "task-1",
      "run-current",
      "running"
    );
    useWorkbenchStore.getState().updateDocumentTaskCheckpoint(
      "task-1",
      "run-current",
      {
        nextStage: "ocr",
        summary: {
          questionCount: 20,
          crossPageMergeCount: 2,
          classifiedQuestionCount: 0,
          autoMatchedAnswerCount: 0,
          pendingAnswerCount: 0,
          specializedDocumentCount: 0
        }
      }
    );

    expect(useWorkbenchStore.getState().activeDocumentTaskId).toBe("task-1");
    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      status: "running",
      checkpoint: {
        nextStage: "ocr",
        summary: {
          questionCount: 20,
          crossPageMergeCount: 2
        }
      }
    });
  });

  it("selects a queued document without changing its execution status", () => {
    useWorkbenchStore.getState().enqueueDocumentTask(
      createTask({ id: "task-1", runId: "run-1" })
    );
    useWorkbenchStore.getState().enqueueDocumentTask(
      createTask({ id: "task-2", runId: "run-2" })
    );

    useWorkbenchStore.getState().selectDocumentTask("task-2");

    expect(useWorkbenchStore.getState().activeDocumentTaskId).toBe("task-2");
    expect(useWorkbenchStore.getState().documentTasks[1].status).toBe("queued");
  });
});
