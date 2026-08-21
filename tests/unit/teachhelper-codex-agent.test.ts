import { beforeEach, describe, expect, it, vi } from "vitest";

const { callModel } = vi.hoisted(() => ({
  callModel: vi.fn()
}));

vi.mock("@/lib/ai/openai-compatible-gateway", () => ({
  callOpenAiCompatibleJsonModel: callModel,
  getOpenAiCompatibleErrorDiagnostic: (error: { status?: number }) => ({
    kind: "upstream_http",
    status: error.status
  })
}));

import {
  classifyDocumentQuestionsWithCodex,
  detectQuestionBoxesWithTextLayout,
  detectQuestionBoxesWithCodex,
  detectCrossPageWithCodex,
  suggestAnswerMatchesWithCodex
} from "@/lib/ai/teachhelper-codex-agent";

describe("teachhelper model adapter", () => {
  beforeEach(() => {
    callModel.mockReset();
  });

  it("runs full semantic vision OCR even when native positioned PDF text is available", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "12. 如图所示，分析物体受力。",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "draft-12",
            localOrder: 1,
            confidence: 0.94,
            normalizedBBox: { x1: 80, y1: 110, x2: 920, y2: 430 }
          }
        ]
      });

    const detections = await detectQuestionBoxesWithCodex({
      imageDataUrl: "data:image/png;base64,page-1",
      subjectScope: "高中物理",
      textLines: [
        {
          text: "12. 如图所示，分析物体受力。",
          normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
        }
      ]
    });

    expect(detections).toHaveLength(1);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0]).toMatchObject({
      taskName: "extract-page-text-layout",
      reasoningEffort: "medium",
      timeoutMs: 600_000
    });
    expect(callModel.mock.calls[0][0].prompt).toContain("PDF 原生坐标文字");
    expect(callModel.mock.calls[0][0].prompt).toContain("12. 如图所示");
    expect(callModel.mock.calls[1][0]).toMatchObject({
      taskName: "detect-question-boxes"
    });
    expect(callModel.mock.calls[1][0].prompt).toContain("question_anchor");
  });

  it("runs positional vision OCR before question-box detection for image-only pages", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "7. 一小球做平抛运动",
            normalizedBBox: { x1: 90, y1: 180, x2: 880, y2: 230 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "draft-7",
            localOrder: 1,
            confidence: 0.91,
            normalizedBBox: { x1: 80, y1: 170, x2: 920, y2: 500 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,scan-page",
      subjectScope: "高中物理"
    });

    expect(result.detections).toHaveLength(1);
    expect(result.textLines).toEqual([
      {
        text: "7. 一小球做平抛运动",
        normalizedBBox: { x1: 90, y1: 180, x2: 880, y2: 230 }
      }
    ]);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0]).toMatchObject({
      taskName: "extract-page-text-layout"
    });
    expect(callModel.mock.calls[1][0]).toMatchObject({
      taskName: "detect-question-boxes"
    });
    expect(callModel.mock.calls[1][0].prompt).toContain("7. 一小球做平抛运动");
  });

  it("allows the question-box model enough wall-clock time for the compatible relay", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "7. 一小球做平抛运动",
            role: "question_anchor",
            normalizedBBox: { x1: 90, y1: 180, x2: 880, y2: 230 }
          }
        ]
      })
      .mockResolvedValueOnce({ detections: [] });

    await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,question-box-timeout",
      subjectScope: "高中物理"
    });

    expect(callModel.mock.calls[1][0]).toMatchObject({
      taskName: "detect-question-boxes",
      timeoutMs: 600_000
    });
  });

  it("retries a rejected OCR-guided box request with semantic OCR lines only", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "页眉",
            role: "header",
            normalizedBBox: { x1: 100, y1: 20, x2: 300, y2: 50 }
          },
          {
            text: "8. 求物体加速度",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 160, x2: 500, y2: 200 }
          },
          {
            text: "知识点梳理",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 800, x2: 500, y2: 840 }
          }
        ]
      })
      .mockRejectedValueOnce(Object.assign(new Error("upstream request failed"), { status: 400 }))
      .mockResolvedValueOnce({ detections: [] });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,retry-box-request",
      subjectScope: "高中物理"
    });

    expect(result.detections).toEqual([
      expect.objectContaining({ id: expect.stringContaining("semantic-anchor") })
    ]);
    expect(callModel).toHaveBeenCalledTimes(3);
    expect(callModel.mock.calls[1][0].prompt).toContain('"text":"页眉"');
    expect(callModel.mock.calls[2][0].prompt).not.toContain('"text":"页眉"');
    expect(callModel.mock.calls[2][0].prompt).toContain("8. 求物体加速度");
  });

  it("falls back to image-only box detection when semantic OCR is also rejected", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "页眉",
            role: "header",
            normalizedBBox: { x1: 100, y1: 20, x2: 300, y2: 50 }
          },
          {
            text: "8. 求物体加速度",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 160, x2: 500, y2: 200 }
          }
        ]
      })
      .mockRejectedValueOnce(Object.assign(new Error("upstream request failed"), { status: 400 }))
      .mockRejectedValueOnce(Object.assign(new Error("upstream request failed"), { status: 400 }))
      .mockResolvedValueOnce({
        detections: [
          {
            id: "image-only-box",
            localOrder: 1,
            confidence: 0.8,
            normalizedBBox: { x1: 60, y1: 140, x2: 540, y2: 600 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,image-only-retry",
      subjectScope: "高中物理"
    });

    expect(result.detections).toEqual([
      expect.objectContaining({ id: "image-only-box" })
    ]);
    expect(callModel).toHaveBeenCalledTimes(4);
    expect(callModel.mock.calls[2][0].prompt).toContain("8. 求物体加速度");
    expect(callModel.mock.calls[3][0].prompt).not.toContain('"text":"8. 求物体加速度"');
  });

  it("continues box detection with native text when full-page OCR is rejected", async () => {
    callModel
      .mockRejectedValueOnce(Object.assign(new Error("upstream request failed"), { status: 400 }))
      .mockResolvedValueOnce({ detections: [] });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,ocr-rejected",
      subjectScope: "高中物理",
      textLines: [
        {
          text: "9. 求小球速度",
          normalizedBBox: { x1: 80, y1: 160, x2: 500, y2: 200 }
        }
      ]
    });

    expect(result.detections).toEqual([]);
    expect(result.textLines).toEqual([
      {
        text: "9. 求小球速度",
        normalizedBBox: { x1: 80, y1: 160, x2: 500, y2: 200 }
      }
    ]);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[1][0]).toMatchObject({
      taskName: "detect-question-boxes"
    });
  });

  it("uses double-column constraints in both OCR and question-box model calls", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "20. 如图所示",
            role: "question_anchor",
            normalizedBBox: { x1: 70, y1: 120, x2: 450, y2: 160 }
          }
        ]
      })
      .mockResolvedValueOnce({ detections: [] });

    await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,double-column-page",
      subjectScope: "高中物理",
      questionPageLayoutMode: "double_column"
    });

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[0][0].prompt).toContain("双栏版式约束");
    expect(callModel.mock.calls[1][0].prompt).toContain("双栏版式约束");
  });

  it("drops model boxes that contain only semantic non-question material", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "知识点梳理",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 80, x2: 920, y2: 130 }
          },
          {
            text: "一、电场强度的定义",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 150, x2: 920, y2: 200 }
          },
          {
            text: "8. 如图所示，求电场强度。",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 420, x2: 920, y2: 470 }
          },
          {
            text: "A. 向左 B. 向右",
            role: "question_content",
            normalizedBBox: { x1: 100, y1: 490, x2: 900, y2: 540 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "knowledge-box",
            localOrder: 1,
            confidence: 0.88,
            normalizedBBox: { x1: 60, y1: 60, x2: 940, y2: 230 }
          },
          {
            id: "question-box",
            localOrder: 2,
            confidence: 0.95,
            normalizedBBox: { x1: 60, y1: 400, x2: 940, y2: 570 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,mixed-page",
      subjectScope: "高中物理"
    });

    expect(result.textLines[0]).toMatchObject({ role: "knowledge_note" });
    expect(result.detections.map((detection) => detection.id)).toEqual(["question-box"]);
  });

  it("adds a missing question box for an uncovered semantic question anchor", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "知识点梳理",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 80, x2: 920, y2: 130 }
          },
          {
            text: "5. 已被模型框出的题目",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 300, x2: 920, y2: 345 }
          },
          {
            text: "A. 选项一 B. 选项二",
            role: "question_content",
            normalizedBBox: { x1: 100, y1: 360, x2: 900, y2: 410 }
          },
          {
            text: "6. 求物体运动到斜面底端的速度。",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 610, x2: 920, y2: 655 }
          },
          {
            text: "（1）求加速度；（2）求运动时间。",
            role: "question_content",
            normalizedBBox: { x1: 100, y1: 675, x2: 900, y2: 730 }
          },
          {
            text: "试卷第 5 页",
            role: "footer",
            normalizedBBox: { x1: 420, y1: 960, x2: 580, y2: 980 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "question-5",
            localOrder: 1,
            confidence: 0.94,
            normalizedBBox: { x1: 60, y1: 280, x2: 940, y2: 440 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,mixed-page-with-missed-anchor",
      subjectScope: "高中物理"
    });

    expect(result.detections).toEqual([
      expect.objectContaining({ id: "question-5", localOrder: 1 }),
      expect.objectContaining({
        id: expect.stringContaining("semantic-anchor"),
        localOrder: 2,
        normalizedBBox: expect.objectContaining({
          y1: expect.any(Number),
          y2: expect.any(Number)
        })
      })
    ]);
    expect(result.detections[1].normalizedBBox.y1).toBeLessThanOrEqual(610);
    expect(result.detections[1].normalizedBBox.y2).toBeGreaterThanOrEqual(730);
    expect(result.detections[1].normalizedBBox.y2).toBeLessThan(960);
  });

  it("recovers an exercise question when semantic OCR mislabels its numbered block as notes", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "2. 功能关系",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 120, x2: 300, y2: 155 }
          },
          {
            text: "【例题】",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 300, x2: 180, y2: 335 }
          },
          {
            text: "10. 如图所示，带电粒子进入偏转电场后打在荧光屏上。",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 350, x2: 920, y2: 395 }
          },
          {
            text: "（1）偏转电压多大时，粒子的偏转距离最大？",
            role: "knowledge_note",
            normalizedBBox: { x1: 100, y1: 420, x2: 900, y2: 465 }
          },
          {
            text: "试卷第 8 页",
            role: "footer",
            normalizedBBox: { x1: 420, y1: 960, x2: 580, y2: 980 }
          }
        ]
      })
      .mockResolvedValueOnce({ detections: [] });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,mislabelled-exercise",
      subjectScope: "高中物理",
      textLines: [
        {
          text: "10. 如图所示，带电粒子进入偏转电场后打在荧光屏上。",
          normalizedBBox: { x1: 80, y1: 350, x2: 920, y2: 395 }
        },
        {
          text: "（1）偏转电压多大时，粒子的偏转距离最大？",
          normalizedBBox: { x1: 100, y1: 420, x2: 900, y2: 465 }
        }
      ]
    });

    expect(result.textLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("10."),
          role: "question_anchor"
        }),
        expect.objectContaining({
          text: expect.stringContaining("（1）"),
          role: "question_content"
        })
      ])
    );
    expect(result.detections).toEqual([
      expect.objectContaining({
        id: expect.stringContaining("semantic-anchor"),
        normalizedBBox: expect.objectContaining({
          y1: expect.any(Number),
          y2: expect.any(Number)
        })
      })
    ]);
    expect(result.detections[0].normalizedBBox.y1).toBeLessThanOrEqual(350);
    expect(result.detections[0].normalizedBBox.y2).toBeGreaterThanOrEqual(465);
  });

  it("does not promote a numbered knowledge heading without exercise answer cues", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "2. 功能关系",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 120, x2: 300, y2: 155 }
          },
          {
            text: "从能量角度分析带电粒子的末速度。",
            role: "knowledge_note",
            normalizedBBox: { x1: 80, y1: 180, x2: 920, y2: 225 }
          }
        ]
      })
      .mockResolvedValueOnce({ detections: [] });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,numbered-knowledge-note",
      subjectScope: "高中物理",
      textLines: [
        {
          text: "2. 功能关系",
          normalizedBBox: { x1: 80, y1: 120, x2: 300, y2: 155 }
        }
      ]
    });

    expect(result.textLines[0]).toMatchObject({ role: "knowledge_note" });
    expect(result.detections).toEqual([]);
  });

  it("does not keep formula-summary regions when OCR mislabels their headings as questions", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "3. 三角函数的关系式",
            role: "question_anchor",
            normalizedBBox: { x1: 120, y1: 570, x2: 430, y2: 605 }
          },
          {
            text: "(1) 若 alpha+beta=90°，则 sin alpha=cos beta",
            role: "question_content",
            normalizedBBox: { x1: 80, y1: 605, x2: 420, y2: 642 }
          },
          {
            text: "1. 圆的周长公式：l=2pi r，圆的面积公式：S=pi r²",
            role: "question_anchor",
            normalizedBBox: { x1: 500, y1: 625, x2: 790, y2: 680 }
          },
          {
            text: "2. 扇形的弧长公式：l=alpha/360°·2pi r",
            role: "knowledge_note",
            normalizedBBox: { x1: 500, y1: 680, x2: 790, y2: 760 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "formula-summary-left",
            localOrder: 1,
            confidence: 0.8,
            normalizedBBox: { x1: 50, y1: 550, x2: 470, y2: 700 }
          },
          {
            id: "formula-summary-right",
            localOrder: 2,
            confidence: 0.8,
            normalizedBBox: { x1: 480, y1: 610, x2: 820, y2: 780 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,formula-summary",
      subjectScope: "高中物理",
      questionPageLayoutMode: "double_column"
    });

    expect(result.detections).toEqual([]);
    expect(result.textLines.filter((line) => line.role === "question_anchor")).toEqual([]);
  });

  it("stops a knowledge region before the next same-column exercise", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "1. 常用公式",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 100, x2: 360, y2: 135 }
          },
          {
            text: "v=s/t",
            role: "question_content",
            normalizedBBox: { x1: 80, y1: 145, x2: 300, y2: 180 }
          },
          {
            text: "2. 求小车到达终点的速度",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 250, x2: 500, y2: 290 }
          },
          {
            text: "计算小车的加速度。",
            role: "question_content",
            normalizedBBox: { x1: 100, y1: 300, x2: 500, y2: 340 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "formula",
            localOrder: 1,
            confidence: 0.8,
            normalizedBBox: { x1: 60, y1: 80, x2: 520, y2: 200 }
          },
          {
            id: "exercise",
            localOrder: 2,
            confidence: 0.9,
            normalizedBBox: { x1: 60, y1: 230, x2: 540, y2: 360 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,knowledge-before-exercise",
      subjectScope: "高中物理"
    });

    expect(result.detections.map((detection) => detection.id)).toEqual(["exercise"]);
    expect(result.textLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "1. 常用公式", role: "knowledge_note" }),
        expect.objectContaining({ text: "2. 求小车到达终点的速度", role: "question_anchor" })
      ])
    );
  });

  it("treats numbered function-method headings as knowledge when no exercise follows", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "1. 直角三角函数",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 100, x2: 360, y2: 135 }
          },
          {
            text: "2. 利用二次函数值域求最值",
            role: "question_anchor",
            normalizedBBox: { x1: 80, y1: 300, x2: 500, y2: 340 }
          },
          {
            text: "配方后可直接得到值域。",
            role: "question_content",
            normalizedBBox: { x1: 100, y1: 350, x2: 500, y2: 390 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "function-notes",
            localOrder: 1,
            confidence: 0.8,
            normalizedBBox: { x1: 60, y1: 80, x2: 540, y2: 430 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,function-method-notes",
      subjectScope: "高中物理"
    });

    expect(result.detections).toEqual([]);
  });

  it("keeps a page-head continuation box identified by semantic OCR", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "接上页，带电粒子继续运动到 B 点",
            role: "question_continuation",
            normalizedBBox: { x1: 80, y1: 30, x2: 920, y2: 90 }
          }
        ]
      })
      .mockResolvedValueOnce({
        detections: [
          {
            id: "continuation-box",
            localOrder: 1,
            confidence: 0.9,
            normalizedBBox: { x1: 60, y1: 20, x2: 940, y2: 150 }
          }
        ]
      });

    const result = await detectQuestionBoxesWithTextLayout({
      imageDataUrl: "data:image/png;base64,continuation-page",
      subjectScope: "高中物理"
    });

    expect(result.detections.map((detection) => detection.id)).toEqual(["continuation-box"]);
  });

  it("passes question regions to OCR and returns the original question number", async () => {
    callModel.mockResolvedValue({
      results: [
        {
          questionId: "q-12",
          questionNumberLabel: "12",
          classificationStatus: "matched",
          directoryMatchConfidence: 0.91,
          directoryPath: ["高中物理", "静力学", "受力分析综合"],
          directoryCandidatePaths: [["高中物理", "静力学", "受力分析综合"]],
          ocrText: "12. 如图所示，分析物体受力。"
        }
      ]
    });

    const results = await classifyDocumentQuestionsWithCodex({
      subjectScope: "高中物理",
      directoryPaths: [["高中物理", "静力学", "受力分析综合"]],
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,page-1",
          questionIds: ["q-12"],
          questionRegions: [
            {
              questionId: "q-12",
              isPrimary: true,
              normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 440 }
            }
          ]
        }
      ]
    });

    expect(results[0]).toMatchObject({
      questionId: "q-12",
      questionNumberLabel: "12",
      ocrText: "12. 如图所示，分析物体受力。"
    });
    expect(callModel.mock.calls[0][0].prompt).toContain('"questionId":"q-12"');
    expect(callModel.mock.calls[0][0].prompt).toContain('"y1":120');
  });

  it("keeps full OCR text for each detected answer block", async () => {
    callModel.mockResolvedValue({
      detectedAnswers: [
        {
          id: "answer-12",
          pageId: "page-3",
          pageNumber: 3,
          answerLabel: "12",
          ocrText: "12. 答：物体受到重力、支持力和摩擦力。",
          confidence: 0.95,
          normalizedBBox: { x1: 100, y1: 120, x2: 900, y2: 360 }
        }
      ]
    });

    const answers = await suggestAnswerMatchesWithCodex({
      answerPages: [
        {
          pageId: "page-3",
          pageNumber: 3,
          imageDataUrl: "data:image/png;base64,page-3"
        }
      ],
      questionLabels: ["12"]
    });

    expect(answers[0].ocrText).toContain("支持力");
  });

  it("allows multi-page answer matching to outlive the default single-request timeout", async () => {
    callModel.mockResolvedValue({ detectedAnswers: [] });

    await suggestAnswerMatchesWithCodex({
      answerPages: Array.from({ length: 13 }, (_, index) => ({
        pageId: `answer-page-${index + 1}`,
        pageNumber: index + 15,
        imageDataUrl: `data:image/png;base64,answer-page-${index + 1}`
      })),
      questionLabels: ["1", "2", "3"]
    });

    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({
        taskName: "suggest-answer-matches",
        timeoutMs: 600_000
      })
    );
  });

  it("drops cross-page ids that were not supplied by the workbench", async () => {
    callModel
      .mockResolvedValueOnce({
        lines: [
          {
            text: "9. 已知物体从斜面顶端",
            role: "question_content",
            normalizedBBox: { x1: 80, y1: 900, x2: 920, y2: 950 }
          }
        ]
      })
      .mockResolvedValueOnce({
        lines: [
          {
            text: "继续求物体到达底端的速度。",
            role: "question_continuation",
            normalizedBBox: { x1: 80, y1: 40, x2: 920, y2: 90 }
          }
        ]
      })
      .mockResolvedValueOnce({
        mergeCandidates: [
          {
            id: "merge-1",
            sourceQuestionIds: ["invented-left", "invented-right"],
            confidence: 0.9
          }
        ]
      });

    const candidates = await detectCrossPageWithCodex({
      leftImageDataUrl: "data:image/png;base64,left",
      rightImageDataUrl: "data:image/png;base64,right",
      leftPageId: "page-1",
      rightPageId: "page-2",
      leftTextLines: [
        {
          text: "9. 已知物体从斜面顶端",
          normalizedBBox: { x1: 80, y1: 900, x2: 920, y2: 950 }
        }
      ],
      rightTextLines: [
        {
          text: "继续求物体到达底端的速度。",
          normalizedBBox: { x1: 80, y1: 40, x2: 920, y2: 90 }
        }
      ],
      candidates: [
        {
          id: "q-1",
          pageId: "page-1",
          localOrder: 1,
          normalizedBBox: { x1: 80, y1: 700, x2: 920, y2: 990 }
        },
        {
          id: "q-2",
          pageId: "page-2",
          localOrder: 1,
          normalizedBBox: { x1: 80, y1: 20, x2: 920, y2: 280 }
        }
      ]
    });

    expect(candidates).toEqual([]);
    expect(callModel.mock.calls[2][0]).toMatchObject({
      taskName: "detect-cross-page",
      timeoutMs: 600_000
    });
    expect(callModel.mock.calls[2][0].prompt).toContain("继续求物体到达底端的速度");
  });

  it("allows cross-page classification to outlive the default single-request timeout", async () => {
    callModel.mockResolvedValue({
      results: [
        {
          questionId: "q-cross-page",
          questionNumberLabel: "12",
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.5,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionType: "计算题",
          chapterTag: "综合",
          knowledgeTags: ["综合"],
          ocrText: "12. 跨页题"
        }
      ]
    });

    await classifyDocumentQuestionsWithCodex({
      subjectScope: "高中物理",
      directoryPaths: [],
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,left",
          questionIds: ["q-cross-page"],
          questionRegions: []
        },
        {
          id: "page-2",
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,right",
          questionIds: ["q-cross-page"],
          questionRegions: []
        }
      ]
    });

    expect(callModel).toHaveBeenCalledWith(
      expect.objectContaining({
        taskName: "classify-document-questions",
        timeoutMs: 600_000
      })
    );
  });
});
