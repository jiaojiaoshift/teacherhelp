import { describe, expect, it } from "vitest";

import {
  buildNativeAutomaticAnswerDetections,
  collectUncoveredAnswerQuestionIds,
  ensureUniqueAnswerDetectionIds
} from "@/lib/services/automatic-answer-matching-service";

describe("automatic-answer-matching-service", () => {
  it("does not treat an empty question set as a complete native answer layout", () => {
    expect(
      buildNativeAutomaticAnswerDetections({
        questions: [],
        answerPages: [
          {
            pageId: "page-15",
            pageNumber: 15,
            textLines: []
          }
        ]
      }).complete
    ).toBe(false);
  });

  it("builds every native answer fragment when one answer crosses a page", () => {
    const result = buildNativeAutomaticAnswerDetections({
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionNumberLabel: "1",
          ocrText: "1. first question"
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionNumberLabel: "2",
          ocrText: "2. second question"
        }
      ],
      answerPages: [
        {
          pageId: "page-15",
          pageNumber: 15,
          textLines: [
            {
              text: "1. first answer",
              normalizedBBox: { x1: 150, y1: 100, x2: 850, y2: 120 }
            }
          ]
        },
        {
          pageId: "page-16",
          pageNumber: 16,
          textLines: [
            {
              text: "continued explanation",
              normalizedBBox: { x1: 150, y1: 80, x2: 850, y2: 110 }
            },
            {
              text: "2. second answer",
              normalizedBBox: { x1: 150, y1: 400, x2: 850, y2: 420 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(true);
    expect(result.detections).toEqual([
      expect.objectContaining({ answerLabel: "1", pageId: "page-15", pageNumber: 15 }),
      expect.objectContaining({ answerLabel: "1", pageId: "page-16", pageNumber: 16 }),
      expect.objectContaining({ answerLabel: "2", pageId: "page-16", pageNumber: 16 })
    ]);
  });

  it("makes repeated model detection ids unique across answer pages", () => {
    const detections = ensureUniqueAnswerDetectionIds([
      {
        id: "answer-1",
        pageId: "page-15",
        pageNumber: 15,
        answerLabel: "1",
        confidence: 0.9,
        normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
      },
      {
        id: "answer-1",
        pageId: "page-16",
        pageNumber: 16,
        answerLabel: "2",
        confidence: 0.9,
        normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
      }
    ]);

    expect(new Set(detections.map((detection) => detection.id)).size).toBe(2);
    expect(detections.map((detection) => detection.id)).toEqual([
      "page-15-answer-1-1",
      "page-16-answer-1-1"
    ]);
  });

  it("reports questions that have neither an attachment nor a review match", () => {
    expect(
      collectUncoveredAnswerQuestionIds({
        questions: [
          { id: "q-1", answerAttachments: [{ id: "a-1", assetId: "asset-1", kind: "matched" }] },
          { id: "q-2" },
          { id: "q-3" }
        ],
        matches: [
          {
            id: "match-2",
            answerLabel: "2",
            suggestedQuestionId: "q-2",
            status: "pending"
          }
        ]
      })
    ).toEqual(["q-3"]);
  });
});
