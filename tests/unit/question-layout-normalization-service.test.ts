import { describe, expect, it } from "vitest";

import {
  normalizeCrossPageQuestionWidths,
  normalizeQuestionPageLayout
} from "@/lib/services/question-layout-normalization-service";

describe("question layout normalization", () => {
  it("leaves the existing single-column path reference-for-reference unchanged", () => {
    const questions = [
      {
        id: "q-1",
        documentId: "doc-single",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 120, y: 200, width: 760, height: 300 }
        }
      }
    ];

    expect(
      normalizeQuestionPageLayout({
        questionPageLayoutMode: "single_column",
        pages: [
          {
            id: "page-1",
            documentId: "doc-single",
            pageNumber: 1,
            width: 1000,
            height: 1600,
            textLines: []
          }
        ],
        questions
      })
    ).toBe(questions);
  });

  it("uses OCR evidence to restore every ordinary double-column box to stable document lanes", () => {
    const questions = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-double",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "1. 左栏题目",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 100, x2: 450, y2: 130 }
            },
            {
              text: "2. 右栏题目",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 540, y1: 100, x2: 940, y2: 130 }
            }
          ]
        },
        {
          id: "page-2",
          documentId: "doc-double",
          pageNumber: 2,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "3. 本页只有左栏内容",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 62, y1: 120, x2: 448, y2: 150 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-left",
          documentId: "doc-double",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 90, y: 150, width: 280, height: 320 }
          }
        },
        {
          id: "q-right",
          documentId: "doc-double",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 620, y: 180, width: 240, height: 280 }
          }
        },
        {
          id: "q-left-only-page",
          documentId: "doc-double",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 3,
          bboxByPage: {
            "page-2": { x: 130, y: 200, width: 210, height: 260 }
          }
        }
      ]
    });

    const leftBox = questions[0].bboxByPage["page-1"];
    const rightBox = questions[1].bboxByPage["page-1"];
    const leftOnlyPageBox = questions[2].bboxByPage["page-2"];

    expect(leftBox).toMatchObject({ y: 150, height: 320 });
    expect(rightBox).toMatchObject({ y: 180, height: 280 });
    expect(leftBox.x).toBeLessThanOrEqual(60);
    expect(leftBox.x + leftBox.width).toBeGreaterThanOrEqual(450);
    expect(leftBox.x + leftBox.width).toBeLessThan(500);
    expect(rightBox.x).toBeGreaterThan(500);
    expect(rightBox.x).toBeLessThanOrEqual(540);
    expect(rightBox.x + rightBox.width).toBeGreaterThanOrEqual(940);
    expect(leftOnlyPageBox.x).toBe(leftBox.x);
    expect(leftOnlyPageBox.width).toBe(leftBox.width);
  });

  it("separates overlapping adjacent boxes inside each double-column lane", () => {
    const normalized = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-overlap",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "1. 左栏第一题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 80, x2: 450, y2: 105 }
            },
            {
              text: "2. 左栏第二题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 450, x2: 450, y2: 475 }
            },
            {
              text: "3. 右栏第一题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 540, y1: 90, x2: 940, y2: 115 }
            },
            {
              text: "4. 右栏第二题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 540, y1: 410, x2: 940, y2: 435 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-left-top",
          documentId: "doc-overlap",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 55, y: 100, width: 405, height: 610 }
          }
        },
        {
          id: "q-left-bottom",
          documentId: "doc-overlap",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 55, y: 700, width: 405, height: 400 }
          }
        },
        {
          id: "q-right-top",
          documentId: "doc-overlap",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 3,
          globalOrder: 3,
          bboxByPage: {
            "page-1": { x: 540, y: 120, width: 405, height: 500 }
          }
        },
        {
          id: "q-right-bottom",
          documentId: "doc-overlap",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 4,
          globalOrder: 4,
          bboxByPage: {
            "page-1": { x: 540, y: 615, width: 405, height: 450 }
          }
        }
      ]
    });

    const byId = new Map(normalized.map((question) => [question.id, question]));
    const leftTop = byId.get("q-left-top")!.bboxByPage["page-1"];
    const leftBottom = byId.get("q-left-bottom")!.bboxByPage["page-1"];
    const rightTop = byId.get("q-right-top")!.bboxByPage["page-1"];
    const rightBottom = byId.get("q-right-bottom")!.bboxByPage["page-1"];

    expect(leftTop.y + leftTop.height).toBe(leftBottom.y);
    expect(leftTop.y).toBe(100);
    expect(leftBottom.y + leftBottom.height).toBe(1100);
    expect(leftTop.x).toBe(leftBottom.x);
    expect(leftTop.width).toBe(leftBottom.width);

    expect(rightTop.y + rightTop.height).toBe(rightBottom.y);
    expect(rightTop.y).toBe(120);
    expect(rightBottom.y + rightBottom.height).toBe(1065);
    expect(rightTop.x).toBe(rightBottom.x);
    expect(rightTop.width).toBe(rightBottom.width);
  });

  it("preserves a genuine full-width question instead of forcing it into one double-column lane", () => {
    const questions = [
      {
        id: "q-spanning",
        documentId: "doc-double",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 55, y: 500, width: 890, height: 240 }
        }
      }
    ];
    const normalized = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-double",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "通栏题目",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 320, x2: 940, y2: 350 }
            }
          ]
        }
      ],
      questions
    });

    expect(normalized[0].bboxByPage["page-1"]).toEqual(
      questions[0].bboxByPage["page-1"]
    );
  });

  it("merges a same-lane subquestion continuation split by an embedded question badge", () => {
    const normalized = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-badge",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "12. 求带电粒子的运动轨迹",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 70, x2: 450, y2: 95 }
            },
            {
              text: "(1) 求初速度",
              role: "question_content" as const,
              normalizedBBox: { x1: 65, y1: 420, x2: 260, y2: 445 }
            },
            {
              text: "(2) 求离开区域的夹角",
              role: "question_content" as const,
              normalizedBBox: { x1: 65, y1: 465, x2: 360, y2: 490 }
            },
            {
              text: "第20题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 58, y1: 510, x2: 140, y2: 535 }
            },
            {
              text: "(3) 求粒子的入射位置",
              role: "question_content" as const,
              normalizedBBox: { x1: 70, y1: 545, x2: 350, y2: 570 }
            },
            {
              text: "(4) 证明轨迹与边界相切",
              role: "question_content" as const,
              normalizedBBox: { x1: 70, y1: 590, x2: 390, y2: 615 }
            },
            {
              text: "7. 右栏独立题目",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 540, y1: 70, x2: 940, y2: 95 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-left-first",
          documentId: "doc-badge",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 50, y: 95, width: 410, height: 700 }
          }
        },
        {
          id: "q-left-continuation",
          documentId: "doc-badge",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 3,
          globalOrder: 3,
          bboxByPage: {
            "page-1": { x: 50, y: 805, width: 410, height: 210 }
          }
        },
        {
          id: "q-right",
          documentId: "doc-badge",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 540, y: 100, width: 405, height: 520 }
          }
        }
      ]
    });

    expect(normalized.map((question) => question.id)).toEqual([
      "q-left-first",
      "q-right"
    ]);
    expect(normalized[0].bboxByPage["page-1"]).toMatchObject({
      y: 95,
      height: 920
    });
  });

  it("does not merge an adjacent box that contains a real new top-level question number", () => {
    const normalized = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-separate",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "12. 第一题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 80, x2: 450, y2: 105 }
            },
            {
              text: "(1) 求速度",
              role: "question_content" as const,
              normalizedBBox: { x1: 65, y1: 420, x2: 260, y2: 445 }
            },
            {
              text: "第20题",
              role: "other" as const,
              normalizedBBox: { x1: 58, y1: 510, x2: 140, y2: 535 }
            },
            {
              text: "13. 第二道独立题",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 545, x2: 450, y2: 570 }
            },
            {
              text: "(2) 第二题自己的小问",
              role: "question_content" as const,
              normalizedBBox: { x1: 65, y1: 590, x2: 350, y2: 615 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-12",
          documentId: "doc-separate",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 50, y: 100, width: 410, height: 695 }
          }
        },
        {
          id: "q-13",
          documentId: "doc-separate",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 50, y: 805, width: 410, height: 210 }
          }
        }
      ]
    });

    expect(normalized).toHaveLength(2);
  });

  it("sorts ordinary double-column questions down the left lane before the right lane", () => {
    const normalized = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-order",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "1. 左上",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 80, x2: 450, y2: 105 }
            },
            {
              text: "2. 左下",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 520, x2: 450, y2: 545 }
            },
            {
              text: "3. 右上",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 540, y1: 90, x2: 940, y2: 115 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-right-top",
          documentId: "doc-order",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 540, y: 140, width: 405, height: 340 }
          }
        },
        {
          id: "q-left-bottom",
          documentId: "doc-order",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 55, y: 820, width: 405, height: 300 }
          }
        },
        {
          id: "q-left-top",
          documentId: "doc-order",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 3,
          globalOrder: 3,
          bboxByPage: {
            "page-1": { x: 55, y: 130, width: 405, height: 400 }
          }
        }
      ]
    });

    expect(normalized.map((question) => question.id)).toEqual([
      "q-left-top",
      "q-left-bottom",
      "q-right-top"
    ]);
    expect(normalized.map((question) => question.localOrder)).toEqual([1, 2, 3]);
    expect(normalized.map((question) => question.globalOrder)).toEqual([1, 2, 3]);
  });

  it("uses a full-width question as a reading-order barrier between column regions", () => {
    const normalized = normalizeQuestionPageLayout({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          documentId: "doc-barrier",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "左栏内容",
              role: "question_content" as const,
              normalizedBBox: { x1: 60, y1: 80, x2: 450, y2: 900 }
            },
            {
              text: "右栏内容",
              role: "question_content" as const,
              normalizedBBox: { x1: 540, y1: 80, x2: 940, y2: 900 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-right-below",
          documentId: "doc-barrier",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: { "page-1": { x: 540, y: 1050, width: 405, height: 260 } }
        },
        {
          id: "q-span",
          documentId: "doc-barrier",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: { "page-1": { x: 55, y: 650, width: 890, height: 180 } }
        },
        {
          id: "q-right-above",
          documentId: "doc-barrier",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 3,
          globalOrder: 3,
          bboxByPage: { "page-1": { x: 540, y: 120, width: 405, height: 280 } }
        },
        {
          id: "q-left-below",
          documentId: "doc-barrier",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 4,
          globalOrder: 4,
          bboxByPage: { "page-1": { x: 55, y: 980, width: 405, height: 260 } }
        },
        {
          id: "q-left-above",
          documentId: "doc-barrier",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 5,
          globalOrder: 5,
          bboxByPage: { "page-1": { x: 55, y: 100, width: 405, height: 300 } }
        }
      ]
    });

    expect(normalized.map((question) => question.id)).toEqual([
      "q-left-above",
      "q-right-above",
      "q-span",
      "q-left-below",
      "q-right-below"
    ]);
  });

  it("expands every fragment of a single-column cross-page question to one document text width", () => {
    const questions = normalizeCrossPageQuestionWidths({
      pages: [
        { id: "page-1", documentId: "doc-1", width: 1200, height: 1600 },
        { id: "page-2", documentId: "doc-1", width: 1200, height: 1600 }
      ],
      questions: [
        {
          id: "q-cross",
          documentId: "doc-1",
          pageIds: ["page-1", "page-2"],
          bboxByPage: {
            "page-1": { x: 120, y: 1240, width: 920, height: 280 },
            "page-2": { x: 130, y: 60, width: 160, height: 360 }
          }
        },
        {
          id: "q-anchor-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          bboxByPage: {
            "page-1": { x: 118, y: 200, width: 925, height: 300 }
          }
        },
        {
          id: "q-anchor-2",
          documentId: "doc-1",
          pageIds: ["page-2"],
          bboxByPage: {
            "page-2": { x: 120, y: 520, width: 920, height: 300 }
          }
        }
      ]
    });

    expect(questions[0].bboxByPage).toEqual({
      "page-1": { x: 118, y: 1240, width: 925, height: 280 },
      "page-2": { x: 118, y: 60, width: 925, height: 360 }
    });
    expect(questions[1].bboxByPage["page-1"]).toEqual({
      x: 118,
      y: 200,
      width: 925,
      height: 300
    });
  });

  it("normalizes a two-column continuation to its own column instead of the whole page", () => {
    const questions = normalizeCrossPageQuestionWidths({
      pages: [
        { id: "page-1", documentId: "doc-2", width: 1200, height: 1600 },
        { id: "page-2", documentId: "doc-2", width: 1200, height: 1600 }
      ],
      questions: [
        {
          id: "q-cross",
          documentId: "doc-2",
          pageIds: ["page-1", "page-2"],
          bboxByPage: {
            "page-1": { x: 640, y: 1240, width: 480, height: 280 },
            "page-2": { x: 82, y: 50, width: 135, height: 320 }
          }
        },
        {
          id: "q-left-1",
          documentId: "doc-2",
          pageIds: ["page-1"],
          bboxByPage: {
            "page-1": { x: 70, y: 120, width: 500, height: 300 }
          }
        },
        {
          id: "q-left-2",
          documentId: "doc-2",
          pageIds: ["page-2"],
          bboxByPage: {
            "page-2": { x: 72, y: 500, width: 498, height: 260 }
          }
        },
        {
          id: "q-right-1",
          documentId: "doc-2",
          pageIds: ["page-1"],
          bboxByPage: {
            "page-1": { x: 630, y: 160, width: 500, height: 300 }
          }
        },
        {
          id: "q-right-2",
          documentId: "doc-2",
          pageIds: ["page-2"],
          bboxByPage: {
            "page-2": { x: 632, y: 540, width: 498, height: 260 }
          }
        }
      ]
    });

    expect(questions[0].bboxByPage).toEqual({
      "page-1": { x: 630, y: 1240, width: 500, height: 280 },
      "page-2": { x: 70, y: 50, width: 500, height: 320 }
    });
    expect(questions[0].bboxByPage["page-2"].width).toBeLessThan(1200 * 0.55);
  });
});
