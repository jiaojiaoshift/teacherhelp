import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as analyzeQuestionPost } from "@/app/api/ai/analyze-question/route";
import * as codexAgent from "@/lib/ai/teachhelper-codex-agent";

describe("question analysis route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEACHHELPER_AI_PROVIDER;
  });

  it("keeps local fallback single-question analysis when ark env is not configured", async () => {
    const response = await analyzeQuestionPost(
      new Request("http://localhost/api/ai/analyze-question", {
        method: "POST",
        body: JSON.stringify({
          questionId: "q-1",
          ocrText: "已知二次函数图像，求顶点坐标"
        })
      })
    );

    const payload = await response.json();

    expect(payload).toMatchObject({
      questionId: "q-1",
      analysis: {
        status: "done"
      }
    });
    expect(payload.analysis.solution).toContain("Step 1");
    expect(payload.analysis.answer).toBeTruthy();
  });

  it("uses the configured model API for single-question analysis when selected", async () => {
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";

    const fetchSpy = vi.spyOn(global, "fetch");
    const codexSpy = vi.spyOn(codexAgent, "analyzeQuestionWithCodex").mockResolvedValue({
      questionId: "q-1",
      solution: "Step 1\nStep 2",
      answer: "B"
    });

    const response = await analyzeQuestionPost(
      new Request("http://localhost/api/ai/analyze-question", {
        method: "POST",
        body: JSON.stringify({
          questionId: "q-1",
          subjectScope: "高中数学",
          ocrText: "已知二次函数图像，求顶点坐标"
        })
      })
    );

    const payload = await response.json();

    expect(payload.analysis).toMatchObject({
      status: "done",
      solution: "Step 1\nStep 2",
      answer: "B"
    });
    expect(codexSpy).toHaveBeenCalledWith({
      questionId: "q-1",
      subjectScope: "高中数学",
      ocrText: "已知二次函数图像，求顶点坐标"
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
