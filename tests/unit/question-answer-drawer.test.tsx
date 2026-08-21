import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionDrawer } from "@/components/layout/drawer";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

describe("question answer drawer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      deleteFolder: useFolderStore.getState().deleteFolder,
      moveFolder: useFolderStore.getState().moveFolder
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
      updateQuestionAnalysis: useQuestionStore.getState().updateQuestionAnalysis,
      attachAnswerToQuestion: useQuestionStore.getState().attachAnswerToQuestion,
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
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
  });

  it("stages uploaded answer images for crop review before saving cropped attachments", async () => {
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,Y3JvcHBlZC1hbnN3ZXI=");
    const drawImage = vi.fn();
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
        confidence: 0.96,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.94,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [["subject-a", "folder-a"]],
        ocrText: "question text",
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().selectQuestion("q-1");

    render(<QuestionDrawer />);

    const firstFile = new File(["answer-one"], "answer-1.png", { type: "image/png" });
    const secondFile = new File(["answer-two"], "answer-2.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("drawer-answer-upload-input"), {
      target: {
        files: [firstFile]
      }
    });

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "pending-answer-crop-preview-1" })).toBeInTheDocument();
    });

    expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toBeUndefined();
    expect(useQuestionStore.getState().binaryAssets).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "confirm-answer-crop-1" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toHaveLength(1);
    });

    expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toEqual([
      expect.objectContaining({ kind: "manual" })
    ]);
    expect(drawImage).toHaveBeenCalled();
    expect(toDataURL).toHaveBeenCalledWith("image/png");
    expect(useQuestionStore.getState().binaryAssets).toHaveLength(1);
    expect(useQuestionStore.getState().binaryAssets[0]).toMatchObject({
      documentId: "doc-1",
      pageId: "page-1",
      kind: "display",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,Y3JvcHBlZC1hbnN3ZXI="
    });
    expect(screen.queryByRole("img", { name: "pending-answer-crop-preview-1" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /answer attachment/i })).toHaveLength(1);

    global.Image = originalImage;
  });

  it("lets the user redraw one pending answer crop before saving", async () => {
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
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,Y3JvcHBlZC1yZWRyYXc=");
    const drawImage = vi.fn();
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
        confidence: 0.96,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.94,
        directoryPath: ["subject-a", "folder-a"],
        directoryCandidatePaths: [["subject-a", "folder-a"]],
        ocrText: "question text",
        lastBulkConfirmationId: null
      }
    ]);
    useQuestionStore.getState().selectQuestion("q-1");

    render(<QuestionDrawer />);

    const firstFile = new File(["answer-one"], "answer-1.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("drawer-answer-upload-input"), {
      target: {
        files: [firstFile]
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText("pending-answer-crop-surface-1")).toBeInTheDocument();
    });

    fireEvent.pointerDown(screen.getByLabelText("pending-answer-crop-surface-1"), {
      clientX: 120,
      clientY: 160,
      pointerId: 1
    });
    fireEvent.pointerMove(window, {
      clientX: 720,
      clientY: 640,
      pointerId: 1
    });
    fireEvent.pointerUp(window, {
      clientX: 720,
      clientY: 640,
      pointerId: 1
    });

    fireEvent.click(screen.getByRole("button", { name: "confirm-answer-crop-1" }));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts[0].answerAttachments).toHaveLength(1);
    });

    expect(drawImage).toHaveBeenCalledWith(
      expect.any(MockImage),
      120,
      160,
      600,
      480,
      0,
      0,
      600,
      480
    );
    expect(useQuestionStore.getState().binaryAssets[0]).toMatchObject({
      dataUrl: "data:image/png;base64,Y3JvcHBlZC1yZWRyYXc="
    });

    global.Image = originalImage;
  });
});
