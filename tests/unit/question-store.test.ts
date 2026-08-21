import { beforeEach, describe, expect, it } from "vitest";

import { useQuestionStore } from "@/lib/stores/question-store";

function createGeometryDraft(id: string, documentId: string, pageId: string) {
  return {
    id,
    documentId,
    pageIds: [pageId],
    primaryPageId: pageId,
    localOrder: 1,
    globalOrder: 1,
    bboxByPage: {
      [pageId]: { x: 10, y: 20, width: 100, height: 120 }
    },
    status: "geometry_draft" as const,
    source: "ai" as const,
    confidence: 0.9,
    crossPageGroupId: null,
    classificationStatus: "unclassified" as const,
    directoryMatchConfidence: null,
    directoryPath: null,
    directoryCandidatePaths: [],
    ocrText: null,
    lastBulkConfirmationId: null
  };
}

describe("question-store", () => {
  beforeEach(() => {
    useQuestionStore.setState({
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      binaryAssets: [],
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      setBinaryAssets: useQuestionStore.getState().setBinaryAssets,
      appendBinaryAssets: useQuestionStore.getState().appendBinaryAssets,
      purgeSourceAssetsForDocument: useQuestionStore.getState().purgeSourceAssetsForDocument,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      addManualQuestionDraft: useQuestionStore.getState().addManualQuestionDraft,
      removeQuestionDraft: useQuestionStore.getState().removeQuestionDraft,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      updateQuestionOcrText: useQuestionStore.getState().updateQuestionOcrText,
      updateQuestionType: useQuestionStore.getState().updateQuestionType,
      updateQuestionAnalysis: useQuestionStore.getState().updateQuestionAnalysis,
      attachAnswerToQuestion: useQuestionStore.getState().attachAnswerToQuestion,
      appendManualAnswerToQuestion: useQuestionStore.getState().appendManualAnswerToQuestion,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      updateQuestionNumberLabel: useQuestionStore.getState().updateQuestionNumberLabel,
      moveQuestionToPendingBucket: useQuestionStore.getState().moveQuestionToPendingBucket,
      assignQuestionToDirectory: useQuestionStore.getState().assignQuestionToDirectory,
      rewriteDirectoryPaths: useQuestionStore.getState().rewriteDirectoryPaths,
      reassignQuestionsFromDeletedFolder: useQuestionStore.getState().reassignQuestionsFromDeletedFolder,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      queueQuestionForManualMerge: useQuestionStore.getState().queueQuestionForManualMerge,
      clearManualMergeQueue: useQuestionStore.getState().clearManualMergeQueue,
      executeManualMerge: useQuestionStore.getState().executeManualMerge,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
  });

  it("stores preview urls by page id", () => {
    useQuestionStore.getState().setPagePreviewUrl("page-1", "blob:page-1");
    expect(useQuestionStore.getState().pagePreviewUrls["page-1"]).toBe("blob:page-1");
  });

  it("restores page preview caches from durable display assets during hydration", () => {
    useQuestionStore.getState().hydrateWorkspaceState({
      binaryAssets: [
        {
          id: "asset-display-inline",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/jpeg",
          byteLength: 128,
          dataUrl: "data:image/jpeg;base64,cGFnZS0x"
        },
        {
          id: "asset-display-disk",
          documentId: "doc-2",
          pageId: "page-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 256,
          dataUrl: "/api/local-library/asset?id=asset-display-disk"
        },
        {
          id: "asset-source",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 512,
          dataUrl: "data:application/pdf;base64,cGRm"
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      questionDrafts: []
    });

    expect(useQuestionStore.getState().pagePreviewUrls).toEqual({
      "page-1": "data:image/jpeg;base64,cGFnZS0x",
      "page-2": "/api/local-library/asset?id=asset-display-disk"
    });
    expect(useQuestionStore.getState().pagePreviewDataUrls).toEqual({
      "page-1": "data:image/jpeg;base64,cGFnZS0x"
    });
  });

  it("normalizes old unrooted question directory paths during workspace hydration", () => {
    useQuestionStore.getState().hydrateWorkspaceState({
      binaryAssets: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["高中数学", "函数", "二次函数"],
          directoryCandidatePaths: [
            ["高中数学", "函数", "二次函数"],
            ["subject-a", "folder-a"]
          ],
          ocrText: "题目 1",
          lastBulkConfirmationId: null
        }
      ]
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      directoryPath: ["我的题库", "高中数学", "函数", "二次函数"],
      directoryCandidatePaths: [
        ["我的题库", "高中数学", "函数", "二次函数"],
        ["subject-a", "folder-a"]
      ]
    });
  });

  it("purges current-document source assets and preview caches only", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewUrls: {
        "page-1": "blob:page-1",
        "page-2": "blob:page-2"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      binaryAssets: [
        {
          id: "asset-source-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        },
        {
          id: "asset-display-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 1024
        },
        {
          id: "asset-source-2",
          documentId: "doc-2",
          pageId: "page-2",
          kind: "source",
          mimeType: "image/png",
          byteLength: 2048
        }
      ]
    });

    useQuestionStore.getState().purgeSourceAssetsForDocument("doc-1", ["page-1"]);

    expect(useQuestionStore.getState().binaryAssets).toEqual([
      {
        id: "asset-display-1",
        documentId: "doc-1",
        pageId: "page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 1024
      },
      {
        id: "asset-source-2",
        documentId: "doc-2",
        pageId: "page-2",
        kind: "source",
        mimeType: "image/png",
        byteLength: 2048
      }
    ]);
    expect(useQuestionStore.getState().pagePreviewUrls["page-1"]).toBeUndefined();
    expect(useQuestionStore.getState().pagePreviewDataUrls["page-1"]).toBeUndefined();
    expect(useQuestionStore.getState().pagePreviewUrls["page-2"]).toBe("blob:page-2");
  });

  it("removes all question workspace artifacts for one deleted document", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewUrls: {
        "page-1": "blob:page-1",
        "page-2": "blob:page-2",
        "page-3": "blob:page-3"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2",
        "page-3": "data:image/png;base64,page-3"
      },
      binaryAssets: [
        {
          id: "asset-doc-1-source",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        },
        {
          id: "asset-doc-1-display",
          documentId: "doc-1",
          pageId: "page-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 1024
        },
        {
          id: "asset-doc-2-display",
          documentId: "doc-2",
          pageId: "page-3",
          kind: "display",
          mimeType: "image/png",
          byteLength: 2048
        }
      ],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["我的题库", "高中数学", "函数"],
          directoryCandidatePaths: [],
          ocrText: "题目 1",
          lastBulkConfirmationId: null
        },
        {
          id: "q-2",
          documentId: "doc-2",
          pageIds: ["page-3"],
          primaryPageId: "page-3",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-3": { x: 30, y: 40, width: 120, height: 140 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.9,
          directoryPath: ["我的题库", "高中物理", "静力学"],
          directoryCandidatePaths: [],
          ocrText: "题目 2",
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [
        {
          id: "candidate-doc-1",
          documentId: "doc-1",
          leftPageId: "page-1",
          rightPageId: "page-2",
          sourceQuestionIds: ["q-1"],
          confidence: 0.86,
          status: "suggested"
        },
        {
          id: "candidate-doc-2",
          documentId: "doc-2",
          leftPageId: "page-3",
          rightPageId: "page-4",
          sourceQuestionIds: ["q-2"],
          confidence: 0.9,
          status: "suggested"
        }
      ],
      manualMergeQuestionIds: ["q-1", "q-2"],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: {
        confirmationId: "bulk-1",
        documentId: "doc-1",
        confirmedCount: 1,
        undoSnapshots: []
      }
    });

    (useQuestionStore.getState() as any).removeDocumentWorkspaceArtifacts("doc-1", [
      "page-1",
      "page-2"
    ]);

    expect(useQuestionStore.getState().pagePreviewUrls).toEqual({
      "page-3": "blob:page-3"
    });
    expect(useQuestionStore.getState().pagePreviewDataUrls).toEqual({
      "page-3": "data:image/png;base64,page-3"
    });
    expect(useQuestionStore.getState().binaryAssets.map((asset) => asset.id)).toEqual([
      "asset-doc-2-display"
    ]);
    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
      "q-2"
    ]);
    expect(useQuestionStore.getState().crossPageCandidates.map((candidate) => candidate.id)).toEqual([
      "candidate-doc-2"
    ]);
    expect(useQuestionStore.getState().manualMergeQuestionIds).toEqual(["q-2"]);
    expect(useQuestionStore.getState().selectedQuestionId).toBeNull();
    expect(useQuestionStore.getState().lastBulkConfirmation).toBeNull();
  });

  it("retains library-referenced questions and display assets when their source document is deleted", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,transient-page"
      },
      binaryAssets: [
        {
          id: "asset-source-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        },
        {
          id: "asset-display-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 1024,
          dataUrl: "data:image/png;base64,durable-page"
        }
      ],
      questionDrafts: [
        {
          id: "q-retained",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["我的题库", "高中物理", "曲线运动", "斜面平抛模型"],
          directoryCandidatePaths: [],
          ocrText: "保留的题目",
          lastBulkConfirmationId: null
        },
        {
          id: "q-transient",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 10, y: 160, width: 100, height: 120 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.8,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: null,
          lastBulkConfirmationId: null
        }
      ]
    });

    (useQuestionStore.getState() as any).removeDocumentWorkspaceArtifacts(
      "doc-1",
      ["page-1"],
      {
        preserveQuestionIds: ["q-retained"],
        preservePageIds: ["page-1"],
        preserveAssetIds: ["asset-display-1"]
      }
    );

    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
      "q-retained"
    ]);
    expect(useQuestionStore.getState().binaryAssets.map((asset) => asset.id)).toEqual([
      "asset-display-1"
    ]);
    expect(useQuestionStore.getState().pagePreviewDataUrls).toEqual({});
  });

  it("replaces questions for a page while keeping other pages intact", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "geometry_draft",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 30, y: 40, width: 130, height: 150 }
        },
        status: "geometry_draft",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().replaceQuestionsForPage("page-1", [
      {
        id: "q-3",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 50, y: 60, width: 140, height: 160 }
        },
        status: "geometry_draft",
        source: "manual",
        confidence: 1,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      }
    ]);

    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual(["q-2", "q-3"]);
  });

  it("replaces one document question set and clears references to consumed drafts", () => {
    useQuestionStore.setState({
      questionDrafts: [
        createGeometryDraft("q-old", "doc-1", "page-1"),
        createGeometryDraft("q-other", "doc-2", "page-2")
      ],
      manualMergeQuestionIds: ["q-old", "q-other"],
      selectedQuestionId: "q-old",
      lastBulkConfirmation: {
        confirmationId: "bulk-1",
        documentId: "doc-1",
        confirmedCount: 1,
        undoSnapshots: []
      }
    });

    useQuestionStore.getState().replaceQuestionsForDocument("doc-1", [
      createGeometryDraft("q-new", "doc-1", "page-1")
    ]);

    expect(useQuestionStore.getState()).toMatchObject({
      questionDrafts: [
        expect.objectContaining({ id: "q-other" }),
        expect.objectContaining({ id: "q-new" })
      ],
      manualMergeQuestionIds: ["q-other"],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    });
  });

  it("marks draft questions on a reviewed page as ready for OCR classification", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "geometry_draft",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 30, y: 40, width: 130, height: 150 }
        },
        status: "geometry_draft",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      },
      {
        id: "q-3",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 3,
        bboxByPage: {
          "page-1": { x: 50, y: 60, width: 140, height: 160 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.88,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.92,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [["subject-a", "folder-a"]],
        ocrText: "processed",
        lastBulkConfirmationId: "bulk-1"
      }
    ]);

    useQuestionStore.getState().markPageQuestionsGeometryReviewed("page-1");

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      status: "geometry_reviewed",
      classificationStatus: "unclassified",
      directoryMatchConfidence: null,
      directoryPath: null,
      directoryCandidatePaths: [],
      ocrText: null,
      lastBulkConfirmationId: null
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      status: "geometry_draft",
      classificationStatus: "unclassified"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-3")).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["subject-a", "folder-a"],
      ocrText: "processed",
      lastBulkConfirmationId: "bulk-1"
    });
  });

  it("stores single-question analysis results", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [],
        ocrText: "text",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().updateQuestionAnalysis("q-1", {
      status: "done",
      updatedAt: "2026-06-02T00:00:00.000Z",
      solution: "Step 1",
      answer: "B"
    });

    expect(useQuestionStore.getState().questionDrafts[0].analysisData).toEqual({
      status: "done",
      updatedAt: "2026-06-02T00:00:00.000Z",
      solution: "Step 1",
      answer: "B"
    });
  });

  it("attaches one or more answer assets to a question", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [],
        ocrText: "text",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().attachAnswerToQuestion("q-1", [
      {
        id: "answer-1",
        assetId: "asset-answer-1",
        kind: "matched"
      },
      {
        id: "answer-2",
        assetId: "asset-answer-2",
        kind: "manual"
      }
    ]);

    expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toEqual([
      {
        id: "answer-1",
        assetId: "asset-answer-1",
        kind: "matched"
      },
      {
        id: "answer-2",
        assetId: "asset-answer-2",
        kind: "manual"
      }
    ]);
  });

  it("appends manual answer attachments without overwriting matched answers", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [],
        ocrText: "text",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().attachAnswerToQuestion("q-1", [
      {
        id: "answer-1",
        assetId: "asset-answer-1",
        kind: "matched"
      }
    ]);

    useQuestionStore.getState().appendManualAnswerToQuestion("q-1", [
      {
        id: "answer-2",
        assetId: "asset-answer-2",
        kind: "manual"
      }
    ]);

    expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toEqual([
      {
        id: "answer-1",
        assetId: "asset-answer-1",
        kind: "matched"
      },
      {
        id: "answer-2",
        assetId: "asset-answer-2",
        kind: "manual"
      }
    ]);
  });

  it("updates one question bbox on one page without touching other questions", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1", "page-2"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 },
          "page-2": { x: 30, y: 40, width: 130, height: 150 }
        },
        status: "geometry_draft",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 200, y: 220, width: 300, height: 320 }
        },
        status: "geometry_draft",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore
      .getState()
      .updateQuestionBBox("q-1", "page-1", { x: 60, y: 70, width: 180, height: 190 });

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")?.bboxByPage).toEqual({
      "page-1": { x: 60, y: 70, width: 180, height: 190 },
      "page-2": { x: 30, y: 40, width: 130, height: 150 }
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")?.bboxByPage).toEqual({
      "page-1": { x: 200, y: 220, width: 300, height: 320 }
    });
  });

  it("invalidates only the changed question semantics when a processed bbox is rerun", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数"],
        directoryCandidatePaths: [["我的题库", "高中数学", "函数"]],
        ocrText: "已识别题目",
        lastBulkConfirmationId: "bulk-1"
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 200, y: 220, width: 300, height: 320 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.88,
        directoryPath: ["我的题库", "高中数学", "几何"],
        directoryCandidatePaths: [["我的题库", "高中数学", "几何"]],
        ocrText: "另一道题",
        lastBulkConfirmationId: "bulk-1"
      }
    ]);

    useQuestionStore
      .getState()
      .updateQuestionBBox(
        "q-1",
        "page-1",
        { x: 60, y: 70, width: 180, height: 190 },
        { userChoseRerun: true }
      );

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      bboxByPage: {
        "page-1": { x: 60, y: 70, width: 180, height: 190 }
      },
      status: "geometry_reviewed",
      classificationStatus: "unclassified",
      directoryMatchConfidence: null,
      directoryPath: null,
      directoryCandidatePaths: [],
      ocrText: null,
      lastBulkConfirmationId: null,
      lastSemanticRevisionSource: "geometry_rerun_pending"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      classificationStatus: "confirmed",
      directoryPath: ["我的题库", "高中数学", "几何"],
      ocrText: "另一道题"
    });
  });

  it("preserves processed semantics when a changed bbox is not rerun", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数"],
        directoryCandidatePaths: [["我的题库", "高中数学", "函数"]],
        ocrText: "已识别题目",
        lastBulkConfirmationId: "bulk-1"
      }
    ]);

    useQuestionStore
      .getState()
      .updateQuestionBBox(
        "q-1",
        "page-1",
        { x: 60, y: 70, width: 180, height: 190 },
        { userChoseRerun: false }
      );

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      bboxByPage: {
        "page-1": { x: 60, y: 70, width: 180, height: 190 }
      },
      classificationStatus: "confirmed",
      directoryMatchConfidence: 0.91,
      directoryPath: ["我的题库", "高中数学", "函数"],
      directoryCandidatePaths: [["我的题库", "高中数学", "函数"]],
      ocrText: "已识别题目",
      lastBulkConfirmationId: "bulk-1",
      lastSemanticRevisionSource: "geometry_preserved_without_rerun"
    });
  });

  it("updates one question OCR text without changing classification fields", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "needs_choice",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.41,
        directoryPath: null,
        directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
        ocrText: "原始 OCR",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 200, y: 220, width: 300, height: 320 }
        },
        status: "needs_choice",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.39,
        directoryPath: null,
        directoryCandidatePaths: [["高中数学", "解析几何", "直线与圆"]],
        ocrText: "另一题 OCR",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().updateQuestionOcrText("q-1", "人工修正 OCR");

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      classificationStatus: "needs_choice",
      directoryMatchConfidence: 0.41,
      ocrText: "人工修正 OCR"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")?.ocrText).toBe(
      "另一题 OCR"
    );
  });

  it("updates one question type without changing unrelated questions", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["subject-a", "folder-a", "folder-b"],
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "question-1",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 30, y: 40, width: 120, height: 140 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.85,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.88,
        directoryPath: ["subject-b", "folder-c", "folder-d"],
        directoryCandidatePaths: [],
        questionType: "填空题",
        ocrText: "question-2",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().updateQuestionType("q-1", "证明题");

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      questionType: "证明题"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      questionType: "填空题"
    });
  });

  it("updates one question tags without changing unrelated questions", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["subject-a", "folder-a", "folder-b"],
        directoryCandidatePaths: [],
        ocrText: "question-1",
        chapterTag: "chapter-a",
        knowledgeTags: ["knowledge-a", "knowledge-b"],
        customTags: ["custom-a"],
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 30, y: 40, width: 120, height: 140 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.85,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.88,
        directoryPath: ["subject-b", "folder-c", "folder-d"],
        directoryCandidatePaths: [],
        ocrText: "question-2",
        chapterTag: "chapter-b",
        knowledgeTags: ["knowledge-c"],
        customTags: ["custom-b"],
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().updateQuestionTags("q-1", {
      chapterTag: "chapter-updated",
      knowledgeTags: ["knowledge-x", "knowledge-y"],
      customTags: ["custom-a", "custom-c"]
    });

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      chapterTag: "chapter-updated",
      knowledgeTags: ["knowledge-x", "knowledge-y"],
      customTags: ["custom-a", "custom-c"]
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      chapterTag: "chapter-b",
      knowledgeTags: ["knowledge-c"],
      customTags: ["custom-b"]
    });
  });

  it("updates one question number label without changing unrelated questions", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["subject-a", "folder-a", "folder-b"],
        directoryCandidatePaths: [],
        ocrText: "question-1",
        questionNumberLabel: "1",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 30, y: 40, width: 120, height: 140 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.85,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.88,
        directoryPath: ["subject-b", "folder-c", "folder-d"],
        directoryCandidatePaths: [],
        questionNumberLabel: "2",
        ocrText: "question-2",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().updateQuestionNumberLabel("q-1", "12");

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      questionNumberLabel: "12"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      questionNumberLabel: "2"
    });
  });

  it("clears cross-page candidates for a single document only", () => {
    useQuestionStore.getState().setCrossPageCandidates([
      {
        id: "merge-1",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-1", "q-2"],
        confidence: 0.88,
        status: "suggested"
      },
      {
        id: "merge-2",
        documentId: "doc-2",
        leftPageId: "page-3",
        rightPageId: "page-4",
        sourceQuestionIds: ["q-3", "q-4"],
        confidence: 0.9,
        status: "suggested"
      }
    ]);

    useQuestionStore.getState().clearCrossPageCandidatesForDocument("doc-1");

    expect(useQuestionStore.getState().crossPageCandidates.map((candidate) => candidate.id)).toEqual(["merge-2"]);
  });

  it("accepts a cross-page candidate and merges the referenced questions", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
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
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 30, y: 40, width: 130, height: 150 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.8,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().setCrossPageCandidates([
      {
        id: "merge-1",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-1", "q-2"],
        confidence: 0.88,
        status: "suggested"
      }
    ]);

    useQuestionStore.getState().acceptCrossPageCandidate("merge-1");

    expect(useQuestionStore.getState().crossPageCandidates[0].status).toBe("accepted");
    expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "merge-1",
      source: "merged",
      crossPageGroupId: "merge-1"
    });
  });

  it("keeps merged question ids unique across documents", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "merge-1",
        documentId: "doc-existing",
        pageIds: ["page-existing"],
        primaryPageId: "page-existing",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-existing": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "merged",
        confidence: 0.9,
        crossPageGroupId: "merge-1",
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.95,
        directoryPath: ["我的题库", "高中物理", "曲线运动"],
        directoryCandidatePaths: [],
        ocrText: "已入库的跨页题",
        lastBulkConfirmationId: null
      },
      {
        id: "q-new-left",
        documentId: "doc-new",
        pageIds: ["page-new-1"],
        primaryPageId: "page-new-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-new-1": { x: 10, y: 900, width: 100, height: 120 }
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
        lastBulkConfirmationId: null
      },
      {
        id: "q-new-right",
        documentId: "doc-new",
        pageIds: ["page-new-2"],
        primaryPageId: "page-new-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-new-2": { x: 10, y: 20, width: 100, height: 120 }
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
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().setCrossPageCandidates([
      {
        id: "merge-1",
        documentId: "doc-new",
        leftPageId: "page-new-1",
        rightPageId: "page-new-2",
        sourceQuestionIds: ["q-new-left", "q-new-right"],
        confidence: 0.99,
        status: "suggested"
      }
    ]);

    useQuestionStore.getState().acceptCrossPageCandidate("merge-1");

    const questions = useQuestionStore.getState().questionDrafts;
    expect(questions.map((question) => question.id)).toEqual([
      "merge-1",
      "page-new-1-page-new-2-merge-1"
    ]);
    expect(questions.find((question) => question.documentId === "doc-existing")).toMatchObject({
      id: "merge-1",
      ocrText: "已入库的跨页题"
    });
    expect(questions.find((question) => question.documentId === "doc-new")).toMatchObject({
      id: "page-new-1-page-new-2-merge-1",
      crossPageGroupId: "page-new-1-page-new-2-merge-1",
      pageIds: ["page-new-1", "page-new-2"]
    });
  });

  it("removes a synthesized continuation fragment when its cross-page candidate is dismissed", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-left",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 900, width: 100, height: 90 }
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
        lastBulkConfirmationId: null
      },
      {
        id: "page-2-continuation-from-q-left",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 0,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 10, y: 20, width: 100, height: 180 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.72,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().setCrossPageCandidates([
      {
        id: "edge-candidate",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-left", "page-2-continuation-from-q-left"],
        confidence: 0.72,
        status: "suggested"
      }
    ]);

    useQuestionStore.getState().dismissCrossPageCandidate("edge-candidate");

    expect(useQuestionStore.getState().crossPageCandidates[0].status).toBe("dismissed");
    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
      "q-left"
    ]);
  });

  it("adds and removes manual question drafts on a page", () => {
    useQuestionStore.getState().addManualQuestionDraft({
      questionId: "manual-1",
      documentId: "doc-1",
      pageId: "page-1",
      pageNumber: 1,
      width: 1200,
      height: 1600,
      globalOrder: 1
    });

    expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "manual-1",
      source: "manual"
    });

    useQuestionStore.getState().removeQuestionDraft("manual-1");

    expect(useQuestionStore.getState().questionDrafts).toHaveLength(0);
  });

  it("queues two questions for manual merge and replaces them with one merged question", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
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
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 30, y: 40, width: 130, height: 150 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.8,
        crossPageGroupId: null,
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        ocrText: null,
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().queueQuestionForManualMerge("q-1");
    useQuestionStore.getState().queueQuestionForManualMerge("q-2");
    useQuestionStore.getState().executeManualMerge("manual-merge-1");

    expect(useQuestionStore.getState().manualMergeQuestionIds).toEqual([]);
    expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "manual-merge-1",
      source: "merged",
      pageIds: ["page-1", "page-2"],
      crossPageGroupId: "manual-merge-1"
    });
    expect(useQuestionStore.getState().selectedQuestionId).toBe("manual-merge-1");
  });

  it("rewrites assigned directory paths after a folder rename", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数", "二次函数"],
        directoryCandidatePaths: [],
        ocrText: "题目 1",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore
      .getState()
      .rewriteDirectoryPaths(["我的题库", "高中数学", "函数"], ["我的题库", "高中数学", "代数"]);

    expect(useQuestionStore.getState().questionDrafts[0].directoryPath).toEqual([
      "我的题库",
      "高中数学",
      "代数",
      "二次函数"
    ]);
  });

  it("moves affected questions to uncategorized when a folder is deleted", () => {
    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数", "二次函数"],
        directoryCandidatePaths: [],
        ocrText: "题目 1",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 30, y: 40, width: 120, height: 140 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.85,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.88,
        directoryPath: ["我的题库", "高中物理", "力学"],
        directoryCandidatePaths: [],
        ocrText: "题目 2",
        lastBulkConfirmationId: null
      }
    ]);

    useQuestionStore.getState().reassignQuestionsFromDeletedFolder(
      ["我的题库", "高中数学", "函数"],
      ["我的题库", "未分类"]
    );

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      directoryPath: ["我的题库", "未分类"],
      classificationStatus: "confirmed"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      directoryPath: ["我的题库", "高中物理", "力学"]
    });
  });

  it("clears question-library records while preserving page previews and binary assets", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewUrls: { "page-1": "blob:page-1" },
      pagePreviewDataUrls: { "page-1": "data:image/png;base64,page-1" },
      binaryAssets: [
        {
          id: "asset-display-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "data:image/png;base64,page-1"
        }
      ],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["我的题库", "高中物理", "曲线运动", "平抛运动基础"],
          directoryCandidatePaths: [],
          ocrText: "平抛运动测试题",
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [
        {
          id: "candidate-1",
          documentId: "doc-1",
          leftPageId: "page-1",
          rightPageId: "page-2",
          sourceQuestionIds: ["q-1", "q-2"],
          confidence: 0.9,
          reason: "test",
          status: "suggested"
        }
      ] as any,
      manualMergeQuestionIds: ["q-1"],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: {
        confirmationId: "bulk-1",
        documentId: "doc-1",
        confirmedCount: 1,
        undoSnapshots: []
      }
    });

    (useQuestionStore.getState() as any).clearQuestionLibrary();

    expect(useQuestionStore.getState()).toMatchObject({
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      pagePreviewUrls: { "page-1": "blob:page-1" },
      pagePreviewDataUrls: { "page-1": "data:image/png;base64,page-1" }
    });
    expect(useQuestionStore.getState().binaryAssets).toHaveLength(1);
  });
});
