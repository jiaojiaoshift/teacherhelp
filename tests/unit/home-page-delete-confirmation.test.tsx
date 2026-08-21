import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";

describe("home-page delete confirmation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
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
      manualMergeQuestionIds: [],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: null
    });
  });

  it("requires two confirmations before deleting one selected question", async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    render(<HomePage />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "P1 · Q1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除题目" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(0);
    });

    expect(confirmSpy).toHaveBeenNthCalledWith(1, "确认删除当前题目吗？");
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      "将同步影响相关默认专题卷内容，是否再次确认删除？"
    );
  });

  it("keeps the selected question when the second confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValueOnce(false);

    render(<HomePage />);

    fireEvent.contextMenu(screen.getByRole("button", { name: "P1 · Q1" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除题目" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);
    });
  });
});
