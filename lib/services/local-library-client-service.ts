import type { WorkspaceSnapshot } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import type {
  LocalLibraryPayload,
  LocalLibrarySnapshot
} from "@/lib/services/local-library-contract";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type LocalLibrarySaveWaiter = {
  resolve: (result: { revision: number }) => void;
  reject: (error: unknown) => void;
};

type LocalLibraryPendingSave = {
  snapshot: LocalLibrarySnapshot;
  waiters: LocalLibrarySaveWaiter[];
};

function isBlob(value: Blob | null | undefined): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.arrayBuffer === "function" &&
    typeof value.size === "number"
  );
}

function buildMultipartLibraryRequest(input: {
  expectedRevision: number;
  snapshot: LocalLibrarySnapshot;
  blobAssets: Array<{ id: string; blob: Blob }>;
}) {
  const formData = new FormData();
  const snapshotWithoutBlobs: LocalLibrarySnapshot = {
    ...input.snapshot,
    binaryAssets: input.snapshot.binaryAssets.map(({ blob: _blob, dataUrl: _dataUrl, ...asset }) => asset)
  };

  formData.append("expectedRevision", String(input.expectedRevision));
  formData.append("snapshot", JSON.stringify(snapshotWithoutBlobs));

  input.blobAssets.forEach(({ id, blob }) => {
    formData.append(`asset:${id}`, blob, `${id}.bin`);
  });

  return formData;
}

export class LocalLibraryConflictError extends Error {
  readonly actualRevision: number;

  constructor(actualRevision: number) {
    super(`Local library revision conflict: current revision is ${actualRevision}`);
    this.name = "LocalLibraryConflictError";
    this.actualRevision = actualRevision;
  }
}

export class LocalLibrarySaveQueue {
  private currentRevision: number;
  private conflict: LocalLibraryConflictError | null = null;
  private readonly fetchImpl: FetchLike;
  private lastSavedSnapshot: LocalLibrarySnapshot | null;
  private saveInFlight = false;
  private pendingSave: LocalLibraryPendingSave | null = null;

  constructor(input: {
    revision: number;
    initialSnapshot?: LocalLibrarySnapshot;
    fetchImpl?: FetchLike;
  }) {
    this.currentRevision = input.revision;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.lastSavedSnapshot = input.initialSnapshot ?? null;
  }

  get revision() {
    return this.currentRevision;
  }

  get blocked() {
    return this.conflict !== null;
  }

  enqueue(snapshot: LocalLibrarySnapshot): Promise<{ revision: number }> {
    if (this.conflict) {
      return Promise.reject(this.conflict);
    }

    if (!this.saveInFlight && !this.pendingSave && snapshot === this.lastSavedSnapshot) {
      return Promise.resolve({ revision: this.currentRevision });
    }

    const operation = new Promise<{ revision: number }>((resolve, reject) => {
      if (this.pendingSave) {
        this.pendingSave.snapshot = snapshot;
        this.pendingSave.waiters.push({ resolve, reject });
      } else {
        this.pendingSave = {
          snapshot,
          waiters: [{ resolve, reject }]
        };
      }
    });

    this.startSaveLoop();
    return operation;
  }

  private startSaveLoop() {
    if (this.saveInFlight) {
      return;
    }

    this.saveInFlight = true;
    void this.drainSaveQueue();
  }

  private async drainSaveQueue() {
    try {
      while (this.pendingSave) {
        const currentSave = this.pendingSave;
        this.pendingSave = null;

        if (currentSave.snapshot === this.lastSavedSnapshot) {
          const result = { revision: this.currentRevision };
          currentSave.waiters.forEach((waiter) => waiter.resolve(result));
          continue;
        }

        try {
          const result = await saveLocalLibrary({
            expectedRevision: this.currentRevision,
            snapshot: currentSave.snapshot,
            fetchImpl: this.fetchImpl
          });
          this.currentRevision = result.revision;
          this.lastSavedSnapshot = currentSave.snapshot;
          currentSave.waiters.forEach((waiter) => waiter.resolve(result));
        } catch (error) {
          if (error instanceof LocalLibraryConflictError) {
            this.conflict = error;
          }
          currentSave.waiters.forEach((waiter) => waiter.reject(error));

          if (this.conflict) {
            this.rejectPendingSavesAfterConflict(this.conflict);
          }
        }
      }
    } finally {
      this.saveInFlight = false;
    }
  }

  private rejectPendingSavesAfterConflict(error: LocalLibraryConflictError) {
    const pendingSave = this.pendingSave;

    if (!pendingSave) {
      return;
    }

    pendingSave.waiters.forEach((waiter) => waiter.reject(error));
    this.pendingSave = null;
  }
}

