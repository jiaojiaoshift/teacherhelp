import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "@/components/layout/shell";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";

describe("app-shell", () => {
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
  });

  it("searches questions by OCR text and tags from the global search input", () => {
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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [],
        ocrText: "quadratic vertex problem",
        chapterTag: "functions",
        knowledgeTags: ["vertex"],
        customTags: ["important"],
        lastBulkConfirmationId: null
      }
    ]);

    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    fireEvent.change(screen.getByLabelText("全局搜索"), {
      target: { value: "vertex" }
    });

    expect(screen.getByLabelText("global-search-results")).toBeInTheDocument();
    expect(screen.getByText("quadratic vertex problem")).toBeInTheDocument();
  });

  it("renders a documentation-style workspace shell with stable regions", () => {
    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    expect(screen.getByLabelText("teachhelper-workspace-shell")).toHaveClass("h-screen");
    expect(screen.getByLabelText("teachhelper-workspace-shell")).toHaveAttribute(
      "data-theme",
      "dark"
    );
    expect(screen.getByLabelText("workspace-navigation")).toBeInTheDocument();
    expect(screen.getByLabelText("workspace-sidebar-region")).toBeInTheDocument();
    expect(screen.getByLabelText("workspace-main-region")).toHaveClass("min-h-0", "overflow-auto");
    expect(screen.getByLabelText("workspace-detail-region")).toBeInTheDocument();
  });

  it("uses the shared application artwork in the workspace brand", () => {
    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    expect(screen.getByRole("img", { name: "智题库应用图标" })).toHaveAttribute(
      "src",
      "/icon.png"
    );
    expect(screen.queryByTestId("legacy-brand-letter")).not.toBeInTheDocument();
  });

  it("does not render a disconnected global OCR classification button", () => {
    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    expect(screen.queryByRole("button", { name: "当前文件 OCR + 分类" })).not.toBeInTheDocument();
  });

  it("links to the file-manager pages for the question and paper libraries", () => {
    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    expect(screen.getByRole("link", { name: "题库" })).toHaveAttribute(
      "href",
      "/library/questions"
    );
    expect(screen.getByRole("link", { name: "专题卷库" })).toHaveAttribute(
      "href",
      "/library/specialized"
    );
    expect(screen.getByRole("link", { name: "套卷库" })).toHaveAttribute(
      "href",
      "/library/full"
    );
  });

  it("searches folders by name from the global search input", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    useFolderStore.getState().createFolder(subject!.id, "folder-search-target");

    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    fireEvent.change(screen.getByLabelText("全局搜索"), {
      target: { value: "search-target" }
    });

    expect(screen.getByLabelText("global-search-results")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "folder-search-target" })).toBeInTheDocument();
  });

  it("searches questions by question type from the global search input", () => {
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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [],
        questionType: "证明题",
        ocrText: "prove the triangle similarity",
        lastBulkConfirmationId: null
      }
    ]);

    render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <div>main</div>
      </AppShell>
    );

    fireEvent.change(screen.getByLabelText("全局搜索"), {
      target: { value: "证明题" }
    });

    expect(screen.getByText("prove the triangle similarity")).toBeInTheDocument();
  });
});
