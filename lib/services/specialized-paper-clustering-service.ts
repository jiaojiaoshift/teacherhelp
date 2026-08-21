import type { ExamDocumentQuestionBlock, QuestionDraftEntity } from "@/lib/domain/entities";

type SpecializedQuestionLike = Pick<
  QuestionDraftEntity,
  "id" | "globalOrder" | "questionType" | "chapterTag" | "knowledgeTags"
>;

const INSERTION_CONFIDENCE_THRESHOLD = 0.8;

function normalizeTag(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getPrimaryKnowledgeTag(question: SpecializedQuestionLike) {
  return normalizeTag(question.knowledgeTags?.[0]) || normalizeTag(question.chapterTag) || "uncategorized";
}

function getBlockLabel(question: SpecializedQuestionLike) {
  return question.knowledgeTags?.[0]?.trim() || question.chapterTag?.trim() || "未分类";
}

function getDifficultyRank(question: SpecializedQuestionLike) {
  switch (question.questionType) {
    case "选择题":
    case "填空题":
      return 1;
    case "简答题":
    case "计算题":
    case "其他":
    case null:
    case undefined:
      return 2;
    case "证明题":
      return 3;
    default:
      return 2;
  }
}

function sortQuestionIdsWithinBlock(
  questionIds: string[],
  questionById: Map<string, SpecializedQuestionLike>
) {
  return questionIds.slice().sort((leftId, rightId) => {
    const left = questionById.get(leftId);
    const right = questionById.get(rightId);

    if (!left || !right) {
      return leftId.localeCompare(rightId, "zh-CN");
    }

    const difficultyDelta = getDifficultyRank(left) - getDifficultyRank(right);

    if (difficultyDelta !== 0) {
      return difficultyDelta;
    }

    return left.globalOrder - right.globalOrder;
  });
}

function flattenBlocks(blocks: ExamDocumentQuestionBlock[]) {
  return blocks.flatMap((block) => block.questionIds);
}

function deriveBlocksFromCurrentOrder(input: {
  currentQuestionIds: string[];
  questionById: Map<string, SpecializedQuestionLike>;
}): ExamDocumentQuestionBlock[] {
  const blocks: ExamDocumentQuestionBlock[] = [];

  input.currentQuestionIds.forEach((questionId) => {
    const question = input.questionById.get(questionId);

    if (!question) {
      return;
    }

    const key = getPrimaryKnowledgeTag(question);
    const label = getBlockLabel(question);
    const currentBlock = blocks.at(-1);

    if (currentBlock && currentBlock.key === key) {
      currentBlock.questionIds.push(questionId);
      return;
    }

    blocks.push({
      key,
      label,
      questionIds: [questionId]
    });
  });

  return blocks;
}

function measureSimilarity(
  question: SpecializedQuestionLike,
  block: ExamDocumentQuestionBlock,
  questionById: Map<string, SpecializedQuestionLike>
) {
  const primaryTag = getPrimaryKnowledgeTag(question);
  const blockQuestions = block.questionIds
    .map((questionId) => questionById.get(questionId))
    .filter((item): item is SpecializedQuestionLike => Boolean(item));

  if (blockQuestions.length === 0) {
    return block.key === primaryTag ? 0.95 : 0.45;
  }

  if (block.key === primaryTag) {
    return 0.95;
  }

  const normalizedQuestionTags = new Set(
    (question.knowledgeTags ?? [])
      .map((tag) => normalizeTag(tag))
      .filter(Boolean)
  );
  const normalizedBlockTags = new Set(
    blockQuestions.flatMap((item) =>
      (item.knowledgeTags ?? []).map((tag) => normalizeTag(tag)).filter(Boolean)
    )
  );

  const overlapCount = [...normalizedQuestionTags].filter((tag) => normalizedBlockTags.has(tag)).length;

  if (overlapCount > 0) {
    return 0.85;
  }

  const chapterTag = normalizeTag(question.chapterTag);
  const blockHasChapterMatch = blockQuestions.some(
    (item) => normalizeTag(item.chapterTag) === chapterTag && chapterTag.length > 0
  );

  if (blockHasChapterMatch) {
    return 0.82;
  }

  return 0.45;
}

export function buildInitialSpecializedQuestionBlocks(
  questions: SpecializedQuestionLike[]
): {
  blocks: ExamDocumentQuestionBlock[];
  orderedQuestionIds: string[];
} {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const groupedBlocks = new Map<string, ExamDocumentQuestionBlock>();

  questions
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder)
    .forEach((question) => {
      const key = getPrimaryKnowledgeTag(question);
      const existing = groupedBlocks.get(key);

      if (existing) {
        existing.questionIds.push(question.id);
        return;
      }

      groupedBlocks.set(key, {
        key,
        label: getBlockLabel(question),
        questionIds: [question.id]
      });
    });

  const blocks = [...groupedBlocks.values()].map((block) => ({
    ...block,
    questionIds: sortQuestionIdsWithinBlock(block.questionIds, questionById)
  }));

  return {
    blocks,
    orderedQuestionIds: flattenBlocks(blocks)
  };
}

export function reconcileSpecializedQuestionBlocks(input: {
  currentQuestionIds: string[];
  currentBlocks?: ExamDocumentQuestionBlock[];
  questions: SpecializedQuestionLike[];
  confidenceThreshold?: number;
}): {
  blocks: ExamDocumentQuestionBlock[];
  orderedQuestionIds: string[];
  manualPlacementQuestionIds: string[];
} {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const confidenceThreshold = input.confidenceThreshold ?? INSERTION_CONFIDENCE_THRESHOLD;
  const baseBlocks =
    input.currentBlocks && input.currentBlocks.length
      ? input.currentBlocks.map((block) => ({
          ...block,
          questionIds: block.questionIds.filter((questionId) => questionById.has(questionId))
        }))
      : deriveBlocksFromCurrentOrder({
          currentQuestionIds: input.currentQuestionIds,
          questionById
        });
  const stableBlocks = baseBlocks;
  const assignedQuestionIds = new Set(flattenBlocks(stableBlocks));
  const manualPlacementQuestionIds: string[] = [];

  input.questions
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder)
    .filter((question) => !assignedQuestionIds.has(question.id))
    .forEach((question) => {
      if (stableBlocks.length === 0) {
        stableBlocks.push({
          key: getPrimaryKnowledgeTag(question),
          label: getBlockLabel(question),
          questionIds: [question.id]
        });
        assignedQuestionIds.add(question.id);
        return;
      }

      const rankedBlocks = stableBlocks
        .map((block) => ({
          block,
          confidence: measureSimilarity(question, block, questionById)
        }))
        .sort((left, right) => right.confidence - left.confidence);
      const bestMatch = rankedBlocks[0];

      if (!bestMatch || bestMatch.confidence < confidenceThreshold) {
        manualPlacementQuestionIds.push(question.id);
        return;
      }

      bestMatch.block.questionIds = sortQuestionIdsWithinBlock(
        bestMatch.block.questionIds.concat(question.id),
        questionById
      );
      assignedQuestionIds.add(question.id);
    });

  return {
    blocks: stableBlocks,
    orderedQuestionIds: flattenBlocks(stableBlocks),
    manualPlacementQuestionIds
  };
}
