import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import {
  QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE,
  QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE
} from "@/lib/services/question-directory-confirmation-service";

describe("home-page directory move confirmation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    const baseFolders = buildInitialFolderTree();
    const subjectFolder = baseFolders.find(
      (folder) => folder.depth === 1 && folder.subjectScope === "高中物理"
    );

    expect(subjectFolder).toBeTruthy();

    const currentChapter = createCustomFolder({
      name: "力学",
      parent: subjectFolder!
    });
    const currentLeaf = createCustomFolder({
      name: "牛顿定律",
      parent: currentChapter
    });

    useFolderStore.setState({
      ...useFolderStore.getState(),
      folders: baseFolders.concat(currentChapter, currentLeaf)
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "physics.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高中物理"
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
          status: "needs_choice",
          source: "ai",
          confidence: 0.61,
          crossPageGroupId: null,
          classificationStatus: "needs_choice",
          directoryMatchConfidence: 0.42,
          directoryPath: currentLeaf.path,
          directoryCandidatePaths: [],
          questionType: "简答题",
          ocrText: "低置信度题干",
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    });
  });

  it(
    "requires two confirmations before moving one third-level question into the pending bucket",
    async () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "放入待定区-Q1" }));

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(2);
    });

    expect(confirmSpy).toHaveBeenNthCalledWith(1, QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE);
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE
    );
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      status: "needs_choice",
      classificationStatus: "needs_choice",
      directoryPath: ["我的题库", "高中物理", "力学", "牛顿定律"]
    });
    },
    10000
  );
});
