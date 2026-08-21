import type {
  PageTextLine,
  QuestionPageLayoutMode
} from "@/lib/domain/entities";

type PageLayoutInput = {
  id: string;
  documentId: string;
  width: number;
  height: number;
  pageNumber?: number;
  textLines?: PageTextLine[];
};

type QuestionBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type QuestionLayoutInput = {
  documentId: string;
  pageIds: string[];
  bboxByPage: Record<string, QuestionBBox>;
};

type OrderedQuestionLayoutInput = QuestionLayoutInput & {
  id: string;
  primaryPageId: string;
  localOrder: number;
  globalOrder: number;
};

type HorizontalLane = {
  left: number;
  right: number;
};

type NormalizedHorizontalSample = HorizontalLane & {
  center: number;
  width: number;
};

const MIN_TRUSTED_WIDTH_RATIO = 0.28;
const SINGLE_COLUMN_WIDTH_RATIO = 0.55;
const DOUBLE_COLUMN_SPANNING_WIDTH_RATIO = 0.62;
const DOUBLE_COLUMN_GUTTER_LEFT = 0.49;
const DOUBLE_COLUMN_GUTTER_RIGHT = 0.51;
const DOUBLE_COLUMN_LANE_MARGIN = 0.012;

const DOUBLE_COLUMN_TEXT_ROLES = new Set<PageTextLine["role"]>([
  "question_anchor",
  "question_content",
  "question_continuation"
]);

const EMBEDDED_QUESTION_BADGE_PATTERN = /^\s*第\s*\d{1,4}\s*题\s*$/u;
const TOP_LEVEL_QUESTION_NUMBER_PATTERN = /^\s*\d{1,4}\s*(?:[.．、:：)）])/u;
const SUBQUESTION_NUMBER_PATTERN = /^\s*[（(]\s*(\d{1,2})\s*[)）]/u;

function quantile(sortedValues: number[], ratio: number) {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * ratio))
  );

  return sortedValues[index];
}

function buildLane(samples: NormalizedHorizontalSample[]): HorizontalLane | null {
  if (samples.length === 0) {
    return null;
  }

  const leftValues = samples.map((sample) => sample.left).sort((left, right) => left - right);
  const rightValues = samples.map((sample) => sample.right).sort((left, right) => left - right);
  const trimRatio = samples.length >= 8 ? 0.1 : 0;
  const left = quantile(leftValues, trimRatio);
  const right = quantile(rightValues, 1 - trimRatio);

  return right > left ? { left, right } : null;
}

function buildDoubleColumnLane(
  samples: NormalizedHorizontalSample[],
  side: "left" | "right"
): HorizontalLane | null {
  if (samples.length === 0) {
    return null;
  }

  const leftValues = samples.map((sample) => sample.left).sort((left, right) => left - right);
  const rightValues = samples.map((sample) => sample.right).sort((left, right) => left - right);
  const trimRatio = samples.length >= 12 ? 0.08 : 0;
  const rawLeft = quantile(leftValues, trimRatio) - DOUBLE_COLUMN_LANE_MARGIN;
  const rawRight = quantile(rightValues, 1 - trimRatio) + DOUBLE_COLUMN_LANE_MARGIN;
  const left = side === "left"
    ? Math.max(0, rawLeft)
    : Math.max(DOUBLE_COLUMN_GUTTER_RIGHT, rawLeft);
  const right = side === "left"
    ? Math.min(DOUBLE_COLUMN_GUTTER_LEFT, rawRight)
    : Math.min(1, rawRight);

  return right > left ? { left, right } : null;
}

