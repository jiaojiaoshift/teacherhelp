import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ExamCreatePage from "@/app/exam/create/page";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import {
  getPdfPageCountFromArrayBuffer,
  renderPdfArrayBufferToPagePreviews
} from "@/lib/pdf/pdf-renderer";
import {
  prepareAiPreviewBlob,
  prepareAiPreviewDataUrl
} from "@/lib/services/ai-image-preview-service";
import { UploadCapacityError } from "@/lib/services/upload-capacity";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

vi.mock("@/lib/pdf/pdf-renderer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/pdf-renderer")>(
    "@/lib/pdf/pdf-renderer"
  );

  const renderPdfMock = vi.fn();
  const pageCountMock = vi.fn();

  return {
    ...actual,
    renderPdfArrayBufferToPagePreviews: renderPdfMock,
    renderPdfBlobToPagePreviews: renderPdfMock,
    getPdfPageCountFromArrayBuffer: pageCountMock,
    getPdfPageCountFromBlob: pageCountMock
  };
});

vi.mock("@/lib/services/ai-image-preview-service", () => ({
  prepareAiPreviewBlob: vi.fn(async (blob: Blob) => blob),
  prepareAiPreviewDataUrl: vi.fn(async (dataUrl: string) => `compressed:${dataUrl}`)
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

describe("exam-create page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const initialFolders = buildInitialExamLibraryFolders(buildInitialFolderTree());

    useExamStore.setState({
      examLibraryFolders: initialFolders,
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      pendingUploadedFullPaperDraft: null,
      hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
      setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
      createExamLibraryFolder: useExamStore.getState().createExamLibraryFolder,
      deleteExamLibraryFolder: useExamStore.getState().deleteExamLibraryFolder,
      setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
      upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
      setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft,
      setPendingUploadedFullPaperDraft: useExamStore.getState().setPendingUploadedFullPaperDraft,
      updateUploadedPdfPageReviewStatus:
        useExamStore.getState().updateUploadedPdfPageReviewStatus,
      confirmPendingUploadedFullPaperDraft:
        useExamStore.getState().confirmPendingUploadedFullPaperDraft,
      finalizeUploadedPdfDocumentGroup:
        useExamStore.getState().finalizeUploadedPdfDocumentGroup
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
    vi.mocked(prepareAiPreviewDataUrl).mockImplementation(
      async (dataUrl: string) => `compressed:${dataUrl}`
    );
    vi.mocked(prepareAiPreviewBlob).mockImplementation(async (blob: Blob) => blob);
  });

  it("creates a blank independent lecture in the selected folder", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "specialized" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });
    fireEvent.change(screen.getByLabelText("independent-lecture-title-input"), {
      target: { value: "lecture-a" }
    });
    fireEvent.click(screen.getByLabelText("create-blank-lecture"));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(1);
    });

    const document = useExamStore.getState().examLibraryDocuments[0];

    expect(document).toMatchObject({
      folderId: targetFolder!.id,
      library: "specialized",
      kind: "lecture",
      title: "lecture-a",
      sourceMode: "freeform",
      syncBinding: "independent",
      allowsQuestionMutations: true,
      rawPageAssetIds: []
    });
    expect(useExamStore.getState().examWorkspaceDraft.selectedDocumentId).toBe(document.id);
    expect(screen.getByText("lecture-a")).toBeInTheDocument();
  });

  it("creates an uploaded-pdf independent lecture without question mutations", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "review.pdf", {
      type: "application/pdf"
    });

    fireEvent.change(screen.getByLabelText("upload-independent-lecture-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(1);
    });

    const document = useExamStore.getState().examLibraryDocuments[0];

    expect(document).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      kind: "lecture",
      title: "review",
      sourceMode: "uploaded_pdf",
      syncBinding: "independent",
      allowsQuestionMutations: false
    });
    expect(document.rawPageAssetIds).toHaveLength(1);
    expect(
      useQuestionStore.getState().binaryAssets.find((asset) => asset.documentId === document.id)
    ).toMatchObject({
      kind: "source",
      mimeType: "application/pdf",
      byteLength: file.size
    });
  });

  it("creates one custom folder in the full library and selects it", async () => {
    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("full-library-folder-name-input"), {
      target: { value: "custom-b" }
    });
    fireEvent.click(screen.getByLabelText("create-full-library-folder"));

    await waitFor(() => {
      expect(
        useExamStore.getState().examLibraryFolders.some((folder) => folder.name === "custom-b")
      ).toBe(true);
    });

    const createdFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.name === "custom-b");

    expect(createdFolder).toMatchObject({
      library: "full",
      kind: "custom"
    });
    expect(useExamStore.getState().examWorkspaceDraft.selectedFolderId).toBe(createdFolder?.id);
  });

  it("renames the selected custom full-library folder", async () => {
    const fullRoot = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.id === "full-root");

    expect(fullRoot).toBeTruthy();

    const createdFolder = useExamStore.getState().createExamLibraryFolder(fullRoot!.id, "custom-b");

    expect(createdFolder).toBeTruthy();

    useExamStore.getState().setExamWorkspaceDraft({
      selectedLibrary: "full",
      selectedFolderId: createdFolder!.id,
      selectedDocumentId: null
    });

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("rename-full-library-folder-name-input"), {
      target: { value: "custom-c" }
    });
    fireEvent.click(screen.getByLabelText("rename-full-library-folder"));

    await waitFor(() => {
      expect(
        useExamStore.getState().examLibraryFolders.some((folder) => folder.name === "custom-c")
      ).toBe(true);
    });

    const renamedFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.name === "custom-c");

    expect(renamedFolder).toMatchObject({
      library: "full",
      kind: "custom"
    });
    expect(useExamStore.getState().examWorkspaceDraft.selectedFolderId).toBe(renamedFolder?.id);
  });

  it("deletes the selected custom full-library folder", async () => {
    const fullRoot = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.id === "full-root");

    expect(fullRoot).toBeTruthy();

    const createdFolder = useExamStore.getState().createExamLibraryFolder(fullRoot!.id, "custom-b");

    expect(createdFolder).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: createdFolder!.id,
          library: "full",
          kind: "paper",
          title: "paper one",
          subjectScope: createdFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: createdFolder!.id,
        selectedDocumentId: "paper-1"
      }
    });

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("delete-full-library-folder"));

    await waitFor(() => {
      expect(
        useExamStore.getState().examLibraryFolders.some((folder) => folder.id === createdFolder!.id)
      ).toBe(false);
    });

    expect(useExamStore.getState().examLibraryDocuments).toEqual([]);
    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedFolderId: fullRoot!.id,
      selectedDocumentId: null
    });
  });

  it("creates one full-library paper trio from selected question-bank questions", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
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
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-b", "topic-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
          ocrText: "question two",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });
    fireEvent.change(screen.getByLabelText("full-paper-title-input"), {
      target: { value: "custom suite 1" }
    });
    fireEvent.click(screen.getByLabelText("full-paper-question-toggle-q-1"));
    fireEvent.click(screen.getByLabelText("full-paper-question-toggle-q-2"));
    fireEvent.click(screen.getByLabelText("create-full-paper-from-bank"));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(3);
    });

    const documents = useExamStore.getState().examLibraryDocuments;
    const paper = documents.find((document) => document.kind === "paper");
    const lecture = documents.find((document) => document.kind === "lecture");
    const answerSheet = documents.find((document) => document.kind === "answer_sheet");

    expect(paper).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      title: "custom suite 1",
      sourceMode: "question_bank",
      syncBinding: "strong",
      numberingMode: "custom_numeric",
      questionIds: ["q-1", "q-2"],
      allowsQuestionMutations: true
    });
    expect(lecture).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      title: "custom suite 1讲义",
      sourceMode: "question_bank",
      syncBinding: "strong",
      questionIds: ["q-1", "q-2"]
    });
    expect(answerSheet).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      title: "custom suite 1答案",
      sourceMode: "question_bank",
      syncBinding: "strong",
      questionIds: ["q-1", "q-2"],
      placeholderAnswerPage: false
    });
    expect(paper?.groupId).toBeTruthy();
    expect(lecture?.groupId).toBe(paper?.groupId);
    expect(answerSheet?.groupId).toBe(paper?.groupId);
    expect(useExamStore.getState().examWorkspaceDraft.selectedDocumentId).toBe(paper?.id);
  });

  it("shows same-subject question-bank questions inside a custom full-library folder", async () => {
    const baseFolders = buildInitialFolderTree();
    const physics = baseFolders.find((folder) => folder.name === "高中物理");

    expect(physics).toBeTruthy();

    const mechanics = createCustomFolder({
      name: "力学",
      parent: physics!
    });
    const newton = createCustomFolder({
      name: "牛顿定律",
      parent: mechanics
    });
    const electricity = createCustomFolder({
      name: "电学",
      parent: physics!
    });
    const ohm = createCustomFolder({
      name: "欧姆定律",
      parent: electricity
    });
    const allFolders = baseFolders.concat(mechanics, newton, electricity, ohm);
    const examFolders = buildInitialExamLibraryFolders(allFolders);

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: examFolders
    });

    const mechanicsFullFolder = examFolders.find(
      (folder) => folder.library === "full" && folder.linkedQuestionFolderId === mechanics.id
    );

    expect(mechanicsFullFolder).toBeTruthy();

    const customTargetFolder = useExamStore
      .getState()
      .createExamLibraryFolder(mechanicsFullFolder!.id, "高频训练");

    expect(customTargetFolder).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: customTargetFolder!.id,
        selectedDocumentId: null
      }
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: [
        {
          id: "q-physics-1",
          documentId: "doc-physics-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.93,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: newton.path,
          directoryCandidatePaths: [],
          questionNumberLabel: "1",
          ocrText: "牛顿定律习题",
          lastBulkConfirmationId: null
        },
        {
          id: "q-physics-2",
          documentId: "doc-physics-2",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ohm.path,
          directoryCandidatePaths: [],
          questionNumberLabel: "2",
          ocrText: "欧姆定律习题",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<ExamCreatePage />);

    expect(screen.getByLabelText("full-paper-question-toggle-q-physics-1")).toBeInTheDocument();
    expect(screen.getByLabelText("full-paper-question-toggle-q-physics-2")).toBeInTheDocument();
  });

  it("excludes questions from pending-answer documents when creating a full-library paper", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.name === "高中物理");

    expect(targetFolder).toBeTruthy();

    useFileStore.setState({
      documents: [
        {
          id: "doc-blocked",
          name: "blocked.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高中物理",
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1
        },
        {
          id: "doc-open",
          name: "open.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-2"],
          subjectScope: "高中物理",
          pendingAnswerMatch: false,
          pendingAnswerMatchCount: 0
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: targetFolder!.id,
        selectedDocumentId: null
      }
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: [
        {
          id: "q-blocked",
          documentId: "doc-blocked",
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
          directoryPath: ["我的题库", "高中物理", "力学", "牛顿定律"],
          directoryCandidatePaths: [],
          questionNumberLabel: "11",
          ocrText: "blocked physics question",
          lastBulkConfirmationId: null
        },
        {
          id: "q-open",
          documentId: "doc-open",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", "高中物理", "电学", "欧姆定律"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "open physics question",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<ExamCreatePage />);

    expect(screen.queryByLabelText("full-paper-question-toggle-q-blocked")).not.toBeInTheDocument();
    expect(screen.getByLabelText("full-paper-question-toggle-q-open")).toBeInTheDocument();
  });

  it("applies natural-language reorder to the whole full-paper trio", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question one",
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
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-b", "topic-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
          ocrText: "question two",
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "paper",
          title: "custom suite 1",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "lecture",
          title: "custom suite 1讲义",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "answer_sheet",
          title: "custom suite 1答案",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: true,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: targetFolder!.id,
        selectedDocumentId: "paper-1"
      }
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderedQuestionIds: ["q-2", "q-1"]
      })
    } as Response);
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("full-paper-nl-input"), {
      target: { value: "把18题调到12题前面" }
    });
    fireEvent.click(screen.getByLabelText("apply-full-paper-nl-order"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.syncStatus === "pending_confirmation")
      ).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/ai/reorder-paper");
    expect(
      useExamStore.getState().examLibraryDocuments.every((document) => document.questionIds.join(",") === "q-1,q-2")
    ).toBe(true);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every((document) => document.pendingQuestionIds?.join(",") === "q-2,q-1")
    ).toBe(true);
  });

  it("applies natural-language deletion to the whole full-paper trio", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
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
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-b", "topic-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
          ocrText: "question two",
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "paper",
          title: "custom suite 1",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "lecture",
          title: "custom suite 1讲义",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "answer_sheet",
          title: "custom suite 1答案",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: targetFolder!.id,
        selectedDocumentId: "paper-1"
      }
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderedQuestionIds: ["q-1"]
      })
    } as Response);
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("full-paper-nl-input"), {
      target: { value: "删掉18题" }
    });
    fireEvent.click(screen.getByLabelText("apply-full-paper-nl-order"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.syncStatus === "pending_confirmation")
      ).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every((document) => document.pendingQuestionIds?.join(",") === "q-1")
    ).toBe(true);
  });

  it("applies natural-language replacement to the whole full-paper trio and updates pending answer placeholder state", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
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
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-b", "topic-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
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
            "page-3": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-c", "topic-c"],
          directoryCandidatePaths: [],
          questionNumberLabel: "20",
          ocrText: "question three",
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: targetFolder!.id,
        selectedDocumentId: "paper-1"
      },
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "paper",
          title: "custom suite 1",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "lecture",
          title: "custom suite 1讲义",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "answer_sheet",
          title: "custom suite 1答案",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderedQuestionIds: ["q-3", "q-2"]
      })
    } as Response);
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("full-paper-nl-input"), {
      target: { value: "把12题换成20题" }
    });
    fireEvent.click(screen.getByLabelText("apply-full-paper-nl-order"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.syncStatus === "pending_confirmation")
      ).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody.currentQuestions).toHaveLength(2);
    expect(requestBody.availableQuestions).toHaveLength(3);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every((document) => document.pendingQuestionIds?.join(",") === "q-3,q-2")
    ).toBe(true);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.find((document) => document.kind === "answer_sheet")
    ).toMatchObject({
      pendingPlaceholderAnswerPage: true
    });
  });

  it("applies natural-language insertion to the whole full-paper trio and clears pending answer placeholder state when the inserted question has an answer", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question one",
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
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-b", "topic-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
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
            "page-3": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-c", "topic-c"],
          directoryCandidatePaths: [],
          questionNumberLabel: "20",
          ocrText: "question three",
          answerAttachments: [
            {
              id: "answer-3",
              assetId: "asset-answer-3",
              kind: "matched"
            }
          ],
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: targetFolder!.id,
        selectedDocumentId: "paper-1"
      },
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "paper",
          title: "custom suite 1",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "lecture",
          title: "custom suite 1讲义",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "answer_sheet",
          title: "custom suite 1答案",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: true,
          allowsQuestionMutations: true
        }
      ]
    });

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        orderedQuestionIds: ["q-1", "q-2", "q-3"]
      })
    } as Response);
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.change(screen.getByLabelText("full-paper-nl-input"), {
      target: { value: "在18题后加入20题" }
    });
    fireEvent.click(screen.getByLabelText("apply-full-paper-nl-order"));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.syncStatus === "pending_confirmation")
      ).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody.currentQuestions).toHaveLength(2);
    expect(requestBody.availableQuestions).toHaveLength(3);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) => document.pendingQuestionIds?.join(",") === "q-1,q-2,q-3"
        )
    ).toBe(true);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.find((document) => document.kind === "answer_sheet")
    ).toMatchObject({
      pendingPlaceholderAnswerPage: false
    });
  });

  it("confirms one pending full-paper reorder from the workspace page", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question one",
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
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: ["我的题库", targetFolder!.name, "chapter-b", "topic-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
          ocrText: "question two",
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "paper",
          title: "custom suite 1",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "lecture",
          title: "custom suite 1讲义",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-1",
          folderId: targetFolder!.id,
          library: "full",
          kind: "answer_sheet",
          title: "custom suite 1答案",
          subjectScope: targetFolder!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: true,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: targetFolder!.id,
        selectedDocumentId: "paper-1"
      }
    });

    render(<ExamCreatePage />);

    fireEvent.click(screen.getAllByRole("button", { name: "confirm-exam-sync-paper-1" })[0]);

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.every((document) => document.syncStatus === "idle")
      ).toBe(true);
    });

    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every((document) => document.questionIds.join(",") === "q-2,q-1")
    ).toBe(true);
  });

  it("creates one uploaded-pdf full-paper trio with suggested answer split", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" }),
        textLines: [
          {
            text: "1. 套卷第一题",
            normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
          }
        ]
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 2
        }
      })
    } as Response);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new Error("Full-paper browser upload should not materialize the complete PDF")
    );

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(3);
    });

    const documents = useExamStore.getState().examLibraryDocuments;
    const paper = documents.find((document) => document.kind === "paper");
    const lecture = documents.find((document) => document.kind === "lecture");
    const answerSheet = documents.find((document) => document.kind === "answer_sheet");

    expect(paper).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      title: "suite",
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      allowsQuestionMutations: false
    });
    expect(lecture).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      title: "suite讲义",
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      allowsQuestionMutations: false
    });
    expect(answerSheet).toMatchObject({
      folderId: targetFolder!.id,
      library: "full",
      title: "suite答案",
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      placeholderAnswerPage: false,
      allowsQuestionMutations: false
    });
    expect(paper?.rawPageAssetIds).toHaveLength(1);
    expect(paper?.uploadedPdfPages?.[0].textLines).toEqual([
      {
        text: "1. 套卷第一题",
        normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
      }
    ]);
    expect(lecture?.rawPageAssetIds).toHaveLength(1);
    expect(answerSheet?.rawPageAssetIds).toHaveLength(1);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("shows a pending full-paper answer-section review instead of creating documents immediately", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 2
        }
      })
    } as Response);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });
    await waitFor(() => {
      expect(screen.getByText("Full-paper answer section review pending")).toBeInTheDocument();
    });

    expect(useExamStore.getState().examLibraryDocuments).toHaveLength(0);
    expect(
      useExamStore.getState().pendingUploadedFullPaperDraft?.answerSection.suggestedSplitPage
    ).toBe(2);
    expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const requestInit = fetchSpy.mock.calls[0][1];
    const requestBody = JSON.parse(String(requestInit?.body));

    expect(requestBody.pageImageDataUrls).toEqual([
      "compressed:data:image/png;base64,cGFnZS0x",
      "compressed:data:image/png;base64,cGFnZS0y"
    ]);
  });

  it("compresses a large full-paper page as a Blob before creating its Data URL", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);
    const rawPageBlob = new Blob([new Uint8Array(300_001)], { type: "image/png" });
    const compressedPageBlob = new Blob(["jpeg"], { type: "image/jpeg" });

    expect(targetFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: rawPageBlob
      }
    ]);
    vi.mocked(prepareAiPreviewBlob).mockResolvedValue(compressedPageBlob);
    vi.mocked(prepareAiPreviewBlob).mockClear();
    vi.mocked(prepareAiPreviewDataUrl).mockClear();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 1
        }
      })
    } as Response);

    render(<ExamCreatePage />);
    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "large-suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });
    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(useExamStore.getState().pendingUploadedFullPaperDraft?.pageCount).toBe(1);
    });

    expect(prepareAiPreviewBlob).toHaveBeenCalledWith(rawPageBlob);
    expect(prepareAiPreviewDataUrl).not.toHaveBeenCalled();
    expect(
      useQuestionStore.getState().binaryAssets.find((asset) => asset.kind === "display")
    ).toMatchObject({
      mimeType: "image/jpeg",
      byteLength: compressedPageBlob.size,
      blob: compressedPageBlob
    });
  });

  it("keeps a 400-page full-paper upload on batched previews and representative answer samples", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);
    const pages = Array.from({ length: 400 }, (_, index) => ({
      pageNumber: index + 1,
      width: 1200,
      height: 1600,
      blob: new Blob([`page-${index + 1}`], { type: "image/png" })
    }));

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockImplementation(
      async (_arrayBuffer, options) => {
        for (let index = 0; index < pages.length; index += 8) {
          const batch = pages.slice(index, index + 8);
          await options?.onBatch?.({
            pages: batch,
            pageCount: pages.length,
            current: index + batch.length
          });
        }

        return [];
      }
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 300
        }
      })
    } as Response);

    render(<ExamCreatePage />);
    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "large-suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(useExamStore.getState().pendingUploadedFullPaperDraft?.pageCount).toBe(400);
    });

    const requestBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(requestBody.pageCount).toBe(400);
    expect(requestBody.pageImageDataUrls).toHaveLength(12);
    expect(requestBody.sampledPageNumbers).toHaveLength(12);
    expect(requestBody.sampledPageNumbers[0]).toBe(1);
    expect(requestBody.sampledPageNumbers.at(-1)).toBe(400);
    expect(
      useQuestionStore
        .getState()
        .binaryAssets.filter((asset) => asset.kind === "display")
    ).toHaveLength(400);
    expect(screen.getByLabelText("full-paper-upload-progress")).toHaveAttribute(
      "aria-valuenow",
      "1"
    );
    expect(screen.getByText("PDF 预处理完成")).toBeInTheDocument();
  });

  it("reports a PDF page-cap failure instead of leaving full-paper upload rejected silently", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockRejectedValue(
      new UploadCapacityError({
        code: "too_many_pages",
        actual: 401,
        limit: 400,
        message: "PDF 共 401 页，超过 400 页上限，请拆分文件后重试。"
      })
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(<ExamCreatePage />);
    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });
    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [new File(["%PDF-1.4"], "too-many-pages.pdf", { type: "application/pdf" })]
      }
    });

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "PDF 共 401 页，超过 400 页上限，请拆分文件后重试。",
            tone: "error"
          })
        ])
      );
    });
    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toBeNull();
  });

  it("creates the uploaded full-paper trio only after confirming the answer split", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let detectionCallCount = 0;
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        detectionCallCount += 1;
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };
        const isFirstPage = requestBody.pageId === "uploaded-page-1";

        return {
          ok: true,
          json: async () => ({
            pageId: requestBody.pageId,
            detections: [
              {
                id: isFirstPage ? "draft-a" : "draft-b",
                localOrder: 1,
                confidence: isFirstPage ? 0.92 : 0.9,
                normalizedBBox: isFirstPage
                  ? {
                      x1: 100,
                      y1: 120,
                      x2: 900,
                      y2: 320
                    }
                  : {
                      x1: 120,
                      y1: 260,
                      x2: 880,
                      y2: 460
                    }
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: []
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(3);
    });

    const paper = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "paper");

    expect(paper).toMatchObject({
      title: "suite",
      sourceMode: "uploaded_pdf",
      uploadedPdfAnswerSection: {
        status: "confirmed",
        hasAnswerSection: true,
        suggestedSplitPage: 2,
        confirmedSplitPage: 2
      }
    });
    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toBeNull();
  });

  it("creates a placeholder uploaded full-paper answer sheet when confirmed as no-answer-section", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let detectionCallCount = 0;
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        detectionCallCount += 1;
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };
        const isFirstPage = requestBody.pageId === "uploaded-page-1";

        return {
          ok: true,
          json: async () => ({
            pageId: requestBody.pageId,
            detections: [
              {
                id: isFirstPage ? "draft-a" : "draft-b",
                localOrder: 1,
                confidence: isFirstPage ? 0.92 : 0.9,
                normalizedBBox: isFirstPage
                  ? {
                      x1: 100,
                      y1: 120,
                      x2: 900,
                      y2: 320
                    }
                  : {
                      x1: 120,
                      y1: 260,
                      x2: 880,
                      y2: 460
                    }
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: []
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByText("Full-paper answer section review pending")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("mark-full-paper-no-answer-section"));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(3);
    });

    const answerSheet = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "answer_sheet");

    expect(answerSheet).toMatchObject({
      placeholderAnswerPage: true,
      uploadedPdfAnswerSection: {
        status: "confirmed",
        hasAnswerSection: false,
        suggestedSplitPage: 2,
        confirmedSplitPage: null
      }
    });
    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
        "uploaded-page-1-draft-a",
        "uploaded-page-2-draft-b"
      ]);
    });
    expect(detectionCallCount).toBe(2);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) => document.questionIds.join(",") === "uploaded-page-1-draft-a,uploaded-page-2-draft-b"
        )
    ).toBe(true);
  });

  it("shows uploaded-pdf question review for question pages after confirming the split", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      },
      {
        pageNumber: 3,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-3"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 3
        }
      })
    } as Response);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(3);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByText("Uploaded PDF Question Review")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("select-uploaded-full-paper-page-1")).toBeInTheDocument();
    expect(screen.getByLabelText("select-uploaded-full-paper-page-2")).toBeInTheDocument();
    expect(screen.queryByLabelText("select-uploaded-full-paper-page-3")).not.toBeInTheDocument();
  });

  it("finalizes one uploaded-pdf trio after question review and then hides question-edit controls", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "uploaded-page-1",
            detections: [
              {
                id: "draft-a",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 100,
                  y1: 120,
                  x2: 900,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByText("Uploaded PDF Question Review")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("detect-uploaded-full-paper-page-questions"));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    fireEvent.click(screen.getByLabelText("finalize-uploaded-full-paper-trio"));

    await waitFor(() => {
      expect(screen.queryByLabelText("detect-uploaded-full-paper-page-questions")).not.toBeInTheDocument();
    });

    expect(
      useExamStore.getState().examLibraryDocuments.every(
        (document) => document.sourceMode === "uploaded_pdf"
          ? document.uploadedPdfWorkflowStatus === "finalized"
          : true
      )
    ).toBe(true);
  });

  it("detects uploaded-pdf questions on one question page and syncs ids to the trio", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "uploaded-page-1",
            detections: [
              {
                id: "draft-a",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 100,
                  y1: 120,
                  x2: 900,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByText("Uploaded PDF Question Review")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("detect-uploaded-full-paper-page-questions"));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "uploaded-page-1-draft-a",
      source: "ai"
    });
    expect(
      useExamStore.getState().examLibraryDocuments.every((document) => document.questionIds.join(",") === "uploaded-page-1-draft-a")
    ).toBe(true);
  });

  it("automatically detects all uploaded-pdf question pages after confirming the answer split", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      },
      {
        pageNumber: 3,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-3"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    let detectionCallCount = 0;
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 3
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        detectionCallCount += 1;

        return {
          ok: true,
          json: async () =>
            detectionCallCount === 1
              ? {
                  pageId: "uploaded-page-1",
                  detections: [
                    {
                      id: "draft-a",
                      localOrder: 1,
                      confidence: 0.92,
                      normalizedBBox: {
                        x1: 100,
                        y1: 120,
                        x2: 900,
                        y2: 320
                      }
                    }
                  ]
                }
              : {
                  pageId: "uploaded-page-2",
                  detections: [
                    {
                      id: "draft-b",
                      localOrder: 1,
                      confidence: 0.93,
                      normalizedBBox: {
                        x1: 120,
                        y1: 260,
                        x2: 880,
                        y2: 460
                      }
                    }
                  ]
                }
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(3);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts.some((question) => question.id === "uploaded-page-1-draft-a")).toBe(true);
      expect(useQuestionStore.getState().questionDrafts.some((question) => question.id === "uploaded-page-2-draft-b")).toBe(true);
    });
    expect(detectionCallCount).toBe(2);

    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) => document.questionIds.join(",") === "uploaded-page-1-draft-a,uploaded-page-2-draft-b"
        )
    ).toBe(true);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every((document) =>
          document.uploadedPdfPages
            ?.filter((page) => page.pageNumber < 3)
            .every((page) => page.reviewStatus === "reviewed")
        )
    ).toBe(true);
    expect(screen.getByRole("button", { name: "P1 · Q1" })).toBeInTheDocument();
  });

  it("shows uploaded-pdf auto-detect progress while question boxes are running", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const firstDetection = createDeferred<Response>();
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return firstDetection.promise;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByLabelText("uploaded-full-paper-auto-detect-progress")).toHaveAttribute(
        "aria-valuenow",
        "0"
      );
    });
    expect(screen.getByText("Detecting question boxes on page 1 of 1")).toBeInTheDocument();
    expect(screen.getByLabelText("finalize-uploaded-full-paper-trio")).toBeDisabled();

    firstDetection.resolve({
      ok: true,
      json: async () => ({
        pageId: "uploaded-page-1",
        detections: [
          {
            id: "draft-a",
            localOrder: 1,
            confidence: 0.92,
            normalizedBBox: {
              x1: 100,
              y1: 120,
              x2: 900,
              y2: 320
            }
          }
        ]
      })
    } as Response);

    await waitFor(() => {
      expect(screen.getByText("Auto-detect completed")).toBeInTheDocument();
    });
  });

  it("stops uploaded-pdf auto-detection when cross-page AI returns a local fallback", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      },
      {
        pageNumber: 3,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-3"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 3
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };

        return {
          ok: true,
          json: async () => ({
            pageId: requestBody.pageId,
            detections: [
              {
                id: "draft-a",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 100,
                  y1: 120,
                  x2: 900,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: [
              {
                id: "fallback-merge",
                sourceQuestionIds: [
                  "uploaded-page-1-draft-a",
                  "uploaded-page-2-draft-a"
                ],
                confidence: 0.9
              }
            ],
            source: {
              provider: "local_fallback",
              reason: "api_request_failed",
              diagnosticId: "aierr-full-paper-cross-page"
            }
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(3);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Cross-page detection AI request failed. Check ccSwitch routing and retry. Diagnostic ID aierr-full-paper-cross-page."
        )
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Auto-detect completed")).not.toBeInTheDocument();
    expect(
      useQuestionStore.getState().questionDrafts.some((question) => question.id === "fallback-merge")
    ).toBe(false);
  });

  it("stops uploaded-pdf auto-detection when question detection AI returns a local fallback", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            detections: [
              {
                id: "fallback-question",
                localOrder: 1,
                confidence: 0.9,
                normalizedBBox: {
                  x1: 100,
                  y1: 100,
                  x2: 900,
                  y2: 300
                }
              }
            ],
            source: {
              provider: "local_fallback",
              reason: "api_request_failed",
              diagnosticId: "aierr-full-paper-boxes"
            }
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Question detection AI request failed. Check ccSwitch routing and retry. Diagnostic ID aierr-full-paper-boxes."
        )
      ).toBeInTheDocument();
    });

    expect(useQuestionStore.getState().questionDrafts).toHaveLength(0);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.flatMap((document) => document.uploadedPdfPages ?? [])
        .find((page) => page.pageNumber === 1)?.reviewStatus
    ).not.toBe("reviewed");
  });

  it("auto-merges adjacent uploaded-pdf question pages when cross-page detection matches source ids", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" }),
        textLines: [
          {
            text: "5. 左页跨页题",
            normalizedBBox: { x1: 100, y1: 820, x2: 900, y2: 980 }
          }
        ]
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" }),
        textLines: [
          {
            text: "右页续题内容",
            normalizedBBox: { x1: 120, y1: 40, x2: 880, y2: 260 }
          }
        ]
      },
      {
        pageNumber: 3,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-3"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    let crossPageRequestBody: Record<string, unknown> | null = null;
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 3
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };
        const isFirstPage = requestBody.pageId === "uploaded-page-1";

        return {
          ok: true,
          json: async () => ({
            pageId: requestBody.pageId,
            detections: [
              {
                id: isFirstPage ? "draft-a" : "draft-b",
                localOrder: 1,
                confidence: isFirstPage ? 0.92 : 0.9,
                normalizedBBox: isFirstPage
                  ? {
                      x1: 100,
                      y1: 820,
                      x2: 900,
                      y2: 980
                    }
                  : {
                      x1: 120,
                      y1: 40,
                      x2: 880,
                      y2: 260
                    }
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-cross-page") {
        crossPageRequestBody = JSON.parse(String(init?.body ?? "{}"));
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: [
              {
                id: "uploaded-page-1-uploaded-page-2-merge-1",
                documentId: "ignored-document-id",
                leftPageId: "uploaded-page-1",
                rightPageId: "uploaded-page-2",
                sourceQuestionIds: ["uploaded-page-1-draft-a", "uploaded-page-2-draft-b"],
                confidence: 0.9,
                status: "suggested"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(3);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    const mergedQuestion = useQuestionStore.getState().questionDrafts[0];

    expect(mergedQuestion).toMatchObject({
      id: "uploaded-page-1-uploaded-page-2-merge-1",
      primaryPageId: "uploaded-page-1",
      pageIds: ["uploaded-page-1", "uploaded-page-2"],
      source: "merged"
    });
    expect(mergedQuestion.bboxByPage["uploaded-page-1"]).toEqual({
      x: 110,
      y: 1288,
      width: 980,
      height: 304
    });
    expect(mergedQuestion.bboxByPage["uploaded-page-2"]).toEqual({
      x: 134,
      y: 40,
      width: 932,
      height: 400
    });
    expect(crossPageRequestBody).toMatchObject({
      leftTextLines: [
        {
          text: "5. 左页跨页题"
        }
      ],
      rightTextLines: [
        {
          text: "右页续题内容"
        }
      ],
      candidates: [
        { id: "uploaded-page-1-draft-a", pageId: "uploaded-page-1" },
        { id: "uploaded-page-2-draft-b", pageId: "uploaded-page-2" }
      ]
    });
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) =>
            document.questionIds.join(",") === "uploaded-page-1-uploaded-page-2-merge-1"
        )
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("select-uploaded-full-paper-page-2"));

    expect(screen.getByRole("button", { name: "P2 · Q1 · 跨页" })).toBeInTheDocument();
  });

  it("keeps one uploaded-pdf question pool for the whole strong-bound trio even after switching documents", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      },
      {
        pageNumber: 3,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-3"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    let detectionCallCount = 0;
    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 3
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        detectionCallCount += 1;

        return {
          ok: true,
          json: async () =>
            detectionCallCount === 1
              ? {
                  pageId: "uploaded-page-1",
                  detections: [
                    {
                      id: "draft-a",
                      localOrder: 1,
                      confidence: 0.92,
                      normalizedBBox: {
                        x1: 100,
                        y1: 120,
                        x2: 900,
                        y2: 320
                      }
                    }
                  ]
                }
              : {
                  pageId: "uploaded-page-2",
                  detections: [
                    {
                      id: "draft-b",
                      localOrder: 1,
                      confidence: 0.93,
                      normalizedBBox: {
                        x1: 120,
                        y1: 260,
                        x2: 880,
                        y2: 460
                      }
                    }
                  ]
                }
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(3);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByLabelText("select-uploaded-full-paper-page-1")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts.some((question) => question.id === "uploaded-page-1-draft-a")).toBe(true);
      expect(useQuestionStore.getState().questionDrafts.some((question) => question.id === "uploaded-page-2-draft-b")).toBe(true);
    });

    const lectureDocument = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "lecture");

    expect(lectureDocument).toBeTruthy();

    fireEvent.click(screen.getByLabelText(`select-current-library-document-${lectureDocument!.id}`));

    const questionDrafts = useQuestionStore.getState().questionDrafts;

    expect(questionDrafts.map((question) => question.documentId)).toEqual([questionDrafts[0].documentId, questionDrafts[0].documentId]);
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) => document.questionIds.join(",") === "uploaded-page-1-draft-a,uploaded-page-2-draft-b"
        )
    ).toBe(true);
  });

  it("marks one uploaded-pdf question page as reviewed after detection and allows manual add/remove on that page", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "uploaded-page-1",
            detections: [
              {
                id: "draft-a",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 100,
                  y1: 120,
                  x2: 900,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByText("Uploaded PDF Question Review")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments[0].uploadedPdfPages?.find((page) => page.pageId === "uploaded-page-1")?.reviewStatus
      ).toBe("reviewed");
    });

    expect(screen.getByRole("button", { name: "P1 · Q1" })).toBeInTheDocument();
    expect(
      useExamStore
        .getState()
        .examLibraryDocuments[0].uploadedPdfPages?.find((page) => page.pageId === "uploaded-page-1")?.reviewStatus
    ).toBe("reviewed");

    fireEvent.click(screen.getByLabelText("add-manual-uploaded-full-paper-question"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "P1 · Q2" })).toBeInTheDocument();
    });

    const manualQuestion = useQuestionStore
      .getState()
      .questionDrafts.find((question) => question.source === "manual");

    expect(manualQuestion).toBeTruthy();

    fireEvent.click(screen.getByLabelText(`remove-uploaded-full-paper-question-${manualQuestion!.id}`));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts.some((question) => question.id === manualQuestion!.id)).toBe(false);
    });
  });

  it("lets the user edit uploaded-pdf question numbers with numeric-only values", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "uploaded-page-1",
            detections: [
              {
                id: "draft-a",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 100,
                  y1: 120,
                  x2: 900,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByText("Uploaded PDF Question Review")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    fireEvent.change(screen.getByLabelText("uploaded-full-paper-question-number-uploaded-page-1-draft-a"), {
      target: { value: "Q18A" }
    });

    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "uploaded-page-1-draft-a")
    ).toMatchObject({
      questionNumberLabel: "18"
    });
    expect(screen.getByRole("button", { name: "P1 · Q18" })).toBeInTheDocument();
  });

  it("shows uploaded-pdf page preview and lets the user drag detected question boxes", async () => {
    const targetFolder = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.library === "full" && folder.depth === 1);

    expect(targetFolder).toBeTruthy();

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 1600,
      width: 1200,
      height: 1600,
      toJSON: () => ({})
    });
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "uploaded-page-1",
            detections: [
              {
                id: "draft-a",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 100,
                  y1: 120,
                  x2: 900,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch ${String(input)}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(fetchSpy);

    render(<ExamCreatePage />);

    fireEvent.click(screen.getByLabelText("switch-library-full"));
    fireEvent.change(screen.getByLabelText("exam-folder-select"), {
      target: { value: targetFolder!.id }
    });

    const file = new File(["%PDF-1.4"], "suite.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("upload-full-paper-pdf"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("full-paper-answer-split-page-input")).toHaveValue(2);
    });

    fireEvent.click(screen.getByLabelText("confirm-full-paper-answer-split"));

    await waitFor(() => {
      expect(screen.getByText("Uploaded PDF Question Review")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("detect-uploaded-full-paper-page-questions"));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    fireEvent.pointerDown(screen.getByRole("button", { name: "P1 · Q1" }), {
      clientX: 200,
      clientY: 260,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 260,
      clientY: 340,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 260,
      clientY: 340,
      pointerId: 1
    });

    expect(useQuestionStore.getState().questionDrafts[0].bboxByPage["uploaded-page-1"]).toEqual({
      x: 170,
      y: 248,
      width: 980,
      height: 368
    });
  });
});
