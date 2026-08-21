import { act, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceHydrator } from "@/components/app/workspace-hydrator";
import { resetDbForTests } from "@/lib/db/client";
import { renderPdfArrayBufferToPagePreviews } from "@/lib/pdf/pdf-renderer";
import {
  IndexedDbWorkspaceSnapshotRepository,
  type WorkspaceSnapshot
} from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import { prepareAiPreviewDataUrl } from "@/lib/services/ai-image-preview-service";
import { createDocumentProcessingTask } from "@/lib/services/document-task-service";
import { buildEmptyLocalLibrarySnapshot } from "@/lib/services/local-library-contract";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

vi.mock("@/lib/pdf/pdf-renderer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/pdf-renderer")>(
    "@/lib/pdf/pdf-renderer"
  );

  const renderPdfMock = vi.fn();

  return {
    ...actual,
    renderPdfArrayBufferToPagePreviews: renderPdfMock,
    renderPdfBlobToPagePreviews: renderPdfMock
  };
});

vi.mock("@/lib/services/ai-image-preview-service", () => ({
  prepareAiPreviewBlob: vi.fn(async (blob: Blob) => blob),
  prepareAiPreviewDataUrl: vi.fn(async (dataUrl: string) => `compressed:${dataUrl}`)
}));

function buildTaskOnlyWorkspaceSnapshot(
  documentTasks: NonNullable<WorkspaceSnapshot["documentTasks"]>
): WorkspaceSnapshot {
  const folders = buildInitialFolderTree();

  return {
    selectedPageId: null,
    documents: [],
    pages: [],
    folders,
    examLibraryFolders: buildInitialExamLibraryFolders(folders),
    examLibraryDocuments: [],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
    mobileUploadTasks: [],
    pendingUploadedFullPaperDraft: null,
    binaryAssets: [],
    questionDrafts: [],
    crossPageCandidates: [],
    manualMergeQuestionIds: [],
    selectedQuestionId: null,
    lastBulkConfirmation: null,
    documentTasks
  };
}

