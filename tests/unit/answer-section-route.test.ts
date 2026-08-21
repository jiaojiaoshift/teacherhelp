import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as suggestAnswerSectionPost } from "@/app/api/ai/suggest-answer-section/route";
import * as codexAgent from "@/lib/ai/teachhelper-codex-agent";

describe("answer section route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEACHHELPER_AI_PROVIDER;
  });

  it("keeps local fallback split suggestion when ark env is not configured", async () => {
    const response = await suggestAnswerSectionPost(
      new Request("http://localhost/api/ai/suggest-answer-section", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          pageCount: 6
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      documentId: "doc-1",
      answerSection: {
        hasAnswerSection: true,
        suggestedSplitPage: 6
      }
    });
  });

  it("uses the configured model API for answer-section suggestion when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const fetchSpy = vi.spyOn(global, "fetch");
    const codexSpy = vi.spyOn(codexAgent, "suggestAnswerSectionWithCodex").mockResolvedValue({
      hasAnswerSection: true,
      suggestedSplitPage: 5
    });

    const response = await suggestAnswerSectionPost(
      new Request("http://localhost/api/ai/suggest-answer-section", {
        method: "POST",
        body: JSON.stringify({
          documentId: "doc-1",
          pageCount: 8,
        pageImageDataUrls: [
          "data:image/png;base64,page-1",
          "data:image/png;base64,page-2"
        ],
        sampledPageNumbers: [1, 8]
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      documentId: "doc-1",
      answerSection: {
        hasAnswerSection: true,
        suggestedSplitPage: 5
      }
    });
    expect(codexSpy).toHaveBeenCalledWith({
      pageCount: 8,
      pageImageDataUrls: [
        "data:image/png;base64,page-1",
        "data:image/png;base64,page-2"
      ]
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects answer-section requests that exceed the bounded representative-page contract", async () => {
    const response = await suggestAnswerSectionPost(
      new Request("http://localhost/api/ai/suggest-answer-section", {
        method: "POST",
        body: JSON.stringify({
          pageCount: 400,
          pageImageDataUrls: Array.from({ length: 13 }, () => "data:image/png;base64,page"),
          sampledPageNumbers: Array.from({ length: 13 }, (_, index) => index + 1)
        })
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "too_many_answer_samples"
    });
  });
});
