import { fireEvent, render, screen, within } from "@testing-library/react";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PagePreview } from "@/components/page-canvas/page-preview";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";

describe("page-preview", () => {
  beforeEach(() => {
    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      questionDrafts: [],
      crossPageCandidates: [],
      selectedQuestionId: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders question boxes for the selected page and lets the user select one", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
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
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
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
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });

    render(createElement(PagePreview));

    const boxButton = screen.getByRole("button", { name: "P1 · Q1" });
    expect(boxButton).toBeInTheDocument();

    fireEvent.click(boxButton);

    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-1");
  });

  it("shows one stable document number and a cross-page marker on every merged fragment", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
        "page-1": "blob:page-1",
        "page-2": "blob:page-2"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 100, y: 120, width: 900, height: 300 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.94,
          crossPageGroupId: null,
          questionNumberLabel: "1"
        },
        {
          id: "merge-4",
          documentId: "doc-1",
          pageIds: ["page-1", "page-2"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 4,
          bboxByPage: {
            "page-1": { x: 100, y: 980, width: 900, height: 560 },
            "page-2": { x: 100, y: 30, width: 900, height: 620 }
          },
          status: "geometry_reviewed",
          source: "merged",
          confidence: 0.92,
          crossPageGroupId: "merge-4",
          questionNumberLabel: null
        }
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    });

    render(createElement(PagePreview));

    expect(screen.getByRole("button", { name: "P1 · Q4 · 跨页" })).toBeInTheDocument();
    expect(screen.getByText("2 个题框")).toBeInTheDocument();
    expect(screen.getByText("1 个跨页片段")).toBeInTheDocument();

    act(() => useFileStore.getState().selectPage("page-2"));

    expect(screen.getByRole("button", { name: "P2 · Q4 · 跨页" })).toBeInTheDocument();
    expect(screen.getByText("1 个题框")).toBeInTheDocument();
    expect(screen.getByText("1 个跨页片段")).toBeInTheDocument();
  });

  it("deletes a question from the question box context menu after confirmation", () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
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
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
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
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    });

    render(createElement(PagePreview));

    fireEvent.contextMenu(screen.getByRole("button", { name: "P1 · Q1" }), {
      clientX: 240,
      clientY: 320
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "删除题目" }));

    expect(useQuestionStore.getState().questionDrafts).toHaveLength(0);
    expect(useQuestionStore.getState().selectedQuestionId).toBeNull();
    expect(confirmSpy).toHaveBeenNthCalledWith(1, "确认删除当前题目吗？");
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      "将同步影响相关默认专题卷内容，是否再次确认删除？"
    );
  });

  it("styles question boxes by question type and shows type icons", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
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
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 160, width: 360, height: 220 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["我的题库", "高中数学", "函数"],
          directoryCandidatePaths: [],
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
            "page-1": { x: 520, y: 420, width: 420, height: 260 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.84,
          directoryPath: ["我的题库", "高中数学", "几何"],
          directoryCandidatePaths: [],
          questionType: "证明题",
          ocrText: "第二题",
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });

    render(createElement(PagePreview));

    const choiceBox = screen.getByRole("button", { name: "P1 · Q1" });
    const proofBox = screen.getByRole("button", { name: "P1 · Q2" });

    expect(choiceBox).toHaveClass("border-sky-500", "bg-sky-100/60", "text-sky-700");
    expect(within(choiceBox).getByText("P1 · Q1")).toHaveClass("bg-sky-500", "text-white");
    expect(within(choiceBox).getByText("☐")).toBeInTheDocument();

    expect(proofBox).toHaveClass("border-violet-500", "bg-violet-100/60", "text-violet-700");
    expect(within(proofBox).getByText("P1 · Q2")).toHaveClass("bg-violet-500", "text-white");
    expect(within(proofBox).getByText("🔷")).toBeInTheDocument();
  });

  it("moves a question box by dragging it on the page preview", () => {
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
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
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
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
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
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });

    render(createElement(PagePreview));

    fireEvent.pointerDown(screen.getByRole("button", { name: "P1 · Q1" }), {
      clientX: 200,
      clientY: 240,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 260,
      clientY: 320,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 260,
      clientY: 320,
      pointerId: 1
    });

    expect(useQuestionStore.getState().questionDrafts[0].bboxByPage["page-1"]).toEqual({
      x: 180,
      y: 240,
      width: 800,
      height: 300
    });
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-1");
  });

  it("resizes a question box from its resize handle", () => {
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
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
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
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 160, width: 300, height: 200 }
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
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });

    render(createElement(PagePreview));

    fireEvent.pointerDown(screen.getByRole("button", { name: "调整大小-P1 · Q1" }), {
      clientX: 420,
      clientY: 360,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 520,
      clientY: 460,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 520,
      clientY: 460,
      pointerId: 1
    });

    expect(useQuestionStore.getState().questionDrafts[0].bboxByPage["page-1"]).toEqual({
      x: 120,
      y: 160,
      width: 400,
      height: 300
    });
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-1");
  });

  it("asks whether to rerun processed semantics after dragging a processed question box", () => {
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
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
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.9,
          directoryPath: ["我的题库", "高中数学", "函数"],
          directoryCandidatePaths: [["我的题库", "高中数学", "函数"]],
          ocrText: "已识别题目",
          lastBulkConfirmationId: "bulk-1"
        }
      ],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });

    render(createElement(PagePreview));

    fireEvent.pointerDown(screen.getByRole("button", { name: "P1 · Q1" }), {
      clientX: 200,
      clientY: 240,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 260,
      clientY: 320,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 260,
      clientY: 320,
      pointerId: 1
    });

    expect(confirmSpy).toHaveBeenCalledWith("检测到已处理题目发生变化，是否重跑该题的 OCR 与分类？");
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      bboxByPage: {
        "page-1": {
          x: 180,
          y: 240,
          width: 800,
          height: 300
        }
      },
      status: "geometry_reviewed",
      classificationStatus: "unclassified",
      directoryPath: null,
      ocrText: null,
      lastSemanticRevisionSource: "geometry_rerun_pending"
    });
  });
});
