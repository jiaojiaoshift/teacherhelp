import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as reorderPaperPost } from "@/app/api/ai/reorder-paper/route";
import * as codexAgent from "@/lib/ai/teachhelper-codex-agent";

describe("full paper reorder route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEACHHELPER_AI_PROVIDER;
  });

  it("keeps the deterministic local fallback when codex is not selected", async () => {
    const codexSpy = vi.spyOn(codexAgent, "reorderPaperWithCodex");

    const response = await reorderPaperPost(
      new Request("http://localhost/api/ai/reorder-paper", {
        method: "POST",
        body: JSON.stringify({
          documentId: "paper-1",
          instruction: "18 12",
          questions: [
            {
              id: "q-1",
              questionNumberLabel: "12",
              ocrText: "question 12"
            },
            {
              id: "q-2",
              questionNumberLabel: "18",
              ocrText: "question 18"
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      documentId: "paper-1",
      orderedQuestionIds: ["q-1", "q-2"]
    });
    expect(codexSpy).not.toHaveBeenCalled();
  });

  it("uses the configured model API for full-paper reorder when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const fetchSpy = vi.spyOn(global, "fetch");
    const codexSpy = vi.spyOn(codexAgent, "reorderPaperWithCodex").mockResolvedValue({
      orderedQuestionIds: ["q-2", "q-1"]
    });

    const response = await reorderPaperPost(
      new Request("http://localhost/api/ai/reorder-paper", {
        method: "POST",
        body: JSON.stringify({
          documentId: "paper-1",
          instruction: "move question 18 before question 12",
          questions: [
            {
              id: "q-1",
              questionNumberLabel: "12",
              ocrText: "question 12"
            },
            {
              id: "q-2",
              questionNumberLabel: "18",
              ocrText: "question 18"
            }
          ]
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      documentId: "paper-1",
      orderedQuestionIds: ["q-2", "q-1"]
    });
    expect(codexSpy).toHaveBeenCalledWith({
      instruction: "move question 18 before question 12",
      questions: [
        {
          id: "q-1",
          questionNumberLabel: "12",
          ocrText: "question 12"
        },
        {
          id: "q-2",
          questionNumberLabel: "18",
          ocrText: "question 18"
        }
      ]
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
