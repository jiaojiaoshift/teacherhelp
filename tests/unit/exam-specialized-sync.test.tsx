import { act, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { WorkspaceHydrator } from "@/components/app/workspace-hydrator";
import { resetDbForTests } from "@/lib/db/client";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";

describe("exam specialized sync", () => {
  beforeEach(async () => {
    const baseFolders = buildInitialFolderTree();
    const subject = baseFolders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const chapter = createCustomFolder({
      name: "函数",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "函数图像",
      parent: chapter
    });
    const allFolders = baseFolders.concat(chapter, leaf);

    await resetDbForTests();

    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useFolderStore.setState({
      folders: allFolders,
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
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: leaf.path,
          directoryCandidatePaths: [],
          ocrText: "processed prompt",
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: "initial_classification"
        }
      ],
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
    useExamStore.setState({
      examLibraryFolders: buildInitialExamLibraryFolders(allFolders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
      setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
      setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
      upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
      setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft
    });
  });

  it("auto-creates the default specialized trio for a non-empty third-level folder", async () => {
    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(4);
    });

    expect(useExamStore.getState().examLibraryDocuments.map((document) => document.title)).toEqual([
      "函数图像专题卷",
      "函数图像空白讲义",
      "函数图像主讲义",
      "函数图像答案"
    ]);
  });
  it("keeps the specialized group visible while the source document awaits answer review", async () => {
    useFileStore.setState({
      ...useFileStore.getState(),
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true
        }
      ]
    });

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(4);
    });

    expect(
      useExamStore.getState().examLibraryDocuments.find((document) => document.kind === "answer_sheet")
    ).toMatchObject({
      placeholderAnswerPage: true,
      questionIds: ["q-1"]
    });
  });

  it("syncs current question ids into the auto-created specialized trio", async () => {
    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(4);
    });

    expect(
      useExamStore
        .getState()
      .examLibraryDocuments.every((document) => document.questionIds.join(",") === "q-1")
    ).toBe(true);
  });

  it("adds missing exam-library folders when a new question folder appears later", async () => {
    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(4);
    });

    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const newChapter = createCustomFolder({
      name: "新增章节",
      parent: subject!
    });
    const newLeaf = createCustomFolder({
      name: "新增专题",
      parent: newChapter
    });

    await act(async () => {
      useFolderStore.setState({
        ...useFolderStore.getState(),
        folders: useFolderStore.getState().folders.concat(newChapter, newLeaf)
      });
    });

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryFolders.some(
            (folder) =>
              folder.library === "specialized" &&
              folder.linkedQuestionFolderId === newLeaf.id
          )
      ).toBe(true);
    });

    expect(
      useExamStore
        .getState()
        .examLibraryFolders.some(
          (folder) =>
            folder.library === "full" &&
            folder.linkedQuestionFolderId === newChapter.id
        )
    ).toBe(true);
  });

  it("syncs pending-answer questions immediately without staging a duplicate update later", async () => {
    const baseFolders = buildInitialFolderTree();
    const physics = baseFolders.find(
      (folder) => folder.depth === 1 && folder.subjectScope === "高中物理"
    );

    expect(physics).toBeTruthy();

    const mechanics = createCustomFolder({
      name: "力学",
      parent: physics!
    });
    const newton = createCustomFolder({
      name: "牛顿定律",
      parent: mechanics
    });
    const allFolders = baseFolders.concat(mechanics, newton);

    useFolderStore.setState({
      ...useFolderStore.getState(),
      folders: allFolders
    });
    useFileStore.setState({
      documents: [
        {
          id: "doc-open",
          name: "seed.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高中物理",
          pendingAnswerMatch: false
        },
        {
          id: "doc-blocked",
          name: "test_for_classifytopic.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-2"],
          subjectScope: "高中物理",
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 1
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
          id: "q-physics-1",
          documentId: "doc-open",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.94,
          directoryPath: newton.path,
          directoryCandidatePaths: [],
          ocrText: "physics seed question",
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: "initial_classification"
        },
        {
          id: "q-physics-2",
          documentId: "doc-blocked",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 120, y: 360, width: 760, height: 280 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: newton.path,
          directoryCandidatePaths: [],
          ocrText: "blocked physics question",
          answerAttachments: [
            {
              id: "answer-physics-2",
              assetId: "asset-answer-physics-2",
              kind: "matched"
            }
          ],
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: "initial_classification"
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: buildInitialExamLibraryFolders(allFolders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft()
    });

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().examLibraryDocuments).toHaveLength(4);
    });

    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) => document.questionIds.join(",") === "q-physics-1,q-physics-2"
        )
    ).toBe(true);

    const initialAnswerSheet = useExamStore
      .getState()
      .examLibraryDocuments.find((document) => document.kind === "answer_sheet");

    expect(initialAnswerSheet).toMatchObject({
      placeholderAnswerPage: false
    });

    await act(async () => {
      useFileStore.setState({
        ...useFileStore.getState(),
        documents: useFileStore.getState().documents.map((document) =>
          document.id === "doc-blocked"
            ? {
                ...document,
                pendingAnswerMatch: false,
                pendingAnswerMatchCount: 0
              }
            : document
        )
      });
    });

    await waitFor(() => {
      expect(
        useExamStore.getState().examLibraryDocuments.every(
          (document) =>
            document.syncStatus === "idle" && document.pendingQuestionIds === undefined
        )
      ).toBe(true);
    });
  });
});
