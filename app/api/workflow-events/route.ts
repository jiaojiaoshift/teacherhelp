import { NextResponse } from "next/server";

import {
  appendWorkflowEventLog,
  type WorkflowEventLogInput,
  type WorkflowEventName,
  type WorkflowStage
} from "@/lib/server/workflow-event-log";

const WORKFLOW_EVENTS = new Set<WorkflowEventName>([
  "workflow_stage",
  "question_box_page",
  "cross_page_pair",
  "cross_page_summary",
  "cross_page_review",
  "specialized_sync"
]);
const WORKFLOW_STAGES = new Set<WorkflowStage>([
  "question_boxes",
  "cross_page",
  "ocr",
  "answer_matching",
  "specialized_sync",
  "done"
]);
const WORKFLOW_STATUSES = new Set<WorkflowEventLogInput["status"]>([
  "running",
  "done",
  "failed"
]);

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  if (
    !body ||
    typeof body.runId !== "string" ||
    !WORKFLOW_EVENTS.has(body.event as WorkflowEventName) ||
    !WORKFLOW_STAGES.has(body.stage as WorkflowStage) ||
    !WORKFLOW_STATUSES.has(body.status as WorkflowEventLogInput["status"])
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await appendWorkflowEventLog({
      runId: body.runId,
      taskId: optionalString(body.taskId),
      documentId: optionalString(body.documentId),
      pageId: optionalString(body.pageId),
      pageNumber: optionalNumber(body.pageNumber),
      diagnosticId: optionalString(body.diagnosticId),
      event: body.event as WorkflowEventName,
      stage: body.stage as WorkflowStage,
      status: body.status as WorkflowEventLogInput["status"],
      sequence: optionalNumber(body.sequence),
      total: optionalNumber(body.total),
      candidateCount: optionalNumber(body.candidateCount),
      filteredCount: optionalNumber(body.filteredCount),
      acceptedCount: optionalNumber(body.acceptedCount),
      elapsedMs: optionalNumber(body.elapsedMs),
      logDirectory: process.env.TEACHHELPER_WORKFLOW_LOG_DIR
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
