import { describe, expect, it } from "vitest";

import type { WorkspaceSnapshot } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import { buildLocalLibrarySnapshot } from "@/lib/services/local-library-snapshot-service";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

function buildWorkspaceSnapshot(): WorkspaceSnapshot {
  const folders = buildInitialFolderTree();

  return {
    selectedPageId: "page-1",
    documents: [
      {
        id: "source-doc-1",
        name: "source.pdf",
        kind: "pdf",
        status: "import_ready",
        pageIds: ["page-1", "page-2", "page-unused"]
      }
    ],
    pages: [
      {
        id: "page-1",
        documentId: "source-doc-1",
        pageNumber: 1,
        width: 1000,
        height: 1400,
        displayAssetId: "asset-page-1",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      },
      {
        id: "page-2",
        documentId: "source-doc-1",
        pageNumber: 2,
        width: 1000,
        height: 1400,
        analysisStatus: "done",
        reviewStatus: "reviewed"
      },
      {
        id: "page-unused",
        documentId: "source-doc-1",
        pageNumber: 3,
        width: 1000,
        height: 1400,
        displayAssetId: "asset-page-unused",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }
    ],
    folders,
    examLibraryFolders: buildInitialExamLibraryFolders(folders),
    examLibraryDocuments: [
      {
        id: "paper-1",
        folderId: "specialized-root",
        library: "specialized",
        kind: "paper",
        title: "平抛专题卷",
        subjectScope: "高中物理",
        groupId: "group-1",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "pending_confirmation",
        numberingMode: "resequence",
        questionIds: ["question-1", "missing-question"],
        questionBlocks: [
          {
            key: "block-1",
            label: "平抛运动",
            questionIds: ["question-1", "missing-question"]
          }
        ],
        pendingQuestionIds: ["missing-question", "question-1"],
        pendingManualPlacementQuestionIds: ["missing-question"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      }
    ],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
    mobileUploadTasks: [],
    pendingUploadedFullPaperDraft: null,
    binaryAssets: [
      {
        id: "asset-source-pdf",
        documentId: "source-doc-1",
        pageId: "source-doc-1",
        kind: "source",
        mimeType: "application/pdf",
        byteLength: 128,
        dataUrl: "data:application/pdf;base64,c291cmNl"
      },
      {
        id: "asset-page-1",
        documentId: "source-doc-1",
        pageId: "page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 16,
        dataUrl: "data:image/png;base64,cGFnZTE="
      },
      {
        id: "asset-page-unused",
        documentId: "source-doc-1",
        pageId: "page-unused",
        kind: "display",
        mimeType: "image/png",
        byteLength: 16,
        dataUrl: "data:image/png;base64,dW51c2Vk"
      },
      {
        id: "asset-answer-1",
        documentId: "source-doc-1",
        pageId: "answer-page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 16,
        dataUrl: "data:image/png;base64,YW5zd2Vy"
      }
    ],
    questionDrafts: [
      {
        id: "question-1",
        documentId: "source-doc-1",
        pageIds: ["page-1", "page-2"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 80, y: 900, width: 840, height: 420 },
          "page-2": { x: 80, y: 60, width: 840, height: 260 }
        },
        status: "reviewed",
        source: "merged",
        confidence: 0.98,
        crossPageGroupId: "cross-page-1",
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.96,
        directoryPath: ["我的题库", "高中物理", "曲线运动", "平抛运动基础"],
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: "跨页平抛运动题",
        answerAttachments: [
          {
            id: "answer-attachment-1",
            assetId: "asset-answer-1",
            kind: "matched"
          }
        ],
        lastBulkConfirmationId: null
      }
    ],
    crossPageCandidates: [],
    manualMergeQuestionIds: [],
    selectedQuestionId: "question-1",
    lastBulkConfirmation: null
  };
}

