import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";
import type {
  DocumentProcessingTask,
  DocumentTaskPriority,
  DocumentTaskStatus
} from "@/lib/services/document-task-service";

const STORE_VERSION = 1;
const TASK_STATUSES = new Set<DocumentTaskStatus>([
  "queued",
  "running",
  "pausing",
  "paused",
  "cancelling",
  "cancelled",
  "failed",
  "done"
]);
const TASK_PRIORITIES = new Set<DocumentTaskPriority>(["restored", "new"]);
const PROCESSING_STAGES = new Set([
  "question_boxes",
  "cross_page",
  "ocr",
  "answer_matching",
  "specialized_sync",
  "done"
]);

interface DocumentTaskStore {
  version: 1;
  revision: number;
  updatedAt: string;
  tasks: DocumentProcessingTask[];
}

interface RepositoryOptions {
  rootDirectory?: string;
}

export interface DocumentTaskPayload {
  revision: number;
  tasks: DocumentProcessingTask[];
}

const saveQueues = new Map<string, Promise<void>>();

export class DocumentTaskRevisionConflictError extends Error {
  readonly actualRevision: number;

  constructor(actualRevision: number) {
    super(`Document task revision conflict: current revision is ${actualRevision}`);
    this.name = "DocumentTaskRevisionConflictError";
    this.actualRevision = actualRevision;
  }
}

export class InvalidDocumentTaskStoreError extends Error {
  constructor() {
    super("Invalid document task store");
    this.name = "InvalidDocumentTaskStoreError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProcessingSummary(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return [
    "questionCount",
    "crossPageMergeCount",
    "classifiedQuestionCount",
    "autoMatchedAnswerCount",
    "pendingAnswerCount",
    "specializedDocumentCount"
  ].every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

export function isDocumentProcessingTask(value: unknown): value is DocumentProcessingTask {
  if (!isRecord(value) || !isRecord(value.progress) || !isRecord(value.checkpoint)) {
    return false;
  }

  const workflowInput = value.workflowInput;

  return (
    typeof value.id === "string" &&
    typeof value.runId === "string" &&
    typeof value.documentId === "string" &&
    typeof value.documentName === "string" &&
    TASK_STATUSES.has(value.status as DocumentTaskStatus) &&
    TASK_PRIORITIES.has(value.priority as DocumentTaskPriority) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    PROCESSING_STAGES.has(value.progress.stage as string) &&
    typeof value.progress.current === "number" &&
    Number.isFinite(value.progress.current) &&
    typeof value.progress.total === "number" &&
    Number.isFinite(value.progress.total) &&
    (value.progress.message === null || typeof value.progress.message === "string") &&
    (value.progress.summary === null || isProcessingSummary(value.progress.summary)) &&
    PROCESSING_STAGES.has(value.checkpoint.nextStage as string) &&
    isProcessingSummary(value.checkpoint.summary) &&
    isStringArray(value.completedPageIds) &&
    isStringArray(value.failedPageIds) &&
    (value.errorMessage === null || typeof value.errorMessage === "string") &&
    isRecord(workflowInput) &&
    (workflowInput.subjectScope === null || typeof workflowInput.subjectScope === "string") &&
    (workflowInput.questionPageLayoutMode === "single_column" ||
      workflowInput.questionPageLayoutMode === "double_column") &&
    typeof workflowInput.hasAnswerSection === "boolean" &&
    isStringArray(workflowInput.questionPageIds) &&
    isStringArray(workflowInput.answerPageIds)
  );
}

function parseStore(value: unknown): DocumentTaskStore {
  if (
    !isRecord(value) ||
    value.version !== STORE_VERSION ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    typeof value.updatedAt !== "string" ||
    !Array.isArray(value.tasks) ||
    !value.tasks.every(isDocumentProcessingTask)
  ) {
    throw new InvalidDocumentTaskStoreError();
  }

  return value as unknown as DocumentTaskStore;
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export class DocumentTaskFilesystemRepository {
  private readonly rootDirectory: string;
  private readonly storePath: string;

  constructor(options: RepositoryOptions = {}) {
    this.rootDirectory =
      options.rootDirectory ?? resolveTeachHelperStoragePaths().tasksDirectory;
    this.storePath = path.join(this.rootDirectory, "document-tasks.json");
  }

  private async readStore(): Promise<DocumentTaskStore | null> {
    if (!(await pathExists(this.storePath))) {
      return null;
    }

    try {
      return parseStore(JSON.parse(await readFile(this.storePath, "utf8")));
    } catch (error) {
      if (error instanceof InvalidDocumentTaskStoreError) {
        throw error;
      }
      throw new InvalidDocumentTaskStoreError();
    }
  }

  async load(): Promise<DocumentTaskPayload> {
    const store = await this.readStore();
    return store
      ? { revision: store.revision, tasks: store.tasks }
      : { revision: 0, tasks: [] };
  }

  async save(input: {
    expectedRevision: number;
    tasks: DocumentProcessingTask[];
  }): Promise<{ revision: number }> {
    if (!input.tasks.every(isDocumentProcessingTask)) {
      throw new InvalidDocumentTaskStoreError();
    }

    const previousQueue = saveQueues.get(this.rootDirectory) ?? Promise.resolve();
    let releaseQueue: () => void = () => undefined;
    const currentGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    saveQueues.set(this.rootDirectory, previousQueue.then(() => currentGate));
    await previousQueue;

    try {
      const currentStore = await this.readStore();
      const currentRevision = currentStore?.revision ?? 0;

      if (input.expectedRevision !== currentRevision) {
        throw new DocumentTaskRevisionConflictError(currentRevision);
      }

      const nextStore: DocumentTaskStore = {
        version: STORE_VERSION,
        revision: currentRevision + 1,
        updatedAt: new Date().toISOString(),
        tasks: input.tasks
      };

      await writeJsonAtomic(this.storePath, nextStore);
      return { revision: nextStore.revision };
    } finally {
      releaseQueue();
    }
  }
}