function collectDoubleColumnSamples(input: {
  pages: PageLayoutInput[];
  questions: QuestionLayoutInput[];
}): NormalizedHorizontalSample[] {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const textSamples = input.pages.flatMap((page) =>
    (page.textLines ?? []).flatMap((line) => {
      if (line.role && !DOUBLE_COLUMN_TEXT_ROLES.has(line.role)) {
        return [];
      }

      const left = Math.max(0, Math.min(1, line.normalizedBBox.x1 / 1000));
      const right = Math.max(0, Math.min(1, line.normalizedBBox.x2 / 1000));
      const width = right - left;
      const center = (left + right) / 2;

      if (width <= 0 || (left < 0.48 && right > 0.52)) {
        return [];
      }

      return [{ left, right, width, center }];
    })
  );
  const boxSamples = input.questions.flatMap((question) =>
    Object.entries(question.bboxByPage).flatMap(([pageId, bbox]) => {
      const page = pageById.get(pageId);

      if (!page || page.width <= 0 || bbox.width <= 0) {
        return [];
      }

      const left = Math.max(0, bbox.x / page.width);
      const right = Math.min(1, (bbox.x + bbox.width) / page.width);
      const width = right - left;
      const center = (left + right) / 2;

      return width > 0 && width < SINGLE_COLUMN_WIDTH_RATIO
        ? [{ left, right, width, center }]
        : [];
    })
  );

  return [...textSamples, ...boxSamples];
}

function resolveDoubleColumnLanes(samples: NormalizedHorizontalSample[]): HorizontalLane[] {
  const leftLane = buildDoubleColumnLane(
    samples.filter((sample) => sample.center < 0.5),
    "left"
  );
  const rightLane = buildDoubleColumnLane(
    samples.filter((sample) => sample.center >= 0.5),
    "right"
  );

  return [leftLane, rightLane].filter((lane): lane is HorizontalLane => Boolean(lane));
}

function isSpanningDoubleColumnBox(input: {
  bbox: QuestionBBox;
  page: PageLayoutInput;
  lanes: HorizontalLane[];
}) {
  const left = input.bbox.x / input.page.width;
  const right = (input.bbox.x + input.bbox.width) / input.page.width;
  const width = right - left;

  if (width >= DOUBLE_COLUMN_SPANNING_WIDTH_RATIO) {
    return true;
  }

  if (input.lanes.length < 2) {
    return false;
  }

  const [leftLane, rightLane] = input.lanes;

  return (
    width >= SINGLE_COLUMN_WIDTH_RATIO &&
    left <= leftLane.left + 0.04 &&
    right >= rightLane.right - 0.04
  );
}

function getTextLinesInsideBox(page: PageLayoutInput, bbox: QuestionBBox): PageTextLine[] {
  if (page.width <= 0 || page.height <= 0) {
    return [];
  }

  const normalizedBox = {
    x1: (bbox.x / page.width) * 1000,
    y1: (bbox.y / page.height) * 1000,
    x2: ((bbox.x + bbox.width) / page.width) * 1000,
    y2: ((bbox.y + bbox.height) / page.height) * 1000
  };

  return (page.textLines ?? []).filter((line) => {
    const centerX = (line.normalizedBBox.x1 + line.normalizedBBox.x2) / 2;
    const centerY = (line.normalizedBBox.y1 + line.normalizedBBox.y2) / 2;

    return (
      centerX >= normalizedBox.x1 - 20 &&
      centerX <= normalizedBox.x2 + 20 &&
      centerY >= normalizedBox.y1 - 12 &&
      centerY <= normalizedBox.y2 + 12
    );
  });
}

function extractSubquestionNumbers(lines: PageTextLine[]): number[] {
  return lines.flatMap((line) => {
    const match = SUBQUESTION_NUMBER_PATTERN.exec(line.text);
    return match ? [Number.parseInt(match[1], 10)] : [];
  });
}

