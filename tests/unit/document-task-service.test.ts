import { describe, expect, it } from "vitest";

import {
  createDocumentProcessingTask,
  normalizeRestoredDocumentTasks,
  selectNextRunnableDocumentTask
} from "@/lib/services/document-task-service";

describe("document task service", () => {
  it("stores the serializable workflow input needed after a reload", () => {
    const task = createDocumentProcessingTask({
      id: "task-input",
      runId: "run-input",
      documentId: "doc-input",
      documentName: "input.pdf",
      workflowInput: {
        subjectScope: "高中物理",
        questionPageLayoutMode: "double_column",
        hasAnswerSection: true,
        questionPageIds: ["page-1", "page-2"],
        answerPageIds: ["page-3"]
      }
    });

    expect(task.workflowInput).toEqual({
      subjectScope: "高中物理",
      questionPageLayoutMode: "double_column",
      hasAnswerSection: true,
      questionPageIds: ["page-1", "page-2"],
      answerPageIds: ["page-3"]
    });
  });

  it("restores interrupted tasks ahead of newly queued work", () => {
    const newTask = createDocumentProcessingTask({
      id: "task-new",
      runId: "run-new",
      documentId: "doc-new",
      documentName: "新文件.pdf",
      createdAt: "2026-08-17T08:00:00.000Z",
      priority: "new"
    });
    const interruptedTask = {
      ...createDocumentProcessingTask({
        id: "task-old",
        runId: "run-old",
        documentId: "doc-old",
        documentName: "上次文件.pdf",
        createdAt: "2026-08-16T08:00:00.000Z",
        priority: "new"
      }),
      status: "running" as const
    };

    const restored = normalizeRestoredDocumentTasks([newTask, interruptedTask]);

    expect(restored.find((task) => task.id === "task-old")).toMatchObject({
      status: "queued",
      priority: "restored"
    });
    expect(selectNextRunnableDocumentTask(restored)?.id).toBe("task-old");
  });

  it("keeps paused tasks out of scheduling until the user resumes them", () => {
    const paused = {
      ...createDocumentProcessingTask({
        id: "task-paused",
        runId: "run-paused",
        documentId: "doc-paused",
        documentName: "暂停文件.pdf",
        createdAt: "2026-08-17T07:00:00.000Z",
        priority: "restored"
      }),
      status: "paused" as const
    };
    const queued = createDocumentProcessingTask({
      id: "task-queued",
      runId: "run-queued",
      documentId: "doc-queued",
      documentName: "排队文件.pdf",
      createdAt: "2026-08-17T09:00:00.000Z",
      priority: "new"
    });

    expect(selectNextRunnableDocumentTask([paused, queued])?.id).toBe("task-queued");
  });

  it("reconciles restored task summaries with the durable merged-question count", async () => {
    const service = (await import("@/lib/services/document-task-service")) as {
      reconcileDocumentTaskQuestionCounts?: (
        tasks: ReturnType<typeof createDocumentProcessingTask>[],
        questionDocumentIds: string[]
      ) => ReturnType<typeof createDocumentProcessingTask>[];
    };
    const task = createDocumentProcessingTask({
      id: "task-old-summary",
      runId: "run-old-summary",
      documentId: "doc-merged",
      documentName: "merged.pdf"
    });
    const staleTask = {
      ...task,
      status: "done" as const,
      progress: {
        ...task.progress,
        stage: "done" as const,
        summary: { ...task.checkpoint.summary, questionCount: 19 }
      },
      checkpoint: {
        nextStage: "done" as const,
        summary: { ...task.checkpoint.summary, questionCount: 19 }
      }
    };

    expect(service.reconcileDocumentTaskQuestionCounts).toBeTypeOf("function");
    if (!service.reconcileDocumentTaskQuestionCounts) {
      return;
    }

    expect(
      service.reconcileDocumentTaskQuestionCounts(
        [staleTask],
        Array.from({ length: 14 }, () => "doc-merged")
      )[0]
    ).toMatchObject({
      progress: { summary: { questionCount: 14 } },
      checkpoint: { summary: { questionCount: 14 } }
    });
  });
});
