import type { DocumentPendingAnswerMatchEntry } from "@/lib/domain/entities";
import { expandNormalizedBBox } from "@/lib/services/analysis-service";

interface QuestionAnswerMatchCandidate {
  id: string;
  globalOrder: number;
  questionNumberLabel?: string | null;
}

export interface DetectedAnswerCandidate {
  id: string;
  pageId: string;
  pageNumber: number;
  answerLabel: string;
  confidence: number;
  ocrText?: string | null;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface DurableAnswerQuestionCandidate extends QuestionAnswerMatchCandidate {
  ocrText?: string | null;
}

export interface DurableAnswerAttachmentPlan {
  attachmentsByQuestionId: Map<string, DetectedAnswerCandidate[]>;
  unresolvedAnswers: DetectedAnswerCandidate[];
  unansweredQuestionIds: string[];
}

export function normalizeQuestionNumberLabel(label: string | null | undefined): string {
  if (!label) {
    return "";
  }

  return label.trim().replace(/\D+/g, "");
}

export function resolveDurableQuestionNumber(question: DurableAnswerQuestionCandidate): string {
  const ocrQuestionNumber = /^\s*(\d{1,3})\s*(?:[.．、。]|[)）])/m.exec(
    question.ocrText ?? ""
  )?.[1];

  return (
    normalizeQuestionNumberLabel(ocrQuestionNumber) ||
    normalizeQuestionNumberLabel(question.questionNumberLabel) ||
    String(question.globalOrder)
  );
}

export function buildDurableAnswerAttachmentPlan(input: {
  questions: DurableAnswerQuestionCandidate[];
  detectedAnswers: DetectedAnswerCandidate[];
}): DurableAnswerAttachmentPlan {
  const questionIdsByNumber = new Map<string, string[]>();

  input.questions.forEach((question) => {
    const number = resolveDurableQuestionNumber(question);
    const questionIds = questionIdsByNumber.get(number) ?? [];

    questionIds.push(question.id);
    questionIdsByNumber.set(number, questionIds);
  });

  const attachmentsByQuestionId = new Map<string, DetectedAnswerCandidate[]>();
  const unresolvedAnswers: DetectedAnswerCandidate[] = [];

  input.detectedAnswers.forEach((answer) => {
    const number = normalizeQuestionNumberLabel(answer.answerLabel);
    const questionIds = number ? questionIdsByNumber.get(number) ?? [] : [];

    if (questionIds.length !== 1) {
      unresolvedAnswers.push(answer);
      return;
    }

    const questionId = questionIds[0];
    const answers = attachmentsByQuestionId.get(questionId) ?? [];

    answers.push(answer);
    attachmentsByQuestionId.set(questionId, answers);
  });

  return {
    attachmentsByQuestionId,
    unresolvedAnswers,
    unansweredQuestionIds: input.questions
      .filter((question) => !attachmentsByQuestionId.has(question.id))
      .map((question) => question.id)
  };
}

export function buildPendingAnswerMatches(input: {
  questions: QuestionAnswerMatchCandidate[];
  detectedAnswers: DetectedAnswerCandidate[];
}): DocumentPendingAnswerMatchEntry[] {
  const questionIdsByLabel = new Map<string, string[]>();

  input.questions
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder)
    .forEach((question) => {
      const normalizedLabel = normalizeQuestionNumberLabel(question.questionNumberLabel);

      if (!normalizedLabel) {
        return;
      }

      const existing = questionIdsByLabel.get(normalizedLabel) ?? [];
      existing.push(question.id);
      questionIdsByLabel.set(normalizedLabel, existing);
    });

  return input.detectedAnswers.map((answer) => {
    const normalizedAnswerLabel = normalizeQuestionNumberLabel(answer.answerLabel);
    const candidateQuestionIds =
      normalizedAnswerLabel.length > 0
        ? (questionIdsByLabel.get(normalizedAnswerLabel) ?? [])
        : [];

    return {
      id: answer.id,
      answerLabel: normalizedAnswerLabel || answer.answerLabel.trim(),
      suggestedQuestionId:
        candidateQuestionIds.length === 1 ? candidateQuestionIds[0] : null,
      status: "pending",
      pageId: answer.pageId,
      pageNumber: answer.pageNumber,
      confidence: answer.confidence,
      ...(typeof answer.ocrText === "string" ? { ocrText: answer.ocrText } : {}),
      normalizedBBox: expandNormalizedBBox(answer.normalizedBBox)
    };
  });
}

export function partitionAnswerMatchesForAutoAttach(
  matches: DocumentPendingAnswerMatchEntry[]
): {
  autoAttachMatches: DocumentPendingAnswerMatchEntry[];
  pendingMatches: DocumentPendingAnswerMatchEntry[];
} {
  const matchCountByQuestionId = new Map<string, number>();

  matches.forEach((match) => {
    if (!match.suggestedQuestionId) {
      return;
    }

    matchCountByQuestionId.set(
      match.suggestedQuestionId,
      (matchCountByQuestionId.get(match.suggestedQuestionId) ?? 0) + 1
    );
  });

  const autoAttachMatches = matches.filter(
    (match) =>
      Boolean(match.suggestedQuestionId) &&
      matchCountByQuestionId.get(match.suggestedQuestionId as string) === 1
  );
  const autoAttachMatchIds = new Set(autoAttachMatches.map((match) => match.id));

  return {
    autoAttachMatches,
    pendingMatches: matches.filter((match) => !autoAttachMatchIds.has(match.id))
  };
}
