import { describe, expect, it } from "vitest";

import {
  buildQuestionDraftsFromDetection,
  buildClassificationRun,
  expandNormalizedBBox,
  mapNormalizedBboxToPixels,
  separateOverlappingQuestionDetections
} from "@/lib/services/analysis-service";

describe("analysis-service", () => {
  it("maps 1000-scale normalized bbox to pixel coordinates", () => {
    expect(
      mapNormalizedBboxToPixels(
        { x1: 100, y1: 200, x2: 900, y2: 800 },
        { width: 1200, height: 1600 }
      )
    ).toEqual({
      x: 120,
      y: 320,
      width: 960,
      height: 960
    });
  });

  it("adds safe whitespace around model boxes without crossing page edges", () => {
    expect(
      expandNormalizedBBox({ x1: 5, y1: 10, x2: 995, y2: 990 })
    ).toEqual({
      x1: 0,
      y1: 0,
      x2: 1000,
      y2: 1000
    });

    expect(
      expandNormalizedBBox({ x1: 100, y1: 100, x2: 900, y2: 320 })
    ).toEqual({
      x1: 92,
      y1: 85,
      x2: 908,
      y2: 335
    });
  });

  it("builds current-file classification runs from reviewed pages only", () => {
    const run = buildClassificationRun({
      documentId: "doc-1",
      directoryPaths: [
        ["高中数学", "函数", "二次函数"],
        ["高中数学", "解析几何", "直线与圆"]
      ],
      pages: [
        { id: "page-1", reviewStatus: "reviewed", questionIds: ["q-1", "q-2"] },
        { id: "page-2", reviewStatus: "unreviewed", questionIds: ["q-3"] }
      ]
    });

    expect(run).toEqual({
      documentId: "doc-1",
      questionIds: ["q-1", "q-2"],
      results: [
        {
          questionId: "q-1",
          classificationStatus: "matched",
          directoryMatchConfidence: 0.86,
          directoryPath: ["高中数学", "函数", "二次函数"],
          directoryCandidatePaths: [
            ["高中数学", "函数", "二次函数"],
            ["高中数学", "解析几何", "直线与圆"]
          ],
          questionType: "其他",
          chapterTag: "二次函数",
          knowledgeTags: ["二次函数示例考点 1"],
          ocrText: "题目 1 的示例 OCR 结果"
        },
        {
          questionId: "q-2",
          classificationStatus: "matched",
          directoryMatchConfidence: 0.86,
          directoryPath: ["高中数学", "解析几何", "直线与圆"],
          directoryCandidatePaths: [
            ["高中数学", "解析几何", "直线与圆"],
            ["高中数学", "函数", "二次函数"]
          ],
          questionType: "其他",
          chapterTag: "直线与圆",
          knowledgeTags: ["直线与圆示例考点 2"],
          ocrText: "题目 2 的示例 OCR 结果"
        }
      ]
    });
  });

  it("returns needs-choice results when no existing directory is matchable", () => {
    const run = buildClassificationRun({
      documentId: "doc-1",
      directoryPaths: [],
      pages: [
        { id: "page-1", reviewStatus: "reviewed", questionIds: ["q-1"] }
      ]
    });

    expect(run.results).toEqual([
      {
        questionId: "q-1",
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.35,
        directoryPath: null,
        directoryCandidatePaths: [],
        questionType: "其他",
        chapterTag: "未分类",
        knowledgeTags: ["知识点待补充 1"],
        ocrText: "题目 1 的示例 OCR 结果"
      }
    ]);
  });

  it("builds geometry draft questions from normalized detections", () => {
    const questions = buildQuestionDraftsFromDetection({
      documentId: "doc-1",
      pageId: "page-1",
      detections: [
        {
          id: "draft-1",
          localOrder: 1,
          confidence: 0.93,
          normalizedBBox: {
            x1: 100,
            y1: 100,
            x2: 900,
            y2: 320
          }
        }
      ],
      size: {
        width: 1200,
        height: 1600
      }
    });

    expect(questions).toEqual([
      {
        id: "page-1-draft-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": {
            x: 110,
            y: 136,
            width: 980,
            height: 400
          }
        },
        source: "ai",
        status: "geometry_draft",
        confidence: 0.93,
        crossPageGroupId: null
      }
    ]);
  });

  it("persists the confirmed page layout mode on every detected question", () => {
    const questions = buildQuestionDraftsFromDetection({
      documentId: "doc-double-column",
      pageId: "page-1",
      pageLayoutMode: "double_column",
      detections: [
        {
          id: "draft-1",
          localOrder: 1,
          confidence: 0.96,
          normalizedBBox: { x1: 50, y1: 80, x2: 480, y2: 420 }
        }
      ],
      size: { width: 1200, height: 1600 }
    });

    expect(questions[0].pageLayoutMode).toBe("double_column");
  });

  it("scopes detector ids by page to avoid cross-page question selection collisions", () => {
    const firstPageQuestions = buildQuestionDraftsFromDetection({
      documentId: "doc-1",
      pageId: "page-1",
      detections: [
        {
          id: "draft-1",
          localOrder: 1,
          confidence: 0.93,
          normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 320 }
        }
      ],
      size: { width: 1200, height: 1600 }
    });
    const secondPageQuestions = buildQuestionDraftsFromDetection({
      documentId: "doc-1",
      pageId: "page-2",
      detections: [
        {
          id: "draft-1",
          localOrder: 1,
          confidence: 0.91,
          normalizedBBox: { x1: 100, y1: 120, x2: 900, y2: 340 }
        }
      ],
      size: { width: 1200, height: 1600 }
    });

    expect(firstPageQuestions[0].id).toBe("page-1-draft-1");
    expect(secondPageQuestions[0].id).toBe("page-2-draft-1");
    expect(new Set([firstPageQuestions[0].id, secondPageQuestions[0].id]).size).toBe(2);
  });

  it("removes near-duplicate detections before creating question drafts", () => {
    const questions = buildQuestionDraftsFromDetection({
      documentId: "doc-1",
      pageId: "page-1",
      detections: [
        {
          id: "draft-wide",
          localOrder: 1,
          confidence: 0.78,
          normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 320 }
        },
        {
          id: "draft-duplicate",
          localOrder: 1,
          confidence: 0.96,
          normalizedBBox: { x1: 105, y1: 104, x2: 895, y2: 318 }
        }
      ],
      size: { width: 1000, height: 1000 }
    });

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe("page-1-draft-duplicate");
  });

  it("separates lightly overlapping same-column boxes after safe padding", () => {
    const detections = [
      {
        id: "draft-1",
        localOrder: 1,
        confidence: 0.9,
        normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 320 }
      },
      {
        id: "draft-2",
        localOrder: 2,
        confidence: 0.9,
        normalizedBBox: { x1: 100, y1: 300, x2: 900, y2: 520 }
      }
    ];

    const normalized = separateOverlappingQuestionDetections(detections);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].normalizedBBox.y2).toBeLessThanOrEqual(
      normalized[1].normalizedBBox.y1
    );
  });

  it("keeps an exam-source line with the numbered question that follows it", () => {
    const questions = buildQuestionDraftsFromDetection({
      documentId: "doc-1",
      pageId: "page-1",
      detections: [
        {
          id: "continuation",
          localOrder: 1,
          confidence: 0.93,
          normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 340 }
        },
        {
          id: "next-question",
          localOrder: 2,
          confidence: 0.95,
          normalizedBBox: { x1: 100, y1: 345, x2: 900, y2: 600 }
        }
      ],
      textLines: [
        {
          text: "D. 物体继续运动至页面末尾",
          normalizedBBox: { x1: 120, y1: 290, x2: 700, y2: 305 }
        },
        {
          text: "（24-25 高一下 · 广东某中学 · 期中）",
          normalizedBBox: { x1: 120, y1: 315, x2: 650, y2: 328 }
        },
        {
          text: "12．如图所示，求小球落地速度",
          normalizedBBox: { x1: 120, y1: 350, x2: 760, y2: 365 }
        }
      ],
      size: { width: 1000, height: 1000 }
    });

    const continuationBox = questions[0].bboxByPage["page-1"];
    const nextQuestionBox = questions[1].bboxByPage["page-1"];

    expect(continuationBox.y + continuationBox.height).toBeLessThan(315);
    expect(nextQuestionBox.y).toBeLessThan(315);
    expect(continuationBox.y + continuationBox.height).toBeLessThan(nextQuestionBox.y);
  });

  it("does not treat an ordinary parenthesized continuation line as exam-source metadata", () => {
    const questions = buildQuestionDraftsFromDetection({
      documentId: "doc-1",
      pageId: "page-1",
      detections: [
        {
          id: "question-1",
          localOrder: 1,
          confidence: 0.93,
          normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 340 }
        },
        {
          id: "question-2",
          localOrder: 2,
          confidence: 0.95,
          normalizedBBox: { x1: 100, y1: 345, x2: 900, y2: 600 }
        }
      ],
      textLines: [
        {
          text: "（2）继续求物体通过 B 点的速度",
          normalizedBBox: { x1: 120, y1: 315, x2: 650, y2: 328 }
        },
        {
          text: "12．下一道独立题目",
          normalizedBBox: { x1: 120, y1: 350, x2: 760, y2: 365 }
        }
      ],
      size: { width: 1000, height: 1000 }
    });

    expect(questions[0].bboxByPage["page-1"].y + questions[0].bboxByPage["page-1"].height)
      .toBeGreaterThanOrEqual(315);
  });

  it("does not vertically trim independent side-by-side question columns", () => {
    const normalized = separateOverlappingQuestionDetections([
      {
        id: "left",
        localOrder: 1,
        confidence: 0.9,
        normalizedBBox: { x1: 80, y1: 100, x2: 440, y2: 500 }
      },
      {
        id: "right",
        localOrder: 2,
        confidence: 0.9,
        normalizedBBox: { x1: 560, y1: 100, x2: 920, y2: 500 }
      }
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0].normalizedBBox).toEqual({ x1: 80, y1: 100, x2: 440, y2: 500 });
    expect(normalized[1].normalizedBBox).toEqual({ x1: 560, y1: 100, x2: 920, y2: 500 });
  });
});
