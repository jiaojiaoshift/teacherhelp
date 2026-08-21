import { describe, expect, it, vi } from "vitest";

import type { WorkspaceSnapshot } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import type {
  LocalLibraryPayload,
  LocalLibrarySnapshot
} from "@/lib/services/local-library-contract";
import {
  LocalLibraryConflictError,
  LocalLibrarySaveQueue,
  loadLocalLibrary,
  mergeLocalLibraryIntoWorkspace,
  saveLocalLibrary
} from "@/lib/services/local-library-client-service";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

function buildWorkspaceSnapshot(): WorkspaceSnapshot {
  const folders = buildInitialFolderTree();

  return {
    selectedPageId: "working-page",
    documents: [
      {
        id: "working-document",
        name: "working.pdf",
        kind: "pdf",
        status: "pages_ready",
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
        analysisStatus: "running",
        reviewStatus: "unreviewed"
      },
      {
        id: "orphan-old-page",
        documentId: "deleted-document",
        pageNumber: 1,
        width: 1000,
        height: 1400,
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }
    ],
    folders,
    examLibraryFolders: buildInitialExamLibraryFolders(folders),
    examLibraryDocuments: [
      {
        id: "stale-paper",
        folderId: "specialized-root",
        library: "specialized",
        kind: "paper",
        title: "旧索引",
        subjectScope: "高中物理",
        groupId: "stale-group",
        isDefault: false,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["stale-question"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      }
    ],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
    mobileUploadTasks: [],
    pendingUploadedFullPaperDraft: null,
    binaryAssets: [
      {
        id: "working-source",
        documentId: "working-document",
        pageId: "working-document",
        kind: "source",
        mimeType: "application/pdf",
        byteLength: 100,
        dataUrl: "data:application/pdf;base64,d29ya2luZw=="
      }
    ],
    questionDrafts: [
      {
        id: "stale-question",
        documentId: "deleted-document",
        pageIds: ["orphan-old-page"],
        primaryPageId: "orphan-old-page",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "orphan-old-page": { x: 20, y: 20, width: 900, height: 300 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null
      }
    ],
    crossPageCandidates: [],
    manualMergeQuestionIds: [],
    selectedQuestionId: "stale-question",
    lastBulkConfirmation: null
  };
}

function buildLocalPayload(): LocalLibraryPayload {
  const folders = buildInitialFolderTree();
  const libraryPage = {
    id: "library-page",
    documentId: "archived-document",
    pageNumber: 2,
    width: 1000,
    height: 1400,
    displayAssetId: "library-display",
    analysisStatus: "done" as const,
    reviewStatus: "reviewed" as const
  };

  return {
    revision: 4,
    snapshot: {
      folders,
      pages: [libraryPage],
      binaryAssets: [
        {
          id: "library-display",
          documentId: "archived-document",
          pageId: "library-page",
          kind: "display",
          mimeType: "image/png",
          byteLength: 100,
          dataUrl: "/api/local-library/asset?id=library-display"
        }
      ],
      questionDrafts: [
        {
          id: "library-question",
          documentId: "archived-document",
          pageIds: ["library-page"],
          primaryPageId: "library-page",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "library-page": { x: 20, y: 30, width: 900, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.98,
          crossPageGroupId: null,
          ocrText: "磁盘题目"
        }
      ],
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [
        {
          id: "library-paper",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "磁盘专题卷",
          subjectScope: "高中物理",
          groupId: "library-group",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["library-question"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-root",
        selectedDocumentId: "library-paper"
      }
    }
  };
}

describe("local library client service", () => {
  it("loads and validates a local library payload", async () => {
    const payload = buildLocalPayload();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(loadLocalLibrary(fetchImpl)).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith("/api/local-library", {
      cache: "no-store"
    });
  });

  it("uses disk questions and papers while preserving the active upload workspace", () => {
    const merged = mergeLocalLibraryIntoWorkspace({
      workspaceSnapshot: buildWorkspaceSnapshot(),
      localLibrary: buildLocalPayload()
    });

    expect(merged.documents.map((document) => document.id)).toEqual(["working-document"]);
    expect(merged.pages.map((page) => page.id)).toEqual(["working-page", "library-page"]);
    expect(merged.questionDrafts.map((question) => question.id)).toEqual([
      "library-question"
    ]);
    expect(merged.examLibraryDocuments.map((document) => document.id)).toEqual([
      "library-paper"
    ]);
    expect(merged.binaryAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "working-source" }),
        expect.objectContaining({ id: "library-display" })
      ])
    );
    expect(merged.selectedQuestionId).toBeNull();
  });

  it("preserves an inline display asset for an active page over its disk URL", () => {
    const workspaceSnapshot = buildWorkspaceSnapshot();
    const localLibrary = buildLocalPayload();
    const inlineDisplayAsset = {
      id: "working-display",
      documentId: "working-document",
      pageId: "working-page",
      kind: "display" as const,
      mimeType: "image/jpeg",
      byteLength: 120,
      dataUrl: "data:image/jpeg;base64,d29ya2luZy1wYWdl"
    };

    workspaceSnapshot.pages[0] = {
      ...workspaceSnapshot.pages[0],
      displayAssetId: inlineDisplayAsset.id
    };
    workspaceSnapshot.binaryAssets.push(inlineDisplayAsset);
    localLibrary.snapshot.pages.push({
      ...workspaceSnapshot.pages[0],
      analysisStatus: "done",
      reviewStatus: "reviewed"
    });
    localLibrary.snapshot.binaryAssets.push({
      ...inlineDisplayAsset,
      dataUrl: "/api/local-library/asset?id=working-display"
    });

    const merged = mergeLocalLibraryIntoWorkspace({ workspaceSnapshot, localLibrary });

    expect(merged.binaryAssets.find((asset) => asset.id === inlineDisplayAsset.id)?.dataUrl).toBe(
      inlineDisplayAsset.dataUrl
    );
  });

  it("does not apply an uninitialized revision zero library", () => {
    const workspaceSnapshot = buildWorkspaceSnapshot();
    const localLibrary = buildLocalPayload();
    localLibrary.revision = 0;
    localLibrary.snapshot.questionDrafts = [];

    expect(
      mergeLocalLibraryIntoWorkspace({ workspaceSnapshot, localLibrary })
    ).toBe(workspaceSnapshot);
  });

  it("reports a stale save as a typed conflict", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "revision_conflict", actualRevision: 7 }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      saveLocalLibrary({
        expectedRevision: 4,
        snapshot: buildLocalPayload().snapshot,
        fetchImpl
      })
    ).rejects.toEqual(expect.objectContaining<Partial<LocalLibraryConflictError>>({
      name: "LocalLibraryConflictError",
      actualRevision: 7
    }));
  });

  it("sends Blob-backed assets as multipart files instead of JSON objects", async () => {
    const snapshot = buildLocalPayload().snapshot;
    const sourceBlob = new Blob([new Uint8Array([37, 80, 68, 70])], {
      type: "application/pdf"
    });
    snapshot.binaryAssets.push({
      id: "uploaded-source",
      documentId: "uploaded-document",
      pageId: "uploaded-document",
      kind: "source",
      mimeType: "application/pdf",
      byteLength: sourceBlob.size,
      blob: sourceBlob
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ revision: 8 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(
      saveLocalLibrary({ expectedRevision: 7, snapshot, fetchImpl })
    ).resolves.toEqual({ revision: 8 });

    const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(requestInit.headers).toBeUndefined();
    expect(requestInit.body).toBeInstanceOf(FormData);
    const formData = requestInit.body as FormData;
    expect(String(formData.get("snapshot"))).not.toContain('"blob"');
    expect(formData.get("asset:uploaded-source")).toBeInstanceOf(Blob);
  });

  it("serializes queued saves and advances the expected revision after each commit", async () => {
    let resolveFirstSave: ((response: Response) => void) | null = null;
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve;
    });
    const expectedRevisions: number[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_input, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { expectedRevision: number };
      expectedRevisions.push(body.expectedRevision);

      if (expectedRevisions.length === 1) {
        return firstSave;
      }

      return new Response(JSON.stringify({ revision: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    const queue = new LocalLibrarySaveQueue({ revision: 5, fetchImpl });
    const secondSnapshot = buildLocalPayload().snapshot;
    secondSnapshot.examWorkspaceDraft = {
      ...secondSnapshot.examWorkspaceDraft,
      selectedDocumentId: null
    };

    const firstResult = queue.enqueue(buildLocalPayload().snapshot);
    const secondResult = queue.enqueue(secondSnapshot);
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveFirstSave?.(
      new Response(JSON.stringify({ revision: 6 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(firstResult).resolves.toEqual({ revision: 6 });
    await expect(secondResult).resolves.toEqual({ revision: 7 });
    expect(expectedRevisions).toEqual([5, 6]);
    expect(queue.revision).toBe(7);
  });

  it("coalesces stale queued snapshots while one save is in flight", async () => {
    let resolveFirstSave: ((response: Response) => void) | null = null;
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve;
    });
    const savedDocumentIds: Array<string | null> = [];
    const fetchImpl = vi.fn().mockImplementation(async (_input, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        snapshot: LocalLibrarySnapshot;
      };
      savedDocumentIds.push(body.snapshot.examWorkspaceDraft.selectedDocumentId);

      if (savedDocumentIds.length === 1) {
        return firstSave;
      }

      return new Response(JSON.stringify({ revision: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    const queue = new LocalLibrarySaveQueue({ revision: 5, fetchImpl });
    const firstSnapshot = buildLocalPayload().snapshot;
    const staleSnapshot = buildLocalPayload().snapshot;
    const latestSnapshot = buildLocalPayload().snapshot;
    firstSnapshot.examWorkspaceDraft.selectedDocumentId = "first";
    staleSnapshot.examWorkspaceDraft.selectedDocumentId = "stale";
    latestSnapshot.examWorkspaceDraft.selectedDocumentId = "latest";

    const firstResult = queue.enqueue(firstSnapshot);
    const staleResult = queue.enqueue(staleSnapshot);
    const latestResult = queue.enqueue(latestSnapshot);
    await Promise.resolve();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolveFirstSave?.(
      new Response(JSON.stringify({ revision: 6 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(firstResult).resolves.toEqual({ revision: 6 });
    await expect(staleResult).resolves.toEqual({ revision: 7 });
    await expect(latestResult).resolves.toEqual({ revision: 7 });
    expect(savedDocumentIds).toEqual(["first", "latest"]);
  });

  it("does not save again when the queued snapshot already matches the loaded library", async () => {
    const snapshot = buildLocalPayload().snapshot;
    const fetchImpl = vi.fn();
    const queue = new LocalLibrarySaveQueue({
      revision: 5,
      initialSnapshot: snapshot,
      fetchImpl
    });

    await expect(queue.enqueue(snapshot)).resolves.toEqual({ revision: 5 });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queue.revision).toBe(5);
  });

  it("allows an unchanged failed snapshot to be retried", async () => {
    const snapshot = buildLocalPayload().snapshot;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "write_failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ revision: 6 }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    const queue = new LocalLibrarySaveQueue({ revision: 5, fetchImpl });

    await expect(queue.enqueue(snapshot)).rejects.toThrow("Local library could not be saved");
    await expect(queue.enqueue(snapshot)).resolves.toEqual({ revision: 6 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("blocks later queued saves after a revision conflict", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "revision_conflict", actualRevision: 9 }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      })
    );
    const queue = new LocalLibrarySaveQueue({ revision: 4, fetchImpl });

    await expect(queue.enqueue(buildLocalPayload().snapshot)).rejects.toBeInstanceOf(
      LocalLibraryConflictError
    );
    await expect(queue.enqueue(buildLocalPayload().snapshot)).rejects.toBeInstanceOf(
      LocalLibraryConflictError
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(queue.blocked).toBe(true);
  });
});
