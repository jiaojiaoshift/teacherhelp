import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

export type WorkflowEventName =
  | "workflow_stage"
  | "question_box_page"
  | "cross_page_pair"
  | "cross_page_summary"
  | "cross_page_review"
  | "specialized_sync";

export type WorkflowStage =
  | "question_boxes"
  | "cross_page"
  | "ocr"
  | "answer_matching"
  | "specialized_sync"
  | "done";

export interface WorkflowEventLogInput {
  runId: string;
  event: WorkflowEventName;
  stage: WorkflowStage;
  status: "running" | "done" | "failed";
  taskId?: string;
  documentId?: string;
  pageId?: string;
  pageNumber?: number;
  diagnosticId?: string;
  sequence?: number;
  total?: number;
  candidateCount?: number;
  filteredCount?: number;
  acceptedCount?: number;
  elapsedMs?: number;
  timestamp?: Date;
  logDirectory?: string;
}

function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().slice(0, 120).replace(/[^A-Za-z0-9_.:-]/g, "_");
  return normalized || fallback;
}

function safeNonNegativeInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : undefined;
}

export function resolveWorkflowEventLogDirectory(logDirectory?: string): string {
  return path.resolve(
    logDirectory?.trim() ||
      path.join(resolveTeachHelperStoragePaths().logsDirectory, "workflows")
  );
}

export async function appendWorkflowEventLog(input: WorkflowEventLogInput): Promise<string> {
  const timestamp = input.timestamp ?? new Date();
  const logDirectory = resolveWorkflowEventLogDirectory(input.logDirectory);
  const filePath = path.join(
    logDirectory,
    `teachhelper-workflows-${timestamp.toISOString().slice(0, 10)}.log`
  );
  const optionalCounts = {
    pageNumber: safeNonNegativeInteger(input.pageNumber),
    sequence: safeNonNegativeInteger(input.sequence),
    total: safeNonNegativeInteger(input.total),
    candidateCount: safeNonNegativeInteger(input.candidateCount),
    filteredCount: safeNonNegativeInteger(input.filteredCount),
    acceptedCount: safeNonNegativeInteger(input.acceptedCount),
    elapsedMs: safeNonNegativeInteger(input.elapsedMs)
  };
  const entry = {
    timestamp: timestamp.toISOString(),
    runId: safeIdentifier(input.runId, "workflow-unknown"),
    event: input.event,
    stage: input.stage,
    status: input.status,
    ...(input.taskId ? { taskId: safeIdentifier(input.taskId, "task-unknown") } : {}),
    ...(input.documentId
      ? { documentId: safeIdentifier(input.documentId, "document-unknown") }
      : {}),
    ...(input.pageId ? { pageId: safeIdentifier(input.pageId, "page-unknown") } : {}),
    ...(input.diagnosticId
      ? { diagnosticId: safeIdentifier(input.diagnosticId, "aierr-unknown") }
      : {}),
    ...Object.fromEntries(
      Object.entries(optionalCounts).filter(([, value]) => value !== undefined)
    )
  };

  await mkdir(logDirectory, { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");

  return filePath;
}
