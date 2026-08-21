import { NextResponse } from "next/server";

import { isOpenAiCompatibleGatewayEnabled } from "@/lib/ai/openai-compatible-gateway";
import { suggestAnswerSectionWithCodex as suggestAnswerSectionWithModel } from "@/lib/ai/teachhelper-codex-agent";
import { buildAnswerSectionPrompt } from "@/lib/ai/teachhelper-ai-prompts";
import {
  MAX_ANSWER_SECTION_SAMPLE_PAGES,
  validatePdfPageCount
} from "@/lib/services/upload-capacity";

export async function POST(request: Request) {
  let body: {
    documentId?: string;
    pageCount?: number;
    pageImageDataUrls?: string[];
    sampledPageNumbers?: number[];
  };

  try {
    body = (await request.json()) as {
      documentId?: string;
      pageCount?: number;
      pageImageDataUrls?: string[];
      sampledPageNumbers?: number[];
    };
  } catch {
    return NextResponse.json(
      { errorMessage: "答案页识别请求格式无效" },
      { status: 400 }
    );
  }

  const pageCount = body.pageCount ?? 0;
  const pageImageDataUrls = body.pageImageDataUrls ?? [];
  const sampledPageNumbers = body.sampledPageNumbers ?? [];
  const hasPageImageField = body.pageImageDataUrls !== undefined;
  const hasSampledPageField = body.sampledPageNumbers !== undefined;
  const pageCountValidation = validatePdfPageCount(pageCount);

  if (!pageCountValidation.ok) {
    return NextResponse.json(
      { errorMessage: pageCountValidation.message, code: pageCountValidation.code },
      { status: 413 }
    );
  }

  if (
    (hasPageImageField && !Array.isArray(body.pageImageDataUrls)) ||
    (hasSampledPageField && !Array.isArray(body.sampledPageNumbers)) ||
    pageImageDataUrls.length > MAX_ANSWER_SECTION_SAMPLE_PAGES ||
    (hasSampledPageField && sampledPageNumbers.length > 0 &&
      sampledPageNumbers.length !== pageImageDataUrls.length) ||
    (hasSampledPageField && sampledPageNumbers.some(
      (pageNumber) =>
        !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount
    ))
  ) {
    return NextResponse.json(
      {
        errorMessage: `答案页识别最多支持 ${MAX_ANSWER_SECTION_SAMPLE_PAGES} 张代表页`,
        code: "too_many_answer_samples"
      },
      { status: 413 }
    );
  }

  if (
    isOpenAiCompatibleGatewayEnabled(process.env) &&
    pageCount > 0 &&
    pageImageDataUrls.length > 0
  ) {
    try {
      const answerSection = await suggestAnswerSectionWithModel({
        pageCount,
        pageImageDataUrls
      });

      return NextResponse.json({
        documentId: body.documentId ?? null,
      prompt: buildAnswerSectionPrompt(pageCount),
        answerSection
      });
    } catch {
      // Fall back to deterministic local stub during local development.
    }
  }

  return NextResponse.json({
    documentId: body.documentId ?? null,
    prompt: buildAnswerSectionPrompt(pageCount || 1),
    answerSection: {
      hasAnswerSection: true,
      suggestedSplitPage: pageCount || null
    }
  });
}

