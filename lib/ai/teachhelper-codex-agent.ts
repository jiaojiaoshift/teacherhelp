import type { QuestionClassificationResult } from "@/lib/domain/entities";
import type { PageTextLine, QuestionPageLayoutMode } from "@/lib/domain/entities";
import type { QuestionType } from "@/lib/domain/enums";
import {
  callOpenAiCompatibleJsonModel,
  getOpenAiCompatibleErrorDiagnostic
} from "@/lib/ai/openai-compatible-gateway";
import {
  buildAnswerMatchPrompt,
  buildAnswerSectionPrompt,
  buildClassificationPrompt,
  buildCrossPagePrompt,
  buildPaperReorderPrompt,
  buildPageTextLayoutPrompt,
  buildQuestionAnalysisPrompt,
  buildQuestionBoxPrompt
} from "@/lib/ai/teachhelper-ai-prompts";

export interface QuestionBoxDetection {
  id: string;
  localOrder: number;
  confidence: number;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface CrossPageDetection {
  id: string;
  sourceQuestionIds: string[];
  confidence: number;
}

export interface CrossPageQuestionCandidate {
  id: string;
  pageId: string;
  localOrder: number;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface QuestionAnalysisResult {
  questionId: string;
  solution: string | null;
  answer: string | null;
}

export interface AnswerSectionSuggestion {
  hasAnswerSection: boolean;
  suggestedSplitPage: number | null;
}

export interface AnswerMatchDetection {
  id: string;
  pageId: string;
  pageNumber: number;
  answerLabel: string;
  ocrText?: string | null;
  confidence: number;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface PaperReorderResult {
  orderedQuestionIds: string[];
}

interface QuestionPageInput {
  id: string;
  reviewStatus: "reviewed" | "unreviewed";
  imageDataUrl?: string | null;
  questionIds: string[];
  questionRegions?: Array<{
    questionId: string;
    isPrimary: boolean;
    normalizedBBox: { x1: number; y1: number; x2: number; y2: number };
  }>;
}

const pageTextLayoutCache = new Map<string, Promise<PageTextLine[]>>();
const PAGE_TEXT_LINE_ROLES = new Set<NonNullable<PageTextLine["role"]>>([
  "question_anchor",
  "question_content",
  "question_continuation",
  "knowledge_note",
  "directory",
  "header",
  "footer",
  "other"
]);
const QUESTION_TEXT_LINE_ROLES = new Set<NonNullable<PageTextLine["role"]>>([
  "question_anchor",
  "question_content",
  "question_continuation"
]);
const TOP_LEVEL_QUESTION_NUMBER_PATTERN =
  /^\s*(?:第\s*)?\d{1,3}\s*(?:[.．。、，,：:）)]|题(?:\s|$))/;
const EXERCISE_MARKER_PATTERN = /(?:例题|典题|练习|训练|试题|真题|考题|题组)/;
const INLINE_QUESTION_CUE_PATTERN =
  /(?:[?？]|（\s*）|\(\s*\)|下列|正确的是|错误的是|不正确|求(?:出|解|证)?|计算|证明|判断|选择|为多少|多大|何时|能否|是否)/;
const FOLLOWING_QUESTION_PART_PATTERN =
  /^\s*(?:[（(]\s*\d+\s*[）)]|[A-HＡ-Ｈ]\s*[.．、)）])/;
const QUESTION_REGION_STOP_PATTERN = /(?:答案|解析|解答|思路|点拨|方法总结)/;
const KNOWLEDGE_HEADING_PATTERN =
  /(?:公式|关系式|定义|性质|定理|知识点|概念|方法总结|常用公式|章节目录|目录|规律归纳|直角三角函数|二次函数|三角函数|函数值域|特殊角|求最值)/;
const QUESTION_OPTION_PATTERN =
  /(?:^|\s)[A-DＡ-Ｄ]\s*[.．、)）]/;

function linesShareVisualRow(left: PageTextLine, right: PageTextLine): boolean {
  const leftCenterY = (left.normalizedBBox.y1 + left.normalizedBBox.y2) / 2;
  const rightCenterY = (right.normalizedBBox.y1 + right.normalizedBBox.y2) / 2;
  const tallerHeight = Math.max(
    left.normalizedBBox.y2 - left.normalizedBBox.y1,
    right.normalizedBBox.y2 - right.normalizedBBox.y1
  );
  const horizontalOverlap = Math.max(
    0,
    Math.min(left.normalizedBBox.x2, right.normalizedBBox.x2) -
      Math.max(left.normalizedBBox.x1, right.normalizedBBox.x1)
  );

  return Math.abs(leftCenterY - rightCenterY) <= Math.max(18, tallerHeight) && horizontalOverlap > 0;
}

