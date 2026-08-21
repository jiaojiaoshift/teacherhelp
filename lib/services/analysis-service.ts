import type { PageTextLine, QuestionPageLayoutMode } from "@/lib/domain/entities";

type NormalizedQuestionBBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type NormalizedQuestionDetection = {
  id: string;
  localOrder: number;
  confidence: number;
  normalizedBBox: NormalizedQuestionBBox;
};

const NORMALIZED_PAGE_SIZE = 1000;
const MIN_NORMALIZED_QUESTION_SIZE = 20;
const MIN_NORMALIZED_QUESTION_GAP = 4;
const SAME_COLUMN_OVERLAP_RATIO = 0.45;
const DUPLICATE_IOU_THRESHOLD = 0.72;
const DUPLICATE_CONTAINMENT_THRESHOLD = 0.9;
const QUESTION_NUMBER_ANCHOR_PATTERN =
  /^\s*(?:第\s*)?(?:Q\s*)?\d{1,4}\s*(?:[.．。、:：）)]|题\b)/i;
const EXAM_SOURCE_YEAR_PATTERN = /(?:20)?\d{2}\s*[-–—]\s*(?:20)?\d{2}/;
const EXAM_SOURCE_GRADE_PATTERN = /(?:高|初)[一二三123]|[七八九]年级|[上下]学期/;
const EXAM_SOURCE_CONTEXT_PATTERN =
  /期中|期末|月考|联考|模拟|一模|二模|统考|校考|质检|中学|学校|附中|一中|教育集团/;

function clampNormalizedCoordinate(value: number): number {
  return Math.max(0, Math.min(NORMALIZED_PAGE_SIZE, Math.round(value)));
}

function normalizeQuestionBBox(bbox: NormalizedQuestionBBox): NormalizedQuestionBBox | null {
  if (![bbox.x1, bbox.y1, bbox.x2, bbox.y2].every(Number.isFinite)) {
    return null;
  }

  const x1 = clampNormalizedCoordinate(Math.min(bbox.x1, bbox.x2));
  const y1 = clampNormalizedCoordinate(Math.min(bbox.y1, bbox.y2));
  const x2 = clampNormalizedCoordinate(Math.max(bbox.x1, bbox.x2));
  const y2 = clampNormalizedCoordinate(Math.max(bbox.y1, bbox.y2));

  return x2 - x1 >= MIN_NORMALIZED_QUESTION_SIZE &&
    y2 - y1 >= MIN_NORMALIZED_QUESTION_SIZE
    ? { x1, y1, x2, y2 }
    : null;
}

function getBBoxArea(bbox: NormalizedQuestionBBox): number {
  return Math.max(0, bbox.x2 - bbox.x1) * Math.max(0, bbox.y2 - bbox.y1);
}

function getBBoxIntersectionArea(
  left: NormalizedQuestionBBox,
  right: NormalizedQuestionBBox
): number {
  const width = Math.max(0, Math.min(left.x2, right.x2) - Math.max(left.x1, right.x1));
  const height = Math.max(0, Math.min(left.y2, right.y2) - Math.max(left.y1, right.y1));

  return width * height;
}

function areNearDuplicateQuestionBoxes(
  left: NormalizedQuestionBBox,
  right: NormalizedQuestionBBox
): boolean {
  const intersectionArea = getBBoxIntersectionArea(left, right);

  if (intersectionArea <= 0) {
    return false;
  }

  const leftArea = getBBoxArea(left);
  const rightArea = getBBoxArea(right);
  const unionArea = leftArea + rightArea - intersectionArea;
  const smallerArea = Math.min(leftArea, rightArea);

  return intersectionArea / unionArea >= DUPLICATE_IOU_THRESHOLD ||
    intersectionArea / smallerArea >= DUPLICATE_CONTAINMENT_THRESHOLD;
}

function getHorizontalOverlapRatio(
  left: NormalizedQuestionBBox,
  right: NormalizedQuestionBBox
): number {
  const overlap = Math.max(0, Math.min(left.x2, right.x2) - Math.max(left.x1, right.x1));
  const smallerWidth = Math.min(left.x2 - left.x1, right.x2 - right.x1);

  return smallerWidth > 0 ? overlap / smallerWidth : 0;
}

