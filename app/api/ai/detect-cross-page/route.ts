import { NextResponse } from "next/server";

import {
  getOpenAiCompatibleErrorDiagnostic,
  getOpenAiCompatibleErrorDiagnosticId,
  isOpenAiCompatibleGatewayEnabled,
  type OpenAiCompatibleErrorDiagnostic
} from "@/lib/ai/openai-compatible-gateway";
import { detectCrossPageWithCodex as detectCrossPageWithModel } from "@/lib/ai/teachhelper-codex-agent";
import type { PageTextLine } from "@/lib/domain/entities";
import { appendWorkflowEventLog } from "@/lib/server/workflow-event-log";

interface CrossPageQuestionCandidateInput {
  id: string;
  pageId: string;
  localOrder: number;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json()) as {
    workflowRunId?: string;
    taskId?: string;
    sequence?: number;
    total?: number;
    documentId?: string;
    leftPage?: string;
    rightPage?: string;
    leftImageDataUrl?: string | null;
    rightImageDataUrl?: string | null;
    leftTextLines?: PageTextLine[];
    rightTextLines?: PageTextLine[];
    candidates?: CrossPageQuestionCandidateInput[];
  };
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const hasModelProvider = isOpenAiCompatibleGatewayEnabled(process.env);
  let fallbackReason = hasModelProvider
    ? body.leftImageDataUrl && body.rightImageDataUrl
      ? "api_request_failed"
      : "api_page_images_missing"
    : "api_provider_not_selected";
  let failureDiagnostic: OpenAiCompatibleErrorDiagnostic | null = null;
  let failureDiagnosticId: string | null = null;
  const recordPairEvent = async (status: "done" | "failed", candidateCount: number) => {
    if (!body.workflowRunId) {
      return;
    }

    try {
      await appendWorkflowEventLog({
        runId: body.workflowRunId,
        taskId: body.taskId,
        documentId: body.documentId,
        pageId: body.leftPage,
        event: "cross_page_pair",
        stage: "cross_page",
        status,
        sequence: body.sequence,
        total: body.total,
        candidateCount,
        elapsedMs: Date.now() - startedAt,
        logDirectory: process.env.TEACHHELPER_WORKFLOW_LOG_DIR
      });
    } catch {
      // Diagnostics must never alter the AI response.
    }
  };

  if (hasModelProvider && body.leftImageDataUrl && body.rightImageDataUrl) {
    try {
      const mergeCandidates = await detectCrossPageWithModel({
        leftImageDataUrl: body.leftImageDataUrl,
        rightImageDataUrl: body.rightImageDataUrl,
        leftPageId: body.leftPage ?? "unknown-left-page",
        rightPageId: body.rightPage ?? "unknown-right-page",
        leftTextLines: body.leftTextLines,
        rightTextLines: body.rightTextLines,
        candidates
      });

      await recordPairEvent("done", mergeCandidates.length);

      return NextResponse.json({
        leftPage: body.leftPage ?? null,
        rightPage: body.rightPage ?? null,
        mergeCandidates: mergeCandidates.map((candidate) => ({
          id: candidate.id,
          documentId: body.documentId ?? "unknown-document",
          leftPageId: body.leftPage ?? "unknown-left-page",
          rightPageId: body.rightPage ?? "unknown-right-page",
          sourceQuestionIds: candidate.sourceQuestionIds,
          confidence: candidate.confidence,
          status: "suggested" as const
        })),
        source: {
          provider: "openai_compatible"
        }
      });
    } catch (error) {
      fallbackReason = "api_request_failed";
      failureDiagnostic = getOpenAiCompatibleErrorDiagnostic(error);
      failureDiagnosticId = getOpenAiCompatibleErrorDiagnosticId(error);
    }
  }

  await recordPairEvent("failed", 0);

  return NextResponse.json({
    leftPage: body.leftPage ?? null,
    rightPage: body.rightPage ?? null,
    source: {
      provider: "local_fallback",
      reason: fallbackReason,
      ...(failureDiagnosticId ? { diagnosticId: failureDiagnosticId } : {}),
      ...(failureDiagnostic ? { diagnostic: failureDiagnostic } : {})
    },
    mergeCandidates: []
  });
}

