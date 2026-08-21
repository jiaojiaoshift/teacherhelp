import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";

import HomePage from "@/app/page";
import { CrossPageReviewHost } from "@/components/workbench/cross-page-review-host";
import { prepareAiPreviewDataUrl } from "@/lib/services/ai-image-preview-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

const pushRoute = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushRoute
  })
}));

vi.mock("@/lib/services/ai-image-preview-service", () => ({
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

function openAnswerReview() {
  fireEvent.click(screen.getByRole("button", { name: /^答案复核/ }));
}

function chooseSingleColumnLayout() {
  fireEvent.click(screen.getByRole("button", { name: "单栏" }));
}

describe("home-page workflow", () => {
  beforeEach(() => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高等数学"
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "1. 自动识别题目",
              normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 140 }
            }
          ]
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
      questionDrafts: [],
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
    vi.restoreAllMocks();
    vi.mocked(prepareAiPreviewDataUrl).mockImplementation(
      async (dataUrl: string) => `compressed:${dataUrl}`
    );
    pushRoute.mockReset();
    useWorkbenchStore.getState().resetTransientProgress();
    useWorkbenchStore.getState().hydrateDocumentTasks([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not expose the removed manual current-page analysis action", () => {
    render(<HomePage />);

    expect(screen.queryByRole("button", { name: "分析当前页题目" })).not.toBeInTheDocument();
  });

  it("adds a manual question box on the current page", async () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "手动新增框选" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      source: "manual",
      status: "manual_only",
      pageIds: ["page-1"]
    });
  });

  it("requires two confirmations before removing the selected question", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
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
      selectedQuestionId: "q-1"
    });

    render(<HomePage />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "P1 · Q1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除题目" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(0);
    });
  });

  it("asks whether to rerun when an already processed question is manually changed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
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
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["高中数学", "函数", "函数图像"],
          directoryCandidatePaths: [],
          ocrText: "已处理题干",
          lastBulkConfirmationId: null
        }
      ],
      selectedQuestionId: "q-1"
    });

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
    render(<HomePage />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "P1 · Q1" }), {
      clientX: 200,
      clientY: 240,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 212,
      clientY: 252,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 212,
      clientY: 252,
      pointerId: 1
    });

    expect(confirmSpy).toHaveBeenCalledWith("检测到已处理题目发生变化，是否重跑该题的 OCR 与分类？");
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      ocrText: "已处理题干",
      lastSemanticRevisionSource: "geometry_preserved_without_rerun"
    });
    expect(useQuestionStore.getState().questionDrafts[0].bboxByPage["page-1"]).toEqual({
      x: 132,
      y: 172,
      width: 800,
      height: 300
    });
  });

  it("invalidates only the changed processed question when rerun is accepted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
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
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["高中数学", "函数", "函数图像"],
          directoryCandidatePaths: [],
          ocrText: "已处理题干",
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
            "page-1": { x: 300, y: 520, width: 760, height: 260 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.89,
          directoryPath: ["高中数学", "函数", "函数性质"],
          directoryCandidatePaths: [],
          ocrText: "另一题",
          lastBulkConfirmationId: null
        }
      ],
      selectedQuestionId: "q-1"
    });

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
    render(<HomePage />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "P1 · Q1" }), {
      clientX: 200,
      clientY: 240,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 212,
      clientY: 252,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 212,
      clientY: 252,
      pointerId: 1
    });

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")).toMatchObject({
      status: "geometry_reviewed",
      classificationStatus: "unclassified",
      directoryPath: null,
      ocrText: null,
      lastSemanticRevisionSource: "geometry_rerun_pending"
    });
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["高中数学", "函数", "函数性质"],
      ocrText: "另一题"
    });
  });

  it("defaults to document question-stream review and can switch back to page review", async () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"]
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
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "unreviewed"
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });
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
          status: "geometry_reviewed",
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
          id: "q-2",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 140, y: 180, width: 760, height: 280 }
          },
          status: "geometry_draft",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: null,
          lastBulkConfirmationId: null
        }
      ],
      selectedQuestionId: null
    });

    render(<HomePage />);

    expect(screen.getByLabelText("整文件题目流复核")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "题目流-P2-Q1" }));

    expect(useFileStore.getState().selectedPageId).toBe("page-2");
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-2");

    fireEvent.click(screen.getByRole("button", { name: "按页复核" }));

    expect(screen.queryByLabelText("整文件题目流复核")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "题目流复核" }));

    expect(screen.getByLabelText("整文件题目流复核")).toBeInTheDocument();
  }, 10000);
  it("edits OCR text and tags from the question drawer in the main workflow", async () => {
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
            "page-1": { x: 120, y: 160, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          ocrText: "old text",
          chapterTag: "old chapter",
          knowledgeTags: ["knowledge-a"],
          customTags: ["custom-a"],
          lastBulkConfirmationId: null
        }
      ],
      selectedQuestionId: "q-1"
    });

    render(<HomePage />);

    fireEvent.change(screen.getByLabelText("drawer-ocr-input"), {
      target: { value: "new text" }
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
      chapterTag: "new chapter",
      knowledgeTags: ["knowledge-x", "knowledge-y"],
      customTags: ["custom-x", "custom-y"]
    });
  });

  it("requires an explicit single-column or double-column choice before answer confirmation", () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: [
        {
          id: "doc-1",
          name: "双栏试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          answerSection: {
            status: "suggested",
            hasAnswerSection: false,
            suggestedSplitPage: null,
            confirmedSplitPage: null
          }
        }
      ]
    });

    render(<HomePage />);

    const layoutChoice = screen.getByRole("group", { name: "题目页面版式" });
    const singleColumnButton = within(layoutChoice).getByRole("button", { name: "单栏" });
    const doubleColumnButton = within(layoutChoice).getByRole("button", { name: "双栏" });
    const confirmButton = screen.getByRole("button", { name: "Confirm answer split" });
    const noAnswerButton = screen.getByRole("button", { name: "No answer section" });

    expect(singleColumnButton).toHaveAttribute("aria-pressed", "false");
    expect(doubleColumnButton).toHaveAttribute("aria-pressed", "false");
    expect(confirmButton).toBeDisabled();
    expect(noAnswerButton).toBeDisabled();

    fireEvent.click(doubleColumnButton);

    expect(doubleColumnButton).toHaveAttribute("aria-pressed", "true");
    expect(confirmButton).toBeEnabled();
    expect(noAnswerButton).toBeEnabled();
  });

  it("confirms the detected answer-section split for the current pdf document", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "page-1",
            detections: []
          })
        } as Response;
      }

      if (String(input) === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({ mergeCandidates: [] })
        } as Response;
      }

      if (String(input) === "/api/ai/suggest-answer-matches") {
        return {
          ok: true,
          json: async () => ({
            detectedAnswers: [
              {
                id: "answer-1",
                pageId: "page-4",
                pageNumber: 4,
                answerLabel: "12",
                confidence: 0.96,
                normalizedBBox: {
                  x1: 120,
                  y1: 300,
                  x2: 780,
                  y2: 460
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3", "page-4"],
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "1. 自动识别题目",
              normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 140 }
            }
          ]
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-4",
          documentId: "doc-1",
          pageNumber: 4,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2",
        "page-3": "data:image/png;base64,page-3",
        "page-4": "data:image/png;base64,page-4"
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
          directoryMatchConfidence: 0.93,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question 12",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);

    expect(screen.getByText("Answer section review pending")).toBeInTheDocument();
    expect(screen.getByLabelText("answer-split-page-input")).toHaveValue(3);

    fireEvent.change(screen.getByLabelText("answer-split-page-input"), {
      target: { value: "4" }
    });
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(useFileStore.getState().documents[0].pendingAnswerMatches).toEqual([
        {
          id: "answer-1",
          answerLabel: "12",
          suggestedQuestionId: null,
          status: "pending",
          pageId: "page-4",
          pageNumber: 4,
          confidence: 0.96,
          normalizedBBox: {
            x1: 112,
            y1: 285,
            x2: 788,
            y2: 475
          }
        }
      ]);
    });

    expect(useFileStore.getState().documents[0].answerSection).toEqual({
      status: "confirmed",
      hasAnswerSection: true,
      suggestedSplitPage: 3,
      confirmedSplitPage: 4
    });
    expect(useFileStore.getState().documents[0].pendingAnswerMatch).toBe(true);
    const answerMatchCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === "/api/ai/suggest-answer-matches"
    );
    expect(answerMatchCall).toBeDefined();

    const requestInit = answerMatchCall?.[1];
    const requestBody = JSON.parse(String(requestInit?.body));
    expect(requestBody.questions).toEqual([]);
    expect(requestBody.answerPages).toEqual([
      {
        pageId: "page-4",
        pageNumber: 4,
        imageDataUrl: "compressed:data:image/png;base64,page-4"
      }
    ]);
  });

  it("auto-detects question boxes on question pages after confirming the answer split", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "page-1",
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: {
                  x1: 100,
                  y1: 100,
                  x2: 900,
                  y2: 300
                }
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            results: [
              {
                questionId: "page-1-draft-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "1. 自动识别题目"
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/suggest-answer-matches") {
        return {
          ok: true,
          json: async () => ({
            detectedAnswers: []
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "数学",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "1. 自动识别题目",
              normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 140 }
            }
          ]
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: []
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "双栏" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "page-1-draft-1",
      documentId: "doc-1",
      pageIds: ["page-1"],
      status: "needs_choice",
      questionNumberLabel: "1"
    });
    expect(useFileStore.getState().pages.find((page) => page.id === "page-1")).toMatchObject({
      analysisStatus: "done",
      reviewStatus: "reviewed"
    });
    expect(useFileStore.getState().pages.find((page) => page.id === "page-2")).toMatchObject({
      analysisStatus: "idle"
    });
    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/detect-question-boxes")
    ).toHaveLength(1);
    const questionBoxCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === "/api/ai/detect-question-boxes"
    );
    const questionBoxRequestBody = JSON.parse(String(questionBoxCall?.[1]?.body));
    expect(questionBoxRequestBody.questionPageLayoutMode).toBe("double_column");
    expect(questionBoxRequestBody.textLines).toEqual([
      {
        text: "1. 自动识别题目",
        normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 140 }
      }
    ]);
    expect(useFileStore.getState().documents[0].questionPageLayoutMode).toBe("double_column");
    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/suggest-answer-matches")
      ).toHaveLength(1);
    });
    const answerMatchCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === "/api/ai/suggest-answer-matches"
    );
    expect(JSON.parse(String(answerMatchCall?.[1]?.body)).questions).toEqual([
      {
        id: "page-1-draft-1",
        globalOrder: 1,
        questionNumberLabel: "1"
      }
    ]);
    const requestOrder = fetchSpy.mock.calls.map(([input]) => String(input));
    expect(requestOrder.indexOf("/api/ai/classify-document-questions")).toBeLessThan(
      requestOrder.indexOf("/api/ai/suggest-answer-matches")
    );
  });

  it("applies double-column lane normalization before OCR classification", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "page-1",
            source: { provider: "openai_compatible" },
            textLines: [
              {
                text: "1. 左栏题目",
                role: "question_anchor",
                normalizedBBox: { x1: 60, y1: 500, x2: 450, y2: 530 }
              },
              {
                text: "2. 右栏题目",
                role: "question_anchor",
                normalizedBBox: { x1: 540, y1: 80, x2: 940, y2: 110 }
              }
            ],
            detections: [
              {
                id: "right",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 620, y1: 100, x2: 850, y2: 300 }
              },
              {
                id: "left",
                localOrder: 2,
                confidence: 0.93,
                normalizedBBox: { x1: 100, y1: 600, x2: 350, y2: 800 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          pages: Array<{ questionIds: string[] }>;
        };
        const questionIds = body.pages.flatMap((page) => page.questionIds);

        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            results: questionIds.map((questionId) => ({
              questionId,
              questionNumberLabel: questionId.endsWith("left") ? "1" : "2",
              classificationStatus: "needs_choice",
              directoryMatchConfidence: 0.35,
              directoryPath: null,
              directoryCandidatePaths: [],
              ocrText: questionId
            }))
          })
        } as Response;
      }

      if (url === "/api/workflow-events") {
        return {
          ok: true,
          json: async () => ({ ok: true })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: useFileStore.getState().documents.map((document) => ({
        ...document,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      }))
    });

    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "双栏" }));
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(useWorkbenchStore.getState().documentTasks).toEqual([
      expect.objectContaining({
        documentId: "doc-1",
        documentName: "高数试卷.pdf",
        status: "done",
        workflowInput: expect.objectContaining({
          hasAnswerSection: false,
          questionPageLayoutMode: "double_column",
          questionPageIds: ["page-1"],
          answerPageIds: []
        })
      })
    ]);

    const questions = useQuestionStore.getState().questionDrafts;
    expect(questions.map((question) => question.id)).toEqual([
      "page-1-left",
      "page-1-right"
    ]);
    expect(questions.map((question) => question.globalOrder)).toEqual([1, 2]);
    expect(questions[0].bboxByPage["page-1"].x).toBeLessThanOrEqual(72);
    expect(
      questions[0].bboxByPage["page-1"].x +
      questions[0].bboxByPage["page-1"].width
    ).toBeGreaterThanOrEqual(540);
  });

  it("stops the automatic workflow instead of accepting local fallback question boxes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (String(input) === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "page-1",
            source: {
              provider: "local_fallback",
              reason: "api_provider_not_selected"
            },
            detections: [
              {
                id: "page-1-draft-1",
                localOrder: 1,
                confidence: 0.92,
                normalizedBBox: {
                  x1: 90,
                  y1: 110,
                  x2: 910,
                  y2: 320
                }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`The workflow must stop before ${String(input)}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: []
    });

    render(<HomePage />);

    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    expect(useQuestionStore.getState().questionDrafts).toEqual([]);
    expect(useFileStore.getState().pages.find((page) => page.id === "page-1")).toMatchObject({
      analysisStatus: "failed",
      reviewStatus: "unreviewed"
    });
    expect(
      fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/ai/"))
    ).toEqual([
      "/api/ai/detect-question-boxes"
    ]);
    expect(useWorkbenchStore.getState().documentProcessingProgress.message).toContain(
      "AI 服务未连接"
    );
    const stageList = screen.getByLabelText("document-processing-stage-list");
    expect(within(stageList).getAllByRole("listitem")).toHaveLength(5);
    expect(
      within(stageList).getByLabelText("处理阶段-自动框题-失败")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("inline-document-processing-retry")).toBeEnabled();
    expect(screen.getByLabelText("inline-document-processing-error")).toHaveTextContent(
      "未写入占位结果"
    );
  });

  it("stops the automatic workflow instead of applying local fallback OCR results", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            source: { provider: "openai_compatible" },
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            source: {
              provider: "local_fallback",
              reason: "api_provider_not_selected"
            },
            results: [
              {
                questionId: "page-1-draft-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "示例 OCR"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`The workflow must stop before ${url}`);
    });
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: useFileStore.getState().documents.map((document) => ({
        ...document,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      }))
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "page-1-draft-1",
      classificationStatus: "unclassified",
      ocrText: null
    });
    expect(
      fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/ai/"))
    ).toEqual([
      "/api/ai/detect-question-boxes",
      "/api/ai/classify-document-questions"
    ]);
    expect(useWorkbenchStore.getState().documentProcessingProgress.message).toContain(
      "AI 服务未连接"
    );
  });

  it("retries from OCR without rerunning completed question-box detection", async () => {
    let classificationAttempt = 0;
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            source: { provider: "openai_compatible" },
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        classificationAttempt += 1;

        if (classificationAttempt === 1) {
          return {
            ok: true,
            json: async () => ({
              source: {
                provider: "local_fallback",
                reason: "api_request_failed",
                diagnosticId: "aierr-ocr-resume-test"
              },
              results: []
            })
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            results: [
              {
                questionId: "page-1-draft-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "1. 重试成功"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/workflow-events") {
        return {
          ok: true,
          json: async () => ({ ok: true })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: useFileStore.getState().documents.map((document) => ({
        ...document,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      }))
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    fireEvent.click(screen.getByLabelText("inline-document-processing-retry"));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/detect-question-boxes")
    ).toHaveLength(1);
    expect(
      fetchSpy.mock.calls.filter(
        ([input]) => String(input) === "/api/ai/classify-document-questions"
      )
    ).toHaveLength(2);
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "page-1-draft-1",
      ocrText: "1. 重试成功"
    });
  });

  it("keeps successful page checkpoints and retries only failed question-box pages", async () => {
    const pageAttempts = new Map<string, number>();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        const attempt = (pageAttempts.get(body.pageId) ?? 0) + 1;
        pageAttempts.set(body.pageId, attempt);

        if (body.pageId === "page-2" && attempt === 1) {
          return { ok: false } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            source: { provider: "openai_compatible" },
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            mergeCandidates: []
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        const body = JSON.parse(String(init?.body)) as {
          pages: Array<{ questionIds: string[] }>;
        };
        const questionIds = body.pages.flatMap((page) => page.questionIds);

        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            results: questionIds.map((questionId) => ({
              questionId,
              classificationStatus: "needs_choice",
              directoryMatchConfidence: 0.35,
              directoryPath: null,
              directoryCandidatePaths: [],
              ocrText: questionId
            }))
          })
        } as Response;
      }

      if (url === "/api/workflow-events") {
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: [
        {
          id: "doc-1",
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高等数学",
          answerSection: {
            status: "suggested",
            hasAnswerSection: false,
            suggestedSplitPage: null,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        ...useFileStore.getState().pages,
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        }
      ]
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      }
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
      "page-1-draft-1"
    ]);
    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      completedPageIds: ["page-1"],
      failedPageIds: ["page-2"],
      checkpoint: { nextStage: "question_boxes" }
    });

    fireEvent.click(screen.getByLabelText("inline-document-processing-retry"));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(pageAttempts).toEqual(
      new Map([
        ["page-1", 1],
        ["page-2", 2]
      ])
    );
    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/detect-cross-page")
    ).toHaveLength(1);
  });

  it("aborts an in-flight question-box request when the document task is paused", async () => {
    let requestSignal: AbortSignal | null = null;
    vi.spyOn(global, "fetch").mockImplementation((async (input, init) => {
      if (String(input) !== "/api/ai/detect-question-boxes") {
        throw new Error(`Unexpected fetch call: ${String(input)}`);
      }

      requestSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason ?? new Error("aborted")),
          { once: true }
        );
      });
    }) as typeof fetch);
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: useFileStore.getState().documents.map((document) => ({
        ...document,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      }))
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => expect(requestSignal).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "暂停任务" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentTasks[0].status).toBe("paused");
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(useQuestionStore.getState().questionDrafts).toEqual([]);
  });

  it("stops on partial OCR results and retries only the missing questions", async () => {
    const classificationAttempts = new Map<string, number>();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "page-1",
            source: { provider: "openai_compatible" },
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              },
              {
                id: "draft-2",
                localOrder: 2,
                confidence: 0.93,
                normalizedBBox: { x1: 100, y1: 360, x2: 900, y2: 620 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        const body = JSON.parse(String(init?.body)) as {
          pages: Array<{ questionIds: string[] }>;
        };
        const questionId = body.pages.flatMap((page) => page.questionIds)[0];
        const attempt = (classificationAttempts.get(questionId) ?? 0) + 1;
        classificationAttempts.set(questionId, attempt);

        if (questionId === "page-1-draft-2" && attempt === 1) {
          return {
            ok: true,
            json: async () => ({
              source: { provider: "openai_compatible" },
              results: []
            })
          } as Response;
        }

        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            results: [
              {
                questionId,
                questionNumberLabel: questionId.endsWith("draft-1") ? "1" : "2",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: questionId.endsWith("draft-1") ? "1. 第一题" : "2. 第二题"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/workflow-events") {
        return {
          ok: true,
          json: async () => ({ ok: true })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: useFileStore.getState().documents.map((document) => ({
        ...document,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      }))
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    expect(useWorkbenchStore.getState().documentProcessingProgress).toMatchObject({
      stage: "ocr",
      status: "failed"
    });
    expect(useQuestionStore.getState().questionDrafts).toEqual([
      expect.objectContaining({
        id: "page-1-draft-1",
        ocrText: "1. 第一题"
      }),
      expect.objectContaining({
        id: "page-1-draft-2",
        classificationStatus: "unclassified",
        ocrText: null
      })
    ]);

    fireEvent.click(screen.getByLabelText("inline-document-processing-retry"));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/detect-question-boxes")
    ).toHaveLength(1);
    const classificationQuestionIds = fetchSpy.mock.calls
      .filter(([input]) => String(input) === "/api/ai/classify-document-questions")
      .map(([, init]) =>
        (JSON.parse(String(init?.body)) as { pages: Array<{ questionIds: string[] }> }).pages
          .flatMap((page) => page.questionIds)[0]
      );
    expect(classificationQuestionIds).toEqual([
      "page-1-draft-1",
      "page-1-draft-2",
      "page-1-draft-2"
    ]);
    expect(useQuestionStore.getState().questionDrafts).toEqual([
      expect.objectContaining({ id: "page-1-draft-1", ocrText: "1. 第一题" }),
      expect.objectContaining({ id: "page-1-draft-2", ocrText: "2. 第二题" })
    ]);
  }, 10000);

  it("resumes missing OCR from a legacy completed workflow without rerunning geometry", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/local-library/asset?id=asset-display-page-1") {
        return {
          ok: true,
          blob: async () => new Blob(["persisted-page"], { type: "image/png" })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            results: [
              {
                questionId: "q-missing",
                questionNumberLabel: "2",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "2. 补齐的题目"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/workflow-events") {
        return {
          ok: true,
          json: async () => ({ ok: true })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: useFileStore.getState().documents.map((document) => ({
        ...document,
        answerSection: {
          status: "confirmed",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      })),
      pages: useFileStore.getState().pages.map((page) => ({
        ...page,
        displayAssetId: "asset-display-page-1",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }))
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-display-page-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 14,
          dataUrl: null
        }
      ],
      questionDrafts: [
        {
          id: "q-complete",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 100, y: 100, width: 800, height: 260 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.94,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.92,
          directoryPath: ["我的题库", "高中物理", "曲线运动", "平抛运动基础"],
          directoryCandidatePaths: [],
          questionNumberLabel: "1",
          ocrText: "1. 已完成题目"
        },
        {
          id: "q-missing",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 100, y: 420, width: 800, height: 260 }
          },
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.93,
          crossPageGroupId: null,
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionNumberLabel: null,
          ocrText: null
        }
      ]
    });
    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "done",
      stage: "done",
      current: 1,
      total: 1,
      message: "整卷处理完成",
      summary: {
        questionCount: 2,
        crossPageMergeCount: 0,
        classifiedQuestionCount: 1,
        autoMatchedAnswerCount: 0,
        pendingAnswerCount: 0,
        specializedDocumentCount: 0
      }
    });

    render(<HomePage />);
    fireEvent.click(screen.getByRole("button", { name: "自动处理" }));
    fireEvent.click(screen.getByRole("button", { name: "继续处理剩余 1 道题" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
      expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-missing"))
        .toMatchObject({ ocrText: "2. 补齐的题目" });
    });

    expect(
      fetchSpy.mock.calls.filter(
        ([input]) => String(input) === "/api/ai/classify-document-questions"
      )
    ).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/local-library/asset?id=asset-display-page-1"
    );
    expect(prepareAiPreviewDataUrl).toHaveBeenCalledWith(
      "data:image/png;base64,cGVyc2lzdGVkLXBhZ2U="
    );
    expect(useQuestionStore.getState().pagePreviewDataUrls["page-1"]).toBe(
      "data:image/png;base64,cGVyc2lzdGVkLXBhZ2U="
    );
    expect(
      fetchSpy.mock.calls.some(([input]) => String(input) === "/api/ai/detect-question-boxes")
    ).toBe(false);
  }, 10000);

  it("stops the automatic workflow instead of applying local fallback answer matches", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            source: { provider: "openai_compatible" },
            results: [
              {
                questionId: "page-1-draft-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "1. 真实 OCR"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/suggest-answer-matches") {
        return {
          ok: true,
          json: async () => ({
            source: {
              provider: "local_fallback",
              reason: "api_provider_not_selected"
            },
            detectedAnswers: [
              {
                id: "fallback-answer",
                pageId: "page-2",
                pageNumber: 2,
                answerLabel: "99",
                confidence: 0.76,
                normalizedBBox: { x1: 120, y1: 160, x2: 920, y2: 420 }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: []
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/ai/suggest-answer-matches",
      expect.any(Object)
    );
    expect(useQuestionStore.getState().questionDrafts[0].answerAttachments ?? []).toEqual([]);
    expect(useWorkbenchStore.getState().documentProcessingProgress.message).toContain(
      "AI 服务未连接"
    );
  });

  it("reports concurrent answer-page preparation by completed page count", async () => {
    const slowAnswerPage = createDeferred<string>();
    const fastAnswerPage = createDeferred<string>();
    const answerRequestBodies: Array<{
      answerPages: Array<{ pageId: string; pageNumber: number; imageDataUrl: string }>;
    }> = [];
    const progressSpy = vi.spyOn(
      useWorkbenchStore.getState(),
      "setDocumentProcessingProgress"
    );
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,YW5zd2Vy")
    };
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", MockImage);

    vi.mocked(prepareAiPreviewDataUrl).mockImplementation((dataUrl: string) => {
      if (dataUrl.endsWith("page-2")) {
        return slowAnswerPage.promise;
      }

      if (dataUrl.endsWith("page-3")) {
        return fastAnswerPage.promise;
      }

      return Promise.resolve(`compressed:${dataUrl}`);
    });
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.94,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                questionId: "page-1-draft-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "1. 测试题目"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/suggest-answer-matches") {
        const body = JSON.parse(String(init?.body)) as {
          answerPages: Array<{ pageId: string; pageNumber: number; imageDataUrl: string }>;
        };
        answerRequestBodies.push(body);

        return {
          ok: true,
          json: async () => ({
            detectedAnswers:
              body.answerPages.length === 1 && body.answerPages[0].pageId === "page-2"
                ? [
                    {
                      id: "answer-1",
                      pageId: "page-2",
                      pageNumber: 2,
                      answerLabel: "1",
                      confidence: 0.96,
                      normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
                    }
                  ]
                : []
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          subjectScope: "数学",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2",
        "page-3": "data:image/png;base64,page-3"
      },
      questionDrafts: []
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(prepareAiPreviewDataUrl).toHaveBeenCalledWith(
        "data:image/png;base64,page-3"
      );
    });

    fastAnswerPage.resolve("compressed:page-3");
    await waitFor(() => {
      expect(prepareAiPreviewDataUrl).toHaveBeenCalledWith(
        "data:image/png;base64,page-3"
      );
      expect(
        progressSpy.mock.calls.some(
          ([progress]) => progress.stage === "answer_matching" && progress.current > 0
        )
      ).toBe(false);
    });
    slowAnswerPage.resolve("compressed:page-2");

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(
      progressSpy.mock.calls
        .map(([progress]) => progress)
        .filter(
          (progress) =>
            progress.status === "running" &&
            progress.stage === "answer_matching" &&
            progress.current > 0
        )
      .map((progress) => progress.current)
    ).toEqual([1, 2]);
    expect(answerRequestBodies).toHaveLength(2);
    expect(answerRequestBodies.every((body) => body.answerPages.length === 1)).toBe(true);
  });

  it("automatically attaches a uniquely numbered answer after question OCR", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,YXV0by1hbnN3ZXI=")
    };
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", MockImage);
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            detections: [
              {
                id: "draft-12",
                localOrder: 1,
                confidence: 0.95,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                questionId: "page-1-draft-12",
                questionNumberLabel: "12",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "12. 唯一题号测试题"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/suggest-answer-matches") {
        return {
          ok: true,
          json: async () => ({
            detectedAnswers: [
              {
                id: "answer-12",
                pageId: "page-2",
                pageNumber: 2,
                answerLabel: "12",
                ocrText: "12. C",
                confidence: 0.96,
                normalizedBBox: { x1: 100, y1: 200, x2: 800, y2: 360 }
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "数学",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      binaryAssets: [],
      questionDrafts: []
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    const question = useQuestionStore.getState().questionDrafts[0];
    expect(question).toMatchObject({
      id: "page-1-draft-12",
      questionNumberLabel: "12",
      answerAttachments: [
        {
          id: "answer-answer-12",
          assetId: "matched-answer-answer-12",
          kind: "matched"
        }
      ]
    });
    expect(useQuestionStore.getState().binaryAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "matched-answer-answer-12",
        pageId: "page-2",
        dataUrl: "data:image/png;base64,YXV0by1hbnN3ZXI="
      }),
      expect.objectContaining({
        id: "asset-display-page-1",
        pageId: "page-1",
        dataUrl: "data:image/png;base64,page-1"
      }),
      expect.objectContaining({
        id: "asset-display-page-2",
        pageId: "page-2",
        dataUrl: "data:image/png;base64,page-2"
      })
    ]));
    expect(useFileStore.getState().documents[0]).toMatchObject({
      pendingAnswerMatch: false,
      pendingAnswerMatchCount: 0,
      pendingAnswerMatches: []
    });
    expect(useWorkbenchStore.getState().documentProcessingProgress.summary).toMatchObject({
      autoMatchedAnswerCount: 1,
      pendingAnswerCount: 0
    });
  });

  it("uses complete answer-page text layout and keeps cross-page answer fragments", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue("data:image/png;base64,bmF0aXZlLWFuc3dlcg==")
    };
    const originalCreateElement = document.createElement.bind(document);

    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      set src(_value: string) {
        this.onload?.();
      }
    }

    vi.stubGlobal("Image", MockImage);
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        return {
          ok: true,
          json: async () => ({
            pageId: "page-1",
            detections: [
              {
                id: "draft-1",
                localOrder: 1,
                confidence: 0.98,
                normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                questionId: "page-1-draft-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "1. native answer layout question"
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/suggest-answer-matches") {
        throw new Error(`AI answer matching must not run for complete native text: ${String(init?.body)}`);
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "native-answer.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "1. answer starts",
              normalizedBBox: { x1: 150, y1: 100, x2: 850, y2: 120 }
            }
          ]
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "answer continues",
              normalizedBBox: { x1: 150, y1: 80, x2: 850, y2: 300 }
            }
          ]
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2",
        "page-3": "data:image/png;base64,page-3"
      },
      binaryAssets: [],
      questionDrafts: []
    });

    render(<HomePage />);
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "Confirm answer split" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(
      useQuestionStore.getState().questionDrafts[0].answerAttachments
    ).toHaveLength(2);
    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/suggest-answer-matches")
    ).toHaveLength(0);
    expect(useWorkbenchStore.getState().documentProcessingProgress.summary).toMatchObject({
      autoMatchedAnswerCount: 2,
      pendingAnswerCount: 0
    });
  });

  it("compresses reviewed page previews before current-document OCR and classification", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        documentId: "doc-1",
        results: []
      })
    } as Response);
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高等数学"
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
      ...useQuestionStore.getState(),
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
          status: "geometry_reviewed",
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
      ]
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    expect(fetchSpy.mock.calls[0][0]).toBe("/api/ai/classify-document-questions");

    const requestInit = fetchSpy.mock.calls[0][1];
    const requestBody = JSON.parse(String(requestInit?.body));

    expect(requestBody.pages).toEqual([
      {
        id: "page-1",
        reviewStatus: "reviewed",
        imageDataUrl: "compressed:data:image/png;base64,page-1",
        questionIds: ["q-1"]
      }
    ]);
  });

  it("detects all question pages and waits for cross-page confirmation before continuing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/ai/detect-question-boxes") {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };
        const isFirstPage = requestBody.pageId === "page-1";

        return {
          ok: true,
          json: async () => ({
            pageId: requestBody.pageId,
            detections: [
              {
                id: isFirstPage ? "draft-a" : "draft-b",
                localOrder: 1,
                confidence: isFirstPage ? 0.94 : 0.91,
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
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: [
              {
                id: "merge-1",
                documentId: "doc-1",
                leftPageId: "page-1",
                rightPageId: "page-2",
                sourceQuestionIds: ["page-1-draft-a", "page-2-draft-b"],
                confidence: 0.9,
                status: "suggested"
              }
            ]
          })
        } as Response;
      }

      if (String(input) === "/api/ai/classify-document-questions") {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            results: [
              {
                questionId: "merge-1",
                questionNumberLabel: "1",
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.35,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: "1. 跨页题目"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: []
    });

    render(
      <>
        <CrossPageReviewHost />
        <HomePage />
      </>
    );

    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    expect(screen.getByLabelText("current-document-auto-detect-progress")).toBeInTheDocument();

    const reviewDialog = await screen.findByRole("dialog", { name: "跨页候选复核" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "合并为一道跨页题" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });

    expect(useFileStore.getState().documents[0].answerSection).toEqual({
      status: "confirmed",
      hasAnswerSection: false,
      suggestedSplitPage: 2,
      confirmedSplitPage: null
    });
    expect(useFileStore.getState().documents[0].pendingAnswerMatch).toBe(false);
    expect(useFileStore.getState().pages).toEqual([
      expect.objectContaining({
        id: "page-1",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }),
      expect.objectContaining({
        id: "page-2",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      })
    ]);
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "merge-1",
      primaryPageId: "page-1",
      pageIds: ["page-1", "page-2"],
      source: "merged"
    });
    expect(useQuestionStore.getState().questionDrafts[0].bboxByPage).toEqual({
      "page-1": {
        x: 110,
        y: 1288,
        width: 980,
        height: 304
      },
      "page-2": {
        x: 110,
        y: 40,
        width: 980,
        height: 400
      }
    });
    expect(
      fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.startsWith("/api/ai/"))
    ).toEqual([
      "/api/ai/detect-question-boxes",
      "/api/ai/detect-question-boxes",
      "/api/ai/detect-cross-page",
      "/api/ai/classify-document-questions"
    ]);
  });

  it("runs whole-document question box detection with concurrent per-page requests", async () => {
    const firstPageResponse = createDeferred<Response>();
    const secondPageResponse = createDeferred<Response>();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((async (input, init) => {
      if (String(input) === "/api/ai/detect-question-boxes") {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };

        return requestBody.pageId === "page-1"
          ? firstPageResponse.promise
          : secondPageResponse.promise;
      }

      if (String(input) === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: []
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    }) as typeof fetch);

    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: null,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: []
    });

    render(<HomePage />);

    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/detect-question-boxes")
      ).toHaveLength(2);
    });
    expect(screen.getByLabelText("current-document-auto-detect-progress")).toHaveAttribute(
      "aria-valuenow",
      "0"
    );

    firstPageResponse.resolve({
      ok: true,
      json: async () => ({
        pageId: "page-1",
        detections: [
          {
            id: "draft-a",
            localOrder: 1,
            confidence: 0.94,
            normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 300 }
          }
        ]
      })
    } as Response);
    secondPageResponse.resolve({
      ok: true,
      json: async () => ({
        pageId: "page-2",
        detections: [
          {
            id: "draft-b",
            localOrder: 1,
            confidence: 0.92,
            normalizedBBox: { x1: 120, y1: 120, x2: 880, y2: 320 }
          }
        ]
      })
    } as Response);

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
        "page-1-draft-a",
        "page-2-draft-b"
      ]);
    });
  });

  it("offers a synthesized next-page header continuation and merges it after confirmation", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (String(input) === "/api/ai/detect-question-boxes") {
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as { pageId: string };
        const isFirstPage = requestBody.pageId === "page-1";

        return {
          ok: true,
          json: async () => ({
            pageId: requestBody.pageId,
            detections: [
              {
                id: isFirstPage ? "draft-a" : "draft-b",
                localOrder: 1,
                confidence: isFirstPage ? 0.94 : 0.91,
                normalizedBBox: isFirstPage
                  ? {
                      x1: 100,
                      y1: 820,
                      x2: 900,
                      y2: 980
                    }
                  : {
                      x1: 120,
                      y1: 300,
                      x2: 880,
                      y2: 520
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

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
      },
      questionDrafts: []
    });

    render(
      <>
        <CrossPageReviewHost />
        <HomePage />
      </>
    );

    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    const reviewDialog = await screen.findByRole("dialog", { name: "跨页候选复核" });
    fireEvent.click(within(reviewDialog).getByRole("button", { name: "合并为一道跨页题" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts.some((question) => question.source === "merged")).toBe(true);
    });

    const mergedQuestion = useQuestionStore
      .getState()
      .questionDrafts.find((question) => question.source === "merged");

    expect(mergedQuestion).toMatchObject({
      id: "page-1-page-2-edge-continuation-page-1-draft-a",
      primaryPageId: "page-1",
      pageIds: ["page-1", "page-2"],
      source: "merged"
    });
    expect(mergedQuestion?.bboxByPage).toMatchObject({
      "page-1": {
        x: 110,
        y: 1288,
        width: 980,
        height: 304
      },
      "page-2": {
        x: 110,
        y: 56,
        width: 980,
        height: 304
      }
    });
    expect(
      useQuestionStore
        .getState()
        .questionDrafts.some((question) => question.id === "page-2-continuation-from-page-1-draft-a")
    ).toBe(false);
  });

  it("opens the first pending answer in the dedicated answer review view", async () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.96,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: null,
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.74,
              normalizedBBox: {
                x1: 100,
                y1: 300,
                x2: 800,
                y2: 460
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-3": "data:image/png;base64,page-3"
      }
    });

    render(<HomePage />);
    openAnswerReview();

    expect(screen.getByLabelText("answer-review-view")).toBeInTheDocument();
    expect(screen.getByLabelText("pending-answer-label-input-match-1")).toHaveValue("12");
    expect(screen.getByLabelText("pending-answer-question-select-match-1")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "pending-answer-page-3" })).toBeInTheDocument();
    expect(
      screen.queryByText(
        "This document is temporarily blocked from specialized sync until answer matching is resolved."
      )
    ).not.toBeInTheDocument();
  });

  it("shows whole answer pages with pending answer overlays for visual review", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.96,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: null,
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.74,
              normalizedBBox: {
                x1: 100,
                y1: 300,
                x2: 800,
                y2: 460
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-3": "data:image/png;base64,page-3"
      }
    });

    render(<HomePage />);
    openAnswerReview();

    expect(screen.getAllByRole("img", { name: "pending-answer-page-3" })).toHaveLength(1);
    expect(screen.getByLabelText("pending-answer-box-match-1")).toBeInTheDocument();
    expect(screen.queryByLabelText("pending-answer-box-match-2")).not.toBeInTheDocument();
  });

  it("lets the user select one pending answer from the page overlay", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.96,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: null,
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.74,
              normalizedBBox: {
                x1: 100,
                y1: 300,
                x2: 800,
                y2: 460
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-3": "data:image/png;base64,page-3"
      }
    });

    render(<HomePage />);
    openAnswerReview();

    fireEvent.click(screen.getByRole("button", { name: "下一个待复核答案" }));

    expect(screen.getByRole("button", { name: "pending-answer-box-match-2" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("pending-answer-label-input-match-2")).toHaveValue("15");
  });

  it("lets the user drag one pending answer overlay and updates its bbox", () => {
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
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.96,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-3": "data:image/png;base64,page-3"
      }
    });

    render(<HomePage />);
    openAnswerReview();

    fireEvent.pointerDown(screen.getByRole("button", { name: "pending-answer-box-match-1" }), {
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

    expect(useFileStore.getState().documents[0].pendingAnswerMatches?.[0]).toMatchObject({
      normalizedBBox: {
        x1: 150,
        y1: 170,
        x2: 850,
        y2: 310
      }
    });
  });

  it("lets the user resize one pending answer overlay and updates its bbox", () => {
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
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.96,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-3": "data:image/png;base64,page-3"
      }
    });

    render(<HomePage />);
    openAnswerReview();

    fireEvent.pointerDown(screen.getByRole("button", { name: "pending-answer-resize-match-1" }), {
      clientX: 960,
      clientY: 416,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 1020,
      clientY: 496,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 1020,
      clientY: 496,
      pointerId: 1
    });

    expect(useFileStore.getState().documents[0].pendingAnswerMatches?.[0]).toMatchObject({
      normalizedBBox: {
        x1: 100,
        y1: 120,
        x2: 850,
        y2: 310
      }
    });
  });

  it("lets the user resolve one pending answer-match entry from the home page", async () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,Y3JvcHBlZA==");
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage
      }),
      toDataURL
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      set src(_value: string) {
        this.onload?.();
      }
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.96,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-3": "data:image/png;base64,cGFnZS0z"
      },
      questionDrafts: [
        {
          id: "q-12",
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
          directoryMatchConfidence: 0.93,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question 12",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);
    openAnswerReview();

    fireEvent.click(screen.getByRole("button", { name: "确认当前答案匹配" }));

    await waitFor(() => {
      expect(useFileStore.getState().documents[0]).toMatchObject({
        pendingAnswerMatch: false,
        pendingAnswerMatchCount: 0,
        pendingAnswerMatches: []
      });
    });

    expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toEqual([
      expect.objectContaining({
        kind: "matched"
      })
    ]);
    expect(useQuestionStore.getState().binaryAssets[0]).toMatchObject({
      documentId: "doc-1",
      pageId: "page-3",
      kind: "display",
      dataUrl: "data:image/png;base64,Y3JvcHBlZA=="
    });
    expect(screen.getByText("答案已自动匹配，没有待复核项。")).toBeInTheDocument();

    global.Image = originalImage;
  });

  it("lets the user assign a pending answer match to a chosen question before resolving it", async () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,Y3JvcHBlZC0y");
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage
      }),
      toDataURL
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      set src(_value: string) {
        this.onload?.();
      }
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "18",
              suggestedQuestionId: null,
              status: "pending",
              pageId: "page-3",
              pageNumber: 3,
              confidence: 0.88,
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
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
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-3": "data:image/png;base64,cGFnZS0z"
      },
      questionDrafts: [
        {
          id: "q-12",
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
          directoryMatchConfidence: 0.93,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question 12",
          lastBulkConfirmationId: null
        },
        {
          id: "q-18",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 120, y: 160, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.92,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
          ocrText: "question 18",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);
    openAnswerReview();

    fireEvent.change(screen.getByLabelText("pending-answer-question-select-match-1"), {
      target: { value: "q-18" }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认当前答案匹配" }));

    await waitFor(() => {
      expect(useFileStore.getState().documents[0]).toMatchObject({
        pendingAnswerMatch: false,
        pendingAnswerMatchCount: 0,
        pendingAnswerMatches: []
      });
    });

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-18")?.answerAttachments).toEqual([
      expect.objectContaining({
        kind: "matched"
      })
    ]);
    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-12")?.answerAttachments).toBeUndefined();

    global.Image = originalImage;
  });

  it("lets the user edit one pending answer label with numeric-only values", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: null,
              status: "pending"
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          }
        }
      ],
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

    render(<HomePage />);
    openAnswerReview();

    fireEvent.change(screen.getByLabelText("pending-answer-label-input-match-1"), {
      target: { value: "A18B" }
    });

    expect(useFileStore.getState().documents[0].pendingAnswerMatches?.[0]).toMatchObject({
      answerLabel: "18"
    });
    expect(screen.getByLabelText("pending-answer-label-input-match-1")).toHaveValue("18");
    expect(screen.getByRole("button", { name: "确认当前答案匹配" })).toBeDisabled();
  });

  it("updates the suggested question after editing one pending answer label to an exact question number", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: null,
              status: "pending"
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: 2
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
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
      ...useQuestionStore.getState(),
      questionDrafts: [
        {
          id: "q-12",
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
          directoryMatchConfidence: 0.93,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question 12",
          lastBulkConfirmationId: null
        },
        {
          id: "q-18",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 120, y: 160, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.92,
          directoryPath: ["subject-a", "folder-a", "folder-b"],
          directoryCandidatePaths: [],
          questionNumberLabel: "18",
          ocrText: "question 18",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);
    openAnswerReview();

    fireEvent.change(screen.getByLabelText("pending-answer-label-input-match-1"), {
      target: { value: "A18B" }
    });

    expect(useFileStore.getState().documents[0].pendingAnswerMatches?.[0]).toMatchObject({
      answerLabel: "18",
      suggestedQuestionId: "q-18"
    });
    expect(screen.getByLabelText("pending-answer-question-select-match-1")).toHaveValue("q-18");
  });
});