function isExamSourceMetadataLine(text: string): boolean {
  const hasYear = EXAM_SOURCE_YEAR_PATTERN.test(text);
  const hasGrade = EXAM_SOURCE_GRADE_PATTERN.test(text);
  const hasContext = EXAM_SOURCE_CONTEXT_PATTERN.test(text);

  return (hasYear && (hasGrade || hasContext)) || (hasGrade && hasContext);
}

function alignQuestionBoundariesToTextLayout<
  Detection extends NormalizedQuestionDetection
>(detections: Detection[], textLines: PageTextLine[]): Detection[] {
  if (detections.length < 2 || textLines.length === 0) {
    return detections;
  }

  const aligned = detections.map((detection) => ({
    ...detection,
    normalizedBBox: { ...detection.normalizedBBox }
  }));
  const sortedTextLines = textLines
    .slice()
    .sort(
      (left, right) =>
        left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
        left.normalizedBBox.x1 - right.normalizedBBox.x1
    );

  for (let index = 0; index < aligned.length - 1; index += 1) {
    const upper = aligned[index];
    const lower = aligned[index + 1];

    if (
      getHorizontalOverlapRatio(upper.normalizedBBox, lower.normalizedBBox) <
      SAME_COLUMN_OVERLAP_RATIO
    ) {
      continue;
    }

    const lowerLeadBottom = Math.min(
      lower.normalizedBBox.y2,
      lower.normalizedBBox.y1 + 180
    );
    const anchor = sortedTextLines.find(
      (line) =>
        QUESTION_NUMBER_ANCHOR_PATTERN.test(line.text) &&
        line.normalizedBBox.y2 >= lower.normalizedBBox.y1 - 40 &&
        line.normalizedBBox.y1 <= lowerLeadBottom &&
        line.normalizedBBox.x2 >= lower.normalizedBBox.x1 - 32 &&
        line.normalizedBBox.x1 <= lower.normalizedBBox.x2 + 32
    );

    if (!anchor) {
      continue;
    }

    const sourceLines = sortedTextLines.filter(
      (line) =>
        isExamSourceMetadataLine(line.text) &&
        line.normalizedBBox.y2 <= anchor.normalizedBBox.y1 &&
        anchor.normalizedBBox.y1 - line.normalizedBBox.y2 <= 80 &&
        line.normalizedBBox.x2 >= lower.normalizedBBox.x1 - 32 &&
        line.normalizedBBox.x1 <= lower.normalizedBBox.x2 + 32
    );
    const sourceStart = sourceLines.reduce(
      (minimum, line) => Math.min(minimum, line.normalizedBBox.y1),
      Number.POSITIVE_INFINITY
    );

    if (!Number.isFinite(sourceStart) || upper.normalizedBBox.y2 < sourceStart) {
      continue;
    }

    const previousContentBottom = sortedTextLines.reduce((maximum, line) => {
      if (
        line.normalizedBBox.y2 >= sourceStart ||
        isExamSourceMetadataLine(line.text) ||
        line.normalizedBBox.x2 < upper.normalizedBBox.x1 - 32 ||
        line.normalizedBBox.x1 > upper.normalizedBBox.x2 + 32
      ) {
        return maximum;
      }

      return Math.max(maximum, line.normalizedBBox.y2);
    }, upper.normalizedBBox.y1);
    const boundaryCenter = Math.round(
      previousContentBottom < sourceStart
        ? (previousContentBottom + sourceStart) / 2
        : sourceStart - MIN_NORMALIZED_QUESTION_GAP
    );
    const proposedLowerTop = Math.min(
      lower.normalizedBBox.y1,
      boundaryCenter + Math.ceil(MIN_NORMALIZED_QUESTION_GAP / 2)
    );
    const proposedUpperBottom = Math.min(
      upper.normalizedBBox.y2,
      proposedLowerTop - MIN_NORMALIZED_QUESTION_GAP
    );

    if (
      proposedUpperBottom - upper.normalizedBBox.y1 < MIN_NORMALIZED_QUESTION_SIZE ||
      lower.normalizedBBox.y2 - proposedLowerTop < MIN_NORMALIZED_QUESTION_SIZE
    ) {
      continue;
    }

    upper.normalizedBBox.y2 = proposedUpperBottom;
    lower.normalizedBBox.y1 = proposedLowerTop;
  }

  return aligned;
}