function canMergeEmbeddedBadgeContinuation(input: {
  page: PageLayoutInput;
  upperBBox: QuestionBBox;
  lowerBBox: QuestionBBox;
}) {
  const gap = input.lowerBBox.y - (input.upperBBox.y + input.upperBBox.height);

  if (gap < -input.page.height * 0.01 || gap > input.page.height * 0.035) {
    return false;
  }

  const upperLines = getTextLinesInsideBox(input.page, input.upperBBox);
  const lowerLines = getTextLinesInsideBox(input.page, input.lowerBBox);
  const lowerTop = (input.lowerBBox.y / input.page.height) * 1000;
  const badgeLines = lowerLines.filter((line) =>
    EMBEDDED_QUESTION_BADGE_PATTERN.test(line.text)
  );

  if (
    badgeLines.length === 0 ||
    badgeLines.every((line) => line.normalizedBBox.y1 > lowerTop + 60) ||
    lowerLines.some(
      (line) =>
        !EMBEDDED_QUESTION_BADGE_PATTERN.test(line.text) &&
        TOP_LEVEL_QUESTION_NUMBER_PATTERN.test(line.text)
    ) ||
    !upperLines.some((line) => TOP_LEVEL_QUESTION_NUMBER_PATTERN.test(line.text))
  ) {
    return false;
  }

  const upperSubquestions = extractSubquestionNumbers(upperLines);
  const lowerSubquestions = extractSubquestionNumbers(lowerLines);

  if (upperSubquestions.length === 0 || lowerSubquestions.length === 0) {
    return false;
  }

  const upperMaximum = Math.max(...upperSubquestions);
  const lowerMinimum = Math.min(...lowerSubquestions);

  return lowerMinimum >= 2 && lowerMinimum === upperMaximum + 1;
}

function mergeQuestionBoxesOnPage<T extends OrderedQuestionLayoutInput>(input: {
  upper: T;
  lower: T;
  pageId: string;
}): T {
  const upperBBox = input.upper.bboxByPage[input.pageId];
  const lowerBBox = input.lower.bboxByPage[input.pageId];
  const x = Math.min(upperBBox.x, lowerBBox.x);
  const y = Math.min(upperBBox.y, lowerBBox.y);
  const right = Math.max(
    upperBBox.x + upperBBox.width,
    lowerBBox.x + lowerBBox.width
  );
  const bottom = Math.max(
    upperBBox.y + upperBBox.height,
    lowerBBox.y + lowerBBox.height
  );

  return {
    ...input.upper,
    pageIds: Array.from(new Set([...input.upper.pageIds, ...input.lower.pageIds])),
    bboxByPage: {
      ...input.lower.bboxByPage,
      ...input.upper.bboxByPage,
      [input.pageId]: {
        x,
        y,
        width: right - x,
        height: bottom - y
      }
    }
  };
}

function mergeEmbeddedBadgeContinuations<T extends OrderedQuestionLayoutInput>(input: {
  pages: PageLayoutInput[];
  questions: T[];
  lanesByDocumentId: Map<string, HorizontalLane[]>;
}): T[] {
  let result = input.questions.slice();

  for (const page of input.pages) {
    const lanes = input.lanesByDocumentId.get(page.documentId) ?? [];

    if (lanes.length === 0) {
      continue;
    }

    const questionsByLane = new Map<number, T[]>();

    for (const question of result) {
      const bbox = question.bboxByPage[page.id];

      if (
        !bbox ||
        question.primaryPageId !== page.id ||
        question.pageIds.length !== 1 ||
        isSpanningDoubleColumnBox({ bbox, page, lanes })
      ) {
        continue;
      }

      const lane = selectLane({ bbox, page, lanes });
      const laneIndex = lane ? lanes.indexOf(lane) : -1;

      if (laneIndex < 0) {
        continue;
      }

      const questions = questionsByLane.get(laneIndex) ?? [];
      questions.push(question);
      questionsByLane.set(laneIndex, questions);
    }

    for (const laneQuestions of questionsByLane.values()) {
      laneQuestions.sort(
        (left, right) =>
          left.bboxByPage[page.id].y - right.bboxByPage[page.id].y ||
          left.globalOrder - right.globalOrder
      );

      for (let index = 0; index < laneQuestions.length - 1;) {
        const upper = laneQuestions[index];
        const lower = laneQuestions[index + 1];
        const upperBBox = upper.bboxByPage[page.id];
        const lowerBBox = lower.bboxByPage[page.id];

        if (!canMergeEmbeddedBadgeContinuation({ page, upperBBox, lowerBBox })) {
          index += 1;
          continue;
        }

        const merged = mergeQuestionBoxesOnPage({ upper, lower, pageId: page.id });
        result = result
          .filter((question) => question.id !== lower.id)
          .map((question) => question.id === upper.id ? merged : question);
        laneQuestions.splice(index, 2, merged);
      }
    }
  }

  return result;
}

