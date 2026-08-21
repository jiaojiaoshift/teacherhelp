import type { DocumentProcessingTask } from "@/lib/services/document-task-service";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface DocumentTaskClientPayload {
  revision: number;
  tasks: DocumentProcessingTask[];
}

export class DocumentTaskClientConflictError extends Error {
  readonly actualRevision: number;

  constructor(actualRevision: number) {
    super(`Document task revision conflict: current revision is ${actualRevision}`);
    this.name = "DocumentTaskClientConflictError";
    this.actualRevision = actualRevision;
  }
}

function isDocumentTaskPayload(value: unknown): value is DocumentTaskClientPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<DocumentTaskClientPayload>;
  return (
    Number.isInteger(payload.revision) &&
    (payload.revision as number) >= 0 &&
    Array.isArray(payload.tasks)
  );
}

export async function loadDocumentTasks(
  fetchImpl: FetchLike = fetch
): Promise<DocumentTaskClientPayload> {
  const response = await fetchImpl("/api/document-tasks", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Document tasks could not be loaded");
  }

  const payload = (await response.json()) as unknown;

  if (!isDocumentTaskPayload(payload)) {
    throw new Error("Document task response is invalid");
  }

  return payload;
}

async function saveDocumentTasks(input: {
  expectedRevision: number;
  tasks: DocumentProcessingTask[];
  fetchImpl: FetchLike;
}) {
  const fetchImpl = input.fetchImpl;
  const response = await fetchImpl("/api/document-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedRevision: input.expectedRevision,
      tasks: input.tasks
    })
  });
  const body = (await response.json().catch(() => null)) as
    | { revision?: unknown; actualRevision?: unknown }
    | null;

  if (response.status === 409 && Number.isInteger(body?.actualRevision)) {
    throw new DocumentTaskClientConflictError(body?.actualRevision as number);
  }

  if (!response.ok || !Number.isInteger(body?.revision)) {
    throw new Error("Document tasks could not be saved");
  }

  return { revision: body?.revision as number };
}

export class DocumentTaskSaveQueue {
  private currentRevision: number;
  private saveChain: Promise<unknown> = Promise.resolve();
  private conflict: DocumentTaskClientConflictError | null = null;
  private readonly fetchImpl: FetchLike;
  private lastSavedFingerprint: string | null;

  constructor(input: {
    revision: number;
    initialTasks?: DocumentProcessingTask[];
    fetchImpl?: FetchLike;
  }) {
    this.currentRevision = input.revision;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.lastSavedFingerprint = input.initialTasks
      ? JSON.stringify(input.initialTasks)
      : null;
  }

  get revision() {
    return this.currentRevision;
  }

  get blocked() {
    return this.conflict !== null;
  }

  enqueue(tasks: DocumentProcessingTask[]): Promise<{ revision: number }> {
    if (this.conflict) {
      return Promise.reject(this.conflict);
    }

    const fingerprint = JSON.stringify(tasks);
    const operation = this.saveChain.then(async () => {
      if (this.conflict) {
        throw this.conflict;
      }

      if (fingerprint === this.lastSavedFingerprint) {
        return { revision: this.currentRevision };
      }

      try {
        const result = await saveDocumentTasks({
          expectedRevision: this.currentRevision,
          tasks,
          fetchImpl: this.fetchImpl
        });
        this.currentRevision = result.revision;
        this.lastSavedFingerprint = fingerprint;
        return result;
      } catch (error) {
        if (error instanceof DocumentTaskClientConflictError) {
          this.conflict = error;
        }
        throw error;
      }
    });

    this.saveChain = operation.catch(() => undefined);
    return operation;
  }
}
