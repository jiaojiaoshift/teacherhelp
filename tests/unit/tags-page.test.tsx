import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TagsPage from "@/app/tags/page";
import { useQuestionStore } from "@/lib/stores/question-store";

describe("tags-page", () => {
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
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      moveQuestionToPendingBucket: useQuestionStore.getState().moveQuestionToPendingBucket,
      assignQuestionToDirectory: useQuestionStore.getState().assignQuestionToDirectory,
      rewriteDirectoryPaths: useQuestionStore.getState().rewriteDirectoryPaths,
      reassignQuestionsFromDeletedFolder: useQuestionStore.getState().reassignQuestionsFromDeletedFolder,
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

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
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
        chapterTag: "二次函数",
        knowledgeTags: ["最值", "顶点公式"],
        customTags: ["易错"]
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {},
        status: "reviewed",
        source: "manual",
        confidence: 1,
        crossPageGroupId: null,
        chapterTag: "二次函数",
        knowledgeTags: ["最值"],
        customTags: ["压轴"]
      }
    ]);
    vi.restoreAllMocks();
  });

  it("renders aggregated tags grouped by type", () => {
    render(<TagsPage />);

    expect(screen.getByText("章节标签")).toBeInTheDocument();
    expect(screen.getByText("考点标签")).toBeInTheDocument();
    expect(screen.getByText("自定义标签")).toBeInTheDocument();
    expect(screen.getByText("二次函数")).toBeInTheDocument();
    expect(screen.getByText("最值")).toBeInTheDocument();
    expect(screen.getByText("易错")).toBeInTheDocument();
    expect(screen.getAllByText("2 次")).toHaveLength(2);
  });

  it("renames one tag and rewrites matching question tags", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("顶点坐标公式");

    render(<TagsPage />);

    fireEvent.click(screen.getByRole("button", { name: "重命名标签-顶点公式" }));

    await waitFor(() => {
      expect(screen.getByText("顶点坐标公式")).toBeInTheDocument();
    });

    expect(useQuestionStore.getState().questionDrafts[0].knowledgeTags).toEqual([
      "最值",
      "顶点坐标公式"
    ]);
  });

  it("deletes one tag and removes it from matching questions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TagsPage />);

    fireEvent.click(screen.getByRole("button", { name: "删除标签-易错" }));

    await waitFor(() => {
      expect(screen.queryByText("易错")).not.toBeInTheDocument();
    });

    expect(useQuestionStore.getState().questionDrafts[0].customTags).toEqual([]);
  });

  it("merges one tag into another tag from the management page", async () => {
    const sourceTagName = useQuestionStore.getState().questionDrafts[1].customTags![0];
    const targetTagName = useQuestionStore.getState().questionDrafts[0].customTags![0];
    vi.spyOn(window, "prompt").mockReturnValue(targetTagName);

    render(<TagsPage />);

    fireEvent.click(screen.getByRole("button", { name: `merge-tag-${sourceTagName}` }));

    await waitFor(() => {
      expect(screen.queryByText(sourceTagName)).not.toBeInTheDocument();
    });

    expect(useQuestionStore.getState().questionDrafts[0].customTags).toEqual([targetTagName]);
    expect(useQuestionStore.getState().questionDrafts[1].customTags).toEqual([targetTagName]);
  });

  it("filters visible tags by name", () => {
    const visibleTagName = useQuestionStore.getState().questionDrafts[1].customTags![0];
    const hiddenTagName = useQuestionStore.getState().questionDrafts[0].customTags![0];

    render(<TagsPage />);

    fireEvent.change(screen.getByLabelText("tag-search-input"), {
      target: { value: visibleTagName }
    });

    expect(screen.getByText(visibleTagName)).toBeInTheDocument();
    expect(screen.queryByText(hiddenTagName)).not.toBeInTheDocument();
  });
});
