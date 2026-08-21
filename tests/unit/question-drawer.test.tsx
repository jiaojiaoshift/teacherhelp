import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ToastViewport } from "@/components/feedback/toast-viewport";
import { QuestionDrawer } from "@/components/layout/drawer";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

describe("question-drawer", () => {
  beforeEach(() => {
    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useFolderStore.setState({
      folders: buildInitialFolderTree(),
      hydrateWorkspaceState: useFolderStore.getState().hydrateWorkspaceState,
      setFolders: useFolderStore.getState().setFolders,
      createFolder: useFolderStore.getState().createFolder,
      renameFolder: useFolderStore.getState().renameFolder,
      deleteFolder: useFolderStore.getState().deleteFolder
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
      updateQuestionOcrText: useQuestionStore.getState().updateQuestionOcrText,
      updateQuestionNumberLabel: useQuestionStore.getState().updateQuestionNumberLabel,
      updateQuestionType: useQuestionStore.getState().updateQuestionType,
      updateQuestionTags: useQuestionStore.getState().updateQuestionTags,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      moveQuestionToPendingBucket: useQuestionStore.getState().moveQuestionToPendingBucket,
      assignQuestionToDirectory: useQuestionStore.getState().assignQuestionToDirectory,
      rewriteDirectoryPaths: useQuestionStore.getState().rewriteDirectoryPaths,
      reassignQuestionsFromDeletedFolder: useQuestionStore.getState().reassignQuestionsFromDeletedFolder,
      renameTagEverywhere: useQuestionStore.getState().renameTagEverywhere,
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
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
  });

  it("renders an empty state when no question is selected", () => {
    render(
      <>
        <QuestionDrawer />
        <ToastViewport />
      </>
    );

    expect(screen.getByText("题目详情")).toBeInTheDocument();
    expect(screen.getByText("当前尚未选中题目。")).toBeInTheDocument();
  });

  it("defaults to the first review question and navigates classification review in the drawer", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "doc.pdf",
          kind: "pdf",
          status: "semantic_review_pending",
          pageIds: ["page-1"],
          subjectScope: "高中数学"
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
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
        status: "auto_classified",
        source: "ai",
        confidence: 0.96,
        crossPageGroupId: null,
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数"],
        directoryCandidatePaths: [["我的题库", "高中数学", "函数"]],
        questionNumberLabel: "1",
        questionType: "选择题",
        ocrText: "第一题",
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
          "page-1": { x: 10, y: 160, width: 100, height: 120 }
        },
        status: "needs_choice",
        source: "ai",
        confidence: 0.78,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.42,
        directoryPath: null,
        directoryCandidatePaths: [["我的题库", "高中数学", "待定区"]],
        questionNumberLabel: "2",
        questionType: "填空题",
        ocrText: "第二题",
        lastBulkConfirmationId: null
      }
    ]);

    render(
      <>
        <QuestionDrawer />
        <ToastViewport />
      </>
    );

    expect(screen.getByText("第一题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一道" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一道" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "下一道" }));

    expect(screen.getByText("第二题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一道" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "确认当前题目" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "上一道" }));
    fireEvent.click(screen.getByRole("button", { name: "确认当前题目" }));

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed"
    });
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-2");
    expect(screen.getByText("第二题")).toBeInTheDocument();
  });

  it("edits OCR text, question number, type and tags for the selected question", () => {
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
        confidence: 0.96,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.94,
        directoryPath: ["高中数学", "函数", "二次函数"],
        directoryCandidatePaths: [["高中数学", "函数", "二次函数"]],
        questionNumberLabel: "1",
        questionType: "选择题",
        ocrText: "old text",
        chapterTag: "old chapter",
        knowledgeTags: ["knowledge-a", "knowledge-b"],
        customTags: ["custom-a"],
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().selectQuestion("q-1");

    render(
      <>
        <QuestionDrawer />
        <ToastViewport />
      </>
    );

    fireEvent.change(screen.getByLabelText("drawer-ocr-input"), {
      target: { value: "new text" }
    });
    fireEvent.change(screen.getByLabelText("drawer-question-number-input"), {
      target: { value: "12" }
    });
    fireEvent.change(screen.getByLabelText("drawer-question-type-select"), {
      target: { value: "证明题" }
    });
    fireEvent.change(screen.getByLabelText("drawer-chapter-input"), {
      target: { value: "new chapter" }
    });
    fireEvent.change(screen.getByLabelText("drawer-knowledge-input"), {
      target: { value: "knowledge-x, knowledge-y" }
    });
    fireEvent.change(screen.getByLabelText("drawer-custom-input"), {
      target: { value: "custom-x, custom-y" }
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      ocrText: "new text",
      questionNumberLabel: "12",
      questionType: "证明题",
      chapterTag: "new chapter",
      knowledgeTags: ["knowledge-x", "knowledge-y"],
      customTags: ["custom-x", "custom-y"]
    });
  });

  it("moves the selected question to a subject-scoped folder", () => {
    const subjectFolder = useFolderStore
      .getState()
      .folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subjectFolder).toBeTruthy();

    const targetFolder = useFolderStore.getState().createFolder(subjectFolder!.id, "folder-a");

    expect(targetFolder).toBeTruthy();

    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "doc.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: subjectFolder!.subjectScope!
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
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
        confidence: 0.8,
        crossPageGroupId: null,
        classificationStatus: "needs_choice",
        directoryMatchConfidence: 0.42,
        directoryPath: null,
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: "text",
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().selectQuestion("q-1");

    render(
      <>
        <QuestionDrawer />
        <ToastViewport />
      </>
    );

    fireEvent.change(screen.getByLabelText("drawer-directory-select"), {
      target: { value: targetFolder!.id }
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: targetFolder!.path
    });
    expect(screen.getByRole("status")).toHaveTextContent("题目已移至 folder-a");
  });
});
