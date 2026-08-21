import type { ExamDocumentQuestionBlock, QuestionDraftEntity } from "@/lib/domain/entities";

type SpecializedSyncDraftQuestion = Pick<
  QuestionDraftEntity,
  "id" | "globalOrder" | "questionType" | "chapterTag" | "knowledgeTags"
>;

interface SpecializedSyncDraftResult {
  blocks: ExamDocumentQuestionBlock[];
  orderedQuestionIds: string[];
  manualPlacementQuestionIds: string[];
}

function normalizeTag(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getPrimaryKnowledgeTag(question: SpecializedSyncDraftQuestion) {
  return normalizeTag(question.knowledgeTags?.[0]) || normalizeTag(question.chapterTag) || "uncategorized";
}

function getBlockLabel(question: SpecializedSyncDraftQuestion) {
  return question.knowledgeTags?.[0]?.trim() || question.chapterTag?.trim() || "Uncategorized";
}

function getDifficultyRank(question: SpecializedSyncDraftQuestion) {
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

function flattenBlocks(blocks: ExamDocumentQuestionBlock[]) {
  return blocks.flatMap((block) => block.questionIds);
}

function sortQuestionIdsWithinBlock(
  questionIds: string[],
  questionById: Map<string, SpecializedSyncDraftQuestion>
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

function buildResult(input: {
  blocks: ExamDocumentQuestionBlock[];
  manualPlacementQuestionIds: string[];
}): SpecializedSyncDraftResult {
  return {
    blocks: input.blocks,
    manualPlacementQuestionIds: input.manualPlacementQuestionIds,
    orderedQuestionIds: flattenBlocks(input.blocks)
  };
}

export function assignPendingQuestionToBlock(input: {
  questionId: string;
  blockIndex: number;
  blocks: ExamDocumentQuestionBlock[];
  manualPlacementQuestionIds: string[];
  questions: SpecializedSyncDraftQuestion[];
}): SpecializedSyncDraftResult {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const nextBlocks = input.blocks.map((block) => ({
    ...block,
    questionIds: block.questionIds.filter((questionId) => questionId !== input.questionId)
  }));
  const targetBlock = nextBlocks[input.blockIndex];

  if (!targetBlock || !questionById.has(input.questionId)) {
    return buildResult({
      blocks: input.blocks,
      manualPlacementQuestionIds: input.manualPlacementQuestionIds
    });
  }

  targetBlock.questionIds = sortQuestionIdsWithinBlock(
    targetBlock.questionIds.concat(input.questionId),
    questionById
  );

  return buildResult({
    blocks: nextBlocks.filter((block) => block.questionIds.length > 0),
    manualPlacementQuestionIds: input.manualPlacementQuestionIds.filter(
      (questionId) => questionId !== input.questionId
    )
  });
}

export function createPendingBlockForQuestion(input: {
  questionId: string;
  blocks: ExamDocumentQuestionBlock[];
  manualPlacementQuestionIds: string[];
  questions: SpecializedSyncDraftQuestion[];
}): SpecializedSyncDraftResult {
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const question = questionById.get(input.questionId);

  if (!question) {
    return buildResult({
      blocks: input.blocks,
      manualPlacementQuestionIds: input.manualPlacementQuestionIds
    });
  }

  const nextBlocks = input.blocks
    .map((block) => ({
      ...block,
      questionIds: block.questionIds.filter((questionId) => questionId !== input.questionId)
    }))
    .filter((block) => block.questionIds.length > 0);

  nextBlocks.push({
    key: question.knowledgeTags?.[0]?.trim() || question.chapterTag?.trim() || getPrimaryKnowledgeTag(question),
    label: getBlockLabel(question),
    questionIds: [input.questionId]
  });

  return buildResult({
    blocks: nextBlocks,
    manualPlacementQuestionIds: input.manualPlacementQuestionIds.filter(
      (questionId) => questionId !== input.questionId
    )
  });
}

export function movePendingQuestionBlock(input: {
  blocks: ExamDocumentQuestionBlock[];
  fromIndex: number;
  direction: "up" | "down";
}): SpecializedSyncDraftResult {
  const targetIndex = input.direction === "up" ? input.fromIndex - 1 : input.fromIndex + 1;

  if (
    input.fromIndex < 0 ||
    input.fromIndex >= input.blocks.length ||
    targetIndex < 0 ||
    targetIndex >= input.blocks.length
  ) {
    return buildResult({
      blocks: input.blocks,
      manualPlacementQuestionIds: []
    });
  }

  const nextBlocks = input.blocks.slice();
  const [block] = nextBlocks.splice(input.fromIndex, 1);

  nextBlocks.splice(targetIndex, 0, block);

  return buildResult({
    blocks: nextBlocks,
    manualPlacementQuestionIds: []
  });
}
