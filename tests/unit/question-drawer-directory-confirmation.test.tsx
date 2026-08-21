import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastViewport } from "@/components/feedback/toast-viewport";
import { QuestionDrawer } from "@/components/layout/drawer";
import {
  buildInitialFolderTree,
  createCustomFolder
} from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import {
  QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE,
  QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE
} from "@/lib/services/question-directory-confirmation-service";

describe("question-drawer directory confirmation", () => {
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
    const targetChapter = createCustomFolder({
      name: "电学",
      parent: subjectFolder!
    });
    const targetLeaf = createCustomFolder({
      name: "欧姆定律",
      parent: targetChapter
    });

    useFolderStore.setState({
      ...useFolderStore.getState(),
      folders: baseFolders.concat(currentChapter, currentLeaf, targetChapter, targetLeaf)
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
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.96,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: currentLeaf.path,
          directoryCandidatePaths: [targetLeaf.path],
          questionNumberLabel: "1",
          questionType: "选择题",
          ocrText: "old text",
          chapterTag: "old chapter",
          knowledgeTags: ["knowledge-a", "knowledge-b"],
          customTags: ["custom-a"],
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: null
    });
  });

  it("keeps the current directory when the second confirmation is cancelled", () => {
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);

    render(
      <>
        <QuestionDrawer />
        <ToastViewport />
      </>
    );

    const targetFolder = useFolderStore
      .getState()
      .folders.find((folder) => folder.path.join(" / ") === "我的题库 / 高中物理 / 电学 / 欧姆定律");

    expect(targetFolder).toBeTruthy();

    fireEvent.change(screen.getByLabelText("drawer-directory-select"), {
      target: { value: targetFolder!.id }
    });

    expect(confirmSpy).toHaveBeenNthCalledWith(1, QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE);
    expect(confirmSpy).toHaveBeenNthCalledWith(
      2,
      QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE
    );
    expect(useQuestionStore.getState().questionDrafts[0].directoryPath).toEqual([
      "我的题库",
      "高中物理",
      "力学",
      "牛顿定律"
    ]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