function recoverMisclassifiedExerciseLines(
  semanticLines: PageTextLine[],
  nativeLines: PageTextLine[]
): PageTextLine[] {
  const result = semanticLines.map((line) => ({
    ...line,
    normalizedBBox: { ...line.normalizedBBox }
  }));
  const evidenceLines = [...result, ...nativeLines].sort(
    (left, right) =>
      left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1
  );
  const candidateLines = evidenceLines
    .filter((line) => TOP_LEVEL_QUESTION_NUMBER_PATTERN.test(line.text))
    .filter(
      (line, index, candidates) =>
        candidates.findIndex((candidate) => linesShareVisualRow(candidate, line)) === index
    );

  for (const [candidateIndex, candidate] of candidateLines.entries()) {
    const existingLine = result.find(
      (line) =>
        TOP_LEVEL_QUESTION_NUMBER_PATTERN.test(line.text) && linesShareVisualRow(line, candidate)
    );

    if (existingLine?.role === "question_anchor") {
      continue;
    }

    const previousCandidate = candidateLines[candidateIndex - 1];
    const nextCandidate = candidateLines[candidateIndex + 1];
    const lowerBound = previousCandidate?.normalizedBBox.y2 ?? 0;
    const upperBound = nextCandidate?.normalizedBBox.y1 ?? 1000;
    const hasNearbyExerciseMarker = evidenceLines.some(
      (line) =>
        EXERCISE_MARKER_PATTERN.test(line.text) &&
        line.normalizedBBox.y2 >= Math.max(lowerBound, candidate.normalizedBBox.y1 - 140) &&
        line.normalizedBBox.y2 <= candidate.normalizedBBox.y1 + 8
    );
    const hasInlineQuestionCue =
      candidate.text.replace(/\s/g, "").length >= 12 &&
      INLINE_QUESTION_CUE_PATTERN.test(candidate.text);
    const hasFollowingQuestionPart = evidenceLines.some(
      (line) =>
        line.normalizedBBox.y1 > candidate.normalizedBBox.y1 &&
        line.normalizedBBox.y1 < upperBound &&
        line.normalizedBBox.y1 <= candidate.normalizedBBox.y2 + 360 &&
        FOLLOWING_QUESTION_PART_PATTERN.test(line.text)
    );

    if (!hasNearbyExerciseMarker && !hasInlineQuestionCue && !hasFollowingQuestionPart) {
      continue;
    }

    const anchorLine = existingLine ?? {
      ...candidate,
      normalizedBBox: { ...candidate.normalizedBBox }
    };
    anchorLine.role = "question_anchor";

    if (!existingLine) {
      result.push(anchorLine);
    }

    const regionEvidence = evidenceLines
      .filter(
        (line) =>
          line.normalizedBBox.y1 > candidate.normalizedBBox.y1 &&
          line.normalizedBBox.y1 < upperBound &&
          line.normalizedBBox.y1 <= candidate.normalizedBBox.y2 + 500
      )
      .sort(
        (left, right) =>
          left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
          left.normalizedBBox.x1 - right.normalizedBBox.x1
      );
    let previousBottom = anchorLine.normalizedBBox.y2;

    for (const line of regionEvidence) {
      if (
        line.role === "header" ||
        line.role === "footer" ||
        line.role === "directory" ||
        TOP_LEVEL_QUESTION_NUMBER_PATTERN.test(line.text) ||
        QUESTION_REGION_STOP_PATTERN.test(line.text) ||
        line.normalizedBBox.y1 - previousBottom > 90
      ) {
        break;
      }

      const matchingResultLine = result.find((item) => linesShareVisualRow(item, line));

      if (matchingResultLine) {
        if (
          !matchingResultLine.role ||
          matchingResultLine.role === "knowledge_note" ||
          matchingResultLine.role === "other"
        ) {
          matchingResultLine.role = "question_content";
        }
        previousBottom = Math.max(previousBottom, matchingResultLine.normalizedBBox.y2);
        continue;
      }

      result.push({
        ...line,
        role: "question_content",
        normalizedBBox: { ...line.normalizedBBox }
      });
      previousBottom = Math.max(previousBottom, line.normalizedBBox.y2);
    }
  }

  return result.sort(
    (left, right) =>
      left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1
  );
}

