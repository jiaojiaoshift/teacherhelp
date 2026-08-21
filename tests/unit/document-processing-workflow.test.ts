import { describe, expect, it, vi } from "vitest";

import { runDocumentProcessingWorkflow } from "@/lib/services/document-processing-workflow";

describe("document processing workflow", () => {
  it("runs boxes, cross-page, OCR, answer matching, and specialized sync in order", async () => {
    const order: string[] = [];
    const onStage = vi.fn();

    const summary = await runDocumentProcessingWorkflow({
      hasAnswerSection: true,
      onStage,
      detectQuestionBoxes: async () => {
        order.push("question_boxes");
        return 24;
      },
      detectCrossPage: async () => {
        order.push("cross_page");
        return 2;
      },
      classifyQuestions: async () => {
        order.push("ocr");
        return 23;
      },
      matchAnswers: async () => {
        order.push("answer_matching");
        return {
          autoMatchedCount: 20,
          pendingCount: 3
        };
      },
      syncSpecialized: async () => {
        order.push("specialized_sync");
        return 4;
      }
    });

    expect(order).toEqual([
      "question_boxes",
      "cross_page",
      "ocr",
      "answer_matching",
      "specialized_sync"
    ]);
    expect(summary).toEqual({
      questionCount: 24,
      crossPageMergeCount: 2,
      classifiedQuestionCount: 23,
      autoMatchedAnswerCount: 20,
      pendingAnswerCount: 3,
      specializedDocumentCount: 4
    });
    expect(onStage).toHaveBeenLastCalledWith({
      stage: "done",
      status: "done"
    });
  });

  it("skips answer matching only when the document has no answer section", async () => {
    const matchAnswers = vi.fn();

    await runDocumentProcessingWorkflow({
      hasAnswerSection: false,
      detectQuestionBoxes: async () => 2,
      detectCrossPage: async () => 0,
      classifyQuestions: async () => 2,
      matchAnswers,
      syncSpecialized: async () => 4
    });

    expect(matchAnswers).not.toHaveBeenCalled();
  });

  it("reports the failed stage and stops later work", async () => {
    const syncSpecialized = vi.fn();
    const onStage = vi.fn();

    await expect(
      runDocumentProcessingWorkflow({
        hasAnswerSection: true,
        onStage,
        detectQuestionBoxes: async () => 2,
        detectCrossPage: async () => {
          throw new Error("cross page failed");
        },
        classifyQuestions: async () => 2,
        matchAnswers: async () => ({ autoMatchedCount: 0, pendingCount: 0 }),
        syncSpecialized
      })
    ).rejects.toThrow("cross page failed");

    expect(onStage).toHaveBeenLastCalledWith({
      stage: "cross_page",
      status: "failed"
    });
    expect(syncSpecialized).not.toHaveBeenCalled();
  });

  it("resumes at the failed stage with the latest completed summary", async () => {
    const detectQuestionBoxes = vi.fn(async () => 12);
    const detectCrossPage = vi.fn(async () => 3);
    const classifyQuestions = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("ocr route unavailable"))
      .mockResolvedValueOnce(11);
    const matchAnswers = vi.fn(async () => ({
      autoMatchedCount: 8,
      pendingCount: 3
    }));
    const syncSpecialized = vi.fn(async () => 4);
    const checkpoints: Array<{
      nextStage: string;
      summary: {
        questionCount: number;
        crossPageMergeCount: number;
        classifiedQuestionCount: number;
        autoMatchedAnswerCount: number;
        pendingAnswerCount: number;
        specializedDocumentCount: number;
      };
    }> = [];

    await expect(
      runDocumentProcessingWorkflow({
        hasAnswerSection: true,
        detectQuestionBoxes,
        detectCrossPage,
        classifyQuestions,
        matchAnswers,
        syncSpecialized,
        onCheckpoint: (checkpoint) => checkpoints.push(checkpoint)
      })
    ).rejects.toThrow("ocr route unavailable");

    expect(checkpoints.at(-1)).toEqual({
      nextStage: "ocr",
      summary: {
        questionCount: 12,
        crossPageMergeCount: 3,
        classifiedQuestionCount: 0,
        autoMatchedAnswerCount: 0,
        pendingAnswerCount: 0,
        specializedDocumentCount: 0
      }
    });

    const summary = await runDocumentProcessingWorkflow({
      hasAnswerSection: true,
      startStage: "ocr",
      initialSummary: checkpoints.at(-1)?.summary,
      detectQuestionBoxes: async () => {
        throw new Error("question boxes must not rerun");
      },
      detectCrossPage: async () => {
        throw new Error("cross page must not rerun");
      },
      classifyQuestions,
      matchAnswers,
      syncSpecialized
    });

    expect(detectQuestionBoxes).toHaveBeenCalledTimes(1);
    expect(detectCrossPage).toHaveBeenCalledTimes(1);
    expect(classifyQuestions).toHaveBeenCalledTimes(2);
    expect(matchAnswers).toHaveBeenCalledTimes(1);
    expect(syncSpecialized).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      questionCount: 12,
      crossPageMergeCount: 3,
      classifiedQuestionCount: 11,
      autoMatchedAnswerCount: 8,
      pendingAnswerCount: 3,
      specializedDocumentCount: 4
    });
  });
});
