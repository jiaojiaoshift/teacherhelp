import { NextResponse } from "next/server";

import { isOpenAiCompatibleGatewayEnabled } from "@/lib/ai/openai-compatible-gateway";
import { reorderPaperWithCodex as reorderPaperWithModel } from "@/lib/ai/teachhelper-codex-agent";
import { buildPaperReorderPrompt } from "@/lib/ai/teachhelper-ai-prompts";
import { normalizeQuestionNumberLabel } from "@/lib/services/answer-match-service";

interface PaperQuestionInput {
  id: string;
  questionNumberLabel?: string | null;
  ocrText?: string | null;
}

function buildFallbackOrderedQuestionIds(input: {
  instruction: string;
  currentQuestions: PaperQuestionInput[];
  availableQuestions: PaperQuestionInput[];
}): string[] {
  const normalizedInstruction = input.instruction.replace(/\s+/g, "");
  const labelsInInstruction = Array.from(
    normalizedInstruction.matchAll(/\d+/g),
    (match) => match[0]
  );
  const currentQuestionIds = input.currentQuestions.map((question) => question.id);

  if (labelsInInstruction.length >= 1 && /(删|删除|去掉|移除)/.test(normalizedInstruction)) {
    const deletedQuestion = input.currentQuestions.find(
      (question) => normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[0]
    );

    if (!deletedQuestion) {
      return currentQuestionIds;
    }

    return currentQuestionIds.filter((questionId) => questionId !== deletedQuestion.id);
  }

  if (labelsInInstruction.length < 2) {
    return currentQuestionIds;
  }

  if (/(加|加入|添加|插入)/.test(normalizedInstruction)) {
    const anchorQuestion = input.currentQuestions.find(
      (question) => normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[0]
    );
    const insertedQuestion = input.availableQuestions.find(
      (question) =>
        normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[1] &&
        !currentQuestionIds.includes(question.id)
    );

    if (!anchorQuestion || !insertedQuestion) {
      return currentQuestionIds;
    }

    const anchorIndex = currentQuestionIds.findIndex((questionId) => questionId === anchorQuestion.id);

    if (anchorIndex < 0) {
      return currentQuestionIds;
    }

    const nextQuestionIds = currentQuestionIds.slice();
    nextQuestionIds.splice(anchorIndex + 1, 0, insertedQuestion.id);
    return nextQuestionIds;
  }

  if (/(换|替换|换成)/.test(normalizedInstruction)) {
    const replacedQuestion = input.currentQuestions.find(
      (question) => normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[0]
    );
    const replacementQuestion = input.availableQuestions.find(
      (question) =>
        normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[1] &&
        !currentQuestionIds.includes(question.id)
    );

    if (!replacedQuestion || !replacementQuestion) {
      return currentQuestionIds;
    }

    return currentQuestionIds.map((questionId) =>
      questionId === replacedQuestion.id ? replacementQuestion.id : questionId
    );
  }

  const firstQuestion = input.currentQuestions.find(
    (question) => normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[0]
  );
  const secondQuestion = input.currentQuestions.find(
    (question) => normalizeQuestionNumberLabel(question.questionNumberLabel) === labelsInInstruction[1]
  );

  if (!firstQuestion || !secondQuestion) {
    return currentQuestionIds;
  }

  const remaining = currentQuestionIds
    .filter((id) => id !== firstQuestion.id && id !== secondQuestion.id);

  return [firstQuestion.id, secondQuestion.id, ...remaining];
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    documentId?: string;
    instruction?: string;
    currentQuestions?: PaperQuestionInput[];
    availableQuestions?: PaperQuestionInput[];
    questions?: PaperQuestionInput[];
  };

  const instruction = body.instruction?.trim() ?? "";
  const currentQuestions = body.currentQuestions ?? body.questions ?? [];
  const availableQuestions = body.availableQuestions ?? currentQuestions;

  if (isOpenAiCompatibleGatewayEnabled(process.env) && instruction && currentQuestions.length > 0) {
    try {
      const result = await reorderPaperWithModel({
        instruction,
        questions: availableQuestions
      });

      return NextResponse.json({
        documentId: body.documentId ?? null,
        prompt: buildPaperReorderPrompt({
          instruction,
          questions: availableQuestions
        }),
        orderedQuestionIds: result.orderedQuestionIds
      });
    } catch {
      // Fall back to deterministic local stub during local development.
    }
  }

  return NextResponse.json({
    documentId: body.documentId ?? null,
    prompt: buildPaperReorderPrompt({
      instruction,
      questions: availableQuestions
    }),
    orderedQuestionIds: buildFallbackOrderedQuestionIds({
      instruction,
      currentQuestions,
      availableQuestions
    })
  });
}