function getLaneIndex(input: {
  bbox: QuestionBBox;
  page: PageLayoutInput;
  lanes: HorizontalLane[];
}) {
  const lane = selectLane(input);
  const laneIndex = lane ? input.lanes.indexOf(lane) : -1;

  return laneIndex >= 0 ? laneIndex : Number.MAX_SAFE_INTEGER;
}

function separateOverlappingDoubleColumnBoxes<T extends OrderedQuestionLayoutInput>(input: {
  pages: PageLayoutInput[];
  questions: T[];
  lanesByDocumentId: Map<string, HorizontalLane[]>;
}): T[] {
  const updatesByQuestionId = new Map<string, Record<string, QuestionBBox>>();
  const getBBox = (question: T, pageId: string) =>
    updatesByQuestionId.get(question.id)?.[pageId] ?? question.bboxByPage[pageId];
  const setBBox = (question: T, pageId: string, bbox: QuestionBBox) => {
    const updates = updatesByQuestionId.get(question.id) ?? {};
    updates[pageId] = bbox;
    updatesByQuestionId.set(question.id, updates);
  };

  for (const page of input.pages) {
    const lanes = input.lanesByDocumentId.get(page.documentId) ?? [];

    if (lanes.length === 0) {
      continue;
    }

    const withBoxes = input.questions.filter((question) => question.bboxByPage[page.id]);
    const spanning = withBoxes
      .filter((question) =>
        isSpanningDoubleColumnBox({
          bbox: question.bboxByPage[page.id],
          page,
          lanes
        })
      )
      .sort((left, right) => {
        const leftBBox = left.bboxByPage[page.id];
        const rightBBox = right.bboxByPage[page.id];
        return leftBBox.y - rightBBox.y || left.globalOrder - right.globalOrder;
      });
    const groups = new Map<string, T[]>();

    for (const question of withBoxes) {
      if (spanning.includes(question)) {
        continue;
      }

      const bbox = question.bboxByPage[page.id];
      const laneIndex = getLaneIndex({ bbox, page, lanes });

      if (laneIndex === Number.MAX_SAFE_INTEGER) {
        continue;
      }

      const centerY = bbox.y + bbox.height / 2;
      const segmentIndex = spanning.filter((barrier) => {
        const barrierBBox = barrier.bboxByPage[page.id];
        return barrierBBox.y + barrierBBox.height / 2 < centerY;
      }).length;
      const key = `${segmentIndex}:${laneIndex}`;
      const questions = groups.get(key) ?? [];
      questions.push(question);
      groups.set(key, questions);
    }

    for (const questions of groups.values()) {
      questions.sort((left, right) => {
        const leftBBox = getBBox(left, page.id);
        const rightBBox = getBBox(right, page.id);
        return leftBBox.y - rightBBox.y || left.globalOrder - right.globalOrder;
      });

      for (let index = 0; index < questions.length - 1; index += 1) {
        const upper = questions[index];
        const lower = questions[index + 1];
        const upperBBox = getBBox(upper, page.id);
        const lowerBBox = getBBox(lower, page.id);
        const upperBottom = upperBBox.y + upperBBox.height;

        if (upperBottom <= lowerBBox.y) {
          continue;
        }

        const lowerBottom = lowerBBox.y + lowerBBox.height;
        const boundary = Math.max(
          upperBBox.y + 1,
          Math.min(
            lowerBottom - 1,
            Math.round((upperBottom + lowerBBox.y) / 2)
          )
        );

        setBBox(upper, page.id, {
          ...upperBBox,
          height: boundary - upperBBox.y
        });
        setBBox(lower, page.id, {
          ...lowerBBox,
          y: boundary,
          height: lowerBottom - boundary
        });
      }
    }
  }

  return input.questions.map((question) => {
    const updates = updatesByQuestionId.get(question.id);

    return updates
      ? {
          ...question,
          bboxByPage: {
            ...question.bboxByPage,
            ...updates
          }
        }
      : question;
  });
}

