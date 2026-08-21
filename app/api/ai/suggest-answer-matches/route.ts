import { NextResponse } from "next/server";

import { isOpenAiCompatibleGatewayEnabled } from "@/lib/ai/openai-compatible-gateway";
import { suggestAnswerMatchesWithCodex as suggestAnswerMatchesWithModel } from "@/lib/ai/teachhelper-codex-agent";
import { buildAnswerMatchPrompt } from "@/lib/ai/teachhelper-ai-prompts";
import { normalizeQuestionNumberLabel } from "@/lib/services/answer-match-service";

interface AnswerMatchQuestionInput {
  id: string;
  globalOrder: number;
  questionNumberLabel?: string | null;
}

interface AnswerMatchPageInput {
  pageId: string;
  pageNumber: number;
  imageDataUrl?: string | null;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    questions?: AnswerMatchQuestionInput[];
    answerPages?: AnswerMatchPageInput[];
  };

  const answerPages = (body.answerPages ?? []).filter(
    (page): page is AnswerMatchPageInput & { imageDataUrl: string } => Boolean(page.imageDataUrl)
  );
  const questions = (body.questions ?? []).slice().sort((left, right) => left.globalOrder - right.globalOrder);
  const questionLabels = questions
    .map((question) => normalizeQuestionNumberLabel(question.questionNumberLabel))
    .filter(Boolean);
  const hasModelProvider = isOpenAiCompatibleGatewayEnabled(process.env);
  let fallbackReason = hasModelProvider
    ? answerPages.length > 0
      ? "api_request_failed"
      : "api_answer_images_missing"
    : "api_provider_not_selected";

  if (hasModelProvider && answerPages.length > 0) {
    try {
      const detectedAnswers = await suggestAnswerMatchesWithModel({
        answerPages: answerPages.map((page) => ({
          pageId: page.pageId,
          pageNumber: page.pageNumber,
          imageDataUrl: page.imageDataUrl
        })),
        questionLabels
      });

      return NextResponse.json({
        documentId: body.documentId ?? null,
        prompt: buildAnswerMatchPrompt({
          answerPages: answerPages.map((page) => ({
            pageId: page.pageId,
            pageNumber: page.pageNumber
          })),
          questionLabels
        }),
        detectedAnswers,
        source: {
          provider: "openai_compatible"
        }
      });
    } catch {
      fallbackReason = "api_request_failed";
    }
  }

  return NextResponse.json({
    documentId: body.documentId ?? null,
    prompt: buildAnswerMatchPrompt({
      answerPages: answerPages.map((page) => ({
        pageId: page.pageId,
        pageNumber: page.pageNumber
      })),
      questionLabels
    }),
    source: {
      provider: "local_fallback",
      reason: fallbackReason
    },
    detectedAnswers: answerPages.map((page, index) => ({
      id: `${page.pageId}-answer-1`,
      pageId: page.pageId,
      pageNumber: page.pageNumber,
      answerLabel: questionLabels[index] ?? String(index + 1),
      confidence: 0.76,
      normalizedBBox: {
        x1: 120,
        y1: 160,
        x2: 920,
        y2: 420
      }
    }))
  });
}

