import type {
  CrossPageCandidateEntity,
  PageEntity,
  QuestionDraftEntity,
  QuestionPageLayoutMode
} from "@/lib/domain/entities";
import {
  normalizeCrossPageQuestionWidths,
  normalizeQuestionPageLayout
} from "@/lib/services/question-layout-normalization-service";

export function canTriggerDocumentClassification(
  pages: Array<{ id: string; reviewStatus: "reviewed" | "unreviewed" }>
): boolean {
  return pages.some((page) => page.reviewStatus === "reviewed");
}

export function hasUnreviewedPagesInDocument(
  pages: Array<{ id: string; documentId: string; reviewStatus: "reviewed" | "unreviewed" }>,
  documentId: string
): boolean {
  return pages.some(
    (page) => page.documentId === documentId && page.reviewStatus === "unreviewed"
  );
}

export function clearCrossPageCandidatesForDocument<
  T extends {
    documentId: string;
  }
>(candidates: T[], documentId: string): T[] {
  return candidates.filter((candidate) => candidate.documentId !== documentId);
}

export function acceptCrossPageCandidate<
  T extends {
    id: string;
    status: "suggested" | "accepted" | "dismissed";
  }
>(candidates: T[], candidateId: string): T[] {
  return candidates.map((candidate) =>
    candidate.id === candidateId
      ? {
          ...candidate,
          status: "accepted"
        }
      : candidate
  );
}

export function dismissCrossPageCandidate<
  T extends {
    id: string;
    status: "suggested" | "accepted" | "dismissed";
  }
>(candidates: T[], candidateId: string): T[] {
  return candidates.map((candidate) =>
    candidate.id === candidateId
      ? {
          ...candidate,
          status: "dismissed"
        }
      : candidate
  );
}

export function buildCrossPageCandidateReviewDisplay(input: {
  candidate: CrossPageCandidateEntity;
  pages: Array<Pick<PageEntity, "id" | "pageNumber">>;
  questions: Array<
    Pick<
      QuestionDraftEntity,
      "id" | "primaryPageId" | "localOrder" | "globalOrder" | "questionNumberLabel"
    >
  >;
}): {
  title: string;
  pageRange: string;
  sourceLabels: string[];
} {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const formatPage = (pageId: string) => {
    const page = pageById.get(pageId);
    return page ? `第 ${page.pageNumber} 页` : pageId;
  };
  const formatQuestion = (questionId: string, index: number) => {
    const question = questionById.get(questionId);

    if (!question) {
      const fallbackPageId = index === 0 ? input.candidate.leftPageId : input.candidate.rightPageId;
      return questionId.includes("continuation-from")
        ? `${formatPage(fallbackPageId)}续题片段`
        : questionId;
    }

    const page = formatPage(question.primaryPageId);
    const label = question.questionNumberLabel?.trim();

    if (!label && question.localOrder <= 0) {
      return `${page}续题片段`;
    }

    return `${page} Q${label || question.localOrder}`;
  };
  const sourceLabels = input.candidate.sourceQuestionIds.map(formatQuestion);

  return {
    title: sourceLabels.length ? sourceLabels.join(" + ") : input.candidate.id,
    pageRange: `${formatPage(input.candidate.leftPageId)} → ${formatPage(input.candidate.rightPageId)}`,
    sourceLabels
  };
}

export function buildCrossPageRequestCandidates(input: {
  pages: Array<Pick<PageEntity, "id" | "width" | "height">>;
  questions: Array<Pick<QuestionDraftEntity, "id" | "localOrder" | "bboxByPage">>;
}) {
  return input.pages.flatMap((page) =>
    input.questions.flatMap((question) => {
      const bbox = question.bboxByPage[page.id];

      if (!bbox || page.width <= 0 || page.height <= 0) {
        return [];
      }

      return [
        {
          id: question.id,
          pageId: page.id,
          localOrder: question.localOrder,
          normalizedBBox: {
            x1: Math.round((bbox.x / page.width) * 1000),
            y1: Math.round((bbox.y / page.height) * 1000),
            x2: Math.round(((bbox.x + bbox.width) / page.width) * 1000),
            y2: Math.round(((bbox.y + bbox.height) / page.height) * 1000)
          }
        }
      ];
    })
  );
}

function getQuestionBBoxOnPage(
  question: Pick<QuestionDraftEntity, "bboxByPage">,
  pageId: string
) {
  return question.bboxByPage[pageId] ?? null;
}