function orderDoubleColumnPageQuestions<T extends OrderedQuestionLayoutInput>(input: {
  page: PageLayoutInput;
  questions: T[];
  lanes: HorizontalLane[];
}): T[] {
  const withBoxes = input.questions.filter((question) => question.bboxByPage[input.page.id]);
  const withoutBoxes = input.questions.filter((question) => !question.bboxByPage[input.page.id]);
  const spanning = withBoxes
    .filter((question) =>
      isSpanningDoubleColumnBox({
        bbox: question.bboxByPage[input.page.id],
        page: input.page,
        lanes: input.lanes
      })
    )
    .sort((left, right) => {
      const leftBBox = left.bboxByPage[input.page.id];
      const rightBBox = right.bboxByPage[input.page.id];
      return leftBBox.y - rightBBox.y || left.globalOrder - right.globalOrder;
    });
  const ordinary = withBoxes.filter((question) => !spanning.includes(question));
  const segments = Array.from({ length: spanning.length + 1 }, () => [] as T[]);

  for (const question of ordinary) {
    const bbox = question.bboxByPage[input.page.id];
    const centerY = bbox.y + bbox.height / 2;
    const segmentIndex = spanning.filter((barrier) => {
      const barrierBBox = barrier.bboxByPage[input.page.id];
      return barrierBBox.y + barrierBBox.height / 2 < centerY;
    }).length;
    segments[segmentIndex].push(question);
  }

  const ordered: T[] = [];

  for (const [segmentIndex, segment] of segments.entries()) {
    segment.sort((left, right) => {
      const leftBBox = left.bboxByPage[input.page.id];
      const rightBBox = right.bboxByPage[input.page.id];
      const laneDifference = getLaneIndex({
        bbox: leftBBox,
        page: input.page,
        lanes: input.lanes
      }) - getLaneIndex({
        bbox: rightBBox,
        page: input.page,
        lanes: input.lanes
      });

      return (
        laneDifference ||
        leftBBox.y - rightBBox.y ||
        leftBBox.x - rightBBox.x ||
        left.globalOrder - right.globalOrder
      );
    });
    ordered.push(...segment);

    if (spanning[segmentIndex]) {
      ordered.push(spanning[segmentIndex]);
    }
  }

  return [...ordered, ...withoutBoxes].map((question, index) => ({
    ...question,
    localOrder: index + 1
  }));
}

