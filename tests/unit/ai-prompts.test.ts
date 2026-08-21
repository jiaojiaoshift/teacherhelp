import { describe, expect, it } from "vitest";

import { buildQuestionBoxPrompt } from "@/lib/ai/teachhelper-ai-prompts";

describe("question box prompt", () => {
  it("requires one non-overlapping complete box per independent question", () => {
    const prompt = buildQuestionBoxPrompt("高中物理");

    expect(prompt).toContain("同一道题只允许输出一个题框");
    expect(prompt).toContain("禁止输出页面级大框、分栏框或选项独立框");
    expect(prompt).toContain("相邻题框不得重叠");
    expect(prompt).toContain("完整首行和完整末行");
  });
});
