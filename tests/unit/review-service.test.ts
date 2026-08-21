import { describe, expect, it } from "vitest";

import {
  acceptCrossPageCandidate,
  buildCrossPageCandidateReviewDisplay,
  buildEdgeContinuationCrossPageArtifacts,
  canTriggerDocumentClassification,
  clearCrossPageCandidatesForDocument,
  createManualQuestionDraft,
  dismissCrossPageCandidate,
  hasUnreviewedPagesInDocument,
  mergeQuestionsAcrossPages,
  mergeQuestionSequenceForDisplay,
  reconcileQuestionAfterGeometryChange,
  reconcileQuestionsAfterCrossPageReview,
  removeQuestionDraftById,
  shouldInvalidateQuestionSemantics
} from "@/lib/services/review-service";

describe("review-service", () => {
  it("allows document classification when at least one page is geometry reviewed", () => {
    expect(
      canTriggerDocumentClassification([
        { id: "page-1", reviewStatus: "reviewed" },
        { id: "page-2", reviewStatus: "unreviewed" }
      ])
    ).toBe(true);

    expect(
      canTriggerDocumentClassification([
        { id: "page-1", reviewStatus: "unreviewed" }
      ])
    ).toBe(false);
  });

  it("keeps original question references while recomputing display order after merge", () => {
    const merged = mergeQuestionSequenceForDisplay([
      { id: "q-1", sourceQuestionIds: ["q-1"] },
      { id: "q-2", sourceQuestionIds: ["q-2"] }
    ], {
      mergedQuestionId: "q-1-q-2",
      sourceQuestionIds: ["q-1", "q-2"]
    });

    expect(merged).toEqual([
      {
        id: "q-1-q-2",
        displayOrder: 1,
        sourceQuestionIds: ["q-1", "q-2"]
      }
    ]);
  });

  it("invalidates semantics only when a processed question changed and user chose rerun", () => {
    expect(
      shouldInvalidateQuestionSemantics({
        hasProcessedSemantics: true,
        geometryChanged: true,
        userChoseRerun: true,
        newlyAddedQuestion: false
      })
    ).toBe(true);

    expect(
      shouldInvalidateQuestionSemantics({
        hasProcessedSemantics: true,
        geometryChanged: true,
        userChoseRerun: false,
        newlyAddedQuestion: false
      })
    ).toBe(false);

    expect(
      shouldInvalidateQuestionSemantics({
        hasProcessedSemantics: false,
        geometryChanged: true,
        userChoseRerun: true,
        newlyAddedQuestion: true
      })
    ).toBe(false);
  });

  it("keeps semantic results when geometry changed but the user chose not to rerun", () => {
    const revised = reconcileQuestionAfterGeometryChange({
      id: "q-1",
      documentId: "doc-1",
      pageIds: ["page-1"],
      primaryPageId: "page-1",
      localOrder: 1,
      globalOrder: 1,
      bboxByPage: {
        "page-1": { x: 100, y: 120, width: 800, height: 300 }
      },
      status: "reviewed",
      source: "ai",
      confidence: 0.91,
      crossPageGroupId: null,
      classificationStatus: "confirmed",
      directoryMatchConfidence: 0.93,
      directoryPath: ["高中数学", "函数", "函数图像"],
      directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
      ocrText: "已处理题干",
      lastBulkConfirmationId: "bulk-1"
    }, {
      selectedPageId: "page-1",
      userChoseRerun: false
    });

    expect(revised).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["高中数学", "函数", "函数图像"],
      ocrText: "已处理题干",
      lastBulkConfirmationId: "bulk-1",
      lastSemanticRevisionSource: "geometry_preserved_without_rerun"
    });
    expect(revised.bboxByPage["page-1"]).toEqual({
      x: 112,
      y: 132,
      width: 800,
      height: 300
    });
  });

  it("invalidates only the affected question semantics when geometry changed and rerun was chosen", () => {
    const revised = reconcileQuestionAfterGeometryChange({
      id: "q-1",
      documentId: "doc-1",
      pageIds: ["page-1"],
      primaryPageId: "page-1",
      localOrder: 1,
      globalOrder: 1,
      bboxByPage: {
        "page-1": { x: 100, y: 120, width: 800, height: 300 }
      },
      status: "reviewed",
      source: "ai",
      confidence: 0.91,
      crossPageGroupId: null,
      classificationStatus: "confirmed",
      directoryMatchConfidence: 0.93,
      directoryPath: ["高中数学", "函数", "函数图像"],
      directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
      ocrText: "已处理题干",
      lastBulkConfirmationId: "bulk-1"
    }, {
      selectedPageId: "page-1",
      userChoseRerun: true
    });

    expect(revised).toMatchObject({
      status: "geometry_reviewed",
      classificationStatus: "unclassified",
      directoryMatchConfidence: null,
      directoryPath: null,
      directoryCandidatePaths: [],
      questionType: null,
      ocrText: null,
      lastBulkConfirmationId: null,
      lastSemanticRevisionSource: "geometry_rerun_pending"
    });
    expect(revised.bboxByPage["page-1"]).toEqual({
      x: 112,
      y: 132,
      width: 800,
      height: 300
    });
  });

  it("detects when the current document still has unreviewed pages", () => {
    expect(
      hasUnreviewedPagesInDocument([
        {
          id: "page-1",
          documentId: "doc-1",
          reviewStatus: "reviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          reviewStatus: "unreviewed"
        }
      ], "doc-1")
    ).toBe(true);

    expect(
      hasUnreviewedPagesInDocument([
        {
          id: "page-1",
          documentId: "doc-1",
          reviewStatus: "reviewed"
        }
      ], "doc-1")
    ).toBe(false);
  });

  it("clears only the current document cross-page candidates", () => {
    expect(
      clearCrossPageCandidatesForDocument([
        {
          id: "merge-1",
          documentId: "doc-1"
        },
        {
          id: "merge-2",
          documentId: "doc-2"
        }
      ], "doc-1")
    ).toEqual([
      {
        id: "merge-2",
        documentId: "doc-2"
      }
    ]);
  });

  it("marks one cross-page candidate as accepted without changing other candidates", () => {
    expect(
      acceptCrossPageCandidate([
        {
          id: "merge-1",
          status: "suggested"
        },
        {
          id: "merge-2",
          status: "suggested"
        }
      ], "merge-1")
    ).toEqual([
      {
        id: "merge-1",
        status: "accepted"
      },
      {
        id: "merge-2",
        status: "suggested"
      }
    ]);
  });

  it("dismisses one cross-page candidate without touching others", () => {
    expect(
      dismissCrossPageCandidate([
        {
          id: "merge-1",
          status: "suggested"
        },
        {
          id: "merge-2",
          status: "accepted"
        }
      ], "merge-1")
    ).toEqual([
      {
        id: "merge-1",
        status: "dismissed"
      },
      {
        id: "merge-2",
        status: "accepted"
      }
    ]);
  });

  it("formats cross-page candidates with page and question labels instead of internal ids", () => {
    expect(
      buildCrossPageCandidateReviewDisplay({
        candidate: {
          id: "page-effd641a-merge-1",
          documentId: "doc-1",
          leftPageId: "page-1",
          rightPageId: "page-2",
          sourceQuestionIds: ["q-1", "q-2"],
          confidence: 0.86,
          status: "suggested"
        },
        pages: [
          { id: "page-1", pageNumber: 1 },
          { id: "page-2", pageNumber: 2 }
        ],
        questions: [
          {
            id: "q-1",
            primaryPageId: "page-1",
            localOrder: 3,
            globalOrder: 3,
            questionNumberLabel: "3"
          },
          {
            id: "q-2",
            primaryPageId: "page-2",
            localOrder: 1,
            globalOrder: 4,
            questionNumberLabel: null
          }
        ]
      })
    ).toEqual({
      title: "第 1 页 Q3 + 第 2 页 Q1",
      pageRange: "第 1 页 → 第 2 页",
      sourceLabels: ["第 1 页 Q3", "第 2 页 Q1"]
    });
  });

  it("creates a top-of-page continuation draft when the previous page ends at the bottom", () => {
    const result = buildEdgeContinuationCrossPageArtifacts({
      documentId: "doc-1",
      pages: [
        { id: "page-1", pageNumber: 1, width: 1200, height: 1600 },
        { id: "page-2", pageNumber: 2, width: 1200, height: 1600 }
      ],
      questions: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 4,
          globalOrder: 4,
          bboxByPage: {
            "page-1": { x: 120, y: 1240, width: 920, height: 320 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        },
        {
          id: "q-2",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 5,
          bboxByPage: {
            "page-2": { x: 120, y: 420, width: 920, height: 300 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        }
      ]
    });

    expect(result.questionDrafts).toHaveLength(1);
    expect(result.questionDrafts[0]).toMatchObject({
      id: "page-2-continuation-from-q-1",
      documentId: "doc-1",
      pageIds: ["page-2"],
      primaryPageId: "page-2",
      localOrder: 0,
      globalOrder: 5,
      source: "ai",
      confidence: 0.72,
      bboxByPage: {
        "page-2": {
          x: 120,
          y: 56,
          width: 920,
          height: 300
        }
      }
    });
    expect(result.candidates).toEqual([
      {
        id: "page-1-page-2-edge-continuation-q-1",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-1", "page-2-continuation-from-q-1"],
        confidence: 0.72,
        status: "suggested"
      }
    ]);
  });

  it("uses an existing top-of-page box as the continuation candidate", () => {
    const result = buildEdgeContinuationCrossPageArtifacts({
      documentId: "doc-1",
      pages: [
        { id: "page-1", pageNumber: 1, width: 1200, height: 1600 },
        { id: "page-2", pageNumber: 2, width: 1200, height: 1600, textLines: [] }
      ],
      questions: [
        {
          id: "q-4",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 4,
          globalOrder: 4,
          bboxByPage: {
            "page-1": { x: 120, y: 1240, width: 920, height: 320 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionNumberLabel: null,
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        },
        {
          id: "q-page-top",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 5,
          bboxByPage: {
            "page-2": { x: 120, y: 40, width: 920, height: 260 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionNumberLabel: null,
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        }
      ]
    });

    expect(result.questionDrafts).toEqual([]);
    expect(result.candidates).toEqual([
      {
        id: "page-1-page-2-edge-continuation-q-4",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-4", "q-page-top"],
        confidence: 0.8,
        status: "suggested"
      }
    ]);
  });

  it("does not mark a numbered top-of-page question as a continuation", () => {
    const result = buildEdgeContinuationCrossPageArtifacts({
      documentId: "doc-1",
      pages: [
        { id: "page-1", pageNumber: 1, width: 1200, height: 1600 },
        {
          id: "page-2",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          textLines: [
            {
              text: "5. 如图所示",
              normalizedBBox: { x1: 100, y1: 30, x2: 900, y2: 70 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-4",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 4,
          globalOrder: 4,
          bboxByPage: {
            "page-1": { x: 120, y: 1240, width: 920, height: 320 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionNumberLabel: null,
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        },
        {
          id: "q-5",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 5,
          bboxByPage: {
            "page-2": { x: 120, y: 40, width: 920, height: 260 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionNumberLabel: null,
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        }
      ]
    });

    expect(result.questionDrafts).toEqual([]);
    expect(result.candidates).toEqual([]);
  });

  it("does not create a first-page header continuation draft without a previous page", () => {
    const result = buildEdgeContinuationCrossPageArtifacts({
      documentId: "doc-1",
      pages: [{ id: "page-1", pageNumber: 1, width: 1200, height: 1600 }],
      questions: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 420, width: 920, height: 300 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: null,
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: null
        }
      ]
    });

    expect(result.questionDrafts).toEqual([]);
    expect(result.candidates).toEqual([]);
  });

  it("merges two questions into one cross-page question and preserves page bboxes", () => {
    const merged = mergeQuestionsAcrossPages([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 100, y: 120, width: 800, height: 300 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.93,
        crossPageGroupId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 110, y: 140, width: 760, height: 280 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.88,
        crossPageGroupId: null
      }
    ], {
      mergedQuestionId: "merge-q-1-q-2",
      sourceQuestionIds: ["q-1", "q-2"],
      crossPageGroupId: "cross-1"
    });

    expect(merged).toEqual([
      {
        id: "merge-q-1-q-2",
        documentId: "doc-1",
        pageIds: ["page-1", "page-2"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 100, y: 120, width: 800, height: 300 },
          "page-2": { x: 110, y: 140, width: 760, height: 280 }
        },
        status: "geometry_reviewed",
        source: "merged",
        confidence: 0.905,
        crossPageGroupId: "cross-1"
      }
    ]);
  });

  it("extracts original numbers and resequences merged questions after cross-page review", () => {
    const questions = mergeQuestionsAcrossPages([
      {
        id: "q-15",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 100, y: 1160, width: 800, height: 260 }
        },
        status: "geometry_reviewed" as const,
        source: "ai" as const,
        confidence: 0.91,
        crossPageGroupId: null,
        questionNumberLabel: null
      },
      {
        id: "q-12",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 8,
        bboxByPage: {
          "page-1": { x: 100, y: 180, width: 800, height: 280 }
        },
        status: "geometry_reviewed" as const,
        source: "ai" as const,
        confidence: 0.94,
        crossPageGroupId: null,
        questionNumberLabel: null
      },
      {
        id: "q-14-left",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 4,
        globalOrder: 9,
        bboxByPage: {
          "page-1": { x: 100, y: 1460, width: 800, height: 500 }
        },
        status: "geometry_reviewed" as const,
        source: "ai" as const,
        confidence: 0.93,
        crossPageGroupId: null,
        questionNumberLabel: null
      },
      {
        id: "q-14-continuation",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-2": { x: 100, y: 20, width: 800, height: 620 }
        },
        status: "geometry_reviewed" as const,
        source: "ai" as const,
        confidence: 0.9,
        crossPageGroupId: null,
        questionNumberLabel: null
      }
    ], {
      mergedQuestionId: "merge-14",
      sourceQuestionIds: ["q-14-left", "q-14-continuation"],
      crossPageGroupId: "merge-14"
    });

    const reconciled = reconcileQuestionsAfterCrossPageReview({
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          width: 1000,
          height: 2000,
          textLines: [
            {
              text: "12. 一小球从斜面顶端水平抛出",
              normalizedBBox: { x1: 90, y1: 90, x2: 900, y2: 125 }
            },
            {
              text: "14．如图所示，求小球的运动时间",
              normalizedBBox: { x1: 90, y1: 730, x2: 900, y2: 765 }
            }
          ]
        },
        {
          id: "page-2",
          pageNumber: 2,
          width: 1000,
          height: 2000,
          textLines: [
            {
              text: "（2）继续求落点速度",
              normalizedBBox: { x1: 90, y1: 20, x2: 900, y2: 55 }
            },
            {
              text: "15、质量为 m 的小球做圆周运动",
              normalizedBBox: { x1: 90, y1: 580, x2: 900, y2: 615 }
            }
          ]
        }
      ],
      questions
    });

    expect(
      reconciled.map((question) => ({
        id: question.id,
        questionNumberLabel: question.questionNumberLabel,
        localOrder: question.localOrder,
        globalOrder: question.globalOrder,
        pageIds: question.pageIds
      }))
    ).toEqual([
      {
        id: "q-12",
        questionNumberLabel: "12",
        localOrder: 1,
        globalOrder: 1,
        pageIds: ["page-1"]
      },
      {
        id: "merge-14",
        questionNumberLabel: "14",
        localOrder: 2,
        globalOrder: 2,
        pageIds: ["page-1", "page-2"]
      },
      {
        id: "q-15",
        questionNumberLabel: "15",
        localOrder: 1,
        globalOrder: 3,
        pageIds: ["page-2"]
      }
    ]);
  });

  it("reapplies left-column-first ordering after double-column cross-page review", () => {
    const reconciled = reconcileQuestionsAfterCrossPageReview({
      questionPageLayoutMode: "double_column",
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          width: 1000,
          height: 1600,
          textLines: [
            {
              text: "1. 左栏题目",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 60, y1: 500, x2: 450, y2: 530 }
            },
            {
              text: "2. 右栏题目",
              role: "question_anchor" as const,
              normalizedBBox: { x1: 540, y1: 80, x2: 940, y2: 110 }
            }
          ]
        }
      ],
      questions: [
        {
          id: "q-right",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 540, y: 120, width: 405, height: 320 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null
        },
        {
          id: "q-left",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 55, y: 800, width: 405, height: 320 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null
        }
      ]
    });

    expect(reconciled.map((question) => question.id)).toEqual(["q-left", "q-right"]);
    expect(reconciled.map((question) => question.globalOrder)).toEqual([1, 2]);
  });

  it("creates a manual draft with centered default bbox on the current page", () => {
    const draft = createManualQuestionDraft({
      questionId: "manual-1",
      documentId: "doc-1",
      pageId: "page-1",
      pageNumber: 1,
      width: 1200,
      height: 1600,
      globalOrder: 3
    });

    expect(draft).toEqual({
      id: "manual-1",
      documentId: "doc-1",
      pageIds: ["page-1"],
      primaryPageId: "page-1",
      localOrder: 1,
      globalOrder: 3,
      bboxByPage: {
        "page-1": {
          x: 240,
          y: 320,
          width: 720,
          height: 480
        }
      },
      status: "manual_only",
      source: "manual",
      confidence: 1,
      crossPageGroupId: null,
      classificationStatus: "unclassified",
      directoryMatchConfidence: null,
      directoryPath: null,
      directoryCandidatePaths: [],
      questionType: null,
      ocrText: null,
      lastBulkConfirmationId: null,
      lastSemanticRevisionSource: null
    });
  });

  it("removes one question draft by id while keeping others intact", () => {
    expect(
      removeQuestionDraftById([
        { id: "q-1" },
        { id: "q-2" }
      ], "q-1")
    ).toEqual([
      { id: "q-2" }
    ]);
  });
});