export function separateOverlappingQuestionDetections<
  Detection extends NormalizedQuestionDetection
>(detections: Detection[]): Detection[] {
  const normalized = detections
    .flatMap((detection, originalIndex) => {
      const normalizedBBox = normalizeQuestionBBox(detection.normalizedBBox);

      return normalizedBBox
        ? [{ ...detection, normalizedBBox, originalIndex }]
        : [];
    })
    .sort(
      (left, right) =>
        left.localOrder - right.localOrder ||
        left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
        left.normalizedBBox.x1 - right.normalizedBBox.x1 ||
        left.originalIndex - right.originalIndex
    );
  const deduplicated: typeof normalized = [];

  for (const candidate of normalized) {
    const duplicateIndex = deduplicated.findIndex((existing) =>
      areNearDuplicateQuestionBoxes(existing.normalizedBBox, candidate.normalizedBBox)
    );

    if (duplicateIndex < 0) {
      deduplicated.push(candidate);
      continue;
    }

    if (candidate.confidence > deduplicated[duplicateIndex].confidence) {
      deduplicated[duplicateIndex] = candidate;
    }
  }

  deduplicated.sort(
    (left, right) =>
      left.localOrder - right.localOrder ||
      left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1 ||
      left.originalIndex - right.originalIndex
  );

  const separated = deduplicated.map((detection) => ({
    ...detection,
    normalizedBBox: { ...detection.normalizedBBox }
  }));

  for (let index = 0; index < separated.length - 1; index += 1) {
    const upper = separated[index];
    const lower = separated[index + 1];
    const upperBBox = upper.normalizedBBox;
    const lowerBBox = lower.normalizedBBox;

    if (
      upperBBox.y1 > lowerBBox.y1 ||
      upperBBox.y2 <= lowerBBox.y1 ||
      getHorizontalOverlapRatio(upperBBox, lowerBBox) < SAME_COLUMN_OVERLAP_RATIO
    ) {
      continue;
    }

    const minimumBoundary = upperBBox.y1 + MIN_NORMALIZED_QUESTION_SIZE;
    const maximumBoundary = lowerBBox.y2 - MIN_NORMALIZED_QUESTION_SIZE;

    if (maximumBoundary - minimumBoundary < MIN_NORMALIZED_QUESTION_GAP) {
      continue;
    }

    const proposedBoundary = Math.round((upperBBox.y2 + lowerBBox.y1) / 2);
    const upperBoundary = Math.max(
      minimumBoundary,
      Math.min(
        maximumBoundary - MIN_NORMALIZED_QUESTION_GAP,
        proposedBoundary - Math.ceil(MIN_NORMALIZED_QUESTION_GAP / 2)
      )
    );

    upper.normalizedBBox.y2 = upperBoundary;
    lower.normalizedBBox.y1 = upperBoundary + MIN_NORMALIZED_QUESTION_GAP;
  }

  return separated.map(({ originalIndex: _originalIndex, ...detection }) => detection as Detection);
}

export function expandNormalizedBBox(
  bbox: { x1: number; y1: number; x2: number; y2: number },
  padding: { horizontal: number; vertical: number } = {
    horizontal: 8,
    vertical: 15
  }
) {
  return {
    x1: Math.max(0, bbox.x1 - padding.horizontal),
    y1: Math.max(0, bbox.y1 - padding.vertical),
    x2: Math.min(1000, bbox.x2 + padding.horizontal),
    y2: Math.min(1000, bbox.y2 + padding.vertical)
  };
}

