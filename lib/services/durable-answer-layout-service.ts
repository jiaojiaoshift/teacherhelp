import type { PageTextLine } from "@/lib/domain/entities";

const PAGE_TOP = 0;
const PAGE_BOTTOM = 1000;
const ANSWER_MARGIN = 10;
const BODY_LEFT_MIN = 120;
const BODY_LEFT_MAX = 220;
const BODY_LINE_MIN_HEIGHT = 10;

export interface NativeAnswerPageLayout {
  pageNumber: number;
  textLines: PageTextLine[];
}

export interface NativeAnswerRegion {
  id: string;
  answerLabel: string;
  pageNumber: number;
  ocrText: string;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface NativeAnswerLayoutResult {
  complete: boolean;
  regions: NativeAnswerRegion[];
  missingAnswerLabels: string[];
}

interface AnswerAnchor {
  answerLabel: string;
  pageIndex: number;
  lineIndex: number;
  line: PageTextLine;
}

function compareAnswerAnchors(left: AnswerAnchor, right: AnswerAnchor) {
  return (
    left.pageIndex - right.pageIndex ||
    left.line.normalizedBBox.y1 - right.line.normalizedBBox.y1 ||
    left.lineIndex - right.lineIndex
  );
}

function selectUniqueOrderedAnchorChain(input: {
  expectedLabels: string[];
  anchorsByLabel: Map<string, AnswerAnchor[]>;
}): AnswerAnchor[] | null {
  const solutions: AnswerAnchor[][] = [];

  const visit = (
    labelIndex: number,
    previousAnchor: AnswerAnchor | null,
    chain: AnswerAnchor[]
  ) => {
    if (solutions.length > 1) {
      return;
    }

    if (labelIndex >= input.expectedLabels.length) {
      solutions.push(chain.slice());
      return;
    }

    const label = input.expectedLabels[labelIndex];
    const candidates = (input.anchorsByLabel.get(label) ?? [])
      .slice()
      .sort(compareAnswerAnchors);

    for (const candidate of candidates) {
      if (previousAnchor && compareAnswerAnchors(candidate, previousAnchor) <= 0) {
        continue;
      }

      chain.push(candidate);
      visit(labelIndex + 1, candidate, chain);
      chain.pop();

      if (solutions.length > 1) {
        return;
      }
    }
  };

  visit(0, null, []);

  return solutions.length === 1 ? solutions[0] : null;
}

function readLeadingAnswerLabel(line: PageTextLine): string | null {
  const x1 = line.normalizedBBox.x1;
  const height = line.normalizedBBox.y2 - line.normalizedBBox.y1;

  if (x1 < BODY_LEFT_MIN || x1 > BODY_LEFT_MAX || height < BODY_LINE_MIN_HEIGHT) {
    return null;
  }

  return /^(\d{1,3})(?:\s|[.．、。])/.exec(line.text.trim())?.[1] ?? null;
}

function collectRegionText(input: {
  pages: NativeAnswerPageLayout[];
  pageIndex: number;
  y1: number;
  y2: number;
}) {
  return input.pages[input.pageIndex].textLines
    .filter(
      (line) =>
        line.normalizedBBox.y2 > input.y1 && line.normalizedBBox.y1 < input.y2
    )
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join("\n");
}

export function buildNativeAnswerRegions(input: {
  expectedAnswerLabels: string[];
  pages: NativeAnswerPageLayout[];
}): NativeAnswerLayoutResult {
  const expectedLabels = input.expectedAnswerLabels.map((label) => label.trim());
  const expectedLabelSet = new Set(expectedLabels);
  const anchorsByLabel = new Map<string, AnswerAnchor[]>();

  input.pages.forEach((page, pageIndex) => {
    page.textLines.forEach((line, lineIndex) => {
      const answerLabel = readLeadingAnswerLabel(line);

      if (!answerLabel || !expectedLabelSet.has(answerLabel)) {
        return;
      }

      const anchors = anchorsByLabel.get(answerLabel) ?? [];
      anchors.push({ answerLabel, pageIndex, lineIndex, line });
      anchorsByLabel.set(answerLabel, anchors);
    });
  });

  const missingAnswerLabels = expectedLabels.filter(
    (label) => (anchorsByLabel.get(label)?.length ?? 0) === 0
  );

  if (missingAnswerLabels.length > 0) {
    return {
      complete: false,
      regions: [],
      missingAnswerLabels
    };
  }

  const anchors = selectUniqueOrderedAnchorChain({
    expectedLabels,
    anchorsByLabel
  });

  if (!anchors) {
    return {
      complete: false,
      regions: [],
      missingAnswerLabels: expectedLabels
    };
  }

  const regions: NativeAnswerRegion[] = [];

  anchors.forEach((anchor, anchorIndex) => {
    const nextAnchor = anchors[anchorIndex + 1] ?? null;
    const lastPageIndex = nextAnchor ? nextAnchor.pageIndex : input.pages.length - 1;

    for (let pageIndex = anchor.pageIndex; pageIndex <= lastPageIndex; pageIndex += 1) {
      const isFirstPage = pageIndex === anchor.pageIndex;
      const isLastPage = nextAnchor?.pageIndex === pageIndex;
      const y1 = isFirstPage
        ? Math.max(PAGE_TOP, anchor.line.normalizedBBox.y1 - ANSWER_MARGIN)
        : PAGE_TOP;
      const y2 = isLastPage && nextAnchor
        ? Math.min(PAGE_BOTTOM, nextAnchor.line.normalizedBBox.y1 - ANSWER_MARGIN)
        : PAGE_BOTTOM;

      if (y2 <= y1) {
        continue;
      }

      const page = input.pages[pageIndex];
      const ocrText = collectRegionText({ pages: input.pages, pageIndex, y1, y2 });

      if (!isFirstPage && !ocrText) {
        continue;
      }

      regions.push({
        id: `native-answer-${anchor.answerLabel}-page-${page.pageNumber}`,
        answerLabel: anchor.answerLabel,
        pageNumber: page.pageNumber,
        ocrText,
        normalizedBBox: {
          x1: 0,
          y1,
          x2: 1000,
          y2
        }
      });
    }
  });

  return {
    complete: true,
    regions,
    missingAnswerLabels: []
  };
}
