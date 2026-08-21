import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as suggestAnswerMatchesPost } from "@/app/api/ai/suggest-answer-matches/route";
import * as codexAgent from "@/lib/ai/teachhelper-codex-agent";

describe("answer match route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEACHHELPER_AI_PROVIDER;
  });

  it("keeps local fallback answer detections when ark env is not configured", async () => {
    const response = await suggestAnswerMatchesPost(
      new Request("http://localhost/api/ai/suggest-answer-matches", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
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
          answerPages: [
            {
              pageId: "page-3",
              pageNumber: 3,
              imageDataUrl: "data:image/png;base64,page-3"
            },
            {
              pageId: "page-4",
              pageNumber: 4,
              imageDataUrl: "data:image/png;base64,page-4"
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      documentId: "doc-1",
      source: {
        provider: "local_fallback",
        reason: "api_provider_not_selected"
      }
    });
    expect(payload.detectedAnswers).toEqual([
      {
        id: "page-3-answer-1",
        pageId: "page-3",
        pageNumber: 3,
        answerLabel: "12",
        confidence: 0.76,
        normalizedBBox: {
          x1: 120,
          y1: 160,
          x2: 920,
          y2: 420
        }
      },
      {
        id: "page-4-answer-1",
        pageId: "page-4",
        pageNumber: 4,
        answerLabel: "15",
        confidence: 0.76,
        normalizedBBox: {
          x1: 120,
          y1: 160,
          x2: 920,
          y2: 420
        }
      }
    ]);
  });

  it("uses the configured model API for answer-match suggestion when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const fetchSpy = vi.spyOn(global, "fetch");
    const codexSpy = vi.spyOn(codexAgent, "suggestAnswerMatchesWithCodex").mockResolvedValue([
      {
        id: "answer-1",
        pageId: "page-3",
        pageNumber: 3,
        answerLabel: "12",
        confidence: 0.96,
        normalizedBBox: {
          x1: 100,
          y1: 120,
          x2: 900,
          y2: 320
        }
      }
    ]);

    const response = await suggestAnswerMatchesPost(
      new Request("http://localhost/api/ai/suggest-answer-matches", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
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
          answerPages: [
            {
              pageId: "page-3",
              pageNumber: 3,
              imageDataUrl: "data:image/png;base64,page-3"
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload.source).toEqual({
      provider: "openai_compatible"
    });
    expect(payload.detectedAnswers).toHaveLength(1);
    expect(payload.detectedAnswers[0]).toMatchObject({
      id: "answer-1",
      answerLabel: "12",
      pageId: "page-3"
    });
    expect(codexSpy).toHaveBeenCalledWith({
      answerPages: [
        {
          pageId: "page-3",
          pageNumber: 3,
          imageDataUrl: "data:image/png;base64,page-3"
        }
      ],
      questionLabels: ["12", "15"]
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
