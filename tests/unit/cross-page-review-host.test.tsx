import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrossPageReviewHost } from "@/components/workbench/cross-page-review-host";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

const pushRoute = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushRoute
  })
}));

function seedCrossPageCandidate() {
  useFileStore.setState({
    ...useFileStore.getState(),
    documents: [
      {
        id: "doc-1",
        name: "physics.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-1", "page-2"],
        subjectScope: "高中物理",
        answerSection: {
          status: "confirmed",
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
        height: 1400,
        analysisStatus: "done",
        reviewStatus: "reviewed"
      },
      {
        id: "page-2",
        documentId: "doc-1",
        pageNumber: 2,
        width: 1000,
        height: 1400,
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
      "page-1": "data:image/png;base64,page-1",
      "page-2": "data:image/png;base64,page-2"
    },
    questionDrafts: [
      {
        id: "q-left",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 80, y: 900, width: 840, height: 420 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "unclassified"
      },
      {
        id: "q-right",
        documentId: "doc-1",
        pageIds: ["page-2"],
        primaryPageId: "page-2",
        localOrder: 1,
        globalOrder: 2,
        bboxByPage: {
          "page-2": { x: 80, y: 20, width: 840, height: 360 }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.94,
        crossPageGroupId: null,
        classificationStatus: "unclassified"
      }
    ],
    crossPageCandidates: [
      {
        id: "merge-1",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-left", "q-right"],
        confidence: 0.92,
        status: "suggested"
      }
    ],
    selectedQuestionId: null
  });
}

describe("cross-page review host", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useWorkbenchStore.getState().resetTransientProgress();
    pushRoute.mockReset();
    seedCrossPageCandidate();
  });

  it("finishes a live review session through the resolver kept outside the workbench route", () => {
    const resolve = vi.fn();

    useWorkbenchStore.getState().setCrossPageReviewSession({
      documentId: "doc-1",
      candidateIds: ["merge-1"],
      currentIndex: 0,
      acceptedCount: 0,
      recoveryMode: "live",
      resolve
    });

    render(<CrossPageReviewHost />);

    const dialog = screen.getByRole("dialog", { name: "跨页候选复核" });
    fireEvent.click(within(dialog).getByRole("button", { name: "不是跨页题" }));

    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(0);
    expect(useWorkbenchStore.getState().crossPageReviewSession).toBeNull();
    expect(useQuestionStore.getState().crossPageCandidates[0].status).toBe("dismissed");
    expect(pushRoute).not.toHaveBeenCalled();
  });

  it("recovers one orphaned review and requests exactly one resume from OCR", async () => {
    render(<CrossPageReviewHost />);

    const dialog = await screen.findByRole("dialog", { name: "跨页候选复核" });
    expect(useWorkbenchStore.getState().crossPageReviewSession).toMatchObject({
      documentId: "doc-1",
      candidateIds: ["merge-1"],
      recoveryMode: "resume_ocr"
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "合并为一道跨页题" }));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().crossPageReviewResumeRequest).toMatchObject({
        documentId: "doc-1",
        acceptedCount: 1
      });
    });

    expect(pushRoute).toHaveBeenCalledOnce();
    expect(pushRoute).toHaveBeenCalledWith("/");
    expect(useQuestionStore.getState().questionDrafts).toEqual([
      expect.objectContaining({
        id: "merge-1",
        pageIds: ["page-1", "page-2"]
      })
    ]);
  });

  it("keeps an orphaned review available when its source document entry is missing", async () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: []
    });

    render(<CrossPageReviewHost />);

    expect(await screen.findByRole("dialog", { name: "跨页候选复核" })).toBeInTheDocument();
    expect(useWorkbenchStore.getState().crossPageReviewSession).toMatchObject({
      documentId: "doc-1",
      candidateIds: ["merge-1"],
      recoveryMode: "review_only"
    });

    fireEvent.click(
      within(screen.getByRole("dialog", { name: "跨页候选复核" })).getByRole("button", {
        name: "不是跨页题"
      })
    );

    expect(useWorkbenchStore.getState().crossPageReviewResumeRequest).toBeNull();
    expect(useWorkbenchStore.getState().documentProcessingProgress).toMatchObject({
      status: "done",
      stage: "cross_page",
      message: "跨页候选复核完成"
    });
    expect(pushRoute).not.toHaveBeenCalled();
  });

  it("renders orphaned review snippets from durable display assets", async () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-page-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 100,
          dataUrl: "data:image/png;base64,page-1"
        },
        {
          id: "asset-page-2",
          documentId: "doc-1",
          pageId: "page-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 100,
          dataUrl: "data:image/png;base64,page-2"
        }
      ]
    });

    render(<CrossPageReviewHost />);

    const dialog = await screen.findByRole("dialog", { name: "跨页候选复核" });
    await waitFor(() => {
      expect(within(dialog).getAllByRole("img")).toHaveLength(2);
      expect(within(dialog).queryByText("暂无片段预览")).not.toBeInTheDocument();
    });
  });

  it("rebuilds lost orphaned candidates without rerunning question boxes", async () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      crossPageCandidates: []
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url === "/api/ai/detect-cross-page") {
        const body = JSON.parse(String(init?.body)) as {
          documentId: string;
          leftPage: string;
          rightPage: string;
        };

        return new Response(JSON.stringify({
          source: { provider: "openai_compatible" },
          mergeCandidates: [
            {
              id: "recovered-merge",
              documentId: body.documentId,
              leftPageId: body.leftPage,
              rightPageId: body.rightPage,
              sourceQuestionIds: ["q-left", "q-right"],
              confidence: 0.91,
              status: "suggested"
            }
          ]
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "/api/workflow-events") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      throw new Error(`Unexpected recovery request: ${url}`);
    });

    render(<CrossPageReviewHost />);

    expect(await screen.findByRole("dialog", { name: "跨页候选复核" })).toBeInTheDocument();
    expect(useWorkbenchStore.getState().crossPageReviewSession).toMatchObject({
      documentId: "doc-1",
      candidateIds: ["recovered-merge"],
      recoveryMode: "review_only"
    });
    expect(
      fetchSpy.mock.calls.filter(([input]) => String(input) === "/api/ai/detect-cross-page")
    ).toHaveLength(1);
    expect(
      fetchSpy.mock.calls.some(
        ([input]) => String(input) === "/api/ai/detect-question-boxes"
      )
    ).toBe(false);
  });

  it("does not recover a partial candidate while cross-page detection is still running", () => {
    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "running",
      stage: "cross_page",
      current: 1,
      total: 4,
      message: "正在自动检测并合并跨页题",
      summary: null
    });

    render(<CrossPageReviewHost />);

    expect(screen.queryByRole("dialog", { name: "跨页候选复核" })).not.toBeInTheDocument();
    expect(useWorkbenchStore.getState().crossPageReviewSession).toBeNull();
  });

  it("recovers review after all cross-page pairs finished with a stale processing message", async () => {
    useWorkbenchStore.getState().setDocumentAutoDetectProgress({
      status: "running",
      phase: "cross_page",
      current: 4,
      total: 4,
      pageNumber: null,
      message: null
    });
    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "running",
      stage: "cross_page",
      current: 4,
      total: 4,
      message: "正在自动检测并合并跨页题",
      summary: null
    });

    render(<CrossPageReviewHost />);

    expect(await screen.findByRole("dialog", { name: "跨页候选复核" })).toBeInTheDocument();
    expect(useWorkbenchStore.getState().crossPageReviewSession).toMatchObject({
      documentId: "doc-1",
      candidateIds: ["merge-1"],
      recoveryMode: "resume_ocr"
    });
  });

  it("requests recovery from cross-page when reviewed AI boxes remain but candidates were lost", async () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      crossPageCandidates: []
    });

    render(<CrossPageReviewHost />);

    await waitFor(() => {
      expect(useWorkbenchStore.getState().crossPageReviewResumeRequest).toMatchObject({
        documentId: "doc-1",
        startStage: "cross_page",
        acceptedCount: 0
      });
    });

    expect(screen.queryByRole("dialog", { name: "跨页候选复核" })).not.toBeInTheDocument();
    expect(pushRoute).toHaveBeenCalledOnce();
    expect(pushRoute).toHaveBeenCalledWith("/");
  });

  it("requests recovery when only a dismissed stale candidate remains", async () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      crossPageCandidates: [
        {
          ...useQuestionStore.getState().crossPageCandidates[0],
          sourceQuestionIds: ["missing-left", "missing-right"],
          status: "dismissed"
        }
      ]
    });

    render(<CrossPageReviewHost />);

    await waitFor(() => {
      expect(useWorkbenchStore.getState().crossPageReviewResumeRequest).toMatchObject({
        documentId: "doc-1",
        startStage: "cross_page",
        acceptedCount: 0
      });
    });

    expect(screen.queryByRole("dialog", { name: "跨页候选复核" })).not.toBeInTheDocument();
    expect(pushRoute).toHaveBeenCalledOnce();
    expect(pushRoute).toHaveBeenCalledWith("/");
  });

  it("does not redetect a valid candidate that was already dismissed", () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      crossPageCandidates: [
        {
          ...useQuestionStore.getState().crossPageCandidates[0],
          status: "dismissed"
        }
      ]
    });
    const fetchSpy = vi.spyOn(global, "fetch");

    render(<CrossPageReviewHost />);

    expect(screen.queryByRole("dialog", { name: "跨页候选复核" })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useWorkbenchStore.getState().documentProcessingProgress.status).toBe("idle");
  });
});
