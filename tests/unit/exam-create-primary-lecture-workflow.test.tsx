import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ExamCreatePage from "@/app/exam/create/page";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildPrintableExamDocument } from "@/lib/services/exam-print-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

vi.mock("@/lib/services/exam-print-service", () => ({
  buildPrintableExamDocument: vi.fn(() => ({
    fileNameBase: "primary-lecture",
    html: "<html><body>primary lecture</body></html>"
  })),
  buildPrintableExamPdf: vi.fn(async () => ({
    fileName: "primary-lecture_2026-06-03.pdf",
    blob: new Blob(["pdf"], { type: "application/pdf" })
  }))
}));

function resetStores() {
  const folders = buildInitialExamLibraryFolders(buildInitialFolderTree());

  useExamStore.setState({
    examLibraryFolders: folders,
    examLibraryDocuments: [],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
    mobileUploadTasks: [],
    pendingUploadedFullPaperDraft: null,
    hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
    setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
    createExamLibraryFolder: useExamStore.getState().createExamLibraryFolder,
    renameExamLibraryFolder: useExamStore.getState().renameExamLibraryFolder,
    deleteExamLibraryFolder: useExamStore.getState().deleteExamLibraryFolder,
    setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
    upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
    setMobileUploadTasks: useExamStore.getState().setMobileUploadTasks,
    upsertMobileUploadTask: useExamStore.getState().upsertMobileUploadTask,
    confirmExamDocumentSync: useExamStore.getState().confirmExamDocumentSync,
    setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft,
    setPendingUploadedFullPaperDraft: useExamStore.getState().setPendingUploadedFullPaperDraft,
    updateUploadedPdfPageReviewStatus:
      useExamStore.getState().updateUploadedPdfPageReviewStatus,
    patchPendingExamDocumentGroup: useExamStore.getState().patchPendingExamDocumentGroup,
    finalizeUploadedPdfDocumentGroup: useExamStore.getState().finalizeUploadedPdfDocumentGroup,
    confirmPendingUploadedFullPaperDraft:
      useExamStore.getState().confirmPendingUploadedFullPaperDraft
  });
  useQuestionStore.setState({
    pagePreviewUrls: {},
    pagePreviewDataUrls: {},
    binaryAssets: [],
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
        directoryMatchConfidence: 0.95,
        directoryPath: ["专题卷库", "高中物理", "牛顿定律"],
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: "question one",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-2",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.95,
        directoryPath: ["专题卷库", "高中物理", "牛顿定律"],
        directoryCandidatePaths: [],
        questionNumberLabel: "2",
        ocrText: "question two",
        lastBulkConfirmationId: null
      }
    ],
    crossPageCandidates: [],
    manualMergeQuestionIds: [],
    selectedQuestionId: null,
    lastBulkConfirmation: null,
    hydrateWorkspaceState: useQuestionStore.getState().hydrateWorkspaceState,
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
    updateQuestionAnalysis: useQuestionStore.getState().updateQuestionAnalysis,
    attachAnswerToQuestion: useQuestionStore.getState().attachAnswerToQuestion,
    updateQuestionOcrText: useQuestionStore.getState().updateQuestionOcrText,
    updateQuestionType: useQuestionStore.getState().updateQuestionType,
    updateQuestionTags: useQuestionStore.getState().updateQuestionTags,
    applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
    moveQuestionToPendingBucket: useQuestionStore.getState().moveQuestionToPendingBucket,
    assignQuestionToDirectory: useQuestionStore.getState().assignQuestionToDirectory,
    rewriteDirectoryPaths: useQuestionStore.getState().rewriteDirectoryPaths,
    reassignQuestionsFromDeletedFolder: useQuestionStore.getState().reassignQuestionsFromDeletedFolder,
    renameTagEverywhere: useQuestionStore.getState().renameTagEverywhere,
    mergeTagEverywhere: useQuestionStore.getState().mergeTagEverywhere,
    removeTagEverywhere: useQuestionStore.getState().removeTagEverywhere,
    confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
    undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
    setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
    acceptCrossPageCandidate: useQuestionStore.getState().acceptCrossPageCandidate,
    dismissCrossPageCandidate: useQuestionStore.getState().dismissCrossPageCandidate,
    queueQuestionForManualMerge: useQuestionStore.getState().queueQuestionForManualMerge,
    clearManualMergeQueue: useQuestionStore.getState().clearManualMergeQueue,
    executeManualMerge: useQuestionStore.getState().executeManualMerge,
    clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
    selectQuestion: useQuestionStore.getState().selectQuestion
  });
  useFileStore.setState({
    documents: [],
    pages: [],
    selectedPageId: null,
    uploadQueue: []
  });
  useToastStore.setState({
    toasts: [],
    pushToast: useToastStore.getState().pushToast,
    dismissToast: useToastStore.getState().dismissToast,
    clearToasts: useToastStore.getState().clearToasts
  });
}