function sortQuestionsByPagePosition(
  pageId: string,
  questions: QuestionDraftEntity[]
): QuestionDraftEntity[] {
  return questions
    .filter((question) => question.pageIds.includes(pageId) && !question.id.includes("continuation-from"))
    .slice()
    .sort((left, right) => {
      const leftBBox = getQuestionBBoxOnPage(left, pageId);
      const rightBBox = getQuestionBBoxOnPage(right, pageId);

      if (leftBBox && rightBBox && leftBBox.y !== rightBBox.y) {
        return leftBBox.y - rightBBox.y;
      }

      if (left.localOrder !== right.localOrder) {
        return left.localOrder - right.localOrder;
      }

      return left.globalOrder - right.globalOrder;
    });
}

const QUESTION_NUMBER_ANCHOR_PATTERN =
  /^\s*(?:第\s*)?(?:Q\s*)?\d{1,4}\s*(?:[.．。、:：）)]|题\b)/i;

function hasQuestionNumberAtBoxStart(input: {
  page: Pick<PageEntity, "height" | "textLines">;
  question: Pick<QuestionDraftEntity, "questionNumberLabel">;
  bbox: { y: number; height: number };
}): boolean {
  if (input.question.questionNumberLabel?.trim()) {
    return true;
  }

  if (input.page.height <= 0) {
    return false;
  }

  const normalizedTop = (input.bbox.y / input.page.height) * 1000;
  const normalizedLeadBottom =
    ((input.bbox.y + Math.min(input.bbox.height, input.page.height * 0.14)) /
      input.page.height) *
    1000;

  return (input.page.textLines ?? []).some(
    (line) =>
      line.normalizedBBox.y2 >= normalizedTop - 24 &&
      line.normalizedBBox.y1 <= normalizedLeadBottom &&
      QUESTION_NUMBER_ANCHOR_PATTERN.test(line.text)
  );
}

export function buildEdgeContinuationCrossPageArtifacts(input: {
  documentId: string;
  pages: Array<Pick<PageEntity, "id" | "pageNumber" | "width" | "height" | "textLines">>;
  questions: QuestionDraftEntity[];
}): {
  questionDrafts: QuestionDraftEntity[];
  candidates: CrossPageCandidateEntity[];
} {
  const sortedPages = input.pages.slice().sort((left, right) => left.pageNumber - right.pageNumber);
  const pagePairs = sortedPages
    .slice(0, -1)
    .map((page, index) => ({
      leftPage: page,
      rightPage: sortedPages[index + 1]
    }))
    .filter((pair) => Boolean(pair.rightPage));
  const existingQuestionIds = new Set(input.questions.map((question) => question.id));
  const questionDrafts: QuestionDraftEntity[] = [];
  const candidates: CrossPageCandidateEntity[] = [];

  for (const pair of pagePairs) {
    const leftQuestions = sortQuestionsByPagePosition(pair.leftPage.id, input.questions);
    const rightQuestions = sortQuestionsByPagePosition(pair.rightPage.id, input.questions);
    const leftQuestion = leftQuestions.at(-1);

    if (!leftQuestion) {
      continue;
    }

    const leftBBox = getQuestionBBoxOnPage(leftQuestion, pair.leftPage.id);

    if (!leftBBox) {
      continue;
    }

    const leftBottomGap = pair.leftPage.height - (leftBBox.y + leftBBox.height);
    const leftReachesPageTail = leftBottomGap <= pair.leftPage.height * 0.12;

    if (!leftReachesPageTail) {
      continue;
    }

    const rightQuestion = rightQuestions[0] ?? null;
    const rightBBox = rightQuestion ? getQuestionBBoxOnPage(rightQuestion, pair.rightPage.id) : null;
    const rightTopGap = rightBBox ? rightBBox.y : pair.rightPage.height * 0.28;

    if (rightQuestion && rightBBox && rightTopGap < pair.rightPage.height * 0.16) {
      if (
        !hasQuestionNumberAtBoxStart({
          page: pair.rightPage,
          question: rightQuestion,
          bbox: rightBBox
        })
      ) {
        candidates.push({
          id: `${pair.leftPage.id}-${pair.rightPage.id}-edge-continuation-${leftQuestion.id}`,
          documentId: input.documentId,
          leftPageId: pair.leftPage.id,
          rightPageId: pair.rightPage.id,
          sourceQuestionIds: [leftQuestion.id, rightQuestion.id],
          confidence: 0.8,
          status: "suggested"
        });
      }

      continue;
    }

    const fragmentId = `${pair.rightPage.id}-continuation-from-${leftQuestion.id}`;
    const topInset = Math.round(pair.rightPage.height * 0.035);
    const gapBeforeNextQuestion = Math.round(pair.rightPage.height * 0.04);
    const referenceHeight = rightBBox
      ? Math.min(leftBBox.height, rightBBox.height)
      : Math.min(leftBBox.height, pair.rightPage.height * 0.22);
    const availableHeight = rightTopGap - topInset - gapBeforeNextQuestion;
    const fragmentHeight = Math.round(Math.min(referenceHeight, availableHeight));

    if (fragmentHeight < pair.rightPage.height * 0.08) {
      continue;
    }

    if (!existingQuestionIds.has(fragmentId)) {
      questionDrafts.push({
        id: fragmentId,
        documentId: input.documentId,
        pageIds: [pair.rightPage.id],
        primaryPageId: pair.rightPage.id,
        localOrder: 0,
        globalOrder: rightQuestion?.globalOrder ?? leftQuestion.globalOrder + 1,
        bboxByPage: {
          [pair.rightPage.id]: {
            x: rightBBox?.x ?? leftBBox.x,
            y: topInset,
            width: rightBBox?.width ?? leftBBox.width,
            height: fragmentHeight
          }
        },
        status: "geometry_reviewed",
        source: "ai",
        confidence: 0.72,
        crossPageGroupId: null,
        ...(leftQuestion.pageLayoutMode
          ? { pageLayoutMode: leftQuestion.pageLayoutMode }
          : {}),
        classificationStatus: "unclassified",
        directoryMatchConfidence: null,
        directoryPath: null,
        directoryCandidatePaths: [],
        questionType: null,
        ocrText: null,
        lastBulkConfirmationId: null,
        lastSemanticRevisionSource: null
      });
      existingQuestionIds.add(fragmentId);
    }

    candidates.push({
      id: `${pair.leftPage.id}-${pair.rightPage.id}-edge-continuation-${leftQuestion.id}`,
      documentId: input.documentId,
      leftPageId: pair.leftPage.id,
      rightPageId: pair.rightPage.id,
      sourceQuestionIds: [leftQuestion.id, fragmentId],
      confidence: 0.72,
      status: "suggested"
    });
  }

  return {
    questionDrafts,
    candidates
  };
}

