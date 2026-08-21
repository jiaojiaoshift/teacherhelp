import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

vi.mock("@/components/layout/drawer", () => ({
  QuestionDrawer: () => null
}));

vi.mock("@/components/layout/sidebar", () => ({
  SidebarPanel: () => null
}));

vi.mock("@/components/page-canvas/page-preview", () => ({
  PagePreview: () => null
}));

vi.mock("@/components/upload/upload-workbench", () => ({
  UploadWorkbench: () => null
}));

vi.mock("@/components/layout/shell", async () => {
  const { ToastViewport } = await import("@/components/feedback/toast-viewport");

  return {
    AppShell: ({ children }: { children: React.ReactNode }) => (
      <div>
        {children}
        <ToastViewport />
      </div>
    )
  };
});

describe("bulk confirmation toast", () => {
  beforeEach(() => {
    useFolderStore.setState({
      folders: buildInitialFolderTree(),
      setFolders: useFolderStore.getState().setFolders,
      createFolder: useFolderStore.getState().createFolder,
      renameFolder: useFolderStore.getState().renameFolder,
      deleteFolder: useFolderStore.getState().deleteFolder
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "doc-1.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高中数学"
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewUrls: {
        "page-1": "blob:page-1"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1"
      },
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
            "page-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "auto_classified",
          source: "ai",
          confidence: 0.93,
          crossPageGroupId: null,
          classificationStatus: "matched",
          directoryMatchConfidence: 0.91,
          directoryPath: ["高中数学", "函数", "函数图像"],
          directoryCandidatePaths: [],
          ocrText: "question text",
          lastBulkConfirmationId: null
        }
      ],
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
      clearCrossPageCandidatesForDocument:
        useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
    vi.restoreAllMocks();
  });

  it("shows a toast with undo after confirming high-confidence questions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<HomePage />);

    fireEvent.click(screen.getByText("一键确认当前文件高置信度题目"));

    await waitFor(() => {
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });

    expect(useToastStore.getState().toasts[0]).toMatchObject({
      title: "已确认 1 道高置信度题目",
      actionLabel: "撤销本次确认"
    });
    expect(screen.getByText("已确认 1 道高置信度题目")).toBeInTheDocument();
    expect(screen.getByText("撤销本次确认")).toBeInTheDocument();

    fireEvent.click(screen.getByText("撤销本次确认"));

    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      status: "auto_classified",
      classificationStatus: "matched"
    });
  }, 10000);
});