function orderDoubleColumnQuestions<T extends OrderedQuestionLayoutInput>(input: {
  pages: PageLayoutInput[];
  questions: T[];
  lanesByDocumentId: Map<string, HorizontalLane[]>;
}): T[] {
  const documentIds = Array.from(new Set(input.questions.map((question) => question.documentId)));
  const pagePosition = new Map(input.pages.map((page, index) => [page.id, index]));
  const ordered: T[] = [];

  for (const documentId of documentIds) {
    const pages = input.pages
      .filter((page) => page.documentId === documentId)
      .slice()
      .sort(
        (left, right) =>
          (left.pageNumber ?? pagePosition.get(left.id) ?? 0) -
          (right.pageNumber ?? pagePosition.get(right.id) ?? 0)
      );
    const lanes = input.lanesByDocumentId.get(documentId) ?? [];
    const documentQuestions = input.questions.filter(
      (question) => question.documentId === documentId
    );
    const consumedIds = new Set<string>();
    const documentOrdered: T[] = [];

    for (const page of pages) {
      const pageQuestions = documentQuestions.filter(
        (question) => question.primaryPageId === page.id
      );
      const pageOrdered = orderDoubleColumnPageQuestions({
        page,
        questions: pageQuestions,
        lanes
      });
      pageOrdered.forEach((question) => consumedIds.add(question.id));
      documentOrdered.push(...pageOrdered);
    }

    documentOrdered.push(
      ...documentQuestions.filter((question) => !consumedIds.has(question.id))
    );
    ordered.push(
      ...documentOrdered.map((question, index) => ({
        ...question,
        globalOrder: index + 1
      }))
    );
  }

  return ordered;
}

function collectDocumentSamples(input: {
  pages: PageLayoutInput[];
  questions: QuestionLayoutInput[];
}) {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));

  return input.questions.flatMap((question) =>
    Object.entries(question.bboxByPage).flatMap(([pageId, bbox]) => {
      const page = pageById.get(pageId);

      if (!page || page.width <= 0 || bbox.width <= 0) {
        return [];
      }

      const left = Math.max(0, bbox.x / page.width);
      const right = Math.min(1, (bbox.x + bbox.width) / page.width);
      const width = right - left;

      return width >= MIN_TRUSTED_WIDTH_RATIO
        ? [{ left, right, width, center: (left + right) / 2 }]
        : [];
    })
  );
}

function resolveDocumentLanes(samples: NormalizedHorizontalSample[]): HorizontalLane[] {
  if (samples.length === 0) {
    return [];
  }

  const wideSampleCount = samples.filter(
    (sample) => sample.width >= SINGLE_COLUMN_WIDTH_RATIO
  ).length;

  if (wideSampleCount >= Math.ceil(samples.length / 2)) {
    const lane = buildLane(samples.filter((sample) => sample.width >= SINGLE_COLUMN_WIDTH_RATIO));
    return lane ? [lane] : [];
  }

  const columnSamples = samples.filter((sample) => sample.width < SINGLE_COLUMN_WIDTH_RATIO);
  const leftLane = buildLane(columnSamples.filter((sample) => sample.center < 0.5));
  const rightLane = buildLane(columnSamples.filter((sample) => sample.center >= 0.5));

  if (leftLane && rightLane) {
    return [leftLane, rightLane];
  }

  const fallback = buildLane(samples);
  return fallback ? [fallback] : [];
}

function horizontalOverlap(left: HorizontalLane, right: HorizontalLane) {
  return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
}

function selectLane(input: {
  bbox: QuestionBBox;
  page: PageLayoutInput;
  lanes: HorizontalLane[];
}) {
  if (input.lanes.length <= 1) {
    return input.lanes[0] ?? null;
  }

  const bboxLane = {
    left: input.bbox.x / input.page.width,
    right: (input.bbox.x + input.bbox.width) / input.page.width
  };
  const bboxCenter = (bboxLane.left + bboxLane.right) / 2;

  return input.lanes
    .map((lane) => ({
      lane,
      overlap: horizontalOverlap(bboxLane, lane),
      centerDistance: Math.abs((lane.left + lane.right) / 2 - bboxCenter)
    }))
    .sort(
      (left, right) =>
        right.overlap - left.overlap || left.centerDistance - right.centerDistance
    )[0]?.lane ?? null;
}