export function mergeQuestionSequenceForDisplay(
  questions: Array<{ id: string; sourceQuestionIds: string[] }>,
  merge: { mergedQuestionId: string; sourceQuestionIds: string[] }
) {
  const consumed = new Set(merge.sourceQuestionIds);
  const kept = questions.filter((question) => !consumed.has(question.id));

  return [
    {
      id: merge.mergedQuestionId,
      displayOrder: 1,
      sourceQuestionIds: merge.sourceQuestionIds
    },
    ...kept.map((question, index) => ({
      id: question.id,
      displayOrder: index + 2,
      sourceQuestionIds: question.sourceQuestionIds
    }))
  ];
}

export function mergeQuestionsAcrossPages<
  T extends {
    id: string;
    documentId: string;
    pageIds: string[];
    primaryPageId: string;
    localOrder: number;
    globalOrder: number;
    bboxByPage: Record<string, { x: number; y: number; width: number; height: number }>;
    status: string;
    source: string;
    confidence: number | null;
    crossPageGroupId: string | null;
  }
>(
  questions: T[],
  merge: {
    mergedQuestionId: string;
    sourceQuestionIds: string[];
    crossPageGroupId: string;
  }
): T[] {
  const sourceQuestions = questions.filter((question) => merge.sourceQuestionIds.includes(question.id));

  if (sourceQuestions.length === 0) {
    return questions;
  }

  const [firstQuestion] = sourceQuestions.sort((left, right) => left.globalOrder - right.globalOrder);
  const mergedQuestion = {
    ...firstQuestion,
    id: merge.mergedQuestionId,
    pageIds: Array.from(new Set(sourceQuestions.flatMap((question) => question.pageIds))),
    bboxByPage: sourceQuestions.reduce<Record<string, { x: number; y: number; width: number; height: number }>>(
      (accumulator, question) => ({
        ...accumulator,
        ...question.bboxByPage
      }),
      {}
    ),
    source: "merged",
    confidence:
      sourceQuestions.every((question) => typeof question.confidence === "number")
        ? sourceQuestions.reduce((sum, question) => sum + Number(question.confidence), 0) / sourceQuestions.length
        : null,
    crossPageGroupId: merge.crossPageGroupId
  } as T;

  return questions
    .filter((question) => !merge.sourceQuestionIds.includes(question.id))
    .concat(mergedQuestion)
    .sort((left, right) => left.globalOrder - right.globalOrder);
}

