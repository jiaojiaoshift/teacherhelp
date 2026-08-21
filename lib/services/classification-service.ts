import type {
  QuestionBulkConfirmationSnapshot,
  QuestionClassificationResult,
  QuestionClassificationSnapshot,
  QuestionDraftEntity
} from "@/lib/domain/entities";

const DEFAULT_AUTO_CONFIRM_THRESHOLD = 0.8;
const QUESTION_LIBRARY_ROOT = "我的题库";
const LEGACY_SUBJECT_RENAMES: Record<string, string> = {
  初高中数学: "高中数学",
  初高中物理: "高中物理"
};
const QUESTION_LIBRARY_SUBJECTS = new Set([
  "高中数学",
  "高中物理",
  "大学物理",
  "高等数学",
  ...Object.keys(LEGACY_SUBJECT_RENAMES)
]);
const FALLBACK_REVIEW_DIRECTORY_PATH = ["待人工决策"];

export interface QuestionDirectoryReviewGroup {
  directoryPath: string[];
  questions: QuestionDraftEntity[];
}

export function buildDocumentClassificationTasks(input: {
  questionIds: string[];
  pages: Array<{
    id: string;
    width: number;
    height: number;
    reviewStatus: "reviewed" | "unreviewed";
    imageDataUrl: string | null;
  }>;
  questions: Array<
    Pick<
      QuestionDraftEntity,
      "id" | "globalOrder" | "pageIds" | "primaryPageId" | "bboxByPage"
    >
  >;
}) {
  const targetQuestionIds = new Set(input.questionIds);
  const pageById = new Map(input.pages.map((page) => [page.id, page]));

  return input.questions
    .filter((question) => targetQuestionIds.has(question.id))
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder)
    .flatMap((question) => {
      const pages = question.pageIds.flatMap((pageId) => {
        const page = pageById.get(pageId);
        const bbox = question.bboxByPage[pageId];

        if (
          !page ||
          page.reviewStatus !== "reviewed" ||
          !page.imageDataUrl ||
          !bbox ||
          page.width <= 0 ||
          page.height <= 0
        ) {
          return [];
        }

        return [
          {
            id: page.id,
            reviewStatus: page.reviewStatus,
            imageDataUrl: page.imageDataUrl,
            questionIds: [question.id],
            questionRegions: [
              {
                questionId: question.id,
                isPrimary: page.id === question.primaryPageId,
                normalizedBBox: {
                  x1: Math.round((bbox.x / page.width) * 1000),
                  y1: Math.round((bbox.y / page.height) * 1000),
                  x2: Math.round(((bbox.x + bbox.width) / page.width) * 1000),
                  y2: Math.round(((bbox.y + bbox.height) / page.height) * 1000)
                }
              }
            ]
          }
        ];
      });

      return pages.length
        ? [
            {
              questionId: question.id,
              pages
            }
          ]
        : [];
    });
}

function hasQuestionBankDirectoryPath(path: string[] | null | undefined): boolean {
  const normalizedPath = normalizeQuestionLibraryDirectoryPath(path ?? null);

  return Boolean(
    normalizedPath &&
      normalizedPath[0] === QUESTION_LIBRARY_ROOT &&
      normalizedPath.length >= 3
  );
}

export function collectHighConfidenceQuestionIds(
  questions: QuestionClassificationSnapshot[],
  documentId: string,
  threshold = DEFAULT_AUTO_CONFIRM_THRESHOLD
): string[] {
  return questions
    .filter((question) => question.documentId === documentId)
    .filter((question) => question.classificationStatus === "matched")
    .filter((question) => (question.directoryMatchConfidence ?? 0) >= threshold)
    .filter((question) => hasQuestionBankDirectoryPath(question.directoryPath))
    .map((question) => question.id);
}

export function collectQuestionIdsNeedingClassification(
  questions: QuestionDraftEntity[],
  documentId: string
): string[] {
  return questions
    .filter((question) => question.documentId === documentId)
    .filter(
      (question) =>
        question.classificationStatus === "unclassified" ||
        question.status === "manual_only" ||
        question.status === "geometry_reviewed"
    )
    .map((question) => question.id);
}

