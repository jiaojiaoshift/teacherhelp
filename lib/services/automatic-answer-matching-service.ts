import type {
  DocumentPendingAnswerMatchEntry,
  PageTextLine,
  QuestionAnswerAttachment
} from "@/lib/domain/entities";
import {
  resolveDurableQuestionNumber,
  type DetectedAnswerCandidate
} from "@/lib/services/answer-match-service";
import { buildNativeAnswerRegions } from "@/lib/services/durable-answer-layout-service";

interface AutomaticAnswerQuestion {
  id: string;
  globalOrder: number;
  questionNumberLabel?: string | null;
  ocrText?: string | null;
}

interface AutomaticAnswerPage {
  pageId: string;
  pageNumber: number;
  textLines?: PageTextLine[];
}

export function buildNativeAutomaticAnswerDetections(input: {
  questions: AutomaticAnswerQuestion[];
  answerPages: AutomaticAnswerPage[];
}): {
  complete: boolean;
  detections: DetectedAnswerCandidate[];
  missingAnswerLabels: string[];
} {
  if (input.questions.length === 0) {
    return {
      complete: false,
      detections: [],
      missingAnswerLabels: []
    };
  }

  const nativeLayout = buildNativeAnswerRegions({
    expectedAnswerLabels: input.questions.map(resolveDurableQuestionNumber),
    pages: input.answerPages.map((page) => ({
      pageNumber: page.pageNumber,
      textLines: page.textLines ?? []
    }))
  });
  const pageIdByNumber = new Map(
    input.answerPages.map((page) => [page.pageNumber, page.pageId])
  );
  const detections = nativeLayout.regions.flatMap((region) => {
    const pageId = pageIdByNumber.get(region.pageNumber);

    return pageId
      ? [
          {
            ...region,
            pageId,
            confidence: 1
          }
        ]
      : [];
  });

  return {
    complete: nativeLayout.complete && detections.length === nativeLayout.regions.length,
    detections,
    missingAnswerLabels: nativeLayout.missingAnswerLabels
  };
}

export function ensureUniqueAnswerDetectionIds(
  detections: DetectedAnswerCandidate[]
): DetectedAnswerCandidate[] {
  const totalById = new Map<string, number>();

  detections.forEach((detection) => {
    totalById.set(detection.id, (totalById.get(detection.id) ?? 0) + 1);
  });
  const occurrenceByPageAndId = new Map<string, number>();

  return detections.map((detection) => {
    if ((totalById.get(detection.id) ?? 0) === 1) {
      return detection;
    }

    const occurrenceKey = `${detection.pageId}\u0000${detection.id}`;
    const occurrence = (occurrenceByPageAndId.get(occurrenceKey) ?? 0) + 1;
    occurrenceByPageAndId.set(occurrenceKey, occurrence);

    return {
      ...detection,
      id: `${detection.pageId}-${detection.id}-${occurrence}`
    };
  });
}

export function collectUncoveredAnswerQuestionIds(input: {
  questions: Array<{
    id: string;
    answerAttachments?: QuestionAnswerAttachment[];
  }>;
  matches: DocumentPendingAnswerMatchEntry[];
}): string[] {
  const coveredQuestionIds = new Set(
    input.matches.flatMap((match) =>
      match.suggestedQuestionId ? [match.suggestedQuestionId] : []
    )
  );

  return input.questions
    .filter((question) => (question.answerAttachments?.length ?? 0) === 0)
    .filter((question) => !coveredQuestionIds.has(question.id))
    .map((question) => question.id);
}
