import { describe, expect, it } from "vitest";

import {
  buildAnswerMatchPrompt,
  buildClassificationPrompt,
  buildCrossPagePrompt,
  buildPageTextLayoutPrompt,
  buildQuestionBoxPrompt
} from "@/lib/ai/teachhelper-ai-prompts";

describe("teachhelper AI prompts", () => {
  it("keeps single-column prompt text identical to the existing default", () => {
    const textLines = [
      {
        text: "12. 如图所示",
        normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
      }
    ];

    expect(buildPageTextLayoutPrompt(textLines, "single_column")).toBe(
      buildPageTextLayoutPrompt(textLines)
    );
    expect(buildQuestionBoxPrompt("高中物理", textLines, "single_column")).toBe(
      buildQuestionBoxPrompt("高中物理", textLines)
    );
  });

  it("adds column-aware reading and boxing constraints only for double-column pages", () => {
    const textLines = [
      {
        text: "20. 如图所示",
        role: "question_anchor" as const,
        normalizedBBox: { x1: 80, y1: 120, x2: 440, y2: 160 }
      }
    ];
    const ocrPrompt = buildPageTextLayoutPrompt(textLines, "double_column");
    const boxPrompt = buildQuestionBoxPrompt("高中物理", textLines, "double_column");

    expect(ocrPrompt).toContain("双栏");
    expect(ocrPrompt).toContain("左栏自上而下");
    expect(ocrPrompt).toContain("右栏自上而下");
    expect(ocrPrompt).toContain("通栏");
    expect(boxPrompt).toContain("中间栏沟");
    expect(boxPrompt).toContain("通栏题");
    expect(boxPrompt).toContain("(2)/(3)/(4)");
    expect(boxPrompt).toContain("左栏自上而下");

    expect(buildPageTextLayoutPrompt(textLines)).not.toContain("双栏版式约束");
    expect(buildQuestionBoxPrompt("高中物理", textLines)).not.toContain("双栏版式约束");
  });

  it("asks question detection to preserve complete first and last lines", () => {
    const prompt = buildQuestionBoxPrompt("高中物理", [
      {
        text: "12. 如图所示，分析物体受力。",
        normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
      }
    ]);

    expect(prompt).toContain("完整首行");
    expect(prompt).toContain("安全留白");
    expect(prompt).toContain("坐标文字行");
    expect(prompt).toContain("12. 如图所示");
    expect(prompt).toContain('"y1":120');
    expect(prompt).toContain("题号锚点");
    expect(prompt).toContain("不得包含下一道题的题号文字行");
    expect(prompt).toContain("页首续题区域");
    expect(prompt).toContain("命题来源说明行");
    expect(prompt).toContain("归入它后面的题目");
  });

  it("asks full-page OCR to classify question and non-question line roles", () => {
    const prompt = buildPageTextLayoutPrompt([
      {
        text: "12. 如图所示",
        normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
      }
    ]);

    expect(prompt).toContain("完整识别整页");
    expect(prompt).toContain("knowledge_note");
    expect(prompt).toContain("directory");
    expect(prompt).toContain("question_continuation");
    expect(prompt).toContain("PDF 原生坐标文字");
    expect(prompt).toContain("12. 如图所示");
  });

  it("forbids question boxes around knowledge notes and directory material", () => {
    const prompt = buildQuestionBoxPrompt("高中物理", [
      {
        text: "知识点梳理",
        role: "knowledge_note",
        normalizedBBox: { x1: 80, y1: 100, x2: 920, y2: 150 }
      }
    ]);

    expect(prompt).toContain("knowledge_note");
    expect(prompt).toContain("目录");
    expect(prompt).toContain("不得输出题框");
  });

  it("asks classification OCR to return the original PDF question number", () => {
    const prompt = buildClassificationPrompt("高中物理", []);

    expect(prompt).toContain("questionNumberLabel");
    expect(prompt).toContain("原 PDF 题号");
  });

  it("embeds real cross-page candidate ids and bboxes", () => {
    const prompt = buildCrossPagePrompt({
      leftPageId: "page-1",
      rightPageId: "page-2",
      leftTextLines: [
        {
          text: "12. 如图所示，求",
          normalizedBBox: { x1: 80, y1: 900, x2: 920, y2: 950 }
        }
      ],
      rightTextLines: [
        {
          text: "物体落地时的速度。",
          normalizedBBox: { x1: 80, y1: 40, x2: 920, y2: 90 }
        }
      ],
      candidates: [
        {
          id: "q-left",
          pageId: "page-1",
          localOrder: 3,
          normalizedBBox: { x1: 80, y1: 720, x2: 920, y2: 990 }
        }
      ]
    });

    expect(prompt).toContain("q-left");
    expect(prompt).toContain('"y1":720');
    expect(prompt).toContain("物体落地时的速度");
    expect(prompt).toContain("页首没有新题号");
  });

  it("asks answer matching to OCR complete answer blocks with safe margins", () => {
    const prompt = buildAnswerMatchPrompt({
      answerPages: [{ pageId: "page-3", pageNumber: 3 }],
      questionLabels: ["12"]
    });

    expect(prompt).toContain("ocrText");
    expect(prompt).toContain("complete first and last lines");
    expect(prompt).toContain("safe whitespace margin");
  });
});
