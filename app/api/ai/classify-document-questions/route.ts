import { NextResponse } from "next/server";

import {
  getOpenAiCompatibleErrorDiagnostic,
  getOpenAiCompatibleErrorDiagnosticId,
  isOpenAiCompatibleGatewayEnabled,
  type OpenAiCompatibleErrorDiagnostic
} from "@/lib/ai/openai-compatible-gateway";
import { classifyDocumentQuestionsWithCodex as classifyDocumentQuestionsWithModel } from "@/lib/ai/teachhelper-codex-agent";
import { buildClassificationRun } from "@/lib/services/analysis-service";

type ClassificationFallbackReason =
  | "api_provider_not_selected"
  | "api_reviewed_images_missing"
  | "api_request_failed";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId: string;
    subjectScope?: string | null;
    directoryPaths?: string[][];
    pages: Array<{
      id: string;
      reviewStatus: "reviewed" | "unreviewed";
      imageDataUrl?: string | null;
      questionIds: string[];
      questionRegions?: Array<{
        questionId: string;
        isPrimary: boolean;
        normalizedBBox: { x1: number; y1: number; x2: number; y2: number };
      }>;
    }>;
  };

  const hasModelProvider = isOpenAiCompatibleGatewayEnabled(process.env);
  let fallbackReason: ClassificationFallbackReason = hasModelProvider
    ? "api_reviewed_images_missing"
    : "api_provider_not_selected";
  let failureDiagnostic: OpenAiCompatibleErrorDiagnostic | null = null;
  let failureDiagnosticId: string | null = null;

  if (hasModelProvider) {
    const reviewedPagesWithImages = body.pages.filter(
      (page) => page.reviewStatus === "reviewed" && page.imageDataUrl
    );

    if (reviewedPagesWithImages.length > 0) {
      try {
        const results = await classifyDocumentQuestionsWithModel({
          directoryPaths: body.directoryPaths ?? [],
          subjectScope: body.subjectScope ?? undefined,
          pages: reviewedPagesWithImages
        });

        return NextResponse.json({
          documentId: body.documentId,
          questionIds: reviewedPagesWithImages.flatMap((page) => page.questionIds),
          results,
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
  }

  return NextResponse.json({
    ...buildClassificationRun(body),
    source: {
      provider: "local_fallback",
      reason: fallbackReason,
      ...(failureDiagnosticId ? { diagnosticId: failureDiagnosticId } : {}),
      ...(failureDiagnostic ? { diagnostic: failureDiagnostic } : {})
    }
  });
}

