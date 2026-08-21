import { NextResponse } from "next/server";

import { isOpenAiCompatibleGatewayEnabled } from "@/lib/ai/openai-compatible-gateway";
import { analyzeQuestionWithCodex as analyzeQuestionWithModel } from "@/lib/ai/teachhelper-codex-agent";
import { buildQuestionAnalysisPrompt } from "@/lib/ai/teachhelper-ai-prompts";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    questionId: string;
    ocrText?: string | null;
    subjectScope?: string | null;
  };

  if (isOpenAiCompatibleGatewayEnabled(process.env) && body.ocrText) {
    try {
      const result = await analyzeQuestionWithModel({
        questionId: body.questionId,
        ocrText: body.ocrText,
        subjectScope: body.subjectScope ?? undefined
      });

      return NextResponse.json({
        questionId: body.questionId,
        prompt: buildQuestionAnalysisPrompt(body.subjectScope ?? undefined),
        analysis: {
          status: "done" as const,
          updatedAt: new Date().toISOString(),
          solution: result.solution,
          answer: result.answer
        }
      });
    } catch {
      // Fall back to deterministic local stub during local development.
    }
  }

  return NextResponse.json({
    questionId: body.questionId,
    prompt: buildQuestionAnalysisPrompt(body.subjectScope ?? undefined),
    analysis: {
      status: "done",
      updatedAt: new Date().toISOString(),
      solution: "Step 1：根据题干整理已知条件。\nStep 2：代入核心关系式完成求解。",
      answer: "示例答案"
    }
  });
}