export function collectSimilarQuestionIdsForBatchApply(
  questions: QuestionDraftEntity[],
  input: {
    documentId: string;
    anchorQuestionId: string;
  }
): string[] {
  const anchor = questions.find(
    (question) => question.documentId === input.documentId && question.id === input.anchorQuestionId
  );

  if (!anchor) {
    return [];
  }

  const anchorPaths = new Set((anchor.directoryCandidatePaths ?? []).map((path) => path.join(" / ")));

  return questions
    .filter((question) => question.documentId === input.documentId)
    .filter((question) => question.id !== input.anchorQuestionId)
    .filter((question) =>
      (question.directoryCandidatePaths ?? []).some((path) => anchorPaths.has(path.join(" / ")))
    )
    .map((question) => question.id);
}

export function groupQuestionIdsByReviewReadiness(input: {
  pages: Array<{
    id: string;
    reviewStatus: "reviewed" | "unreviewed";
    questionIds: string[];
  }>;
}) {
  const readyQuestionIds = new Set<string>();
  const blockedQuestionIds = new Set<string>();

  for (const page of input.pages) {
    for (const questionId of page.questionIds) {
      if (page.reviewStatus === "unreviewed") {
        readyQuestionIds.delete(questionId);
        blockedQuestionIds.add(questionId);
      } else if (!blockedQuestionIds.has(questionId)) {
        readyQuestionIds.add(questionId);
      }
    }
  }

  return {
    readyQuestionIds: Array.from(readyQuestionIds),
    blockedQuestionIds: Array.from(blockedQuestionIds)
  };
}

function getReviewPriority(question: QuestionDraftEntity): number {
  switch (question.classificationStatus) {
    case "needs_choice":
      return 0;
    case "pending_bucket":
      return 1;
    case "matched":
      return question.status === "auto_classified" ? 3 : 2;
    case "confirmed":
      return 4;
    case "unclassified":
    default:
      return 5;
  }
}

function normalizeSubjectSegment(segment: string): string {
  return LEGACY_SUBJECT_RENAMES[segment] ?? segment;
}

export function normalizeQuestionLibraryDirectoryPath(path: string[] | null): string[] | null {
  if (!path) {
    return null;
  }

  if (path[0] === QUESTION_LIBRARY_ROOT) {
    return path.map((segment, index) => (index === 1 ? normalizeSubjectSegment(segment) : segment));
  }

  if (!QUESTION_LIBRARY_SUBJECTS.has(path[0])) {
    return path;
  }

  return [QUESTION_LIBRARY_ROOT, normalizeSubjectSegment(path[0]), ...path.slice(1)];
}

export function normalizeQuestionLibraryCandidatePaths(paths: string[][]): string[][] {
  return paths.map((path) => normalizeQuestionLibraryDirectoryPath(path) ?? path);
}

function normalizeDetectedQuestionNumber(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .match(/\d{1,4}/)?.[0];

  return normalized ?? null;
}

export function extractQuestionNumberLabelFromOcr(ocrText: string | null | undefined): string | null {
  if (!ocrText) {
    return null;
  }

  const normalizedText = ocrText
    .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
    .trimStart();
  const match = normalizedText.match(
    /^(?:第\s*)?(?:Q\s*)?(\d{1,4})(?:\s*(?:题|[.．、,:：)）\]]))?/i
  );

  return match?.[1] ?? null;
}