export function normalizeQuestionPageLayout<T extends OrderedQuestionLayoutInput>(input: {
  questionPageLayoutMode?: QuestionPageLayoutMode;
  pages: PageLayoutInput[];
  questions: T[];
}): T[] {
  if (input.questionPageLayoutMode !== "double_column") {
    return input.questions;
  }

  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const questionsByDocumentId = new Map<string, T[]>();

  input.questions.forEach((question) => {
    const questions = questionsByDocumentId.get(question.documentId) ?? [];
    questions.push(question);
    questionsByDocumentId.set(question.documentId, questions);
  });

  const lanesByDocumentId = new Map<string, HorizontalLane[]>();
  questionsByDocumentId.forEach((questions, documentId) => {
    const pages = input.pages.filter((page) => page.documentId === documentId);
    lanesByDocumentId.set(
      documentId,
      resolveDoubleColumnLanes(collectDoubleColumnSamples({ pages, questions }))
    );
  });
  const mergedQuestions = mergeEmbeddedBadgeContinuations({
    pages: input.pages,
    questions: input.questions,
    lanesByDocumentId
  });

  const normalizedQuestions = mergedQuestions.map((question) => {
    const lanes = lanesByDocumentId.get(question.documentId) ?? [];

    if (lanes.length === 0) {
      return question;
    }

    const bboxByPage = Object.fromEntries(
      Object.entries(question.bboxByPage).map(([pageId, bbox]) => {
        const page = pageById.get(pageId);

        if (!page || page.width <= 0 || isSpanningDoubleColumnBox({ bbox, page, lanes })) {
          return [pageId, bbox];
        }

        const lane = selectLane({ bbox, page, lanes });

        if (!lane) {
          return [pageId, bbox];
        }

        const x = Math.max(0, Math.round(lane.left * page.width));
        const right = Math.min(page.width, Math.round(lane.right * page.width));

        return [
          pageId,
          {
            x,
            y: bbox.y,
            width: Math.max(1, right - x),
            height: bbox.height
          }
        ];
      })
    );

    return {
      ...question,
      bboxByPage
    };
  });

  const separatedQuestions = separateOverlappingDoubleColumnBoxes({
    pages: input.pages,
    questions: normalizedQuestions,
    lanesByDocumentId
  });

  return orderDoubleColumnQuestions({
    pages: input.pages,
    questions: separatedQuestions,
    lanesByDocumentId
  });
}

export function normalizeCrossPageQuestionWidths<T extends QuestionLayoutInput>(input: {
  pages: PageLayoutInput[];
  questions: T[];
}): T[] {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const questionsByDocumentId = new Map<string, T[]>();

  input.questions.forEach((question) => {
    const questions = questionsByDocumentId.get(question.documentId) ?? [];
    questions.push(question);
    questionsByDocumentId.set(question.documentId, questions);
  });

  const lanesByDocumentId = new Map<string, HorizontalLane[]>();
  questionsByDocumentId.forEach((questions, documentId) => {
    const pages = input.pages.filter((page) => page.documentId === documentId);
    lanesByDocumentId.set(
      documentId,
      resolveDocumentLanes(collectDocumentSamples({ pages, questions }))
    );
  });

  return input.questions.map((question) => {
    if (question.pageIds.length < 2) {
      return question;
    }

    const lanes = lanesByDocumentId.get(question.documentId) ?? [];
    if (lanes.length === 0) {
      return question;
    }

    const bboxByPage = Object.fromEntries(
      Object.entries(question.bboxByPage).map(([pageId, bbox]) => {
        const page = pageById.get(pageId);
        const lane = page ? selectLane({ bbox, page, lanes }) : null;

        if (!page || !lane) {
          return [pageId, bbox];
        }

        const x = Math.max(0, Math.round(lane.left * page.width));
        const right = Math.min(page.width, Math.round(lane.right * page.width));

        return [
          pageId,
          {
            x,
            y: bbox.y,
            width: Math.max(1, right - x),
            height: bbox.height
          }
        ];
      })
    );

    return {
      ...question,
      bboxByPage
    };
  });
}
