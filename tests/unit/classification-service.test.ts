import { describe, expect, it } from "vitest";

import {
  collectSimilarQuestionIdsForBatchApply,
  collectQuestionIdsNeedingClassification,
  applyClassificationResults,
  buildDocumentClassificationTasks,
  bulkConfirmQuestions,
  collectHighConfidenceQuestionIds,
  groupQuestionsByDirectoryReview,
  groupQuestionIdsByReviewReadiness,
  prioritizeQuestionsForReview,
  restoreQuestionConfirmations
} from "@/lib/services/classification-service";

describe("classification-service", () => {
  it("builds one OCR task per question and keeps every region of a cross-page question", () => {
    const tasks = buildDocumentClassificationTasks({
      questionIds: ["q-cross", "q-single"],
      pages: [
        {
          id: "page-1",
          width: 1000,
          height: 2000,
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,page-1"
        },
        {
          id: "page-2",
          width: 1000,
          height: 2000,
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,page-2"
        }
      ],
      questions: [
        {
          id: "q-cross",
          globalOrder: 1,
          pageIds: ["page-1", "page-2"],
          primaryPageId: "page-1",
          bboxByPage: {
            "page-1": { x: 100, y: 1400, width: 800, height: 560 },
            "page-2": { x: 100, y: 20, width: 800, height: 500 }
          }
        },
        {
          id: "q-single",
          globalOrder: 2,
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          bboxByPage: {
            "page-2": { x: 100, y: 600, width: 800, height: 500 }
          }
        }
      ]
    });

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toEqual({
      questionId: "q-cross",
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,page-1",
          questionIds: ["q-cross"],
          questionRegions: [
            {
              questionId: "q-cross",
              isPrimary: true,
              normalizedBBox: { x1: 100, y1: 700, x2: 900, y2: 980 }
            }
          ]
        },
        {
          id: "page-2",
          reviewStatus: "reviewed",
          imageDataUrl: "data:image/png;base64,page-2",
          questionIds: ["q-cross"],
          questionRegions: [
            {
              questionId: "q-cross",
              isPrimary: false,
              normalizedBBox: { x1: 100, y1: 10, x2: 900, y2: 260 }
            }
          ]
        }
      ]
    });
    expect(tasks[1].questionId).toBe("q-single");
  });

  it("applies question type and tags from classification results", () => {
    const nextQuestions = applyClassificationResults([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null
      }
    ], "doc-1", [
      {
        questionId: "q-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["高中数学", "函数", "函数图像"],
        directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
        questionType: "选择题",
        chapterTag: "函数",
        knowledgeTags: ["函数图像", "数形结合"],
        ocrText: "已识别题干"
      }
    ]);

    expect(nextQuestions[0]).toMatchObject({
      status: "auto_classified",
      classificationStatus: "matched",
      directoryPath: ["我的题库", "高中数学", "函数", "函数图像"],
      directoryCandidatePaths: [["我的题库", "高中数学", "函数", "函数图像"]],
      questionType: "选择题",
      chapterTag: "函数",
      knowledgeTags: ["函数图像", "数形结合"],
      ocrText: "已识别题干"
    });
  });

  it("writes the original PDF question number from OCR before answer matching", () => {
    const nextQuestions = applyClassificationResults([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        questionNumberLabel: null
      }
    ], "doc-1", [
      {
        questionId: "q-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["高中数学", "函数", "函数图像"],
        directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
        questionNumberLabel: null,
        ocrText: "第 12 题 已知函数 f(x)，求其单调区间。"
      }
    ]);

    expect(nextQuestions[0].questionNumberLabel).toBe("12");
  });

  it("prefers the model question number field and normalizes it", () => {
    const nextQuestions = applyClassificationResults([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        questionNumberLabel: null
      }
    ], "doc-1", [
      {
        questionId: "q-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["高中数学", "函数", "函数图像"],
        directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
        questionNumberLabel: "Q08",
        ocrText: "8. 已知函数 f(x)。"
      }
    ]);

    expect(nextQuestions[0].questionNumberLabel).toBe("08");
  });

  it("replaces a stale page-local number with the original number returned by OCR", () => {
    const nextQuestions = applyClassificationResults([
      {
        id: "q-25",
        documentId: "doc-1",
        pageIds: ["page-10"],
        primaryPageId: "page-10",
        localOrder: 1,
        globalOrder: 25,
        bboxByPage: {},
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        questionNumberLabel: "1"
      }
    ], "doc-1", [
      {
        questionId: "q-25",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["高中物理", "曲线运动"],
        directoryCandidatePaths: [["高中物理", "曲线运动"]],
        questionNumberLabel: "25",
        ocrText: "25. 在水平面内做曲线运动的物体"
      }
    ]);

    expect(nextQuestions[0].questionNumberLabel).toBe("25");
  });

  it("keeps non-library classification paths unchanged", () => {
    const nextQuestions = applyClassificationResults([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null
      }
    ], "doc-1", [
      {
        questionId: "q-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [["subject-a", "folder-a"]],
        ocrText: "recognized text"
      }
    ]);

    expect(nextQuestions[0]).toMatchObject({
      directoryPath: ["subject-a", "folder-a"],
      directoryCandidatePaths: [["subject-a", "folder-a"]]
    });
  });

  it("collects high-confidence question ids only when they already have a question-bank directory", () => {
    const ids = collectHighConfidenceQuestionIds([
      {
        id: "q-1",
        documentId: "doc-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.82,
        directoryPath: ["我的题库", "高中数学", "函数"]
      },
      {
        id: "q-2",
        documentId: "doc-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.8,
        directoryPath: null
      },
      {
        id: "q-3",
        documentId: "doc-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.79,
        directoryPath: ["我的题库", "高中数学", "几何"]
      },
      {
        id: "q-4",
        documentId: "doc-2",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.95,
        directoryPath: ["我的题库", "高中数学", "函数"]
      },
      {
        id: "q-5",
        documentId: "doc-1",
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "待定区"]
      },
      {
        id: "q-6",
        documentId: "doc-1",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.93,
        directoryPath: ["高中物理", "静力学", "受力分析综合"]
      }
    ], "doc-1");

    expect(ids).toEqual(["q-1", "q-6"]);
  });

  it("splits current-file questions into ready and blocked groups by page review state", () => {
    const groups = groupQuestionIdsByReviewReadiness({
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          questionIds: ["q-1", "q-2"]
        },
        {
          id: "page-2",
          reviewStatus: "unreviewed",
          questionIds: ["q-3"]
        }
      ]
    });

    expect(groups).toEqual({
      readyQuestionIds: ["q-1", "q-2"],
      blockedQuestionIds: ["q-3"]
    });
  });

  it("counts a cross-page question once and blocks it when any referenced page is unreviewed", () => {
    const groups = groupQuestionIdsByReviewReadiness({
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          questionIds: ["q-cross-page", "q-ready"]
        },
        {
          id: "page-2",
          reviewStatus: "unreviewed",
          questionIds: ["q-cross-page", "q-blocked"]
        },
        {
          id: "page-3",
          reviewStatus: "reviewed",
          questionIds: ["q-ready"]
        }
      ]
    });

    expect(groups).toEqual({
      readyQuestionIds: ["q-ready"],
      blockedQuestionIds: ["q-cross-page", "q-blocked"]
    });
  });

  it("prioritizes current-file review questions by decision urgency", () => {
    const questions = prioritizeQuestionsForReview([
      {
        id: "q-auto",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 4,
        bboxByPage: {},
        status: "auto_classified",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "matched",
        directoryMatchConfidence: 0.92
      },
      {
        id: "q-low",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 3,
        bboxByPage: {},
        status: "semantic_draft",
        source: "ai",
        confidence: 0.73,
        crossPageGroupId: null,
        classificationStatus: "matched",
        directoryMatchConfidence: 0.64
      },
      {
        id: "q-pending",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {},
        status: "pending_bucket",
        source: "manual",
        confidence: 0.4,
        crossPageGroupId: null,
        classificationStatus: "pending_bucket",
        directoryMatchConfidence: 0.3
      },
      {
        id: "q-choice",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.5,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.41
      },
      {
        id: "q-reviewed",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 5,
        bboxByPage: {},
        status: "reviewed",
        source: "manual",
        confidence: 0.98,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.98
      }
    ], "doc-1");

    expect(questions.map((question) => question.id)).toEqual([
      "q-choice",
      "q-pending",
      "q-low",
      "q-auto"
    ]);
  });

  it("groups review questions by their assigned or leading candidate directory", () => {
    const groups = groupQuestionsByDirectoryReview([
      {
        id: "q-choice-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.5,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryCandidatePaths: [
          ["高中数学", "函数", "函数图像"],
          ["高中数学", "函数", "函数性质"]
        ]
      },
      {
        id: "q-choice-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.48,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryCandidatePaths: [
          ["高中数学", "函数", "函数图像"]
        ]
      },
      {
        id: "q-pending",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 3,
        globalOrder: 3,
        bboxByPage: {},
        status: "pending_bucket",
        source: "ai",
        confidence: 0.4,
        crossPageGroupId: null,
        classificationStatus: "pending_bucket",
        directoryPath: ["我的题库", "高中数学", "待定区"]
      }
    ]);

    expect(
      groups.map((group) => ({
        directoryPath: group.directoryPath,
        questionIds: group.questions.map((question) => question.id)
      }))
    ).toEqual([
      {
        directoryPath: ["高中数学", "函数", "函数图像"],
        questionIds: ["q-choice-1", "q-choice-2"]
      },
      {
        directoryPath: ["我的题库", "高中数学", "待定区"],
        questionIds: ["q-pending"]
      }
    ]);
  });

  it("confirms high-confidence questions in bulk and can restore them from snapshots", () => {
    const result = bulkConfirmQuestions([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "auto_classified",
        source: "ai",
        confidence: 0.93,
        crossPageGroupId: null,
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["高中数学", "函数"],
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {},
        status: "semantic_draft",
        source: "ai",
        confidence: 0.69,
        crossPageGroupId: null,
        classificationStatus: "matched",
        directoryMatchConfidence: 0.61,
        lastBulkConfirmationId: null
      }
    ], ["q-1"], "bulk-1");

    expect(result.undoSnapshots).toEqual([
      {
        id: "q-1",
        status: "auto_classified",
        classificationStatus: "matched",
        lastBulkConfirmationId: null
      }
    ]);
    expect(result.nextQuestions.find((question) => question.id === "q-1")).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["我的题库", "高中数学", "函数"],
      lastBulkConfirmationId: "bulk-1"
    });

    const restored = restoreQuestionConfirmations(result.nextQuestions, result.undoSnapshots);

    expect(restored.find((question) => question.id === "q-1")).toMatchObject({
      status: "auto_classified",
      classificationStatus: "matched",
      lastBulkConfirmationId: null
    });
  });

  it("collects only newly added or invalidated questions for rerun classification", () => {
    const ids = collectQuestionIdsNeedingClassification([
      {
        id: "q-reviewed",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.94,
        ocrText: "已完成"
      },
      {
        id: "q-new",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {},
        status: "manual_only",
        source: "manual",
        confidence: 1,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        ocrText: null
      },
      {
        id: "q-invalidated",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 3,
        globalOrder: 3,
        bboxByPage: {},
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.87,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        ocrText: null
      }
    ], "doc-1");

    expect(ids).toEqual(["q-new", "q-invalidated"]);
  });

  it("collects similar questions for batch directory apply from the current document", () => {
    const ids = collectSimilarQuestionIdsForBatchApply([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.61,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryCandidatePaths: [
          ["高中数学", "函数", "函数图像"],
          ["高中数学", "函数", "函数性质"]
        ]
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.58,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryCandidatePaths: [
          ["高中数学", "函数", "函数图像"],
          ["高中数学", "解析几何", "直线与圆"]
        ]
      },
      {
        id: "q-3",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 3,
        globalOrder: 3,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.57,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryCandidatePaths: [
          ["高中数学", "解析几何", "直线与圆"]
        ]
      },
      {
        id: "q-4",
        documentId: "doc-2",
        pageIds: ["page-9"],
        primaryPageId: "page-9",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {},
        status: "needs_choice",
        source: "ai",
        confidence: 0.59,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryCandidatePaths: [
          ["高中数学", "函数", "函数图像"]
        ]
      }
    ], {
      documentId: "doc-1",
      anchorQuestionId: "q-1"
    });

    expect(ids).toEqual(["q-2"]);
  });
});
