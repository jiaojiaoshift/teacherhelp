import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { CrossPageReviewHost } from "@/components/workbench/cross-page-review-host";
import { createDefaultSpecializedDocuments } from "@/lib/services/exam-library-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

function chooseSingleColumnLayout() {
  fireEvent.click(screen.getByRole("button", { name: "单栏" }));
}

const pushRoute = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushRoute
  })
}));

function renderWorkbench() {
  return render(
    <>
      <CrossPageReviewHost />
      <HomePage />
    </>
  );
}

describe("home-page automatic cross-page workflow", () => {
  beforeEach(() => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: [
        {
          id: "doc-1",
          name: "物理试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"],
          subjectScope: "高中物理",
          answerSection: {
            status: "suggested",
            hasAnswerSection: false,
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
          width: 1000,
          height: 2000,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "1. 左页未结束题干",
              normalizedBBox: { x1: 90, y1: 900, x2: 910, y2: 950 }
            }
          ]
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1000,
          height: 2000,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: [
            {
              text: "右页续题内容",
              normalizedBBox: { x1: 90, y1: 40, x2: 910, y2: 90 }
            }
          ]
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
      questionDrafts: [],
      crossPageCandidates: [],
      selectedQuestionId: null
    });
    useWorkbenchStore.getState().resetTransientProgress();
    pushRoute.mockReset();
    vi.restoreAllMocks();
  });

  it("removes the manual cross-page controls from the primary workbench", () => {
    renderWorkbench();

    expect(screen.getByLabelText("document-workflow-navigation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "检测跨页候选" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "取消当前文件全部跨页识别" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "分析当前页题目" })).not.toBeInTheDocument();
  }, 10000);

  it("runs automatic cross-page detection with real question ids before OCR", async () => {
    const resolvedTextLinesByPage = {
      "page-1": [
        {
          text: "1. 左页未结束题干",
          normalizedBBox: { x1: 90, y1: 900, x2: 910, y2: 950 }
        }
      ],
      "page-2": [
        {
          text: "右页续题内容",
          normalizedBBox: { x1: 90, y1: 40, x2: 910, y2: 90 }
        }
      ]
    };
    useFileStore.setState({
      ...useFileStore.getState(),
      pages: useFileStore.getState().pages.map((page) => ({ ...page, textLines: [] }))
    });
    const targetFolder = useFolderStore
      .getState()
      .folders.find((folder) => folder.depth === 3 && folder.name === "匀加速基础");
    expect(targetFolder).toBeDefined();
    const targetExamFolder = useExamStore
      .getState()
      .examLibraryFolders.find(
        (folder) =>
          folder.library === "specialized" &&
          folder.linkedQuestionFolderId === targetFolder?.id
      );
    expect(targetExamFolder).toBeDefined();
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: createDefaultSpecializedDocuments({
        folder: targetExamFolder!,
        subjectScope: targetExamFolder!.subjectScope
      }).map((document) => ({
        ...document,
        questionIds: ["existing-question"]
      }))
    });
    const progressSpy = vi.spyOn(
      useWorkbenchStore.getState(),
      "setDocumentProcessingProgress"
    );
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        const isLeftPage = body.pageId === "page-1";

        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            textLines:
              resolvedTextLinesByPage[body.pageId as keyof typeof resolvedTextLinesByPage],
            detections: [
              {
                id: isLeftPage ? "left-question" : "right-question",
                localOrder: 1,
                confidence: 0.93,
                normalizedBBox: isLeftPage
                  ? { x1: 100, y1: 800, x2: 900, y2: 980 }
                  : { x1: 100, y1: 20, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: [
              {
                id: "dismissed-merge",
                sourceQuestionIds: ["page-1-left-question", "page-2-right-question"],
                confidence: 0.72
              },
              {
                id: "merge-1",
                sourceQuestionIds: ["page-1-left-question", "page-2-right-question"],
                confidence: 0.92
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
                questionId: "merge-1",
                questionNumberLabel: null,
                classificationStatus: "matched",
                directoryMatchConfidence: 0.95,
                directoryPath: targetFolder?.path ?? null,
                directoryCandidatePaths: [],
                ocrText: "跨页题目"
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

    const { rerender } = renderWorkbench();
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    const reviewDialog = await screen.findByRole("dialog", { name: "跨页候选复核" });

    expect(useWorkbenchStore.getState().crossPageReviewSession).toMatchObject({
      documentId: "doc-1",
      candidateIds: ["merge-1"],
      currentIndex: 0,
      acceptedCount: 0
    });

    expect(within(reviewDialog).getByText("第 1 页 Q1 + 第 2 页 Q1")).toBeInTheDocument();
    expect(within(reviewDialog).getByText("1 / 1")).toBeInTheDocument();
    expect(
      fetchSpy.mock.calls.some(
        ([input]) => String(input) === "/api/ai/classify-document-questions"
      )
    ).toBe(false);

    const crossPageCall = fetchSpy.mock.calls.find(
      ([input]) => String(input) === "/api/ai/detect-cross-page"
    );
    const body = JSON.parse(String(crossPageCall?.[1]?.body));

    expect(body).toMatchObject({
      workflowRunId: expect.stringMatching(/^workflow-/),
      sequence: 1,
      total: 1
    });
    expect(body.candidates).toEqual([
      {
        id: "page-1-left-question",
        pageId: "page-1",
        localOrder: 1,
        normalizedBBox: { x1: 92, y1: 785, x2: 908, y2: 995 }
      },
      {
        id: "page-2-right-question",
        pageId: "page-2",
        localOrder: 1,
        normalizedBBox: { x1: 92, y1: 5, x2: 908, y2: 315 }
      }
    ]);
    expect(body.leftTextLines).toEqual(resolvedTextLinesByPage["page-1"]);
    expect(body.rightTextLines).toEqual(resolvedTextLinesByPage["page-2"]);

    rerender(<CrossPageReviewHost />);

    fireEvent.click(within(reviewDialog).getByRole("button", { name: "合并为一道跨页题" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });

    expect(screen.queryByRole("dialog", { name: "跨页候选复核" })).not.toBeInTheDocument();
    expect(
      useQuestionStore
        .getState()
        .crossPageCandidates.filter((candidate) =>
          candidate.sourceQuestionIds.includes("page-1-left-question") &&
          candidate.sourceQuestionIds.includes("page-2-right-question")
        )
    ).toEqual([expect.objectContaining({ id: "merge-1", status: "accepted" })]);
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      id: "merge-1",
      pageIds: ["page-1", "page-2"],
      questionNumberLabel: "1"
    });
    const workflowEvents = fetchSpy.mock.calls
      .filter(([input]) => String(input) === "/api/workflow-events")
      .map(([, request]) => JSON.parse(String(request?.body)));
    expect(workflowEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: body.workflowRunId,
        event: "cross_page_summary",
        stage: "cross_page",
        status: "done",
        total: 1,
        candidateCount: 3,
        filteredCount: 2
      }),
      expect.objectContaining({
        runId: body.workflowRunId,
        event: "cross_page_review",
        stage: "cross_page",
        status: "done",
        candidateCount: 1,
        acceptedCount: 1
      }),
      expect.objectContaining({
        runId: body.workflowRunId,
        event: "specialized_sync",
        stage: "specialized_sync",
        status: "done",
        total: 4
      })
    ]));
    expect(useWorkbenchStore.getState().documentProcessingProgress.summary).toMatchObject({
      questionCount: 1,
      crossPageMergeCount: 1,
      specializedDocumentCount: 4
    });
    const acceptedCandidate = useQuestionStore
      .getState()
      .crossPageCandidates.find((candidate) => candidate.status === "accepted");
    expect(acceptedCandidate).toBeDefined();
    useQuestionStore.getState().setCrossPageCandidates([
      ...useQuestionStore.getState().crossPageCandidates,
      {
        ...acceptedCandidate!,
        id: "foreign-accepted-candidate",
        documentId: "foreign-document"
      }
    ]);
    rerender(
      <>
        <CrossPageReviewHost />
        <HomePage />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "自动处理" }));
    expect(screen.getAllByText("跨页 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("跨页 2")).not.toBeInTheDocument();
    expect(useToastStore.getState().toasts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: "专题卷同步完成：已更新 4 份专题资料。",
        tone: "success"
      })
    ]));
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        stage: "cross_page",
        current: 1,
        total: 1
      })
    );
  });

  it("keeps candidates from different page pairs when the AI repeats one candidate id", async () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: [
        {
          ...useFileStore.getState().documents[0],
          pageIds: ["page-1", "page-2", "page-3"]
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1000,
          height: 2000,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: []
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1000,
          height: 2000,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: []
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
          width: 1000,
          height: 2000,
          analysisStatus: "idle",
          reviewStatus: "unreviewed",
          textLines: []
        }
      ],
      selectedPageId: "page-1"
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewUrls: {
        "page-1": "blob:page-1",
        "page-2": "blob:page-2",
        "page-3": "blob:page-3"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1",
        "page-2": "data:image/png;base64,page-2",
        "page-3": "data:image/png;base64,page-3"
      }
    });

    vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-question-boxes") {
        const body = JSON.parse(String(init?.body)) as { pageId: string };
        const detectionsByPage = {
          "page-1": [
            {
              id: "left",
              localOrder: 1,
              confidence: 0.93,
              normalizedBBox: { x1: 100, y1: 200, x2: 900, y2: 400 }
            }
          ],
          "page-2": [
            {
              id: "top",
              localOrder: 1,
              confidence: 0.93,
              normalizedBBox: { x1: 100, y1: 200, x2: 900, y2: 400 }
            },
            {
              id: "bottom",
              localOrder: 2,
              confidence: 0.93,
              normalizedBBox: { x1: 100, y1: 600, x2: 900, y2: 800 }
            }
          ],
          "page-3": [
            {
              id: "right",
              localOrder: 1,
              confidence: 0.93,
              normalizedBBox: { x1: 100, y1: 200, x2: 900, y2: 400 }
            }
          ]
        } as const;

        return {
          ok: true,
          json: async () => ({
            pageId: body.pageId,
            detections: detectionsByPage[body.pageId as keyof typeof detectionsByPage]
          })
        } as Response;
      }

      if (url === "/api/ai/detect-cross-page") {
        const body = JSON.parse(String(init?.body)) as { sequence: number };
        return {
          ok: true,
          json: async () => ({
            mergeCandidates: [
              {
                id: "merge-1",
                sourceQuestionIds:
                  body.sequence === 1
                    ? ["page-1-left", "page-2-top"]
                    : ["page-2-bottom", "page-3-right"],
                confidence: 0.92
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/classify-document-questions") {
        const body = JSON.parse(String(init?.body)) as {
          pages: Array<{ questionIds: string[] }>;
        };
        const questionId = body.pages[0].questionIds[0];
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                questionId,
                questionNumberLabel: null,
                classificationStatus: "needs_choice",
                directoryMatchConfidence: 0.4,
                directoryPath: null,
                directoryCandidatePaths: [],
                ocrText: `OCR ${questionId}`
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

    renderWorkbench();
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    const firstReview = await screen.findByRole("dialog", { name: "跨页候选复核" });
    expect(within(firstReview).getByText("1 / 2")).toBeInTheDocument();
    expect(within(firstReview).getByText("第 1 页 Q1 + 第 2 页 Q1")).toBeInTheDocument();

    fireEvent.click(within(firstReview).getByRole("button", { name: "不是跨页题" }));

    const secondReview = screen.getByRole("dialog", { name: "跨页候选复核" });
    expect(within(secondReview).getByText("2 / 2")).toBeInTheDocument();
    expect(within(secondReview).getByText("第 2 页 Q2 + 第 3 页 Q1")).toBeInTheDocument();

    fireEvent.click(within(secondReview).getByRole("button", { name: "不是跨页题" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("done");
    });
  });

  it("stops before OCR when cross-page detection returns a local fallback", async () => {
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
                id: body.pageId === "page-1" ? "left-question" : "right-question",
                localOrder: 1,
                confidence: 0.93,
                normalizedBBox:
                  body.pageId === "page-1"
                    ? { x1: 100, y1: 800, x2: 900, y2: 980 }
                    : { x1: 100, y1: 20, x2: 900, y2: 300 }
              }
            ]
          })
        } as Response;
      }

      if (url === "/api/ai/detect-cross-page") {
        return {
          ok: true,
          json: async () => ({
            source: {
              provider: "local_fallback",
              reason: "api_request_failed",
              diagnosticId: "aierr-cross-page-test"
            },
            mergeCandidates: [
              {
                id: "fallback-merge",
                sourceQuestionIds: ["page-1-left-question", "page-2-right-question"],
                confidence: 0.84
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

      throw new Error(`The workflow must stop before ${url}`);
    });

    renderWorkbench();
    chooseSingleColumnLayout();
    fireEvent.click(screen.getByRole("button", { name: "No answer section" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("failed");
    });

    expect(
      useQuestionStore.getState().questionDrafts.some((question) => question.id === "fallback-merge")
    ).toBe(false);
    expect(
      fetchSpy.mock.calls.some(
        ([input]) => String(input) === "/api/ai/classify-document-questions"
      )
    ).toBe(false);
    expect(useWorkbenchStore.getState().documentProcessingProgress.message).toContain(
      "诊断编号 aierr-cross-page-test"
    );
    const failedStageEvents = fetchSpy.mock.calls
      .filter(([input]) => String(input) === "/api/workflow-events")
      .map(([, request]) => JSON.parse(String(request?.body)))
      .filter((event) => event.event === "workflow_stage" && event.status === "failed");
    expect(failedStageEvents).toEqual([
      expect.objectContaining({
        runId: expect.stringMatching(/^workflow-/),
        stage: "cross_page",
        status: "failed"
      })
    ]);
  });
});