function getPageImageFingerprint(imageDataUrl: string): string {
  const prefix = imageDataUrl.slice(0, 80);
  let hash = 2166136261;

  for (let index = 0; index < imageDataUrl.length; index += 1) {
    hash ^= imageDataUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${prefix}:${imageDataUrl.length}:${hash >>> 0}`;
}

function normalizePageTextLines(value: unknown): PageTextLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 500).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const line = item as Partial<PageTextLine>;
    const bbox = line.normalizedBBox;
    const text = typeof line.text === "string" ? line.text.trim().slice(0, 500) : "";
    const role = PAGE_TEXT_LINE_ROLES.has(line.role as NonNullable<PageTextLine["role"]>)
      ? (line.role as NonNullable<PageTextLine["role"]>)
      : undefined;

    if (!text || !bbox || typeof bbox !== "object") {
      return [];
    }

    const values = [bbox.x1, bbox.y1, bbox.x2, bbox.y2];
    if (!values.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) {
      return [];
    }

    const x1 = Math.max(0, Math.min(1000, Math.round(Math.min(bbox.x1, bbox.x2))));
    const y1 = Math.max(0, Math.min(1000, Math.round(Math.min(bbox.y1, bbox.y2))));
    const x2 = Math.max(0, Math.min(1000, Math.round(Math.max(bbox.x1, bbox.x2))));
    const y2 = Math.max(0, Math.min(1000, Math.round(Math.max(bbox.y1, bbox.y2))));

    return x2 > x1 && y2 > y1
      ? [{ text, ...(role ? { role } : {}), normalizedBBox: { x1, y1, x2, y2 } }]
      : [];
  });
}

async function resolvePageTextLines(input: {
  imageDataUrl: string;
  textLines?: PageTextLine[];
  questionPageLayoutMode?: QuestionPageLayoutMode;
}): Promise<PageTextLine[]> {
  const nativeTextLines = normalizePageTextLines(input.textLines);
  const fingerprint = getPageImageFingerprint(input.imageDataUrl);
  const cacheKey = `${fingerprint}:${input.questionPageLayoutMode ?? "default"}`;

  if (nativeTextLines.some((line) => line.role)) {
    return nativeTextLines;
  }

  const cached = pageTextLayoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = callOpenAiCompatibleJsonModel<{ lines?: unknown[] }>({
    taskName: "extract-page-text-layout",
    reasoningEffort: "medium",
    timeoutMs: 600_000,
    prompt: buildPageTextLayoutPrompt(nativeTextLines, input.questionPageLayoutMode),
    imageDataUrls: [input.imageDataUrl]
  }).then((payload) =>
    recoverMisclassifiedExerciseLines(normalizePageTextLines(payload.lines), nativeTextLines)
  );

  pageTextLayoutCache.set(cacheKey, pending);

  try {
    return await pending;
  } catch (error) {
    pageTextLayoutCache.delete(cacheKey);

    if (isUpstreamBadRequest(error)) {
      return recoverMisclassifiedExerciseLines(nativeTextLines, nativeTextLines);
    }

    throw error;
  }
}

function isLineCenterInsideDetection(
  line: PageTextLine,
  bbox: QuestionBoxDetection["normalizedBBox"]
): boolean {
  const centerX = (line.normalizedBBox.x1 + line.normalizedBBox.x2) / 2;
  const centerY = (line.normalizedBBox.y1 + line.normalizedBBox.y2) / 2;

  return centerX >= bbox.x1 && centerX <= bbox.x2 && centerY >= bbox.y1 && centerY <= bbox.y2;
}

function filterDetectionsBySemanticTextLines(
  detections: QuestionBoxDetection[],
  textLines: PageTextLine[]
): QuestionBoxDetection[] {
  if (!textLines.some((line) => line.role)) {
    return detections;
  }

  return detections.filter((detection) => {
    const containedLines = textLines.filter((line) =>
      isLineCenterInsideDetection(line, detection.normalizedBBox)
    );

    return containedLines.length === 0 || containedLines.some(
      (line) => line.role && QUESTION_TEXT_LINE_ROLES.has(line.role)
    );
  });
}

function horizontalLineOverlap(left: PageTextLine, right: PageTextLine): number {
  return Math.max(
    0,
    Math.min(left.normalizedBBox.x2, right.normalizedBBox.x2) -
      Math.max(left.normalizedBBox.x1, right.normalizedBBox.x1)
  );
}

function suppressMisclassifiedKnowledgeRegions(textLines: PageTextLine[]): PageTextLine[] {
  const sortedLines = textLines
    .map((line) => ({ ...line, normalizedBBox: { ...line.normalizedBBox } }))
    .sort(
      (left, right) =>
        left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1
    );
  const result = sortedLines.map((line) => ({
    ...line,
    normalizedBBox: { ...line.normalizedBBox }
  }));
  const anchors = result.filter((line) => line.role === "question_anchor");

  if (!anchors.length) {
    return textLines;
  }

  anchors.forEach((anchor) => {
    if (!KNOWLEDGE_HEADING_PATTERN.test(anchor.text)) {
      return;
    }

    const nextSameColumnAnchor = anchors
      .filter(
        (candidate) =>
          candidate !== anchor &&
          candidate.normalizedBBox.y1 > anchor.normalizedBBox.y1 &&
          horizontalLineOverlap(anchor, candidate) > 0
      )
      .sort((left, right) => left.normalizedBBox.y1 - right.normalizedBBox.y1)[0];
    const upperY = nextSameColumnAnchor?.normalizedBBox.y1 ?? 1000;

    const relatedLines = result.filter((line) => {
      if (line === anchor || line.normalizedBBox.y1 <= anchor.normalizedBBox.y1) {
        return false;
      }

      if (horizontalLineOverlap(anchor, line) <= 0) {
        return false;
      }

      if (line.normalizedBBox.y1 >= upperY) {
        return false;
      }

      const verticalGap = line.normalizedBBox.y1 - anchor.normalizedBBox.y2;
      return verticalGap <= 520;
    });
    const regionLines = [anchor, ...relatedLines];
    const anchorText = anchor.text.replace(/求最值/g, "");
    const relatedText = relatedLines.map((line) => line.text).join(" ");
    const hasExerciseCue =
      INLINE_QUESTION_CUE_PATTERN.test(anchorText) ||
      INLINE_QUESTION_CUE_PATTERN.test(relatedText) ||
      EXERCISE_MARKER_PATTERN.test(relatedText) ||
      regionLines.some((line) => QUESTION_OPTION_PATTERN.test(line.text));

    if (hasExerciseCue) {
      return;
    }

    regionLines.forEach((line) => {
      if (line.role === "question_anchor" || line.role === "question_content") {
        line.role = "knowledge_note";
      }
    });
  });

  return result.sort(
    (left, right) =>
      left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1
  );
}

function getQuestionBoxFallbackTextLines(textLines: PageTextLine[]): PageTextLine[] {
  const questionLines = textLines.filter(
    (line) => line.role && QUESTION_TEXT_LINE_ROLES.has(line.role)
  );

  return questionLines.length < textLines.length ? questionLines : [];
}

function isUpstreamBadRequest(error: unknown): boolean {
  const diagnostic = getOpenAiCompatibleErrorDiagnostic(error);

  return diagnostic.kind === "upstream_http" && diagnostic.status === 400;
}

function addMissingSemanticAnchorDetections(
  detections: QuestionBoxDetection[],
  textLines: PageTextLine[]
): QuestionBoxDetection[] {
  const sortedLines = textLines
    .slice()
    .sort(
      (left, right) =>
        left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
        left.normalizedBBox.x1 - right.normalizedBBox.x1
    );
  const anchors = sortedLines.filter((line) => line.role === "question_anchor");

  if (!anchors.length) {
    return detections;
  }

  const result = detections.slice();

  for (const [anchorIndex, anchor] of anchors.entries()) {
    const anchorCovered = result.some((detection) =>
      isLineCenterInsideDetection(anchor, {
        x1: detection.normalizedBBox.x1 - 20,
        y1: detection.normalizedBBox.y1 - 20,
        x2: detection.normalizedBBox.x2 + 20,
        y2: detection.normalizedBBox.y2 + 20
      })
    );

    if (anchorCovered) {
      continue;
    }

    const nextAnchor = anchors[anchorIndex + 1];
    const questionLines = sortedLines.filter(
      (line) =>
        (line === anchor || line.role === "question_content") &&
        line.normalizedBBox.y1 >= anchor.normalizedBBox.y1 - 12 &&
        (!nextAnchor || line.normalizedBBox.y1 < nextAnchor.normalizedBBox.y1)
    );
    const regionLines = questionLines.length ? questionLines : [anchor];
    const x1 = Math.max(
      0,
      Math.min(...regionLines.map((line) => line.normalizedBBox.x1)) - 20
    );
    const y1 = Math.max(0, anchor.normalizedBBox.y1 - 16);
    const x2 = Math.min(
      1000,
      Math.max(...regionLines.map((line) => line.normalizedBBox.x2)) + 20
    );
    const y2 = Math.min(
      1000,
      Math.max(...regionLines.map((line) => line.normalizedBBox.y2)) + 20
    );

    if (x2 - x1 < 20 || y2 - y1 < 20) {
      continue;
    }

    result.push({
      id: `semantic-anchor-${anchorIndex + 1}`,
      localOrder: anchorIndex + 1,
      confidence: 0.75,
      normalizedBBox: { x1, y1, x2, y2 }
    });
  }

  return result
    .sort(
      (left, right) =>
        left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
        left.normalizedBBox.x1 - right.normalizedBBox.x1 ||
        left.localOrder - right.localOrder
    )
    .map((detection, index) => ({
      ...detection,
      localOrder: index + 1
    }));
}

function clampConfidence(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeQuestionType(value: unknown): QuestionType | null {
  const allowedTypes = new Set(["选择题", "填空题", "简答题", "证明题", "计算题", "其他"]);

  return typeof value === "string" && allowedTypes.has(value)
    ? (value as QuestionType)
    : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeStringPath(value: unknown): string[] | null {
  const path = normalizeStringArray(value);

  return path.length > 0 ? path : null;
}

function normalizeStringPathList(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeStringPath(item))
    .filter((item): item is string[] => Boolean(item));
}

export async function detectQuestionBoxesWithTextLayout(input: {
  imageDataUrl: string;
  subjectScope?: string;
  textLines?: PageTextLine[];
  questionPageLayoutMode?: QuestionPageLayoutMode;
}): Promise<{
  detections: QuestionBoxDetection[];
  textLines: PageTextLine[];
}> {
  const textLines = suppressMisclassifiedKnowledgeRegions(
    await resolvePageTextLines(input)
  );
  const requestQuestionBoxes = (promptTextLines: PageTextLine[]) =>
    callOpenAiCompatibleJsonModel<{ detections?: unknown[] }>({
      taskName: "detect-question-boxes",
      reasoningEffort: "high",
      timeoutMs: 600_000,
      prompt: buildQuestionBoxPrompt(
        input.subjectScope,
        promptTextLines,
        input.questionPageLayoutMode
      ),
      imageDataUrls: [input.imageDataUrl]
    });
  let payload: { detections?: unknown[] };

  try {
    payload = await requestQuestionBoxes(textLines);
  } catch (error) {
    if (!isUpstreamBadRequest(error)) {
      throw error;
    }

    const fallbackTextLines = getQuestionBoxFallbackTextLines(textLines);

    try {
      payload = await requestQuestionBoxes(fallbackTextLines);
    } catch (fallbackError) {
      if (!isUpstreamBadRequest(fallbackError)) {
        throw fallbackError;
      }

      payload = await requestQuestionBoxes([]);
    }
  }

  const detections = (payload.detections ?? []).flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const detection = item as Partial<QuestionBoxDetection>;
    const bbox = detection.normalizedBBox;

    if (!bbox || typeof bbox !== "object") {
      return [];
    }

    return [
      {
        id: typeof detection.id === "string" ? detection.id : `draft-${index + 1}`,
        localOrder: typeof detection.localOrder === "number" ? detection.localOrder : index + 1,
        confidence: clampConfidence(detection.confidence, 0.7),
        normalizedBBox: {
          x1: typeof bbox.x1 === "number" ? bbox.x1 : 0,
          y1: typeof bbox.y1 === "number" ? bbox.y1 : 0,
          x2: typeof bbox.x2 === "number" ? bbox.x2 : 1000,
          y2: typeof bbox.y2 === "number" ? bbox.y2 : 1000
        }
      }
    ];
  });

  return {
    detections: addMissingSemanticAnchorDetections(
      filterDetectionsBySemanticTextLines(detections, textLines),
      textLines
    ),
    textLines
  };
}

export async function detectQuestionBoxesWithCodex(input: {
  imageDataUrl: string;
  subjectScope?: string;
  textLines?: PageTextLine[];
  questionPageLayoutMode?: QuestionPageLayoutMode;
}): Promise<QuestionBoxDetection[]> {
  const result = await detectQuestionBoxesWithTextLayout(input);

  return result.detections;
}

export async function detectCrossPageWithCodex(input: {
  leftImageDataUrl: string;
  rightImageDataUrl: string;
  leftPageId: string;
  rightPageId: string;
  leftTextLines?: PageTextLine[];
  rightTextLines?: PageTextLine[];
  candidates: CrossPageQuestionCandidate[];
}): Promise<CrossPageDetection[]> {
  const [leftTextLines, rightTextLines] = await Promise.all([
    resolvePageTextLines({
      imageDataUrl: input.leftImageDataUrl,
      textLines: input.leftTextLines
    }),
    resolvePageTextLines({
      imageDataUrl: input.rightImageDataUrl,
      textLines: input.rightTextLines
    })
  ]);
  const payload = await callOpenAiCompatibleJsonModel<{ mergeCandidates?: unknown[] }>({
    taskName: "detect-cross-page",
    reasoningEffort: "high",
    timeoutMs: 600_000,
    prompt: buildCrossPagePrompt({
      leftPageId: input.leftPageId,
      rightPageId: input.rightPageId,
      leftTextLines,
      rightTextLines,
      candidates: input.candidates
    }),
    imageDataUrls: [input.leftImageDataUrl, input.rightImageDataUrl]
  });

  const allowedQuestionIds = new Set(input.candidates.map((candidate) => candidate.id));

  return (payload.mergeCandidates ?? []).flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Partial<CrossPageDetection>;
    const sourceQuestionIds = normalizeStringArray(candidate.sourceQuestionIds);

    if (
      sourceQuestionIds.length < 2 ||
      sourceQuestionIds.some((questionId) => !allowedQuestionIds.has(questionId))
    ) {
      return [];
    }

    return [
      {
        id: typeof candidate.id === "string" ? candidate.id : `merge-${index + 1}`,
        sourceQuestionIds,
        confidence: clampConfidence(candidate.confidence, 0.7)
      }
    ];
  });
}

export async function classifyDocumentQuestionsWithCodex(input: {
  pages: QuestionPageInput[];
  directoryPaths?: string[][];
  subjectScope?: string;
}): Promise<QuestionClassificationResult[]> {
  const reviewedPages = input.pages.filter((page) => page.reviewStatus === "reviewed");
  const questionIds = reviewedPages.flatMap((page) => page.questionIds);
  const prompt = [
    buildClassificationPrompt(input.subjectScope, input.directoryPaths),
    "",
    "Input question ids and page ids:",
    JSON.stringify(
      reviewedPages.map((page) => ({
        pageId: page.id,
        questionIds: page.questionIds,
        questionRegions: page.questionRegions ?? []
      }))
    )
  ].join("\n");
  const payload = await callOpenAiCompatibleJsonModel<{ results?: unknown[] }>({
    taskName: "classify-document-questions",
    timeoutMs: 600_000,
    prompt,
    imageDataUrls: reviewedPages
      .map((page) => page.imageDataUrl)
      .filter((imageDataUrl): imageDataUrl is string => Boolean(imageDataUrl))
  });
  const allowedQuestionIds = new Set(questionIds);

  return (payload.results ?? []).flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const result = item as Partial<QuestionClassificationResult>;

    if (typeof result.questionId !== "string" || !allowedQuestionIds.has(result.questionId)) {
      return [];
    }

    const status = result.classificationStatus;
    const classificationStatus =
      status === "matched" || status === "needs_choice" || status === "pending_bucket" || status === "confirmed"
        ? status
        : "needs_choice";

    return [
      {
        questionId: result.questionId,
        classificationStatus,
        directoryMatchConfidence:
          typeof result.directoryMatchConfidence === "number"
            ? clampConfidence(result.directoryMatchConfidence, 0.5)
            : null,
        directoryPath: normalizeStringPath(result.directoryPath),
        directoryCandidatePaths: normalizeStringPathList(result.directoryCandidatePaths),
        questionType: normalizeQuestionType(result.questionType),
        chapterTag: typeof result.chapterTag === "string" ? result.chapterTag : null,
        knowledgeTags: normalizeStringArray(result.knowledgeTags),
        questionNumberLabel:
          typeof result.questionNumberLabel === "string" ? result.questionNumberLabel : null,
        ocrText: typeof result.ocrText === "string" ? result.ocrText : null
      }
    ];
  });
}

export async function analyzeQuestionWithCodex(input: {
  questionId: string;
  ocrText: string;
  subjectScope?: string;
}): Promise<QuestionAnalysisResult> {
  const payload = await callOpenAiCompatibleJsonModel<Partial<QuestionAnalysisResult>>({
    taskName: "analyze-question",
    prompt: `${buildQuestionAnalysisPrompt(input.subjectScope)}\n题目ID：${input.questionId}\n题目内容：${input.ocrText}`
  });

  return {
    questionId: input.questionId,
    solution: typeof payload.solution === "string" ? payload.solution : null,
    answer: typeof payload.answer === "string" ? payload.answer : null
  };
}

export async function suggestAnswerSectionWithCodex(input: {
  pageCount: number;
  pageImageDataUrls: string[];
}): Promise<AnswerSectionSuggestion> {
  const payload = await callOpenAiCompatibleJsonModel<Partial<AnswerSectionSuggestion>>({
    taskName: "suggest-answer-section",
    prompt: buildAnswerSectionPrompt(input.pageCount),
    imageDataUrls: input.pageImageDataUrls
  });

  return {
    hasAnswerSection: Boolean(payload.hasAnswerSection),
    suggestedSplitPage:
      typeof payload.suggestedSplitPage === "number" ? payload.suggestedSplitPage : null
  };
}

export async function suggestAnswerMatchesWithCodex(input: {
  answerPages: Array<{
    pageId: string;
    pageNumber: number;
    imageDataUrl: string;
  }>;
  questionLabels: string[];
}): Promise<AnswerMatchDetection[]> {
  const payload = await callOpenAiCompatibleJsonModel<{ detectedAnswers?: unknown[] }>({
    taskName: "suggest-answer-matches",
    timeoutMs: 600_000,
    prompt: buildAnswerMatchPrompt({
      answerPages: input.answerPages.map((page) => ({
        pageId: page.pageId,
        pageNumber: page.pageNumber
      })),
      questionLabels: input.questionLabels
    }),
    imageDataUrls: input.answerPages.map((page) => page.imageDataUrl)
  });

  return (payload.detectedAnswers ?? []).flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const answer = item as Partial<AnswerMatchDetection>;
    const bbox = answer.normalizedBBox;

    if (
      typeof answer.pageId !== "string" ||
      typeof answer.pageNumber !== "number" ||
      typeof answer.answerLabel !== "string" ||
      !bbox
    ) {
      return [];
    }

    return [
      {
        id: typeof answer.id === "string" ? answer.id : `${answer.pageId}-answer-${index + 1}`,
        pageId: answer.pageId,
        pageNumber: answer.pageNumber,
        answerLabel: answer.answerLabel,
        ocrText: typeof answer.ocrText === "string" ? answer.ocrText : null,
        confidence: clampConfidence(answer.confidence, 0.7),
        normalizedBBox: {
          x1: typeof bbox.x1 === "number" ? bbox.x1 : 0,
          y1: typeof bbox.y1 === "number" ? bbox.y1 : 0,
          x2: typeof bbox.x2 === "number" ? bbox.x2 : 1000,
          y2: typeof bbox.y2 === "number" ? bbox.y2 : 1000
        }
      }
    ];
  });
}

export async function reorderPaperWithCodex(input: {
  instruction: string;
  questions: Array<{
    id: string;
    questionNumberLabel?: string | null;
    ocrText?: string | null;
  }>;
}): Promise<PaperReorderResult> {
  const questionIds = new Set(input.questions.map((question) => question.id));
  const payload = await callOpenAiCompatibleJsonModel<Partial<PaperReorderResult>>({
    taskName: "reorder-paper",
    prompt: buildPaperReorderPrompt(input)
  });
  const orderedQuestionIds = normalizeStringArray(payload.orderedQuestionIds).filter((id) =>
    questionIds.has(id)
  );

  return {
    orderedQuestionIds
  };
}