function seedPrimaryLecture(overrides?: Record<string, unknown>) {
  const syncMetadata = {
    version: 1 as const,
    sourceDocumentId: "lecture-primary-1",
    generatedAt: "2026-06-03T09:00:00.000Z",
    questionIds: ["q-1", "q-2"],
    blocks: [
      {
        blockId: "block-a",
        questionIds: ["q-1", "q-2"],
        exportOrder: 0,
        pageRange: {
          start: 1,
          end: 1
        },
        anchorBBox: {
          page: 1,
          x: 100,
          y: 120,
          width: 720,
          height: 200
        }
      }
    ]
  };

  useExamStore.setState({
    ...useExamStore.getState(),
    examLibraryDocuments: [
      {
        id: "lecture-primary-1",
        folderId: "specialized-root",
        library: "specialized",
        kind: "lecture",
        lectureVariant: "primary",
        title: "牛顿定律主讲义",
        immutableName: "牛顿定律主讲义",
        subjectScope: null,
        groupId: "group-primary-1",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["q-1", "q-2"],
        questionBlocks: [
          {
            key: "block-a",
            label: "Block A",
            questionIds: ["q-1", "q-2"]
          }
        ],
        lectureSpacing: {
          defaultGap: 48,
          perQuestionGapOverrides: {}
        },
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true,
        syncMetadata,
        ...overrides
      } as never
    ],
    examWorkspaceDraft: {
      selectedLibrary: "specialized",
      selectedFolderId: "specialized-root",
      selectedDocumentId: "lecture-primary-1"
    }
  });

  return syncMetadata;
}

