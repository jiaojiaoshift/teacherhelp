import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

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

describe("home-page classification workflow", () => {
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
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
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
      pagePreviewUrls: {
        "page-1": "blob:page-1",
        "page-2": "blob:page-2"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2"
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
          status: "geometry_reviewed",
          source: "ai",
          confidence: 0.93,
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
            "page-2": { x: 110, y: 140, width: 760, height: 280 }
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
      crossPageCandidates: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      setBinaryAssets: useQuestionStore.getState().setBinaryAssets,
      appendBinaryAssets: useQuestionStore.getState().appendBinaryAssets,
      purgeSourceAssetsForDocument: useQuestionStore.getState().purgeSourceAssetsForDocument,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
    useWorkbenchStore.getState().resetTransientProgress();
    vi.restoreAllMocks();
  });

  it("warns about unreviewed pages and only classifies reviewed-page questions", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            source: {
              provider: "local_fallback",
              reason: "ark_runtime_config_missing"
            },
            results: [
              {
                questionId: "q-1",
                classificationStatus: "matched",
                directoryMatchConfidence: 0.91,
                directoryPath: ["高中数学", "函数", "函数图像"],
                directoryCandidatePaths: [
                  ["高中数学", "函数", "函数图像"],
                  ["高中数学", "函数", "函数性质"],
                  ["高中数学", "解析几何", "直线与圆"]
                ],
                chapterTag: "函数",
                knowledgeTags: ["函数图像", "数形结合"],
                ocrText: "已识别题干"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    const [, request] = fetchSpy.mock.calls[0];
    expect(confirmSpy).toHaveBeenCalledWith("当前文件没有全部框选完成，是否继续？");
    expect(JSON.parse(String(request?.body))).toEqual({
      documentId: "doc-1",
      subjectScope: "高中数学",
      directoryPaths: [],
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          questionIds: ["q-1"],
          imageDataUrl: "data:image/png;base64,page-1"
        }
      ]
    });
    expect(screen.getByText("将仅处理已完成几何复核的页面")).toBeInTheDocument();
    expect(screen.getAllByText(/本地示例 OCR\/分类/).length).toBeGreaterThan(0);
    expect(screen.getByText("当前文件分类复核")).toBeInTheDocument();
    expect(screen.getByText("已自动归类")).toBeInTheDocument();
    expect(screen.getAllByText("我的题库 / 高中数学 / 函数 / 函数图像")).toHaveLength(2);
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-1");
    expect(screen.getAllByText("1/1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "确认当前题目" })).toBeEnabled();
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      chapterTag: "函数",
      knowledgeTags: ["函数图像", "数形结合"]
    });
  }, 15000);

  it("shows separate OCR and classification progress while the current document run is pending", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const classificationResponse = createDeferred<Response>();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return classificationResponse.promise;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /OCR/ }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText("current-document-ocr-progress")).toHaveAttribute(
      "aria-valuenow",
      "2"
    );
    expect(screen.getByLabelText("current-document-classification-progress")).toHaveAttribute(
      "aria-valuenow",
      "0"
    );
    expect(
      screen.getByText(
        "No matchable directories are configured; results will need manual directory review."
      )
    ).toBeInTheDocument();

    classificationResponse.resolve({
      ok: true,
      json: async () => ({
        documentId: "doc-1",
        results: [
          {
            questionId: "q-1",
            classificationStatus: "needs_choice",
            directoryMatchConfidence: 0.35,
            directoryPath: null,
            directoryCandidatePaths: [],
            ocrText: "recognized text"
          }
        ]
      })
    } as Response);

    await waitFor(() => {
      expect(screen.getByLabelText("current-document-classification-progress")).toHaveAttribute(
        "aria-valuenow",
        "1"
      );
    });
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      status: "needs_choice",
      classificationStatus: "needs_choice",
      ocrText: "recognized text"
    });
  });

  it("keeps the current classification progress visible after the workbench remounts", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const classificationResponse = createDeferred<Response>();
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return classificationResponse.promise;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    const view = render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /OCR/ }));

    await waitFor(() => {
      expect(screen.getByLabelText("current-document-ocr-progress")).toHaveAttribute(
        "aria-valuenow",
        "2"
      );
      expect(screen.getByLabelText("current-document-classification-progress")).toHaveAttribute(
        "aria-valuenow",
        "0"
      );
    });

    view.unmount();
    render(<HomePage />);

    expect(screen.getByLabelText("current-document-ocr-progress")).toHaveAttribute(
      "aria-valuenow",
      "2"
    );
    expect(screen.getByLabelText("current-document-classification-progress")).toHaveAttribute(
      "aria-valuenow",
      "0"
    );

    classificationResponse.resolve({
      ok: true,
      json: async () => ({
        documentId: "doc-1",
        results: []
      })
    } as Response);

    await waitFor(() => {
      expect(screen.getByLabelText("current-document-classification-progress")).toHaveAttribute(
        "aria-valuenow",
        "1"
      );
    });
  }, 10000);

  it("runs current-document classification as concurrent per-question requests", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const firstResponse = createDeferred<Response>();
    const secondResponse = createDeferred<Response>();
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((async (input) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return fetchSpy.mock.calls.filter(([calledInput]) =>
          String(calledInput).includes("classify-document-questions")
        ).length === 1
          ? firstResponse.promise
          : secondResponse.promise;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    }) as typeof fetch);

    useFileStore.setState({
      ...useFileStore.getState(),
      pages: useFileStore.getState().pages.map((page) => ({
        ...page,
        reviewStatus: "reviewed"
      }))
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: useQuestionStore.getState().questionDrafts.map((question) => ({
        ...question,
        status: "geometry_reviewed",
        classificationStatus: "unclassified"
      }))
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(
        fetchSpy.mock.calls.filter(([input]) =>
          String(input).includes("classify-document-questions")
        )
      ).toHaveLength(2);
    });

    const requestBodies = fetchSpy.mock.calls
      .filter(([input]) => String(input).includes("classify-document-questions"))
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(requestBodies.map((body) => body.pages.flatMap((page: { questionIds: string[] }) => page.questionIds))).toEqual([
      ["q-1"],
      ["q-2"]
    ]);

    firstResponse.resolve({
      ok: true,
      json: async () => ({
        documentId: "doc-1",
        results: [
          {
            questionId: "q-1",
            classificationStatus: "matched",
            directoryMatchConfidence: 0.86,
            directoryPath: null,
            directoryCandidatePaths: [],
            ocrText: "题目一"
          }
        ]
      })
    } as Response);
    secondResponse.resolve({
      ok: true,
      json: async () => ({
        documentId: "doc-1",
        results: [
          {
            questionId: "q-2",
            classificationStatus: "matched",
            directoryMatchConfidence: 0.86,
            directoryPath: null,
            directoryCandidatePaths: [],
            ocrText: "题目二"
          }
        ]
      })
    } as Response);

    await waitFor(() => {
      expect(screen.getByLabelText("current-document-classification-progress")).toHaveAttribute(
        "aria-valuenow",
        "2"
      );
    });
  });

  it("confirms all high-confidence questions for the current document and supports undo", async () => {
    vi.spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            results: [
              {
                questionId: "q-1",
                classificationStatus: "matched",
                directoryMatchConfidence: 0.91,
                directoryPath: ["高中数学", "函数", "函数图像"],
                directoryCandidatePaths: [
                  ["高中数学", "函数", "函数图像"],
                  ["高中数学", "函数", "函数性质"],
                  ["高中数学", "解析几何", "直线与圆"]
                ],
                ocrText: "已识别题干"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(
        useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
      ).toMatchObject({
        status: "auto_classified",
        classificationStatus: "matched",
        directoryMatchConfidence: 0.91
      });
    }, { timeout: 10000 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "一键确认当前文件高置信度题目" })).toBeEnabled();
    }, { timeout: 10000 });

    fireEvent.click(screen.getByRole("button", { name: "一键确认当前文件高置信度题目" }));

    await waitFor(() => {
      expect(screen.getAllByText("已确认 1 道高置信度题目")).not.toHaveLength(0);
    });

    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed"
    });

    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "撤销本次确认" }));

    await waitFor(() => {
      expect(
        useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
      ).toMatchObject({
        status: "auto_classified",
        classificationStatus: "matched"
      });
    });
  }, 15000);

  it("selects the next remaining review question after confirming high-confidence questions", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      selectedQuestionId: "q-1",
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
          directoryPath: ["我的题库", "高中数学", "函数", "函数图像"],
          directoryCandidatePaths: [["我的题库", "高中数学", "函数", "函数图像"]],
          ocrText: "高置信度题",
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
            "page-1": { x: 110, y: 520, width: 760, height: 280 }
          },
          status: "needs_choice",
          source: "ai",
          confidence: 0.66,
          crossPageGroupId: null,
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.42,
          directoryPath: null,
          directoryCandidatePaths: [["我的题库", "高中数学", "待定区"]],
          ocrText: "低置信度题",
          lastBulkConfirmationId: null
        },
        {
          id: "q-3",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 3,
          globalOrder: 3,
          bboxByPage: {
            "page-1": { x: 130, y: 840, width: 720, height: 220 }
          },
          status: "auto_classified",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "matched",
          directoryMatchConfidence: 0.91,
          directoryPath: null,
          directoryCandidatePaths: [["我的题库", "高中数学", "待定区"]],
          ocrText: "高分但无目录题",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "一键确认当前文件高置信度题目" }));

    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-2");
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-3")
    ).toMatchObject({
      status: "auto_classified",
      classificationStatus: "matched",
      directoryPath: null
    });
    expect(screen.getByText("低置信度题")).toBeInTheDocument();
    expect(screen.getByText("剩余待复核 2 道")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续处理剩余题目" })).toBeEnabled();
  });

  it("lets the user move a low-confidence question into the subject pending bucket", async () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      binaryAssets: [
        {
          id: "asset-source-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        },
        {
          id: "asset-source-2",
          documentId: "doc-1",
          pageId: "page-2",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        }
      ],
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
          status: "needs_choice",
          source: "ai",
          confidence: 0.61,
          crossPageGroupId: null,
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.42,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionType: "简答题",
          ocrText: "低置信度题干",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);

    expect(screen.getByText("当前归类")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("drawer-ocr-input"), {
      target: {
        value: "人工修正后的题干"
      }
    });

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")?.ocrText).toBe(
      "人工修正后的题干"
    );

    fireEvent.change(screen.getByLabelText("drawer-question-type-select"), {
      target: {
        value: "证明题"
      }
    });

    expect(useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")?.questionType).toBe(
      "证明题"
    );

    fireEvent.click(screen.getByRole("button", { name: "放入待定区-Q1" }));

    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      status: "pending_bucket",
      classificationStatus: "pending_bucket",
      directoryPath: ["我的题库", "高中数学", "待定区"]
    });
  });

  it("shows feedback instead of sending an empty classification run", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        documentId: "doc-1",
        results: []
      })
    } as Response);
    useFileStore.setState({
      ...useFileStore.getState(),
      pages: useFileStore.getState().pages.map((page) => ({
        ...page,
        reviewStatus: "reviewed"
      }))
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: []
    });

    render(<HomePage />);

    expect(useQuestionStore.getState().questionDrafts).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(useToastStore.getState().toasts[0]).toMatchObject({
        title: "没有可 OCR/分类的题目，请先完成题框复核",
        tone: "info"
      });
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates a new folder from the review panel and immediately classifies the question into it", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("圆锥曲线");
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
            "page-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "needs_choice",
          source: "ai",
          confidence: 0.61,
          crossPageGroupId: null,
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.42,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: "低置信度题干",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "新建目录并归类-Q1" }));

    expect(screen.getByText("圆锥曲线")).toBeInTheDocument();
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["我的题库", "高中数学", "圆锥曲线"]
    });
  });

  it("shows a batch-apply prompt after creating a new folder and applies it to checked similar questions", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("圆锥曲线");
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
            "page-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "needs_choice",
          source: "ai",
          confidence: 0.61,
          crossPageGroupId: null,
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.42,
          directoryPath: null,
          directoryCandidatePaths: [
            ["高中数学", "函数", "函数图像"],
            ["高中数学", "函数", "函数性质"],
            ["高中数学", "解析几何", "直线与圆"]
          ],
          ocrText: "低置信度题干 A",
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
            "page-1": { x: 120, y: 460, width: 760, height: 260 }
          },
          status: "needs_choice",
          source: "ai",
          confidence: 0.59,
          crossPageGroupId: null,
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.39,
          directoryPath: null,
          directoryCandidatePaths: [
            ["高中数学", "函数", "函数图像"],
            ["高中数学", "解析几何", "直线与圆"]
          ],
          ocrText: "低置信度题干 B",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "新建目录并归类-Q1" }));

    expect(screen.getByText("将新目录批量应用到当前文件相似题目")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "批量应用-Q2" }));
    fireEvent.click(screen.getByRole("button", { name: "应用到已勾选题目" }));

    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["我的题库", "高中数学", "圆锥曲线"]
    });
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-2")
    ).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      directoryPath: ["我的题库", "高中数学", "圆锥曲线"]
    });
  });

  it("allows explicit source purge only after the current document is fully imported", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: [
        {
          id: "doc-1",
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "semantic_review_pending",
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
          reviewStatus: "reviewed"
        }
      ]
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      binaryAssets: [
        {
          id: "question-crop-q-1-page-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "question_crop",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,question-1",
          byteLength: 10
        },
        {
          id: "question-crop-q-2-page-2",
          documentId: "doc-1",
          pageId: "page-2",
          kind: "question_crop",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,question-2",
          byteLength: 10
        }
      ],
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
          status: "reviewed",
          source: "ai",
          confidence: 0.93,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["高中数学", "函数", "函数图像"],
          directoryCandidatePaths: [],
          ocrText: "题目 1",
          lastBulkConfirmationId: null,
          questionImageAttachments: [
            {
              id: "question-image-q-1-page-1",
              assetId: "question-crop-q-1-page-1",
              pageId: "page-1",
              pixelWidth: 2000,
              pixelHeight: 750,
              renderDpi: 300,
              version: 1
            }
          ]
        },
        {
          id: "q-2",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 110, y: 140, width: 760, height: 280 }
          },
          status: "pending_bucket",
          source: "ai",
          confidence: 0.88,
          crossPageGroupId: null,
          classificationStatus: "pending_bucket",
          directoryMatchConfidence: 0.52,
          directoryPath: ["我的题库", "高中数学", "待定区"],
          directoryCandidatePaths: [],
          ocrText: "题目 2",
          lastBulkConfirmationId: null,
          questionImageAttachments: [
            {
              id: "question-image-q-2-page-2",
              assetId: "question-crop-q-2-page-2",
              pageId: "page-2",
              pixelWidth: 1900,
              pixelHeight: 700,
              renderDpi: 300,
              version: 1
            }
          ]
        }
      ]
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "确认入库并删除原文件" }));

    await waitFor(() => {
      expect(
        useFileStore.getState().documents.find((document) => document.id === "doc-1")?.status
      ).toBe("source_purged");
    });

    expect(confirmSpy).toHaveBeenCalledWith("当前文件已完全入库，是否确认删除原文件？");
    expect(
      useQuestionStore.getState().binaryAssets.filter(
        (asset) => asset.documentId === "doc-1" && asset.kind === "source"
      )
    ).toHaveLength(0);
    expect(
      useQuestionStore
        .getState()
        .binaryAssets.filter(
          (asset) => asset.documentId === "doc-1" && asset.kind === "display"
        )
        .map((asset) => asset.dataUrl)
    ).toEqual([
      "data:image/png;base64,page-1",
      "data:image/png;base64,page-2"
    ]);
    expect(useQuestionStore.getState().pagePreviewUrls["page-1"]).toBeUndefined();
    expect(useQuestionStore.getState().pagePreviewDataUrls["page-1"]).toBeUndefined();
    expect(screen.getByText("原文件：")).toBeInTheDocument();
    expect(screen.getByText("已删除")).toBeInTheDocument();
  });

  it("classifies only newly added questions when previous reviewed results should stay unchanged", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            results: [
              {
                questionId: "q-new",
                classificationStatus: "matched",
                directoryMatchConfidence: 0.84,
                directoryPath: ["高中数学", "函数", "函数图像"],
                directoryCandidatePaths: [
                  ["高中数学", "函数", "函数图像"],
                  ["高中数学", "函数", "函数性质"],
                  ["高中数学", "解析几何", "直线与圆"]
                ],
                ocrText: "新增题目"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: [
        {
          id: "q-reviewed",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.93,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["高中数学", "函数", "函数图像"],
          directoryCandidatePaths: [],
          ocrText: "已处理旧题",
          lastBulkConfirmationId: null
        },
        {
          id: "q-new",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-1": { x: 120, y: 500, width: 760, height: 260 }
          },
          status: "manual_only",
          source: "manual",
          confidence: 1,
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

    const [, request] = fetchSpy.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual({
      documentId: "doc-1",
      subjectScope: "高中数学",
      directoryPaths: [],
      pages: [
        {
          id: "page-1",
          reviewStatus: "reviewed",
          questionIds: ["q-new"],
          imageDataUrl: "data:image/png;base64,page-1"
        }
      ]
    });

    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-reviewed")
    ).toMatchObject({
      status: "reviewed",
      classificationStatus: "confirmed",
      ocrText: "已处理旧题"
    });
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-new")
    ).toMatchObject({
      status: "auto_classified",
      classificationStatus: "matched",
      ocrText: "新增题目"
    });
  });

  it("reports when returned classification results do not apply to current-file questions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            results: [
              {
                questionId: "q-from-old-file",
                classificationStatus: "matched",
                directoryMatchConfidence: 0.91,
                directoryPath: ["高中数学", "函数", "函数图像"],
                directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
                ocrText: "旧文件题目"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getAllByText("生成 1 条分类结果，但 0 条匹配当前文件题目").length).toBeGreaterThan(0);
    });
    expect(
      useQuestionStore.getState().questionDrafts.filter((question) => question.documentId === "doc-1")
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "q-1",
          classificationStatus: "unclassified",
          ocrText: null
        })
      ])
    );
    expect(useQuestionStore.getState().selectedQuestionId).toBeNull();
    expect(screen.getByText("当前文件尚未生成分类复核结果。")).toBeInTheDocument();
  });

  it("reports partial application when some returned classification results do not match current-file questions", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      if (typeof input === "string" && input.includes("classify-document-questions")) {
        return {
          ok: true,
          json: async () => ({
            documentId: "doc-1",
            results: [
              {
                questionId: "q-1",
                classificationStatus: "matched",
                directoryMatchConfidence: 0.91,
                directoryPath: ["高中数学", "函数", "函数图像"],
                directoryCandidatePaths: [["高中数学", "函数", "函数图像"]],
                ocrText: "当前文件题目"
              },
              {
                questionId: "q-from-old-file",
                classificationStatus: "matched",
                directoryMatchConfidence: 0.88,
                directoryPath: ["高中数学", "函数", "函数性质"],
                directoryCandidatePaths: [["高中数学", "函数", "函数性质"]],
                ocrText: "旧文件题目"
              }
            ]
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "当前文件 OCR + 分类" }));

    await waitFor(() => {
      expect(screen.getAllByText("生成 2 条分类结果，已应用 1 条到当前文件").length).toBeGreaterThan(0);
    });
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-1");
    expect(
      useQuestionStore.getState().questionDrafts.find((question) => question.id === "q-1")
    ).toMatchObject({
      classificationStatus: "matched",
      ocrText: "当前文件题目"
    });
  });
});