function isLocalLibraryPayload(value: unknown): value is LocalLibraryPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<LocalLibraryPayload>;
  const snapshot = payload.snapshot as Partial<LocalLibrarySnapshot> | undefined;

  return (
    Number.isInteger(payload.revision) &&
    (payload.revision as number) >= 0 &&
    Boolean(snapshot) &&
    Array.isArray(snapshot?.folders) &&
    Array.isArray(snapshot?.pages) &&
    Array.isArray(snapshot?.binaryAssets) &&
    Array.isArray(snapshot?.questionDrafts) &&
    Array.isArray(snapshot?.examLibraryFolders) &&
    Array.isArray(snapshot?.examLibraryDocuments) &&
    Boolean(snapshot?.examWorkspaceDraft)
  );
}

function mergeEntitiesById<T extends { id: string }>(left: T[], right: T[]) {
  const merged = new Map(left.map((item) => [item.id, item]));
  right.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

export async function loadLocalLibrary(fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl("/api/local-library", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Local library could not be loaded");
  }

  const payload = (await response.json()) as unknown;

  if (!isLocalLibraryPayload(payload)) {
    throw new Error("Local library response is invalid");
  }

  return payload;
}

export async function saveLocalLibrary(input: {
  expectedRevision: number;
  snapshot: LocalLibrarySnapshot;
  fetchImpl?: FetchLike;
}) {
  const blobAssets = input.snapshot.binaryAssets.flatMap((asset) =>
    isBlob(asset.blob) ? [{ id: asset.id, blob: asset.blob }] : []
  );
  const requestBody = blobAssets.length
    ? buildMultipartLibraryRequest({
        expectedRevision: input.expectedRevision,
        snapshot: input.snapshot,
        blobAssets
      })
    : JSON.stringify({
        expectedRevision: input.expectedRevision,
        snapshot: input.snapshot
      });
  const response = await (input.fetchImpl ?? fetch)("/api/local-library", {
    method: "POST",
    ...(blobAssets.length ? {} : { headers: { "Content-Type": "application/json" } }),
    body: requestBody
  });
  const body = (await response.json().catch(() => null)) as
    | { revision?: unknown; error?: unknown; actualRevision?: unknown }
    | null;

  if (response.status === 409 && Number.isInteger(body?.actualRevision)) {
    throw new LocalLibraryConflictError(body?.actualRevision as number);
  }

  if (!response.ok || !Number.isInteger(body?.revision)) {
    throw new Error("Local library could not be saved");
  }

  return { revision: body?.revision as number };
}

export function mergeLocalLibraryIntoWorkspace(input: {
  workspaceSnapshot: WorkspaceSnapshot;
  localLibrary: LocalLibraryPayload;
}): WorkspaceSnapshot {
  if (input.localLibrary.revision === 0) {
    return input.workspaceSnapshot;
  }

  const local = input.localLibrary.snapshot;
  const activeDocumentIds = new Set(
    input.workspaceSnapshot.documents.map((document) => document.id)
  );
  const activePages = input.workspaceSnapshot.pages.filter((page) =>
    activeDocumentIds.has(page.documentId)
  );
  const activePageIds = new Set(activePages.map((page) => page.id));
  const activeAssets = input.workspaceSnapshot.binaryAssets.filter(
    (asset) =>
      activeDocumentIds.has(asset.documentId) ||
      activePageIds.has(asset.pageId) ||
      asset.kind === "source"
  );
  const localQuestionIds = new Set(local.questionDrafts.map((question) => question.id));

  return {
    ...input.workspaceSnapshot,
    pages: mergeEntitiesById(activePages, local.pages),
    folders: local.folders,
    examLibraryFolders: local.examLibraryFolders,
    examLibraryDocuments: local.examLibraryDocuments,
    examWorkspaceDraft: local.examWorkspaceDraft,
    binaryAssets: mergeEntitiesById(local.binaryAssets, activeAssets),
    questionDrafts: local.questionDrafts,
    crossPageCandidates: input.workspaceSnapshot.crossPageCandidates.filter((candidate) =>
      candidate.sourceQuestionIds.every((questionId) => localQuestionIds.has(questionId))
    ),
    manualMergeQuestionIds: input.workspaceSnapshot.manualMergeQuestionIds.filter((questionId) =>
      localQuestionIds.has(questionId)
    ),
    selectedQuestionId: localQuestionIds.has(input.workspaceSnapshot.selectedQuestionId ?? "")
      ? input.workspaceSnapshot.selectedQuestionId
      : null,
    lastBulkConfirmation:
      input.workspaceSnapshot.lastBulkConfirmation?.undoSnapshots.every((snapshot) =>
        localQuestionIds.has(snapshot.id)
      )
        ? input.workspaceSnapshot.lastBulkConfirmation
        : null
  };
}
