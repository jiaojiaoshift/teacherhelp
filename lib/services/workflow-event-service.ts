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

export interface WorkflowEventPayload {
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
}

type WorkflowEventFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Pick<Response, "ok">>;

export function createWorkflowRunId(
  now = new Date(),
  createRandomId: () => string = () =>
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)
): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");

  return `workflow-${timestamp}-${createRandomId()}`;
}

export async function recordWorkflowEvent(
  input: WorkflowEventPayload,
  fetcher: WorkflowEventFetcher = fetch
): Promise<void> {
  const optionalFields = {
    taskId: input.taskId,
    documentId: input.documentId,
    pageId: input.pageId,
    pageNumber: input.pageNumber,
    diagnosticId: input.diagnosticId,
    sequence: input.sequence,
    total: input.total,
    candidateCount: input.candidateCount,
    filteredCount: input.filteredCount,
    acceptedCount: input.acceptedCount,
    elapsedMs: input.elapsedMs
  };
  const body = {
    runId: input.runId,
    event: input.event,
    stage: input.stage,
    status: input.status,
    ...Object.fromEntries(
      Object.entries(optionalFields).filter(([, value]) => value !== undefined)
    )
  };

  try {
    await fetcher("/api/workflow-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      keepalive: true
    });
  } catch {
    // Diagnostics must never interrupt the document workflow.
  }
}
