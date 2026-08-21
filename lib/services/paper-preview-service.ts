import type {
  ExamDocumentQuestionBlock,
  ExamLectureSpacingState,
  ExamLibraryDocumentEntity,
  QuestionDraftEntity
} from "@/lib/domain/entities";

type PaperPreviewQuestion = Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText">;

type PaperPreviewDocument = Pick<
  ExamLibraryDocumentEntity,
  "numberingMode" | "questionIds" | "questionBlocks" | "lectureSpacing"
>;

export interface PaperPreviewItem {
  questionId: string;
  displayNumber: string;
  summaryText: string;
  gapAfter: number;
}

export interface PaperPreviewSection {
  key: string;
  label: string;
  items: PaperPreviewItem[];
}

export interface PaperPreviewResult {
  sections: PaperPreviewSection[];
}

function normalizeSummaryText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  return normalized || "No OCR text";
}

function buildDisplayNumberMap(document: PaperPreviewDocument): Map<string, string> {
  return new Map(
    document.questionIds.map((questionId, index) => [
      questionId,
      document.numberingMode === "resequence" ? String(index + 1) : ""
    ])
  );
}

function resolveQuestionItem(input: {
  questionId: string;
  fallbackIndex: number;
  displayNumberByQuestionId: Map<string, string>;
  questionById: Map<string, PaperPreviewQuestion>;
  gapByQuestionId: Map<string, number>;
}) {
  const question = input.questionById.get(input.questionId);
  const resequencedLabel = input.displayNumberByQuestionId.get(input.questionId);
  const customLabel = question?.questionNumberLabel?.trim() ?? "";

  return {
    questionId: input.questionId,
    displayNumber: resequencedLabel || customLabel || String(input.fallbackIndex + 1),
    summaryText: normalizeSummaryText(question?.ocrText),
    gapAfter: input.gapByQuestionId.get(input.questionId) ?? 0
  };
}

function buildGapMap(input: {
  questionIds: string[];
  lectureSpacing?: ExamLectureSpacingState;
}) {
  return new Map(
    input.questionIds.map((questionId) => [
      questionId,
      input.lectureSpacing?.perQuestionGapOverrides[questionId] ??
        input.lectureSpacing?.defaultGap ??
        0
    ])
  );
}

function buildBlockSections(input: {
  blocks: ExamDocumentQuestionBlock[];
  displayNumberByQuestionId: Map<string, string>;
  questionById: Map<string, PaperPreviewQuestion>;
  gapByQuestionId: Map<string, number>;
}) {
  return input.blocks
    .map((block) => ({
      key: block.key,
      label: block.label,
      items: block.questionIds
        .map((questionId, index) =>
          resolveQuestionItem({
            questionId,
            fallbackIndex: index,
            displayNumberByQuestionId: input.displayNumberByQuestionId,
            questionById: input.questionById,
            gapByQuestionId: input.gapByQuestionId
          })
        )
        .filter((item) => Boolean(item.questionId))
    }));
}

export function buildPaperPreview(input: {
  document: PaperPreviewDocument;
  questionDrafts: PaperPreviewQuestion[];
}): PaperPreviewResult {
  const questionById = new Map(input.questionDrafts.map((question) => [question.id, question]));
  const displayNumberByQuestionId = buildDisplayNumberMap(input.document);
  const gapByQuestionId = buildGapMap({
    questionIds: input.document.questionIds,
    lectureSpacing: input.document.lectureSpacing
  });

  if (input.document.questionBlocks?.length) {
    const sections = buildBlockSections({
      blocks: input.document.questionBlocks,
      displayNumberByQuestionId,
      questionById,
      gapByQuestionId
    });

    if (sections.length > 0) {
      return {
        sections
      };
    }
  }

  return {
    sections: [
      {
        key: "current-order",
        label: "Current Order",
        items: input.document.questionIds
          .map((questionId, index) =>
            resolveQuestionItem({
            questionId,
            fallbackIndex: index,
            displayNumberByQuestionId,
            questionById,
            gapByQuestionId
          })
        )
        .filter((item) => Boolean(item.questionId))
      }
    ]
  };
}