describe("local library snapshot service", () => {
  it("retains the complete question preview closure without retaining the uploaded source PDF", () => {
    const snapshot = buildLocalLibrarySnapshot({
      workspaceSnapshot: buildWorkspaceSnapshot(),
      pagePreviewDataUrls: {
        "page-2": "data:image/png;base64,cGFnZTI="
      }
    });

    expect(snapshot.questionDrafts.map((question) => question.id)).toEqual(["question-1"]);
    expect(snapshot.pages.map((page) => page.id)).toEqual(["page-1", "page-2"]);
    expect(snapshot.pages.find((page) => page.id === "page-2")?.displayAssetId).toBe(
      "asset-display-page-2"
    );
    expect(snapshot.binaryAssets.map((asset) => asset.id).sort()).toEqual([
      "asset-answer-1",
      "asset-display-page-2",
      "asset-page-1"
    ]);
    expect(snapshot.binaryAssets).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "asset-source-pdf" })])
    );
  });

  it("retains durable question crop assets referenced by question image attachments", () => {
    const workspaceSnapshot = buildWorkspaceSnapshot();
    workspaceSnapshot.binaryAssets.push({
      id: "asset-question-crop-1",
      documentId: "source-doc-1",
      pageId: "page-1",
      kind: "question_crop",
      mimeType: "image/png",
      byteLength: 64,
      dataUrl: "data:image/png;base64,aGlnaC1yZXM="
    });
    workspaceSnapshot.questionDrafts[0].questionImageAttachments = [
      {
        id: "question-image-1",
        assetId: "asset-question-crop-1",
        pageId: "page-1",
        pixelWidth: 2000,
        pixelHeight: 800,
        renderDpi: 300,
        version: 1
      }
    ];

    const snapshot = buildLocalLibrarySnapshot({
      workspaceSnapshot,
      pagePreviewDataUrls: {
        "page-2": "data:image/png;base64,cGFnZTI="
      }
    });

    expect(snapshot.binaryAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "asset-question-crop-1",
          kind: "question_crop"
        })
      ])
    );
    expect(snapshot.binaryAssets).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "asset-source-pdf" })])
    );
  });

  it("removes stale question references from every persisted paper list", () => {
    const snapshot = buildLocalLibrarySnapshot({
      workspaceSnapshot: buildWorkspaceSnapshot(),
      pagePreviewDataUrls: {
        "page-2": "data:image/png;base64,cGFnZTI="
      }
    });
    const paper = snapshot.examLibraryDocuments[0];

    expect(paper.questionIds).toEqual(["question-1"]);
    expect(paper.questionBlocks).toEqual([
      {
        key: "block-1",
        label: "平抛运动",
        questionIds: ["question-1"]
      }
    ]);
    expect(paper.pendingQuestionIds).toEqual(["question-1"]);
    expect(paper.pendingManualPlacementQuestionIds).toEqual([]);
  });

  it("retains an uploaded paper source and page previews that are explicitly owned by the paper", () => {
    const workspaceSnapshot = buildWorkspaceSnapshot();
    workspaceSnapshot.examLibraryDocuments.push({
      id: "uploaded-paper-1",
      folderId: "full-root",
      library: "full",
      kind: "paper",
      title: "高一物理套卷",
      subjectScope: "高中物理",
      groupId: "uploaded-group-1",
      isDefault: false,
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: [],
      rawPageAssetIds: ["asset-uploaded-source"],
      placeholderAnswerPage: false,
      allowsQuestionMutations: false,
      uploadedPdfPages: [
        {
          pageId: "uploaded-page-1",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          reviewStatus: "reviewed",
          previewAssetId: "asset-uploaded-preview"
        }
      ]
    });
    workspaceSnapshot.binaryAssets.push(
      {
        id: "asset-uploaded-source",
        documentId: "uploaded-paper-1",
        pageId: "uploaded-paper-1",
        kind: "source",
        mimeType: "application/pdf",
        byteLength: 128,
        dataUrl: "data:application/pdf;base64,cGFwZXI="
      },
      {
        id: "asset-uploaded-preview",
        documentId: "uploaded-paper-1",
        pageId: "uploaded-page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 16,
        dataUrl: "data:image/png;base64,cHJldmlldw=="
      }
    );

    const snapshot = buildLocalLibrarySnapshot({
      workspaceSnapshot,
      pagePreviewDataUrls: {}
    });

    expect(snapshot.binaryAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "asset-uploaded-source", kind: "source" }),
        expect.objectContaining({ id: "asset-uploaded-preview", kind: "display" })
      ])
    );
  });

  it("rejects a question whose referenced page is unavailable", () => {
    const workspaceSnapshot = buildWorkspaceSnapshot();
    workspaceSnapshot.pages = workspaceSnapshot.pages.filter((page) => page.id !== "page-2");

    expect(() =>
      buildLocalLibrarySnapshot({
        workspaceSnapshot,
        pagePreviewDataUrls: {}
      })
    ).toThrow(/question-1.*page-2/);
  });
});