describe("exam-create primary lecture workflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStores();
  });

  it("renders primary-lecture download and upload controls for the selected primary lecture", () => {
    seedPrimaryLecture();

    render(<ExamCreatePage />);

    expect(screen.getByRole("heading", { name: "Primary Lecture Sync" })).toBeInTheDocument();
    expect(screen.getByLabelText("download-primary-lecture-pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("upload-primary-lecture-pdf")).toBeInTheDocument();
  });

  it("downloads one primary lecture pdf and stores the exported sync snapshot on the document", async () => {
    const syncMetadata = seedPrimaryLecture();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:primary");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const anchorClickSpy = vi.fn();
    const anchorRemoveSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    render(<ExamCreatePage />);

    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") {
        const anchor = originalCreateElement("a");

        anchor.click = anchorClickSpy;
        anchor.remove = anchorRemoveSpy;

        return anchor;
      }

      return originalCreateElement(tagName);
    });
    const originalAppendChild = document.body.appendChild.bind(document.body);
    const appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation((node) => originalAppendChild(node));

    fireEvent.click(screen.getByLabelText("download-primary-lecture-pdf"));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(anchorRemoveSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:primary");
      expect(
        (useExamStore.getState().examLibraryDocuments[0] as {
          lastExportedSyncMetadata?: unknown;
        }).lastExportedSyncMetadata
      ).toEqual(syncMetadata);
    });

    createElementSpy.mockRestore();
  });

  it("uploads one updated primary lecture pdf through the last exported sync snapshot", async () => {
    const syncMetadata = seedPrimaryLecture({
      lastExportedSyncMetadata: {
        version: 1,
        sourceDocumentId: "lecture-primary-1",
        generatedAt: "2026-06-03T09:00:00.000Z",
        questionIds: ["q-1", "q-2"],
        blocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-2"],
            exportOrder: 0,
            pageRange: {
              start: 1,
              end: 1
            },
            anchorBBox: {
              page: 1,
              x: 100,
              y: 120,
              width: 720,
              height: 200
            }
          }
        ]
      }
    });

    render(<ExamCreatePage />);

    const file = new File(["%PDF-1.4"], "随手命名.pdf", {
      type: "application/pdf"
    });

    fireEvent.change(screen.getByLabelText("upload-primary-lecture-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useExamStore.getState().mobileUploadTasks).toHaveLength(1);
    });

    const task = useExamStore.getState().mobileUploadTasks[0];
    const document = useExamStore.getState().examLibraryDocuments[0];

    expect(task).toMatchObject({
      uploadKind: "primary_lecture_pdf",
      normalizedFileName: "牛顿定律主讲义.pdf",
      status: "completed"
    });
    expect(document).toMatchObject({
      sourceUploadTaskId: task.id
    });
    expect(document.rawPageAssetIds).toHaveLength(1);
    expect(useQuestionStore.getState().binaryAssets[0]).toMatchObject({
      documentId: "lecture-primary-1",
      kind: "source",
      mimeType: "application/pdf",
      byteLength: file.size
    });
    expect(document.syncMetadata).toEqual(syncMetadata);
  });

  it("stages one outdated primary lecture upload for sync confirmation before replacing the current lecture", async () => {
    const olderMetadata = {
      version: 1 as const,
      sourceDocumentId: "lecture-primary-1",
      generatedAt: "2026-06-03T09:00:00.000Z",
      questionIds: ["q-1", "q-2"],
      blocks: [
        {
          blockId: "block-a",
          questionIds: ["q-1", "q-2"],
          exportOrder: 0,
          pageRange: {
            start: 1,
            end: 1
          },
          anchorBBox: {
            page: 1,
            x: 100,
            y: 120,
            width: 720,
            height: 200
          }
        }
      ]
    };
    const currentMetadata = {
      ...olderMetadata,
      generatedAt: "2026-06-03T10:00:00.000Z",
      questionIds: ["q-1", "q-2", "q-3"],
      blocks: [
        olderMetadata.blocks[0],
        {
          blockId: "block-b",
          questionIds: ["q-3"],
          exportOrder: 1,
          pageRange: {
            start: 2,
            end: 2
          },
          anchorBBox: {
            page: 2,
            x: 120,
            y: 150,
            width: 700,
            height: 180
          }
        }
      ]
    };

    seedPrimaryLecture({
      questionIds: ["q-1", "q-2", "q-3"],
      questionBlocks: [
        {
          key: "block-a",
          label: "Block A",
          questionIds: ["q-1", "q-2"]
        },
        {
          key: "block-b",
          label: "Block B",
          questionIds: ["q-3"]
        }
      ],
      syncMetadata: currentMetadata,
      lastExportedSyncMetadata: olderMetadata
    });

    render(<ExamCreatePage />);

    const file = new File(["%PDF-1.4"], "updated-primary-lecture.pdf", {
      type: "application/pdf"
    });

    fireEvent.change(screen.getByLabelText("upload-primary-lecture-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useExamStore.getState().mobileUploadTasks).toHaveLength(1);
      expect(screen.getByLabelText("confirm-exam-sync-lecture-primary-1")).toBeInTheDocument();
    });

    const task = useExamStore.getState().mobileUploadTasks[0];
    const document = useExamStore.getState().examLibraryDocuments[0];
    const sourceAsset = useQuestionStore.getState().binaryAssets[0];

    expect(task).toMatchObject({
      uploadKind: "primary_lecture_pdf",
      status: "processing"
    });
    expect(document).toMatchObject({
      syncStatus: "pending_confirmation",
      pendingQuestionIds: ["q-1", "q-2", "q-3"],
      pendingQuestionBlocks: [
        {
          key: "block-a",
          label: "Block A",
          questionIds: ["q-1", "q-2"]
        },
        {
          key: "block-b",
          label: "Block B",
          questionIds: ["q-3"]
        }
      ],
      pendingManualPlacementQuestionIds: [],
      pendingRawPageAssetIds: [sourceAsset.id],
      pendingSourceUploadTaskId: task.id,
      syncMetadata: currentMetadata
    });
    expect(document.rawPageAssetIds).toEqual([]);
    expect(document.sourceUploadTaskId).toBeUndefined();
    expect(sourceAsset).toMatchObject({
      documentId: "lecture-primary-1",
      kind: "source",
      mimeType: "application/pdf",
      byteLength: file.size
    });
  });

  it("downloads one pending primary lecture through the staged question order after an outdated upload", async () => {
    const olderMetadata = {
      version: 1 as const,
      sourceDocumentId: "lecture-primary-1",
      generatedAt: "2026-06-03T09:00:00.000Z",
      questionIds: ["q-1", "q-2"],
      blocks: [
        {
          blockId: "block-a",
          questionIds: ["q-1", "q-2"],
          exportOrder: 0,
          pageRange: {
            start: 1,
            end: 1
          },
          anchorBBox: {
            page: 1,
            x: 100,
            y: 120,
            width: 720,
            height: 200
          }
        }
      ]
    };
    const currentMetadata = {
      ...olderMetadata,
      generatedAt: "2026-06-03T10:00:00.000Z",
      questionIds: ["q-1", "q-2", "q-3"],
      blocks: [
        olderMetadata.blocks[0],
        {
          blockId: "block-b",
          questionIds: ["q-3"],
          exportOrder: 1,
          pageRange: {
            start: 2,
            end: 2
          },
          anchorBBox: {
            page: 2,
            x: 120,
            y: 150,
            width: 700,
            height: 180
          }
        }
      ]
    };

    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: useQuestionStore.getState().questionDrafts.concat({
        id: "q-3",
        documentId: "doc-3",
        pageIds: ["page-3"],
        primaryPageId: "page-3",
        localOrder: 3,
        globalOrder: 3,
        bboxByPage: {
          "page-3": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.95,
        directoryPath: ["专题卷库", "高中物理", "牛顿定律"],
        directoryCandidatePaths: [],
        questionNumberLabel: "3",
        ocrText: "question three",
        lastBulkConfirmationId: null
      })
    });

    seedPrimaryLecture({
      questionIds: ["q-1", "q-2"],
      questionBlocks: [
        {
          key: "block-a",
          label: "Block A",
          questionIds: ["q-1", "q-2"]
        }
      ],
      syncMetadata: currentMetadata,
      lastExportedSyncMetadata: olderMetadata
    });

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("upload-primary-lecture-pdf"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "updated-primary-lecture.pdf", {
            type: "application/pdf"
          })
        ]
      }
    });

    await waitFor(() => {
      expect(useExamStore.getState().mobileUploadTasks).toHaveLength(1);
      expect(screen.getByLabelText("confirm-exam-sync-lecture-primary-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("download-primary-lecture-pdf"));

    await waitFor(() => {
      expect(buildPrintableExamDocument).toHaveBeenCalled();
    });

    const latestCall = vi.mocked(buildPrintableExamDocument).mock.calls.at(-1)?.[0];

    expect(latestCall?.paperPreview?.sections).toEqual([
      {
        key: "block-a",
        label: "Block A",
        items: [
          {
            questionId: "q-1",
            displayNumber: "1",
            summaryText: "question one",
            gapAfter: 48
          },
          {
            questionId: "q-2",
            displayNumber: "2",
            summaryText: "question two",
            gapAfter: 48
          }
        ]
      },
      {
        key: "block-b",
        label: "block-b",
        items: [
          {
            questionId: "q-3",
            displayNumber: "3",
            summaryText: "question three",
            gapAfter: 48
          }
        ]
      }
    ]);
    expect(
      (useExamStore.getState().examLibraryDocuments[0] as {
        lastExportedSyncMetadata?: unknown;
      }).lastExportedSyncMetadata
    ).toEqual(currentMetadata);
  });
});