export function mapNormalizedBboxToPixels(
  bbox: { x1: number; y1: number; x2: number; y2: number },
  size: { width: number; height: number }
) {
  const x = Math.round((bbox.x1 / 1000) * size.width);
  const y = Math.round((bbox.y1 / 1000) * size.height);
  const right = Math.round((bbox.x2 / 1000) * size.width);
  const bottom = Math.round((bbox.y2 / 1000) * size.height);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

export function buildQuestionDraftsFromDetection(input: {
  documentId: string;
  pageId: string;
  pageLayoutMode?: QuestionPageLayoutMode;
  detections: Array<{
    id: string;
    localOrder: number;
    confidence: number;
    normalizedBBox: { x1: number; y1: number; x2: number; y2: number };
  }>;
  textLines?: PageTextLine[];
  size: { width: number; height: number };
  globalOrderOffset?: number;
}) {
  const normalizedDetections = separateOverlappingQuestionDetections(input.detections);
  const expandedDetections = separateOverlappingQuestionDetections(
    normalizedDetections.map((detection) => ({
      ...detection,
      normalizedBBox: expandNormalizedBBox(detection.normalizedBBox)
    }))
  );
  const textAlignedDetections = alignQuestionBoundariesToTextLayout(
    expandedDetections,
    input.textLines ?? []
  );

  return textAlignedDetections.map((detection, index) => ({
    id: detection.id.startsWith(`${input.pageId}-`)
      ? detection.id
      : `${input.pageId}-${detection.id}`,
    documentId: input.documentId,
    pageIds: [input.pageId],
    primaryPageId: input.pageId,
    localOrder: detection.localOrder,
    globalOrder: (input.globalOrderOffset ?? 0) + index + 1,
    bboxByPage: {
      [input.pageId]: mapNormalizedBboxToPixels(
        detection.normalizedBBox,
        input.size
      )
    },
    source: "ai" as const,
    status: "geometry_draft" as const,
    confidence: detection.confidence,
    crossPageGroupId: null,
    ...(input.pageLayoutMode ? { pageLayoutMode: input.pageLayoutMode } : {})
  }));
}

export function buildClassificationRun(input: {
  documentId: string;
  subjectScope?: string | null;
  directoryPaths?: string[][];
  pages: Array<{
    id: string;
    reviewStatus: "reviewed" | "unreviewed";
    questionIds: string[];
  }>;
}) {
  const readyQuestionIds = input.pages
    .filter((page) => page.reviewStatus === "reviewed")
    .flatMap((page) => page.questionIds);
  const directoryPaths = (input.directoryPaths ?? [])
    .map((path) => path.slice(0, 3))
    .filter((path) => !input.subjectScope || path[0] === input.subjectScope);

  return {
    documentId: input.documentId,
    questionIds: readyQuestionIds,
    results: readyQuestionIds.map((questionId, index) => {
      const directoryPath = directoryPaths[index % directoryPaths.length] ?? null;
      const chapterTag = directoryPath?.at(-1) ?? "未分类";
      const knowledgeTags = directoryPath
        ? [`${directoryPath.at(-1) ?? input.subjectScope ?? "通用"}示例考点 ${index + 1}`]
        : [`知识点待补充 ${index + 1}`];

      if (!directoryPath) {
        return {
          questionId,
          classificationStatus: "needs_choice" as const,
          directoryMatchConfidence: 0.35,
          directoryPath: null,
          directoryCandidatePaths: [],
          questionType: "其他" as const,
          chapterTag,
          knowledgeTags,
          ocrText: `题目 ${index + 1} 的示例 OCR 结果`
        };
      }

      const directoryCandidatePaths = [
        directoryPath,
        ...directoryPaths.filter((path) => path.join(" / ") !== directoryPath.join(" / "))
      ].slice(0, 3);

      return {
        questionId,
        classificationStatus: "matched" as const,
        directoryMatchConfidence: 0.86,
        directoryPath,
        directoryCandidatePaths,
        questionType: "其他" as const,
        chapterTag,
        knowledgeTags,
        ocrText: `题目 ${index + 1} 的示例 OCR 结果`
      };
    })
  };
}