const ORIGINAL_QUESTION_NUMBER_PATTERN =
  /^\s*(?:第\s*)?(?:Q\s*)?(\d{1,4})\s*(?:[.．。、:：）)]|题(?:\s|$))/i;

function extractQuestionNumberFromPrimaryBox(input: {
  page: Pick<PageEntity, "width" | "height" | "textLines">;
  bbox: { x: number; y: number; width: number; height: number };
}): string | null {
  if (input.page.width <= 0 || input.page.height <= 0) {
    return null;
  }

  const normalizedBox = {
    x1: (input.bbox.x / input.page.width) * 1000,
    y1: (input.bbox.y / input.page.height) * 1000,
    x2: ((input.bbox.x + input.bbox.width) / input.page.width) * 1000,
    height: (input.bbox.height / input.page.height) * 1000
  };
  const leadBottom =
    normalizedBox.y1 + Math.max(48, Math.min(160, normalizedBox.height * 0.75));

  const matches = (input.page.textLines ?? []).flatMap((line) => {
    if (
      line.normalizedBBox.y2 < normalizedBox.y1 - 28 ||
      line.normalizedBBox.y1 > leadBottom ||
      line.normalizedBBox.x2 < normalizedBox.x1 - 32 ||
      line.normalizedBBox.x1 > normalizedBox.x2 + 32
    ) {
      return [];
    }

    const match = ORIGINAL_QUESTION_NUMBER_PATTERN.exec(line.text);

    return match
      ? [{
          label: match[1],
          distance: Math.abs(line.normalizedBBox.y1 - normalizedBox.y1),
          y: line.normalizedBBox.y1,
          x: line.normalizedBBox.x1
        }]
      : [];
  });

  matches.sort(
    (left, right) =>
      left.distance - right.distance || left.y - right.y || left.x - right.x
  );

  return matches[0]?.label ?? null;
}

export function reconcileQuestionsAfterCrossPageReview(input: {
  pages: Array<Pick<PageEntity, "id" | "pageNumber" | "width" | "height" | "textLines">>;
  questions: QuestionDraftEntity[];
  questionPageLayoutMode?: QuestionPageLayoutMode;
}): QuestionDraftEntity[] {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const pageRankById = new Map(
    input.pages
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((page, index) => [page.id, index])
  );
  const getPageRank = (pageId: string) => pageRankById.get(pageId) ?? Number.MAX_SAFE_INTEGER;

  const normalizedQuestions = normalizeCrossPageQuestionWidths({
    pages: input.pages.map((page) => ({
      id: page.id,
      documentId:
        input.questions.find((question) => question.pageIds.includes(page.id))?.documentId ?? "",
      width: page.width,
      height: page.height
    })),
    questions: input.questions
  });
  const prepared = normalizedQuestions.map((question) => {
    const pageIds = question.pageIds
      .slice()
      .sort((left, right) => getPageRank(left) - getPageRank(right));
    const primaryPageId = pageIds[0] ?? question.primaryPageId;
    const primaryPage = pageById.get(primaryPageId);
    const primaryBBox = question.bboxByPage[primaryPageId];
    const questionNumberLabel =
      question.questionNumberLabel?.trim() ||
      (primaryPage && primaryBBox
        ? extractQuestionNumberFromPrimaryBox({ page: primaryPage, bbox: primaryBBox })
        : null);

    return {
      ...question,
      pageIds,
      primaryPageId,
      questionNumberLabel
    };
  });

  if (input.questionPageLayoutMode === "double_column") {
    return normalizeQuestionPageLayout({
      questionPageLayoutMode: input.questionPageLayoutMode,
      pages: input.pages.map((page) => ({
        ...page,
        documentId:
          input.questions.find((question) => question.pageIds.includes(page.id))?.documentId ?? ""
      })),
      questions: prepared
    });
  }

  prepared.sort((left, right) => {
    const pageDifference = getPageRank(left.primaryPageId) - getPageRank(right.primaryPageId);

    if (pageDifference !== 0) {
      return pageDifference;
    }

    const leftBBox = left.bboxByPage[left.primaryPageId];
    const rightBBox = right.bboxByPage[right.primaryPageId];
    const verticalDifference = (leftBBox?.y ?? Number.MAX_SAFE_INTEGER) -
      (rightBBox?.y ?? Number.MAX_SAFE_INTEGER);

    if (verticalDifference !== 0) {
      return verticalDifference;
    }

    const horizontalDifference = (leftBBox?.x ?? Number.MAX_SAFE_INTEGER) -
      (rightBBox?.x ?? Number.MAX_SAFE_INTEGER);

    return horizontalDifference || left.globalOrder - right.globalOrder || left.id.localeCompare(right.id);
  });

  const localOrderByPageId = new Map<string, number>();

  return prepared.map((question, index) => {
    const localOrder = (localOrderByPageId.get(question.primaryPageId) ?? 0) + 1;
    localOrderByPageId.set(question.primaryPageId, localOrder);

    return {
      ...question,
      localOrder,
      globalOrder: index + 1
    };
  });
}

