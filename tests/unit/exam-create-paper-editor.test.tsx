import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import ExamCreatePage from "@/app/exam/create/page";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

function createDragDataTransfer() {
  return {
    effectAllowed: "move",
    dropEffect: "move",
    setData: () => {},
    getData: () => "",
    clearData: () => {}
  };
}

function resetExamCreateStores() {
  const initialFolders = buildInitialExamLibraryFolders(buildInitialFolderTree());

  useExamStore.setState({
    examLibraryFolders: initialFolders,
    examLibraryDocuments: [],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
    pendingUploadedFullPaperDraft: null,
    hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
    setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
    createExamLibraryFolder: useExamStore.getState().createExamLibraryFolder,
    renameExamLibraryFolder: useExamStore.getState().renameExamLibraryFolder,
    deleteExamLibraryFolder: useExamStore.getState().deleteExamLibraryFolder,
    setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
    upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
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
    questionDrafts: [],
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

function seedEditableFullPaper() {
  const folder = useExamStore
    .getState()
    .examLibraryFolders.find((item) => item.library === "full" && item.depth === 1);

  expect(folder).toBeTruthy();

  useQuestionStore.setState({
    ...useQuestionStore.getState(),
    questionDrafts: [
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 10, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.93,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", folder!.name, "chapter-a", "topic-a"],
        directoryCandidatePaths: [],
        questionNumberLabel: "11",
        ocrText: "question one",
        answerAttachments: [
          {
            id: "answer-1",
            assetId: "asset-answer-1",
            kind: "matched"
          }
        ],
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-2",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 10, y: 20, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.9,
        directoryPath: ["我的题库", folder!.name, "chapter-a", "topic-a"],
        directoryCandidatePaths: [],
        questionNumberLabel: "12",
        ocrText: "question two",
        lastBulkConfirmationId: null
      },
      {
        id: "q-3",
        documentId: "doc-3",
        pageIds: ["page-3"],
        primaryPageId: "page-3",
        localOrder: 1,
        globalOrder: 3,
        bboxByPage: {
          "page-3": { x: 10, y: 20, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.88,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.89,
        directoryPath: ["我的题库", folder!.name, "chapter-a", "topic-a"],
        directoryCandidatePaths: [],
        questionNumberLabel: "13",
        ocrText: "question three",
        answerAttachments: [
          {
            id: "answer-3",
            assetId: "asset-answer-3",
            kind: "matched"
          }
        ],
        lastBulkConfirmationId: null
      },
      {
        id: "q-4",
        documentId: "doc-4",
        pageIds: ["page-4"],
        primaryPageId: "page-4",
        localOrder: 1,
        globalOrder: 4,
        bboxByPage: {
          "page-4": { x: 10, y: 20, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.92,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.94,
        directoryPath: ["鎴戠殑棰樺簱", folder!.name, "chapter-a", "topic-a"],
        directoryCandidatePaths: [],
        questionNumberLabel: "14",
        ocrText: "question four",
        answerAttachments: [
          {
            id: "answer-4",
            assetId: "asset-answer-4",
            kind: "matched"
          }
        ],
        lastBulkConfirmationId: null
      },
      {
        id: "q-5",
        documentId: "doc-5",
        pageIds: ["page-5"],
        primaryPageId: "page-5",
        localOrder: 1,
        globalOrder: 5,
        bboxByPage: {
          "page-5": { x: 10, y: 20, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.87,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.85,
        directoryPath: ["鎴戠殑棰樺簱", folder!.name, "chapter-b", "topic-b"],
        directoryCandidatePaths: [],
        questionNumberLabel: "15",
        ocrText: "question five",
        lastBulkConfirmationId: null
      },
      {
        id: "q-6",
        documentId: "doc-6",
        pageIds: ["page-6"],
        primaryPageId: "page-6",
        localOrder: 1,
        globalOrder: 6,
        bboxByPage: {
          "page-6": { x: 10, y: 20, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.82,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.8,
        directoryPath: ["鎴戠殑棰樺簱", "鍒濋珮涓暟瀛?", "chapter-a", "topic-a"],
        directoryCandidatePaths: [],
        questionNumberLabel: "16",
        ocrText: "question six",
        lastBulkConfirmationId: null
      }
    ]
  });
  useExamStore.setState({
    ...useExamStore.getState(),
    examLibraryDocuments: [
      {
        id: "paper-1",
        folderId: folder!.id,
        library: "full",
        kind: "paper",
        title: "suite one",
        subjectScope: folder!.subjectScope,
        groupId: "group-1",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "custom_numeric",
        questionIds: ["q-1", "q-2", "q-3"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true,
        editorState: {
          undoStack: []
        }
      },
      {
        id: "lecture-1",
        folderId: folder!.id,
        library: "full",
        kind: "lecture",
        title: "suite one lecture",
        subjectScope: folder!.subjectScope,
        groupId: "group-1",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "custom_numeric",
        questionIds: ["q-1", "q-2", "q-3"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        lectureSpacing: {
          defaultGap: 48,
          perQuestionGapOverrides: {
            "q-2": 72
          }
        },
        allowsQuestionMutations: true
      },
      {
        id: "answer-1",
        folderId: folder!.id,
        library: "full",
        kind: "answer_sheet",
        title: "suite one answer",
        subjectScope: folder!.subjectScope,
        groupId: "group-1",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "custom_numeric",
        questionIds: ["q-1", "q-2", "q-3"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      }
    ],
    examWorkspaceDraft: {
      selectedLibrary: "full",
      selectedFolderId: folder!.id,
      selectedDocumentId: "paper-1"
    }
  });
}

function seedEditableSpecializedPaper() {
  const folder = useExamStore
    .getState()
    .examLibraryFolders.find((item) => item.library === "specialized" && item.depth === 1);

  expect(folder).toBeTruthy();

  useQuestionStore.setState({
    ...useQuestionStore.getState(),
    questionDrafts: [
      {
        id: "sq-1",
        documentId: "doc-s1",
        pageIds: ["page-s1"],
        primaryPageId: "page-s1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-s1": { x: 10, y: 10, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.95,
        directoryPath: ["鎴戠殑棰樺簱", folder!.subjectScope ?? folder!.name, folder!.name],
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: "special question one",
        answerAttachments: [
          {
            id: "s-answer-1",
            assetId: "asset-s-answer-1",
            kind: "matched"
          }
        ],
        lastBulkConfirmationId: null
      },
      {
        id: "sq-2",
        documentId: "doc-s2",
        pageIds: ["page-s2"],
        primaryPageId: "page-s2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-s2": { x: 10, y: 10, width: 200, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.93,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.94,
        directoryPath: ["鎴戠殑棰樺簱", folder!.subjectScope ?? folder!.name, folder!.name],
        directoryCandidatePaths: [],
        questionNumberLabel: "2",
        ocrText: "special question two",
        lastBulkConfirmationId: null
      }
    ]
  });
  useExamStore.setState({
    ...useExamStore.getState(),
    examLibraryDocuments: [
      {
        id: "special-paper-1",
        folderId: folder!.id,
        library: "specialized",
        kind: "paper",
        title: `${folder!.name}专题卷`,
        subjectScope: folder!.subjectScope,
        groupId: "special-group-1",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["sq-1", "sq-2"],
        questionBlocks: [
          {
            key: "block-a",
            label: "Mechanics",
            questionIds: ["sq-1"]
          },
          {
            key: "block-b",
            label: "Optics",
            questionIds: ["sq-2"]
          }
        ],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true,
        editorState: {
          undoStack: []
        }
      },
      {
        id: "special-lecture-1",
        folderId: folder!.id,
        library: "specialized",
        kind: "lecture",
        title: `${folder!.name}讲义`,
        subjectScope: folder!.subjectScope,
        groupId: "special-group-1",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["sq-1", "sq-2"],
        questionBlocks: [
          {
            key: "block-a",
            label: "Mechanics",
            questionIds: ["sq-1"]
          },
          {
            key: "block-b",
            label: "Optics",
            questionIds: ["sq-2"]
          }
        ],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        lectureSpacing: {
          defaultGap: 48,
          perQuestionGapOverrides: {}
        },
        allowsQuestionMutations: true
      },
      {
        id: "special-answer-1",
        folderId: folder!.id,
        library: "specialized",
        kind: "answer_sheet",
        title: `${folder!.name}答案`,
        subjectScope: folder!.subjectScope,
        groupId: "special-group-1",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["sq-1", "sq-2"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      }
    ],
    examWorkspaceDraft: {
      selectedLibrary: "specialized",
      selectedFolderId: folder!.id,
      selectedDocumentId: "special-paper-1"
    }
  });
}

describe("exam-create paper editor", () => {
  beforeEach(() => {
    resetExamCreateStores();
  });

  it("renders the paper editor for one editable question-bank paper", () => {
    seedEditableFullPaper();

    render(<ExamCreatePage />);

    expect(screen.getByRole("heading", { name: "Paper Editor" })).toBeInTheDocument();
    expect(screen.getByLabelText("paper-editor-question-list")).toBeInTheDocument();
    expect(screen.getByLabelText("paper-editor-preview")).toBeInTheDocument();
    expect(screen.getByLabelText("paper-editor-question-select-q-2")).toBeInTheDocument();
  });

  it("deletes selected questions across the trio and lets undo restore them", async () => {
    seedEditableFullPaper();

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("paper-editor-question-select-q-2"));
    fireEvent.click(screen.getByLabelText("paper-editor-delete-selected"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.questionIds.join(",") === "q-1,q-3")
      ).toBe(true);
    });

    const lectureAfterDelete = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "lecture");
    const paperAfterDelete = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "paper");

    expect(lectureAfterDelete?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {}
    });
    expect(paperAfterDelete?.numberingMode).toBe("resequence");
    expect(paperAfterDelete?.editorState?.undoStack).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("paper-editor-undo"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every(
            (document) => document.questionIds.join(",") === "q-1,q-2,q-3"
          )
      ).toBe(true);
    });

    const lectureAfterUndo = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "lecture");

    expect(lectureAfterUndo?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {
        "q-2": 72
      }
    });
  });

  it("replaces one question with same-subject candidates prioritized by the current folder", async () => {
    seedEditableFullPaper();

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("paper-editor-open-replace-q-2"));

    const candidateButtons = screen.getAllByRole("button", {
      name: /paper-editor-replace-with-/
    });

    expect(candidateButtons[0]).toHaveAttribute("aria-label", "paper-editor-replace-with-q-4");
    expect(candidateButtons[1]).toHaveAttribute("aria-label", "paper-editor-replace-with-q-5");
    expect(screen.queryByLabelText("paper-editor-replace-with-q-6")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("paper-editor-replace-with-q-4"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every(
            (document) => document.questionIds.join(",") === "q-1,q-4,q-3"
          )
      ).toBe(true);
    });

    const lectureAfterReplace = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "lecture");

    expect(lectureAfterReplace?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {}
    });
  });

  it("updates lecture spacing with one global value and one per-question override", async () => {
    seedEditableFullPaper();

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("paper-editor-default-gap-input"), {
      target: { value: "60" }
    });
    fireEvent.change(screen.getByLabelText("paper-editor-question-gap-input-q-1"), {
      target: { value: "96" }
    });

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.find((document) => document.kind === "lecture")?.lectureSpacing
      ).toEqual({
        defaultGap: 60,
        perQuestionGapOverrides: {
          "q-1": 96,
          "q-2": 72
        }
      });
    });
  });

  it("updates one per-question lecture gap through the slider control", async () => {
    seedEditableFullPaper();

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("paper-editor-question-gap-slider-q-3"), {
      target: { value: "120" }
    });

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.find((document) => document.kind === "lecture")?.lectureSpacing
      ).toEqual({
        defaultGap: 48,
        perQuestionGapOverrides: {
          "q-2": 72,
          "q-3": 120
        }
      });
    });
  });

  it("selects multiple preview questions by marquee drag before batch delete", async () => {
    seedEditableFullPaper();

    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function mockRect() {
        const ariaLabel = this.getAttribute("aria-label");

        if (ariaLabel === "paper-editor-preview") {
          return {
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 800,
            bottom: 800,
            width: 800,
            height: 800,
            toJSON: () => ({})
          } as DOMRect;
        }

        if (ariaLabel === "paper-editor-preview-item-current-order-q-1") {
          return {
            x: 40,
            y: 40,
            left: 40,
            top: 40,
            right: 360,
            bottom: 180,
            width: 320,
            height: 140,
            toJSON: () => ({})
          } as DOMRect;
        }

        if (ariaLabel === "paper-editor-preview-item-current-order-q-2") {
          return {
            x: 40,
            y: 220,
            left: 40,
            top: 220,
            right: 360,
            bottom: 360,
            width: 320,
            height: 140,
            toJSON: () => ({})
          } as DOMRect;
        }

        if (ariaLabel === "paper-editor-preview-item-current-order-q-3") {
          return {
            x: 40,
            y: 400,
            left: 40,
            top: 400,
            right: 360,
            bottom: 540,
            width: 320,
            height: 140,
            toJSON: () => ({})
          } as DOMRect;
        }

        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({})
        } as DOMRect;
      });

    render(<ExamCreatePage />);

    fireEvent.pointerDown(screen.getByLabelText("paper-editor-preview"), {
      clientX: 20,
      clientY: 20,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 380,
      clientY: 380,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 380,
      clientY: 380,
      pointerId: 1
    });

    fireEvent.click(screen.getByLabelText("paper-editor-delete-selected"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.questionIds.join(",") === "q-3")
      ).toBe(true);
    });

    getBoundingClientRectSpy.mockRestore();
  });

  it("reorders one full-paper question from the left list by drag and drop", async () => {
    seedEditableFullPaper();

    render(<ExamCreatePage />);

    const dataTransfer = createDragDataTransfer();

    fireEvent.dragStart(screen.getByLabelText("paper-editor-list-item-q-3"), { dataTransfer });
    fireEvent.dragOver(screen.getByLabelText("paper-editor-list-item-q-1"), { dataTransfer });
    fireEvent.drop(screen.getByLabelText("paper-editor-list-item-q-1"), { dataTransfer });

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every(
            (document) => document.questionIds.join(",") === "q-3,q-1,q-2"
          )
      ).toBe(true);
    });
  });

  it("moves one specialized question across blocks from the preview area by drag and drop", async () => {
    seedEditableSpecializedPaper();

    render(<ExamCreatePage />);

    const dataTransfer = createDragDataTransfer();

    fireEvent.dragStart(screen.getByLabelText("paper-editor-preview-item-block-a-sq-1"), {
      dataTransfer
    });
    fireEvent.dragOver(screen.getByLabelText("paper-editor-preview-block-drop-block-b"), {
      dataTransfer
    });
    fireEvent.drop(screen.getByLabelText("paper-editor-preview-block-drop-block-b"), {
      dataTransfer
    });

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.find((document) => document.kind === "paper")?.questionBlocks
      ).toEqual([
        {
          key: "block-a",
          label: "Mechanics",
          questionIds: []
        },
        {
          key: "block-b",
          label: "Optics",
          questionIds: ["sq-2", "sq-1"]
        }
      ]);
    });
  });

  it("lets the user choose whether to keep or remove one emptied specialized block on delete", async () => {
    seedEditableSpecializedPaper();

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("paper-editor-question-select-sq-1"));

    expect(
      screen.getByLabelText("paper-editor-delete-selected-keep-empty-blocks")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("paper-editor-delete-selected-remove-empty-blocks")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("paper-editor-delete-selected-remove-empty-blocks"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.find((document) => document.kind === "paper")?.questionBlocks
      ).toEqual([
        {
          key: "block-b",
          label: "Optics",
          questionIds: ["sq-2"]
        }
      ]);
    });
  });
});