export function applyClassificationResults(
  questions: QuestionDraftEntity[],
  documentId: string,
  results: QuestionClassificationResult[]
): QuestionDraftEntity[] {
  const resultsById = new Map(results.map((result) => [result.questionId, result]));

  return questions.map((question) => {
    if (question.documentId !== documentId) {
      return question;
    }

    const result = resultsById.get(question.id);

    if (!result) {
      return question;
    }

    const nextStatus =
      result.classificationStatus === "needs_choice"
        ? "needs_choice"
        : result.classificationStatus === "pending_bucket"
          ? "pending_bucket"
          : (result.directoryMatchConfidence ?? 0) >= DEFAULT_AUTO_CONFIRM_THRESHOLD
            ? "auto_classified"
            : "semantic_draft";

    return {
      ...question,
      status: nextStatus,
      classificationStatus: result.classificationStatus,
      directoryMatchConfidence: result.directoryMatchConfidence,
      directoryPath: normalizeQuestionLibraryDirectoryPath(result.directoryPath),
      directoryCandidatePaths: normalizeQuestionLibraryCandidatePaths(result.directoryCandidatePaths),
      questionType: result.questionType ?? null,
      chapterTag: result.chapterTag ?? null,
      knowledgeTags: result.knowledgeTags ?? [],
      questionNumberLabel:
        normalizeDetectedQuestionNumber(result.questionNumberLabel) ||
        extractQuestionNumberLabelFromOcr(result.ocrText) ||
        question.questionNumberLabel?.trim() ||
        null,
      ocrText: result.ocrText,
      lastBulkConfirmationId: null,
      lastSemanticRevisionSource: "initial_classification"
    };
  });
}

export function prioritizeQuestionsForReview(
  questions: QuestionDraftEntity[],
  documentId: string
): QuestionDraftEntity[] {
  return questions
    .filter((question) => question.documentId === documentId)
    .filter((question) => question.classificationStatus && question.classificationStatus !== "unclassified")
    .filter((question) => question.classificationStatus !== "confirmed")
    .sort((left, right) => {
      const priorityDelta = getReviewPriority(left) - getReviewPriority(right);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.globalOrder - right.globalOrder;
    });
}

function getDirectoryReviewPath(
  question: QuestionDraftEntity,
  fallbackDirectoryPath?: string[]
): string[] {
  return (
    question.directoryPath ??
    question.directoryCandidatePaths?.[0] ??
    fallbackDirectoryPath ??
    FALLBACK_REVIEW_DIRECTORY_PATH
  );
}

export function groupQuestionsByDirectoryReview(
  questions: QuestionDraftEntity[],
  fallbackDirectoryPath?: string[]
): QuestionDirectoryReviewGroup[] {
  const groups: QuestionDirectoryReviewGroup[] = [];
  const groupByKey = new Map<string, QuestionDirectoryReviewGroup>();

  questions.forEach((question) => {
    const directoryPath = getDirectoryReviewPath(question, fallbackDirectoryPath);
    const key = directoryPath.join(" / ");
    const existingGroup = groupByKey.get(key);

    if (existingGroup) {
      existingGroup.questions.push(question);
      return;
    }

    const nextGroup = {
      directoryPath,
      questions: [question]
    };

    groups.push(nextGroup);
    groupByKey.set(key, nextGroup);
  });

  return groups;
}

export function bulkConfirmQuestions(
  questions: QuestionDraftEntity[],
  questionIds: string[],
  confirmationId: string
): {
  nextQuestions: QuestionDraftEntity[];
  undoSnapshots: QuestionBulkConfirmationSnapshot[];
} {
  const targetIds = new Set(questionIds);
  const undoSnapshots: QuestionBulkConfirmationSnapshot[] = [];

  const nextQuestions = questions.map((question) => {
    if (!targetIds.has(question.id)) {
      return question;
    }

    undoSnapshots.push({
      id: question.id,
      status: question.status,
      classificationStatus: question.classificationStatus ?? "unclassified",
      lastBulkConfirmationId: question.lastBulkConfirmationId ?? null
    });

    return {
      ...question,
      status: "reviewed" as const,
      classificationStatus: "confirmed" as const,
      directoryPath: normalizeQuestionLibraryDirectoryPath(question.directoryPath ?? null),
      lastBulkConfirmationId: confirmationId
    };
  });

  return {
    nextQuestions,
    undoSnapshots
  };
}

export function restoreQuestionConfirmations(
  questions: QuestionDraftEntity[],
  snapshots: QuestionBulkConfirmationSnapshot[]
): QuestionDraftEntity[] {
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));

  return questions.map((question) => {
    const snapshot = snapshotsById.get(question.id);

    if (!snapshot) {
      return question;
    }

    return {
      ...question,
      status: snapshot.status,
      classificationStatus: snapshot.classificationStatus,
      lastBulkConfirmationId: snapshot.lastBulkConfirmationId
    };
  });
}
