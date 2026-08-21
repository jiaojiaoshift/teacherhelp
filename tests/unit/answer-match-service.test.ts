import { describe, expect, it } from "vitest";

import {
  buildDurableAnswerAttachmentPlan,
  buildPendingAnswerMatches,
  normalizeQuestionNumberLabel,
  partitionAnswerMatchesForAutoAttach
} from "@/lib/services/answer-match-service";

describe("answer-match-service", () => {
  it("normalizes question number labels by trimming and keeping digits", () => {
    expect(normalizeQuestionNumberLabel(" 12 ")).toBe("12");
    expect(normalizeQuestionNumberLabel("第15题")).toBe("15");
    expect(normalizeQuestionNumberLabel("Q08")).toBe("08");
    expect(normalizeQuestionNumberLabel("")).toBe("");
  });

  it("builds pending answer matches with suggested question ids from exact labels", () => {
    const matches = buildPendingAnswerMatches({
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionNumberLabel: "12"
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionNumberLabel: "15"
        }
      ],
      detectedAnswers: [
        {
          id: "answer-1",
          pageId: "page-3",
          pageNumber: 3,
          answerLabel: "12",
          confidence: 0.96,
          normalizedBBox: {
            x1: 100,
            y1: 120,
            x2: 800,
            y2: 260
          }
        },
        {
          id: "answer-2",
          pageId: "page-4",
          pageNumber: 4,
          answerLabel: "15",
          confidence: 0.91,
          normalizedBBox: {
            x1: 120,
            y1: 300,
            x2: 780,
            y2: 460
          }
        }
      ]
    });

    expect(matches).toEqual([
      {
        id: "answer-1",
        answerLabel: "12",
        suggestedQuestionId: "q-1",
        status: "pending",
        pageId: "page-3",
        pageNumber: 3,
        confidence: 0.96,
        normalizedBBox: {
          x1: 92,
          y1: 105,
          x2: 808,
          y2: 275
        }
      },
      {
        id: "answer-2",
        answerLabel: "15",
        suggestedQuestionId: "q-2",
        status: "pending",
        pageId: "page-4",
        pageNumber: 4,
        confidence: 0.91,
        normalizedBBox: {
          x1: 112,
          y1: 285,
          x2: 788,
          y2: 475
        }
      }
    ]);
  });

  it("leaves ambiguous or missing labels unresolved", () => {
    const matches = buildPendingAnswerMatches({
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionNumberLabel: "12"
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionNumberLabel: "12"
        },
        {
          id: "q-3",
          globalOrder: 3,
          questionNumberLabel: null
        }
      ],
      detectedAnswers: [
        {
          id: "answer-1",
          pageId: "page-3",
          pageNumber: 3,
          answerLabel: "12",
          confidence: 0.96,
          normalizedBBox: {
            x1: 100,
            y1: 120,
            x2: 800,
            y2: 260
          }
        },
        {
          id: "answer-2",
          pageId: "page-3",
          pageNumber: 3,
          answerLabel: "18",
          confidence: 0.74,
          normalizedBBox: {
            x1: 100,
            y1: 300,
            x2: 800,
            y2: 460
          }
        }
      ]
    });

    expect(matches).toEqual([
      expect.objectContaining({
        id: "answer-1",
        answerLabel: "12",
        suggestedQuestionId: null
      }),
      expect.objectContaining({
        id: "answer-2",
        answerLabel: "18",
        suggestedQuestionId: null
      })
    ]);
  });

  it("auto-attaches only unique exact matches and keeps ambiguous answers for review", () => {
    const partition = partitionAnswerMatchesForAutoAttach([
      {
        id: "answer-1",
        answerLabel: "12",
        suggestedQuestionId: "q-1",
        status: "pending"
      },
      {
        id: "answer-2",
        answerLabel: "15",
        suggestedQuestionId: null,
        status: "pending"
      },
      {
        id: "answer-3",
        answerLabel: "18A",
        suggestedQuestionId: "q-2",
        status: "pending"
      },
      {
        id: "answer-4",
        answerLabel: "18B",
        suggestedQuestionId: "q-2",
        status: "pending"
      }
    ]);

    expect(partition.autoAttachMatches.map((match) => match.id)).toEqual(["answer-1"]);
    expect(partition.pendingMatches.map((match) => match.id)).toEqual([
      "answer-2",
      "answer-3",
      "answer-4"
    ]);
  });

  it("uses the top-level OCR number before a stale stored label for durable answer recovery", () => {
    const plan = buildDurableAnswerAttachmentPlan({
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionNumberLabel: "1",
          ocrText: "1. first question"
        },
        {
          id: "q-25",
          globalOrder: 25,
          questionNumberLabel: "1",
          ocrText: "source note\n25. actual question"
        }
      ],
      detectedAnswers: [
        {
          id: "answer-1",
          pageId: "answer-page-15",
          pageNumber: 15,
          answerLabel: "1",
          confidence: 0.98,
          normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
        },
        {
          id: "answer-25",
          pageId: "answer-page-23",
          pageNumber: 23,
          answerLabel: "25",
          confidence: 0.97,
          normalizedBBox: { x1: 100, y1: 320, x2: 900, y2: 620 }
        }
      ]
    });

    expect(plan.unresolvedAnswers).toEqual([]);
    expect(plan.unansweredQuestionIds).toEqual([]);
    expect(plan.attachmentsByQuestionId.get("q-1")?.map((answer) => answer.id)).toEqual([
      "answer-1"
    ]);
    expect(plan.attachmentsByQuestionId.get("q-25")?.map((answer) => answer.id)).toEqual([
      "answer-25"
    ]);
  });

  it("keeps multiple answer-page fragments for one question in durable recovery", () => {
    const plan = buildDurableAnswerAttachmentPlan({
      questions: [
        {
          id: "q-8",
          globalOrder: 8,
          questionNumberLabel: "8",
          ocrText: "8. question"
        }
      ],
      detectedAnswers: [
        {
          id: "answer-8-a",
          pageId: "answer-page-16",
          pageNumber: 16,
          answerLabel: "8",
          confidence: 0.94,
          normalizedBBox: { x1: 100, y1: 700, x2: 900, y2: 990 }
        },
        {
          id: "answer-8-b",
          pageId: "answer-page-17",
          pageNumber: 17,
          answerLabel: "8",
          confidence: 0.91,
          normalizedBBox: { x1: 100, y1: 10, x2: 900, y2: 250 }
        }
      ]
    });

    expect(plan.unresolvedAnswers).toEqual([]);
    expect(plan.unansweredQuestionIds).toEqual([]);
    expect(plan.attachmentsByQuestionId.get("q-8")?.map((answer) => answer.id)).toEqual([
      "answer-8-a",
      "answer-8-b"
    ]);
  });

  it("reports unknown answer labels and unanswered questions without guessing", () => {
    const plan = buildDurableAnswerAttachmentPlan({
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionNumberLabel: "1",
          ocrText: "1. question"
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionNumberLabel: "2",
          ocrText: "2. question"
        }
      ],
      detectedAnswers: [
        {
          id: "answer-99",
          pageId: "answer-page-15",
          pageNumber: 15,
          answerLabel: "99",
          confidence: 0.55,
          normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
        }
      ]
    });

    expect(plan.attachmentsByQuestionId.size).toBe(0);
    expect(plan.unresolvedAnswers.map((answer) => answer.id)).toEqual(["answer-99"]);
    expect(plan.unansweredQuestionIds).toEqual(["q-1", "q-2"]);
  });
});
