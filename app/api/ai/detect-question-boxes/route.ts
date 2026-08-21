import { NextResponse } from "next/server";

import {
  getOpenAiCompatibleErrorDiagnostic,
  getOpenAiCompatibleErrorDiagnosticId,
  isOpenAiCompatibleGatewayEnabled,
  type OpenAiCompatibleErrorDiagnostic
} from "@/lib/ai/openai-compatible-gateway";
import { detectQuestionBoxesWithTextLayout as detectQuestionBoxesWithModel } from "@/lib/ai/teachhelper-codex-agent";
import { buildQuestionBoxPrompt } from "@/lib/ai/teachhelper-ai-prompts";
import type { PageTextLine, QuestionPageLayoutMode } from "@/lib/domain/entities";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    subjectScope?: string;
    pageId?: string;
    imageDataUrl?: string | null;
    textLines?: PageTextLine[];
    questionPageLayoutMode?: QuestionPageLayoutMode;
  };

  const hasModelProvider = isOpenAiCompatibleGatewayEnabled(process.env);
  let fallbackReason = hasModelProvider
    ? body.imageDataUrl
      ? "api_request_failed"
      : "api_page_image_missing"
    : "api_provider_not_selected";
  let failureDiagnostic: OpenAiCompatibleErrorDiagnostic | null = null;
  let failureDiagnosticId: string | null = null;

  if (hasModelProvider && body.imageDataUrl) {
    try {
      const result = await detectQuestionBoxesWithModel({
        imageDataUrl: body.imageDataUrl,
        subjectScope: body.subjectScope,
        textLines: body.textLines,
        questionPageLayoutMode: body.questionPageLayoutMode
      });

      return NextResponse.json({
        pageId: body.pageId ?? null,
        prompt: buildQuestionBoxPrompt(
          body.subjectScope,
          result.textLines,
          body.questionPageLayoutMode
        ),
        mode: "ocr_guided_geometry",
        detections: result.detections,
        textLines: result.textLines,
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

  return NextResponse.json({
    pageId: body.pageId ?? null,
    prompt: buildQuestionBoxPrompt(
      body.subjectScope,
      body.textLines,
      body.questionPageLayoutMode
    ),
    mode: "ocr_guided_geometry",
    source: {
      provider: "local_fallback",
      reason: fallbackReason,
      ...(failureDiagnosticId ? { diagnosticId: failureDiagnosticId } : {}),
      ...(failureDiagnostic ? { diagnostic: failureDiagnostic } : {})
    },
    detections: []
  });
}