describe("workspace-hydrator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    const folders = buildInitialFolderTree();

    await resetDbForTests();
    window.localStorage.setItem("teachhelper:workspace-content-cleanup:20260610", "done");
    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: [],
      hydrateWorkspaceState: useFileStore.getState().hydrateWorkspaceState,
      upsertDocument: useFileStore.getState().upsertDocument,
      updateDocumentStatus: useFileStore.getState().updateDocumentStatus,
      upsertPage: useFileStore.getState().upsertPage,
      updatePageStatus: useFileStore.getState().updatePageStatus,
      selectPage: useFileStore.getState().selectPage
    });
    useFolderStore.setState({
      folders,
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
      pendingUploadedFullPaperDraft: null,
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
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      mobileUploadTasks: [],
      pendingUploadedFullPaperDraft: null,
      hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
      setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
      setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
      setMobileUploadTasks: useExamStore.getState().setMobileUploadTasks,
      upsertMobileUploadTask: useExamStore.getState().upsertMobileUploadTask,
      setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft,
      setPendingUploadedFullPaperDraft: useExamStore.getState().setPendingUploadedFullPaperDraft,
      confirmPendingUploadedFullPaperDraft:
        useExamStore.getState().confirmPendingUploadedFullPaperDraft
    });
    useWorkbenchStore.getState().hydrateDocumentTasks([]);
  });

  it("hydrates file, folder, question and exam stores from the last saved workspace snapshot", async () => {
    const repository = new IndexedDbWorkspaceSnapshotRepository();
    const folders = buildInitialFolderTree();

    await repository.save({
      selectedPageId: "page-1",
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2
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
      folders,
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [
        {
          id: "paper-specialized",
          folderId: "specialized-folder-1",
          library: "specialized",
          kind: "paper",
          title: "sample specialized paper",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-folder-1",
        selectedDocumentId: "paper-specialized"
      },
      mobileUploadTasks: [
        {
          id: "task-1",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-folder-1--archive--lecture",
          targetNodePath: ["专题卷库", "subject-a", "chapter-a", "topic-a", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-03T08:00:00.000Z"
        }
      ],
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
          directoryPath: ["question-bank", "subject-a", "topic-a"],
          directoryCandidatePaths: [],
          ocrText: "processed prompt",
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: "initial_classification"
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: null,
      documentTasks: [
        {
          ...createDocumentProcessingTask({
            id: "document-task-1",
            runId: "document-run-1",
            documentId: "doc-1",
            documentName: "sample.pdf",
            createdAt: "2026-08-17T08:00:00.000Z"
          }),
          status: "running"
        }
      ]
    });

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(useFileStore.getState().selectedPageId).toBe("page-1");
    expect(useFileStore.getState().documents[0].pendingAnswerMatch).toBe(true);
    expect(useFileStore.getState().documents[0].pendingAnswerMatchCount).toBe(2);
    expect(useQuestionStore.getState().questionDrafts[0].ocrText).toBe("processed prompt");
    expect(useExamStore.getState().examLibraryDocuments[0].title).toBe("sample specialized paper");
    expect(useExamStore.getState().examWorkspaceDraft.selectedDocumentId).toBe("paper-specialized");
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      {
        id: "task-1",
        deviceId: "device-a",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: "specialized-folder-1--archive--lecture",
        targetNodePath: ["专题卷库", "subject-a", "chapter-a", "topic-a", "讲义归档"],
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "张三_高一_26_06_03.pdf",
        mimeType: "application/pdf",
        status: "queued",
        createdAt: "2026-06-03T08:00:00.000Z"
      }
    ]);
    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toBeNull();
    expect(useWorkbenchStore.getState().documentTasks[0]).toMatchObject({
      id: "document-task-1",
      status: "queued",
      priority: "restored"
    });
  });

  it("persists editor history and lecture spacing in the latest workspace snapshot", async () => {
    render(createElement(WorkspaceHydrator));

    useExamStore.getState().setExamLibraryDocuments([
      {
        id: "full-paper-1",
        folderId: "full-folder-1",
        library: "full",
        kind: "paper",
        title: "custom paper 1",
        subjectScope: null,
        groupId: "group-1",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "custom_numeric",
        questionIds: ["q-1"],
        editorState: {
          undoStack: [
            {
              questionIds: ["q-1", "q-2"],
              numberingMode: "custom_numeric",
              answerPlaceholder: false,
              lectureSpacing: {
                defaultGap: 48,
                perQuestionGapOverrides: {
                  "q-2": 72
                }
              }
            }
          ]
        },
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      },
      {
        id: "full-lecture-1",
        folderId: "full-folder-1",
        library: "full",
        kind: "lecture",
        title: "lecture-1",
        subjectScope: null,
        groupId: "group-1",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "custom_numeric",
        questionIds: ["q-1"],
        lectureSpacing: {
          defaultGap: 60,
          perQuestionGapOverrides: {
            "q-1": 96
          }
        },
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      }
    ]);
    useExamStore.getState().setMobileUploadTasks([
      {
        id: "task-2",
        deviceId: "device-b",
        uploadKind: "question_bank_pdf",
        targetNodeId: "folder-2",
        targetNodePath: ["我的题库", "高中数学"],
        originalFileName: "math.pdf",
        normalizedFileName: "math.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-06-03T09:00:00.000Z"
      }
    ]);
    useExamStore.getState().setExamWorkspaceDraft({
      selectedLibrary: "full",
      selectedFolderId: "full-folder-1",
      selectedDocumentId: "full-paper-1"
    });
    useWorkbenchStore.getState().enqueueDocumentTask(
      createDocumentProcessingTask({
        id: "document-task-persisted",
        runId: "document-run-persisted",
        documentId: "doc-persisted",
        documentName: "persisted.pdf",
        createdAt: "2026-08-17T09:00:00.000Z"
      })
    );

    const repository = new IndexedDbWorkspaceSnapshotRepository();

    await waitFor(async () => {
      const loaded = await repository.load();
      expect(loaded?.examLibraryDocuments).toHaveLength(2);
    });

    const loaded = await repository.load();

    expect(loaded?.examLibraryDocuments[0].title).toBe("custom paper 1");
    expect(loaded?.examLibraryDocuments[0].editorState?.undoStack).toHaveLength(1);
    expect(loaded?.examLibraryDocuments[0].editorState?.undoStack[0]?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {
        "q-2": 72
      }
    });
    expect(loaded?.examLibraryDocuments[1].lectureSpacing).toEqual({
      defaultGap: 60,
      perQuestionGapOverrides: {
        "q-1": 96
      }
    });
    expect(loaded?.mobileUploadTasks).toEqual([
      {
        id: "task-2",
        deviceId: "device-b",
        uploadKind: "question_bank_pdf",
        targetNodeId: "folder-2",
        targetNodePath: ["我的题库", "高中数学"],
        originalFileName: "math.pdf",
        normalizedFileName: "math.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-06-03T09:00:00.000Z"
      }
    ]);
    expect(loaded?.examWorkspaceDraft.selectedLibrary).toBe("full");
    expect(loaded?.documentTasks?.[0]).toMatchObject({
      id: "document-task-persisted",
      documentName: "persisted.pdf"
    });
  });

  it("prefers durable server tasks over a stale IndexedDB task queue", async () => {
    const browserTask = createDocumentProcessingTask({
      id: "browser-task",
      runId: "browser-run",
      documentId: "browser-document",
      documentName: "browser.pdf"
    });
    const serverTask = createDocumentProcessingTask({
      id: "server-task",
      runId: "server-run",
      documentId: "server-document",
      documentName: "server.pdf"
    });
    await new IndexedDbWorkspaceSnapshotRepository().save(
      buildTaskOnlyWorkspaceSnapshot([browserTask])
    );
    const fetchMock = vi.fn().mockImplementation(async (input, init?: RequestInit) => {
      if (input === "/api/document-tasks" && !init?.method) {
        return new Response(JSON.stringify({ revision: 4, tasks: [serverTask] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/local-library" && !init?.method) {
        return new Response(
          JSON.stringify({ revision: 0, snapshot: buildEmptyLocalLibrarySnapshot() }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ revision: 5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useWorkbenchStore.getState().documentTasks).toEqual([
        expect.objectContaining({
          id: "server-task",
          priority: "restored"
        })
      ]);
    });
    expect(useWorkbenchStore.getState().documentTasks).not.toEqual([
      expect.objectContaining({ id: "browser-task" })
    ]);
  });

  it("migrates IndexedDB tasks when the durable server task store is empty", async () => {
    const browserTask = createDocumentProcessingTask({
      id: "browser-task-to-migrate",
      runId: "browser-run-to-migrate",
      documentId: "browser-document-to-migrate",
      documentName: "browser-migration.pdf"
    });
    await new IndexedDbWorkspaceSnapshotRepository().save(
      buildTaskOnlyWorkspaceSnapshot([browserTask])
    );
    const savedTaskPayloads: Array<{ expectedRevision: number; tasks: unknown[] }> = [];
    const fetchMock = vi.fn().mockImplementation(async (input, init?: RequestInit) => {
      if (input === "/api/document-tasks" && !init?.method) {
        return new Response(JSON.stringify({ revision: 0, tasks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/document-tasks" && init?.method === "POST") {
        savedTaskPayloads.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ revision: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/local-library" && !init?.method) {
        return new Response(
          JSON.stringify({ revision: 0, snapshot: buildEmptyLocalLibrarySnapshot() }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ revision: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(savedTaskPayloads).toHaveLength(1);
    });
    expect(savedTaskPayloads[0]).toMatchObject({
      expectedRevision: 0,
      tasks: [
        expect.objectContaining({
          id: "browser-task-to-migrate",
          priority: "restored"
        })
      ]
    });
  });

  it("keeps a conflict-protected task save queue when the initial durable task load fails", async () => {
    const browserTask = createDocumentProcessingTask({
      id: "browser-task-after-load-failure",
      runId: "browser-run-after-load-failure",
      documentId: "browser-document-after-load-failure",
      documentName: "load-failure-recovery.pdf"
    });
    await new IndexedDbWorkspaceSnapshotRepository().save(
      buildTaskOnlyWorkspaceSnapshot([browserTask])
    );
    const savedTaskPayloads: Array<{ expectedRevision: number; tasks: unknown[] }> = [];
    const fetchMock = vi.fn().mockImplementation(async (input, init?: RequestInit) => {
      if (input === "/api/document-tasks" && !init?.method) {
        return new Response(JSON.stringify({ error: "temporary_unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/document-tasks" && init?.method === "POST") {
        savedTaskPayloads.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ revision: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/local-library" && !init?.method) {
        return new Response(
          JSON.stringify({ revision: 0, snapshot: buildEmptyLocalLibrarySnapshot() }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ revision: 1, status: "synced" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(savedTaskPayloads).toHaveLength(1);
    });
    expect(savedTaskPayloads[0]).toMatchObject({
      expectedRevision: 0,
      tasks: [
        expect.objectContaining({
          id: "browser-task-after-load-failure",
          priority: "restored"
        })
      ]
    });
  });

  it("syncs helper workspace snapshots with current mobile upload tasks outside the test environment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "synced" })
    } as Response);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    useExamStore.setState({
      ...useExamStore.getState(),
      mobileUploadTasks: [
        {
          id: "task-helper-1",
          deviceId: "device-helper",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-folder-1--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-03T12:08:00.000Z"
        }
      ]
    });

    render(createElement(WorkspaceHydrator));

    let helperSyncCall: (typeof fetchMock.mock.calls)[number] | undefined;

    await waitFor(() => {
      helperSyncCall = fetchMock.mock.calls.find(
        (call) => call[0] === "/api/mobile-upload/workspace-sync"
      );
      expect(helperSyncCall).toBeTruthy();
    });

    expect(helperSyncCall).toBeTruthy();
    expect(
      JSON.parse(String((helperSyncCall?.[1] as RequestInit | undefined)?.body ?? "{}"))
    ).toMatchObject({
      mobileUploadTasks: [
        {
          id: "task-helper-1",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          status: "queued"
        }
      ]
    });
  });

  it("re-syncs helper question summaries after one question draft changes outside the test environment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "synced" })
    } as Response);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: [
        {
          id: "q-helper-1",
          documentId: "doc-helper-1",
          pageIds: ["page-helper-1"],
          primaryPageId: "page-helper-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-helper-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["question-bank", "subject-a", "topic-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "1",
          ocrText: "before sync",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    fetchMock.mockClear();

    act(() => {
      useQuestionStore.getState().updateQuestionOcrText("q-helper-1", "after sync");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const helperSyncCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/mobile-upload/workspace-sync"
    );

    expect(helperSyncCall).toBeTruthy();
    expect(
      JSON.parse(String((helperSyncCall?.[1] as RequestInit | undefined)?.body ?? "{}"))
    ).toMatchObject({
      questionDrafts: [
        {
          id: "q-helper-1",
          questionNumberLabel: "1",
          ocrText: "after sync"
        }
      ]
    });
  });

  it("consumes one helper pending question-bank upload outside the test environment", async () => {
    const folders = buildInitialFolderTree();
    const targetFolder = folders.find((folder) => folder.subjectScope === "高中数学");
    const fetchMock = vi.fn().mockImplementation(async (input, init) => {
      if (input === "/api/mobile-upload/pending-uploads" && (!init || !("method" in init))) {
        return {
          ok: true,
          json: async () => ({
            pendingUploads: [
              {
                id: "pending-upload-qb-1",
                taskId: "task-qb-1",
                uploadKind: "question_bank_pdf",
                targetNodeId: targetFolder?.id,
                targetNodePath: targetFolder?.path,
                originalFileName: "functions.pdf",
                normalizedFileName: "functions.pdf",
                mimeType: "application/pdf",
                createdAt: "2026-06-04T08:02:00.000Z",
                byteLength: 8,
                base64Data: "JVBERi0xLjQ="
              }
            ]
          })
        } as Response;
      }

      if (input === "/api/mobile-upload/pending-uploads" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "acknowledged",
            pendingUploadCount: 0
          })
        } as Response;
      }

      if (input === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 1
            }
          })
        } as Response;
      }

      if (input === "/api/mobile-upload/workspace-sync") {
        return {
          ok: true,
          json: async () => ({
            status: "synced"
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue(
      "compressed:data:image/png;base64,cGFnZS0x"
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(useFileStore.getState().documents[0]).toMatchObject({
      name: "functions.pdf",
      kind: "pdf",
      subjectScope: "高中数学"
    });

    const acknowledgeCall = fetchMock.mock.calls.find(
      (call) =>
        call[0] === "/api/mobile-upload/pending-uploads" &&
        (call[1] as RequestInit | undefined)?.method === "POST"
    );

    expect(acknowledgeCall).toBeTruthy();
    expect(JSON.parse(String((acknowledgeCall?.[1] as RequestInit).body))).toEqual({
      pendingUploadId: "pending-upload-qb-1",
      nextTaskStatus: "completed"
    });
  });

  it("replays one helper processed question-bank import outside the test environment", async () => {
    const folders = buildInitialFolderTree();
    const targetFolder = folders.find((folder) => folder.subjectScope !== null);
    const sourceFileBlob = new Blob(["%PDF-1.4 question bank"], {
      type: "application/pdf"
    });
    const fetchMock = vi.fn().mockImplementation(async (input, init) => {
      if (input === "/api/mobile-upload/pending-uploads" && (!init || !("method" in init))) {
        return {
          ok: true,
          json: async () => ({
            pendingUploads: [],
            processedQuestionBankImports: [
              {
                id: "processed-import-qb-1",
                task: {
                  id: "task-qb-processed-1",
                  deviceId: "android-qb-processed-1",
                  uploadKind: "question_bank_pdf",
                  targetNodeId: targetFolder?.id,
                  targetNodePath: targetFolder?.path,
                  originalFileName: "functions.pdf",
                  normalizedFileName: "functions.pdf",
                  mimeType: "application/pdf",
                  status: "processing",
                  createdAt: "2026-06-04T08:02:00.000Z",
                  errorMessage: null
                },
                documents: [
                  {
                    id: "doc-qb-processed-1",
                    name: "functions.pdf",
                    kind: "pdf",
                    status: "pages_ready",
                    pageIds: ["page-qb-processed-1"],
                    subjectScope: targetFolder?.subjectScope
                  }
                ],
                pages: [
                  {
                    id: "page-qb-processed-1",
                    documentId: "doc-qb-processed-1",
                    pageNumber: 1,
                    width: 1200,
                    height: 1600,
                    analysisStatus: "idle",
                    reviewStatus: "unreviewed"
                  }
                ],
                binaryAssets: [
                  {
                    id: "asset-source-qb-processed-1",
                    documentId: "doc-qb-processed-1",
                    pageId: "page-qb-processed-1",
                    kind: "source",
                    mimeType: "application/pdf",
                    byteLength: 8
                  }
                ],
                pagePreviews: [
                  {
                    pageId: "page-qb-processed-1",
                    dataUrl: "compressed:data:image/png;base64,cGFnZS0x"
                  }
                ],
                sourceFileUrl:
                  "/api/mobile-upload/pending-uploads/file?id=processed-import-qb-1"
              }
            ]
          })
        } as Response;
      }

      if (
        input === "/api/mobile-upload/pending-uploads/file?id=processed-import-qb-1"
      ) {
        return {
          ok: true,
          blob: async () => sourceFileBlob
        } as Response;
      }

      if (input === "/api/mobile-upload/pending-uploads" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "acknowledged",
            pendingUploadCount: 0
          })
        } as Response;
      }

      if (input === "/api/mobile-upload/workspace-sync") {
        return {
          ok: true,
          json: async () => ({
            status: "synced"
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(useFileStore.getState().documents).toEqual([
      expect.objectContaining({
        id: "doc-qb-processed-1",
        name: "functions.pdf",
        kind: "pdf",
        subjectScope: targetFolder?.subjectScope
      })
    ]);
    expect(useFileStore.getState().pages).toEqual([
      expect.objectContaining({
        id: "page-qb-processed-1",
        documentId: "doc-qb-processed-1",
        pageNumber: 1
      })
    ]);
    expect(useQuestionStore.getState().binaryAssets).toEqual([
      expect.objectContaining({
        id: "asset-source-qb-processed-1",
        documentId: "doc-qb-processed-1",
        kind: "source",
        blob: sourceFileBlob
      })
    ]);
    expect(useQuestionStore.getState().pagePreviewUrls["page-qb-processed-1"]).toBe(
      "compressed:data:image/png;base64,cGFnZS0x"
    );
    expect(useQuestionStore.getState().pagePreviewDataUrls["page-qb-processed-1"]).toBe(
      "compressed:data:image/png;base64,cGFnZS0x"
    );
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-qb-processed-1",
        deviceId: "android-qb-processed-1",
        uploadKind: "question_bank_pdf",
        status: "completed"
      })
    ]);

    const acknowledgeCall = fetchMock.mock.calls.find(
      (call) =>
        call[0] === "/api/mobile-upload/pending-uploads" &&
        (call[1] as RequestInit | undefined)?.method === "POST"
    );

    expect(acknowledgeCall).toBeTruthy();
    expect(JSON.parse(String((acknowledgeCall?.[1] as RequestInit).body))).toEqual({
      processedQuestionBankImportId: "processed-import-qb-1",
      nextTaskStatus: "completed"
    });
  });

  it("replays one helper processed full-paper draft outside the test environment", async () => {
    const folders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(folders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    const sourceFileBlob = new Blob(["%PDF-1.4 full paper"], {
      type: "application/pdf"
    });
    const fetchMock = vi.fn().mockImplementation(async (input, init) => {
      if (input === "/api/mobile-upload/pending-uploads" && (!init || !("method" in init))) {
        return {
          ok: true,
          json: async () => ({
            pendingUploads: [],
            processedQuestionBankImports: [],
            processedFullPaperDrafts: [
              {
                id: "processed-full-paper-1",
                task: {
                  id: "task-full-processed-1",
                  deviceId: "android-full-processed-1",
                  uploadKind: "full_paper_pdf",
                  targetNodeId: targetFolder?.id,
                  targetNodePath: targetFolder?.path,
                  originalFileName: "suite.pdf",
                  normalizedFileName: "suite.pdf",
                  mimeType: "application/pdf",
                  status: "processing",
                  createdAt: "2026-06-04T08:03:00.000Z",
                  errorMessage: null
                },
                pendingDraft: {
                  id: "draft-full-1",
                  folderId: targetFolder?.id,
                  fileName: "suite.pdf",
                  sourceAssetId: "asset-source-1",
                  sourceDocumentId: "draft-full-1",
                  sourceUploadTaskId: "task-full-processed-1",
                  pageCount: 2,
                  answerSection: {
                    status: "suggested",
                    hasAnswerSection: true,
                    suggestedSplitPage: 2,
                    confirmedSplitPage: null
                  },
                  uploadedPdfPages: [
                    {
                      pageId: "uploaded-page-1",
                      pageNumber: 1,
                      width: 1200,
                      height: 1600,
                      reviewStatus: "unreviewed",
                      previewAssetId: "asset-preview-1"
                    },
                    {
                      pageId: "uploaded-page-2",
                      pageNumber: 2,
                      width: 1200,
                      height: 1600,
                      reviewStatus: "unreviewed",
                      previewAssetId: "asset-preview-2"
                    }
                  ]
                },
                binaryAssets: [
                  {
                    id: "asset-source-1",
                    documentId: "draft-full-1",
                    pageId: "draft-full-1",
                    kind: "source",
                    mimeType: "application/pdf",
                    byteLength: 8
                  },
                  {
                    id: "asset-preview-1",
                    documentId: "draft-full-1",
                    pageId: "uploaded-page-1",
                    kind: "display",
                    mimeType: "image/png",
                    byteLength: 128,
                    dataUrl: "compressed:data:image/png;base64,cGFnZS0x"
                  },
                  {
                    id: "asset-preview-2",
                    documentId: "draft-full-1",
                    pageId: "uploaded-page-2",
                    kind: "display",
                    mimeType: "image/png",
                    byteLength: 128,
                    dataUrl: "compressed:data:image/png;base64,cGFnZS0y"
                  }
                ],
                sourceFileUrl:
                  "/api/mobile-upload/pending-uploads/file?id=processed-full-paper-1"
              }
            ]
          })
        } as Response;
      }

      if (
        input === "/api/mobile-upload/pending-uploads/file?id=processed-full-paper-1"
      ) {
        return {
          ok: true,
          blob: async () => sourceFileBlob
        } as Response;
      }

      if (input === "/api/mobile-upload/pending-uploads" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "acknowledged",
            pendingUploadCount: 0
          })
        } as Response;
      }

      if (input === "/api/mobile-upload/workspace-sync") {
        return {
          ok: true,
          json: async () => ({
            status: "synced"
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().pendingUploadedFullPaperDraft).not.toBeNull();
    });

    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toMatchObject({
      id: "draft-full-1",
      folderId: targetFolder?.id,
      fileName: "suite.pdf",
      sourceUploadTaskId: "task-full-processed-1",
      pageCount: 2
    });
    expect(useQuestionStore.getState().binaryAssets).toEqual([
      expect.objectContaining({
        id: "asset-source-1",
        kind: "source",
        blob: sourceFileBlob
      }),
      expect.objectContaining({
        id: "asset-preview-1",
        kind: "display"
      }),
      expect.objectContaining({
        id: "asset-preview-2",
        kind: "display"
      })
    ]);
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-full-processed-1",
        deviceId: "android-full-processed-1",
        uploadKind: "full_paper_pdf",
        status: "processing"
      })
    ]);
    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "full",
      selectedFolderId: targetFolder?.id,
      selectedDocumentId: null
    });

    const acknowledgeCall = fetchMock.mock.calls.find(
      (call) =>
        call[0] === "/api/mobile-upload/pending-uploads" &&
        (call[1] as RequestInit | undefined)?.method === "POST"
    );

    expect(acknowledgeCall).toBeTruthy();
    expect(JSON.parse(String((acknowledgeCall?.[1] as RequestInit).body))).toEqual({
      processedFullPaperDraftId: "processed-full-paper-1",
      nextTaskStatus: "processing"
    });
  });

  it("syncs helper-applied lecture upload results into the local exam store outside the test environment", async () => {
    const folders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(folders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.depth === 3
    );
    const sourceFileBlob = new Blob(["%PDF-1.4 lecture"], {
      type: "application/pdf"
    });

    const fetchMock = vi.fn().mockImplementation(async (input, init) => {
      if (input === "/api/mobile-upload/pending-uploads" && (!init || !("method" in init))) {
        return {
          ok: true,
          json: async () => ({
            pendingUploads: [],
            processedQuestionBankImports: [],
            processedFullPaperDrafts: [],
            processedLectureUploads: [
              {
                id: "processed-lecture-upload-1",
                sourceFileUrl:
                  "/api/mobile-upload/pending-uploads/file?id=processed-lecture-upload-1",
                task: {
                  id: "task-archive-helper-1",
                  deviceId: "android-archive-helper-1",
                  uploadKind: "lecture_archive_pdf",
                  targetNodeId: `${targetFolder?.id}--archive--lecture`,
                  targetNodePath: [...(targetFolder?.path ?? []), "讲义归档"],
                  originalFileName: "camera-scan.pdf",
                  normalizedFileName: "王明_高二_26_06_04.pdf",
                  mimeType: "application/pdf",
                  status: "completed",
                  createdAt: "2026-06-04T09:00:00.000Z",
                  errorMessage: null
                },
                binaryAssets: [
                  {
                    id: "asset-archive-helper-1",
                    documentId: "archive-doc-helper-1",
                    pageId: "archive-doc-helper-1",
                    kind: "source",
                    mimeType: "application/pdf",
                    byteLength: 8192
                  }
                ]
              }
            ],
            examLibraryDocuments: [
              {
                id: "archive-doc-helper-1",
                folderId: `${targetFolder?.id}--archive--lecture`,
                library: "specialized",
                kind: "lecture",
                lectureVariant: "archive",
                title: "王明_高二_26_06_04",
                subjectScope: null,
                groupId: null,
                isDefault: false,
                sourceMode: "uploaded_pdf",
                syncBinding: "independent",
                syncStatus: "idle",
                numberingMode: "resequence",
                questionIds: [],
                rawPageAssetIds: ["asset-archive-helper-1"],
                placeholderAnswerPage: false,
                allowsQuestionMutations: false,
                sourceUploadTaskId: "task-archive-helper-1"
              }
            ],
            mobileUploadTasks: [
              {
                id: "task-archive-helper-1",
                deviceId: "android-archive-helper-1",
                uploadKind: "lecture_archive_pdf",
                targetNodeId: `${targetFolder?.id}--archive--lecture`,
                targetNodePath: [...(targetFolder?.path ?? []), "讲义归档"],
                originalFileName: "camera-scan.pdf",
                normalizedFileName: "王明_高二_26_06_04.pdf",
                mimeType: "application/pdf",
                status: "completed",
                createdAt: "2026-06-04T09:00:00.000Z",
                errorMessage: null
              }
            ]
          })
        } as Response;
      }

      if (
        input === "/api/mobile-upload/pending-uploads/file?id=processed-lecture-upload-1"
      ) {
        return {
          ok: true,
          blob: async () => sourceFileBlob
        } as Response;
      }

      if (input === "/api/mobile-upload/workspace-sync") {
        return {
          ok: true,
          json: async () => ({
            status: "synced"
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(
        useExamStore
          .getState()
          .examLibraryDocuments.some((document) => document.id === "archive-doc-helper-1")
      ).toBe(true);
    });

    expect(useExamStore.getState().examLibraryDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "archive-doc-helper-1",
          lectureVariant: "archive",
          sourceUploadTaskId: "task-archive-helper-1"
        })
      ])
    );
    expect(useExamStore.getState().mobileUploadTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-archive-helper-1",
          uploadKind: "lecture_archive_pdf",
          status: "completed"
        })
      ])
    );
    expect(useQuestionStore.getState().binaryAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "asset-archive-helper-1",
          documentId: "archive-doc-helper-1",
          kind: "source",
          mimeType: "application/pdf",
          blob: sourceFileBlob
        })
      ])
    );

    const acknowledgeCall = fetchMock.mock.calls.find(
      (call) =>
        call[0] === "/api/mobile-upload/pending-uploads" &&
        (call[1] as RequestInit | undefined)?.method === "POST" &&
        String((call[1] as RequestInit | undefined)?.body ?? "").includes(
          "processedLectureUploadId"
        )
    );

    expect(acknowledgeCall).toBeTruthy();
    expect(JSON.parse(String((acknowledgeCall?.[1] as RequestInit).body))).toEqual({
      processedLectureUploadId: "processed-lecture-upload-1",
      nextTaskStatus: "completed"
    });
  });

  it("consumes one helper pending full-paper upload outside the test environment", async () => {
    const folders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(folders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    const fetchMock = vi.fn().mockImplementation(async (input, init) => {
      if (input === "/api/mobile-upload/pending-uploads" && (!init || !("method" in init))) {
        return {
          ok: true,
          json: async () => ({
            pendingUploads: [
              {
                id: "pending-upload-full-1",
                taskId: "task-full-1",
                deviceId: "android-full-1",
                uploadKind: "full_paper_pdf",
                targetNodeId: targetFolder?.id,
                targetNodePath: targetFolder?.path,
                originalFileName: "suite.pdf",
                normalizedFileName: "suite.pdf",
                mimeType: "application/pdf",
                createdAt: "2026-06-04T08:02:00.000Z",
                byteLength: 8,
                base64Data: "JVBERi0xLjQ="
              }
            ]
          })
        } as Response;
      }

      if (input === "/api/mobile-upload/pending-uploads" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            status: "acknowledged",
            pendingUploadCount: 0
          })
        } as Response;
      }

      if (input === "/api/ai/suggest-answer-section") {
        return {
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 2
            }
          })
        } as Response;
      }

      if (input === "/api/mobile-upload/workspace-sync") {
        return {
          ok: true,
          json: async () => ({
            status: "synced"
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch call: ${String(input)}`);
    });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl)
      .mockResolvedValueOnce("compressed:data:image/png;base64,cGFnZS0x")
      .mockResolvedValueOnce("compressed:data:image/png;base64,cGFnZS0y");

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useExamStore.getState().pendingUploadedFullPaperDraft).not.toBeNull();
    });

    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toMatchObject({
      fileName: "suite.pdf",
      folderId: targetFolder?.id,
      sourceUploadTaskId: "task-full-1",
      pageCount: 2,
      answerSection: {
        status: "suggested",
        hasAnswerSection: true,
        suggestedSplitPage: 2,
        confirmedSplitPage: null
      }
    });
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-full-1",
        deviceId: "android-full-1",
        uploadKind: "full_paper_pdf",
        status: "processing"
      })
    ]);

    const acknowledgeCall = fetchMock.mock.calls.find(
      (call) =>
        call[0] === "/api/mobile-upload/pending-uploads" &&
        (call[1] as RequestInit | undefined)?.method === "POST"
    );

    expect(acknowledgeCall).toBeTruthy();
    expect(JSON.parse(String((acknowledgeCall?.[1] as RequestInit).body))).toEqual({
      pendingUploadId: "pending-upload-full-1",
      nextTaskStatus: "processing"
    });
  });

  it("waits for hydration before sending the first helper workspace sync outside the test environment", async () => {
    const hydratedSnapshot = {
      selectedPageId: null,
      documents: [],
      pages: [],
      folders: buildInitialFolderTree(),
      examLibraryFolders: buildInitialExamLibraryFolders(buildInitialFolderTree()),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      mobileUploadTasks: [
        {
          id: "task-hydrated-1",
          deviceId: "device-hydrated",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-folder-1--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-03T12:08:00.000Z"
        }
      ],
      pendingUploadedFullPaperDraft: null,
      binaryAssets: [],
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    };

    let resolveLoad: ((value: typeof hydratedSnapshot | null) => void) | null = null;
    const loadGate = new Promise<typeof hydratedSnapshot | null>((resolve) => {
      resolveLoad = resolve;
    });
    const loadSpy = vi
      .spyOn(IndexedDbWorkspaceSnapshotRepository.prototype, "load")
      .mockImplementation(() => loadGate);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "synced" })
    } as Response);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.find((call) => call[0] === "/api/mobile-upload/workspace-sync")
    ).toBeUndefined();

    await act(async () => {
      resolveLoad?.(hydratedSnapshot);
      await loadGate;
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const helperSyncCall = fetchMock.mock.calls.find(
      (call) => call[0] === "/api/mobile-upload/workspace-sync"
    );

    expect(helperSyncCall).toBeTruthy();
    expect(
      JSON.parse(String((helperSyncCall?.[1] as RequestInit | undefined)?.body ?? "{}"))
    ).toMatchObject({
      mobileUploadTasks: [
        {
          id: "task-hydrated-1",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          status: "queued"
        }
      ]
    });
  });

  it("waits for hydration before persisting the first workspace snapshot", async () => {
    const hydratedFolders = buildInitialFolderTree();
    const hydratedSnapshot = {
      selectedPageId: null,
      documents: [],
      pages: [],
      folders: hydratedFolders,
      examLibraryFolders: buildInitialExamLibraryFolders(hydratedFolders),
      examLibraryDocuments: [
        {
          id: "paper-specialized",
          folderId: "specialized-folder-1",
          library: "specialized",
          kind: "paper",
          title: "sample specialized paper",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-folder-1",
        selectedDocumentId: "paper-specialized"
      },
      mobileUploadTasks: [],
      pendingUploadedFullPaperDraft: null,
      binaryAssets: [],
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    };

    let resolveLoad: ((value: typeof hydratedSnapshot | null) => void) | null = null;
    const loadGate = new Promise<typeof hydratedSnapshot | null>((resolve) => {
      resolveLoad = resolve;
    });
    const loadSpy = vi
      .spyOn(IndexedDbWorkspaceSnapshotRepository.prototype, "load")
      .mockImplementation(() => loadGate);
    const saveSpy = vi
      .spyOn(IndexedDbWorkspaceSnapshotRepository.prototype, "save")
      .mockResolvedValue(undefined);

    render(createElement(WorkspaceHydrator));

    await act(async () => {
      await Promise.resolve();
    });

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveLoad?.(hydratedSnapshot);
      await loadGate;
    });

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalled();
    });

    expect(saveSpy.mock.calls).toContainEqual([
      expect.objectContaining({
        examLibraryDocuments: [
          expect.objectContaining({
            id: "paper-specialized",
            questionIds: ["q-1"]
          })
        ]
      })
    ]);
  });

  it("hydrates durable questions and papers from the local filesystem library before stale browser copies", async () => {
    const folders = buildInitialFolderTree();
    const browserSnapshot = {
      selectedPageId: "working-page",
      documents: [
        {
          id: "working-document",
          name: "working.pdf",
          kind: "pdf" as const,
          status: "pages_ready" as const,
          pageIds: ["working-page"]
        }
      ],
      pages: [
        {
          id: "working-page",
          documentId: "working-document",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          analysisStatus: "running" as const,
          reviewStatus: "unreviewed" as const
        }
      ],
      folders,
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      mobileUploadTasks: [],
      pendingUploadedFullPaperDraft: null,
      binaryAssets: [],
      questionDrafts: [
        {
          id: "stale-browser-question",
          documentId: "deleted-document",
          pageIds: ["deleted-page"],
          primaryPageId: "deleted-page",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "deleted-page": { x: 20, y: 30, width: 900, height: 300 }
          },
          status: "reviewed" as const,
          source: "ai" as const,
          confidence: 0.8,
          crossPageGroupId: null
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: "stale-browser-question",
      lastBulkConfirmation: null
    };
    const durablePage = {
      id: "durable-page",
      documentId: "archived-document",
      pageNumber: 2,
      width: 1000,
      height: 1400,
      displayAssetId: "durable-display",
      analysisStatus: "done" as const,
      reviewStatus: "reviewed" as const
    };
    const durableQuestion = {
      id: "durable-question",
      documentId: "archived-document",
      pageIds: ["durable-page"],
      primaryPageId: "durable-page",
      localOrder: 1,
      globalOrder: 1,
      bboxByPage: {
        "durable-page": { x: 30, y: 40, width: 880, height: 320 }
      },
      status: "reviewed" as const,
      source: "ai" as const,
      confidence: 0.98,
      crossPageGroupId: null,
      ocrText: "长期保留的题目"
    };
    const durablePaper = {
      id: "durable-paper",
      folderId: "specialized-root",
      library: "specialized" as const,
      kind: "paper" as const,
      title: "长期保留的专题卷",
      subjectScope: "高中物理" as const,
      groupId: "durable-group",
      isDefault: false,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "resequence" as const,
      questionIds: ["durable-question"],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    };
    vi.spyOn(IndexedDbWorkspaceSnapshotRepository.prototype, "load").mockResolvedValue(
      browserSnapshot
    );
    const fetchMock = vi.fn().mockImplementation(async (input, init?: RequestInit) => {
      if (input === "/api/local-library" && !init?.method) {
        return new Response(
          JSON.stringify({
            revision: 3,
            snapshot: {
              folders,
              pages: [durablePage],
              binaryAssets: [
                {
                  id: "durable-display",
                  documentId: "archived-document",
                  pageId: "durable-page",
                  kind: "display",
                  mimeType: "image/png",
                  byteLength: 32,
                  dataUrl: "/api/local-library/asset?id=durable-display"
                }
              ],
              questionDrafts: [durableQuestion],
              examLibraryFolders: buildInitialExamLibraryFolders(folders),
              examLibraryDocuments: [durablePaper],
              examWorkspaceDraft: {
                selectedLibrary: "specialized",
                selectedFolderId: "specialized-root",
                selectedDocumentId: "durable-paper"
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (input === "/api/local-library") {
        return new Response(JSON.stringify({ revision: 4 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/mobile-upload/pending-uploads") {
        return new Response(JSON.stringify({ pendingUploads: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ status: "synced" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toEqual([
        expect.objectContaining({ id: "durable-question", ocrText: "长期保留的题目" })
      ]);
    });

    expect(useFileStore.getState().documents).toEqual([
      expect.objectContaining({ id: "working-document" })
    ]);
    expect(useFileStore.getState().pages.map((page) => page.id)).toEqual([
      "working-page",
      "durable-page"
    ]);
    expect(useExamStore.getState().examLibraryDocuments).toEqual([
      expect.objectContaining({ id: "durable-paper", questionIds: ["durable-question"] })
    ]);
    expect(useQuestionStore.getState().binaryAssets).toEqual([
      expect.objectContaining({
        id: "durable-display",
        dataUrl: "/api/local-library/asset?id=durable-display"
      })
    ]);
  });

  it("migrates a complete IndexedDB question library to disk when the local library is empty", async () => {
    const folders = buildInitialFolderTree();
    await new IndexedDbWorkspaceSnapshotRepository().save({
      selectedPageId: null,
      documents: [],
      pages: [
        {
          id: "migration-page",
          documentId: "migration-document",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          displayAssetId: "migration-display",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      folders,
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      mobileUploadTasks: [],
      pendingUploadedFullPaperDraft: null,
      binaryAssets: [
        {
          id: "migration-display",
          documentId: "migration-document",
          pageId: "migration-page",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "data:image/png;base64,bWlncmF0aW9u"
        }
      ],
      questionDrafts: [
        {
          id: "migration-question",
          documentId: "migration-document",
          pageIds: ["migration-page"],
          primaryPageId: "migration-page",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "migration-page": { x: 30, y: 40, width: 880, height: 320 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.98,
          crossPageGroupId: null,
          ocrText: "待迁移题目"
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    });
    const localSaveBodies: Array<{ expectedRevision: number; snapshot: unknown }> = [];
    const fetchMock = vi.fn().mockImplementation(async (input, init?: RequestInit) => {
      if (input === "/api/local-library" && !init?.method) {
        return new Response(
          JSON.stringify({ revision: 0, snapshot: buildEmptyLocalLibrarySnapshot() }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (input === "/api/local-library" && init?.method === "POST") {
        localSaveBodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ revision: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (input === "/api/mobile-upload/pending-uploads") {
        return new Response(JSON.stringify({ pendingUploads: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ status: "synced" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(localSaveBodies).toHaveLength(1);
    });

    expect(localSaveBodies[0]).toMatchObject({
      expectedRevision: 0,
      snapshot: {
        pages: [expect.objectContaining({ id: "migration-page" })],
        binaryAssets: [
          expect.objectContaining({
            id: "migration-display",
            dataUrl: "data:image/png;base64,bWlncmF0aW9u"
          })
        ],
        questionDrafts: [
          expect.objectContaining({ id: "migration-question", ocrText: "待迁移题目" })
        ]
      }
    });
  });

  it("preserves saved questions, previews and papers when the obsolete cleanup marker is missing", async () => {
    const repository = new IndexedDbWorkspaceSnapshotRepository();
    const folders = buildInitialFolderTree();
    const customFolder = {
      id: "root-高中数学--custom--函数",
      parentId: "root-高中数学",
      name: "函数",
      kind: "custom" as const,
      subjectScope: "高中数学" as const,
      depth: 2,
      path: ["我的题库", "高中数学", "函数"]
    };

    window.localStorage.removeItem("teachhelper:workspace-content-cleanup:20260610");

    await repository.save({
      selectedPageId: "page-1",
      documents: [
        {
          id: "doc-1",
          name: "old-upload.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"]
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
      folders: folders.concat(customFolder),
      examLibraryFolders: buildInitialExamLibraryFolders(folders.concat(customFolder)),
      examLibraryDocuments: [
        {
          id: "paper-old",
          folderId: "specialized--root-高中数学--custom--函数",
          library: "specialized",
          kind: "paper",
          title: "函数专题卷",
          subjectScope: "高中数学",
          groupId: "group-old",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "uploaded-paper-old",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "old suite",
          subjectScope: null,
          groupId: "uploaded-group-old",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: [],
          rawPageAssetIds: ["asset-uploaded-full-source"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "uploaded-paper-old"
      },
      mobileUploadTasks: [
        {
          id: "task-old",
          deviceId: "android-old",
          uploadKind: "question_bank_pdf",
          targetNodeId: customFolder.id,
          targetNodePath: customFolder.path,
          originalFileName: "old-upload.pdf",
          normalizedFileName: "old-upload.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-10T08:00:00.000Z"
        }
      ],
      pendingUploadedFullPaperDraft: {
        id: "draft-old",
        folderId: "full-root",
        fileName: "old-suite.pdf",
        sourceAssetId: "asset-uploaded-full-source",
        sourceDocumentId: "draft-old",
        pageCount: 1,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        },
        uploadedPdfPages: [
          {
            pageId: "uploaded-page-old",
            pageNumber: 1,
            width: 1200,
            height: 1600,
            reviewStatus: "unreviewed",
            previewAssetId: "asset-uploaded-full-preview"
          }
        ]
      },
      binaryAssets: [
        {
          id: "asset-old-source",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        },
        {
          id: "asset-uploaded-full-source",
          documentId: "draft-old",
          pageId: "draft-old",
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
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: customFolder.path,
          directoryCandidatePaths: [],
          ocrText: "old question",
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [
        {
          id: "candidate-old",
          documentId: "doc-1",
          leftPageId: "page-1",
          rightPageId: "page-2",
          sourceQuestionIds: ["q-1"],
          confidence: 0.9,
          status: "suggested"
        }
      ],
      manualMergeQuestionIds: ["q-1"],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: {
        confirmationId: "bulk-old",
        documentId: "doc-1",
        confirmedCount: 1,
        undoSnapshots: []
      }
    });

    render(createElement(WorkspaceHydrator));

    await waitFor(() => {
      expect(useQuestionStore.getState().questionDrafts).toEqual([
        expect.objectContaining({ id: "q-1", ocrText: "old question" })
      ]);
    });

    expect(useFileStore.getState().pages).toEqual([
      expect.objectContaining({ id: "page-1", documentId: "doc-1" })
    ]);
    expect(useFileStore.getState().selectedPageId).toBe("page-1");
    expect(useQuestionStore.getState().binaryAssets).toEqual([
      expect.objectContaining({ id: "asset-old-source" }),
      expect.objectContaining({ id: "asset-uploaded-full-source" })
    ]);
    expect(useQuestionStore.getState().crossPageCandidates).toEqual([
      expect.objectContaining({ id: "candidate-old" })
    ]);
    expect(useQuestionStore.getState().manualMergeQuestionIds).toEqual(["q-1"]);
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-1");
    expect(useQuestionStore.getState().lastBulkConfirmation).toEqual(
      expect.objectContaining({ confirmationId: "bulk-old" })
    );
    expect(useFolderStore.getState().folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: customFolder.name,
          kind: customFolder.kind,
          subjectScope: customFolder.subjectScope,
          depth: customFolder.depth,
          path: customFolder.path
        })
      ])
    );
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      expect.objectContaining({ id: "task-old", status: "processing" })
    ]);
    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toEqual(
      expect.objectContaining({ id: "draft-old", sourceAssetId: "asset-uploaded-full-source" })
    );
    expect(useExamStore.getState().examLibraryDocuments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "paper-old", questionIds: ["q-1"] }),
        expect.objectContaining({
          id: "uploaded-paper-old",
          rawPageAssetIds: ["asset-uploaded-full-source"]
        })
      ])
    );
    expect(useExamStore.getState().examWorkspaceDraft).toEqual({
      selectedLibrary: "full",
      selectedFolderId: "full-root",
      selectedDocumentId: "uploaded-paper-old"
    });
  });
});