export function shouldInvalidateQuestionSemantics(input: {
  hasProcessedSemantics: boolean;
  geometryChanged: boolean;
  userChoseRerun: boolean;
  newlyAddedQuestion: boolean;
}): boolean {
  if (input.newlyAddedQuestion) {
    return false;
  }

  if (!input.hasProcessedSemantics) {
    return false;
  }

  return input.geometryChanged && input.userChoseRerun;
}

export function hasProcessedQuestionSemantics(question: {
  ocrText?: string | null;
  questionType?: string | null;
  classificationStatus?: string;
}): boolean {
  return (
    Boolean(question.ocrText) ||
    Boolean(question.questionType) ||
    question.classificationStatus === "matched" ||
    question.classificationStatus === "needs_choice" ||
    question.classificationStatus === "pending_bucket" ||
    question.classificationStatus === "confirmed"
  );
}

export function reconcileQuestionAfterGeometryChange<
  T extends {
    bboxByPage: Record<string, { x: number; y: number; width: number; height: number }>;
    status: string;
    classificationStatus?: string;
    directoryMatchConfidence?: number | null;
    directoryPath?: string[] | null;
    directoryCandidatePaths?: string[][];
    questionType?: string | null;
    ocrText?: string | null;
    lastBulkConfirmationId?: string | null;
    lastSemanticRevisionSource?: string | null;
  }
>(
  question: T,
  input: {
    selectedPageId: string;
    nextBBox?: { x: number; y: number; width: number; height: number };
    userChoseRerun: boolean;
  }
): T {
  const currentBBox = question.bboxByPage[input.selectedPageId];
  const nextBBox =
    input.nextBBox ??
    (currentBBox
      ? {
          ...currentBBox,
          x: currentBBox.x + 12,
          y: currentBBox.y + 12
        }
      : currentBBox);

  const nextQuestion = {
    ...question,
    bboxByPage: nextBBox
      ? {
          ...question.bboxByPage,
          [input.selectedPageId]: nextBBox
        }
      : question.bboxByPage
  } as T;

  if (!input.userChoseRerun) {
    return {
      ...nextQuestion,
      lastSemanticRevisionSource: "geometry_preserved_without_rerun"
    };
  }

  return {
    ...nextQuestion,
    status: "geometry_reviewed",
    classificationStatus: "unclassified",
    directoryMatchConfidence: null,
    directoryPath: null,
    directoryCandidatePaths: [],
    questionType: null,
    ocrText: null,
    lastBulkConfirmationId: null,
    lastSemanticRevisionSource: "geometry_rerun_pending"
  };
}

export function createManualQuestionDraft(input: {
  questionId: string;
  documentId: string;
  pageId: string;
  pageNumber: number;
  width: number;
  height: number;
  globalOrder: number;
  pageLayoutMode?: QuestionPageLayoutMode;
}) {
  return {
    id: input.questionId,
    documentId: input.documentId,
    pageIds: [input.pageId],
    primaryPageId: input.pageId,
    localOrder: input.pageNumber,
    globalOrder: input.globalOrder,
    bboxByPage: {
      [input.pageId]: {
        x: input.width * 0.2,
        y: input.height * 0.2,
        width: input.width * 0.6,
        height: input.height * 0.3
      }
    },
    status: "manual_only" as const,
    source: "manual" as const,
    confidence: 1,
    crossPageGroupId: null,
    ...(input.pageLayoutMode ? { pageLayoutMode: input.pageLayoutMode } : {}),
    classificationStatus: "unclassified" as const,
    directoryMatchConfidence: null,
    directoryPath: null,
    directoryCandidatePaths: [],
    questionType: null,
    ocrText: null,
    lastBulkConfirmationId: null,
    lastSemanticRevisionSource: null
  };
}

export function removeQuestionDraftById<T extends { id: string }>(questions: T[], questionId: string): T[] {
  return questions.filter((question) => question.id !== questionId);
}
