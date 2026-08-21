import { PDFDocument, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";

import type {
  ExamDocumentQuestionBlock,
  PageEntity,
  QuestionDraftEntity
} from "@/lib/domain/entities";

type SpecializedPaperDocument = {
  title: string;
  numberingMode: "resequence" | "custom_numeric";
  questionIds: string[];
  questionBlocks?: ExamDocumentQuestionBlock[];
};

type SpecializedPaperQuestion = Pick<
  QuestionDraftEntity,
  | "id"
  | "pageIds"
  | "questionNumberLabel"
  | "bboxByPage"
  | "questionImageAttachments"
  | "pageLayoutMode"
>;

type SpecializedPaperPage = Pick<
  PageEntity,
  "id" | "pageNumber" | "width" | "height" | "displayAssetId"
>;

type ReadableAsset = {
  mimeType: string;
  data: Buffer;
};

type QuestionFragment = {
  image: Image;
  bbox: { x: number; y: number; width: number; height: number };
  renderDpi?: number;
};

export interface SpecializedPaperPlacement {
  questionId: string;
  pageNumber: number;
  column: "left" | "right" | "full";
  x: number;
  y: number;
  width: number;
  height: number;
  displayNumber: string;
}

export function mapPageBBoxToImagePixels(input: {
  bbox: { x: number; y: number; width: number; height: number };
  image: { width: number; height: number };
  page: { width: number; height: number };
}) {
  const pageWidth = Math.max(1, input.page.width);
  const pageHeight = Math.max(1, input.page.height);
  const left = Math.max(
    0,
    Math.min(input.image.width - 1, Math.floor((input.bbox.x / pageWidth) * input.image.width))
  );
  const top = Math.max(
    0,
    Math.min(input.image.height - 1, Math.floor((input.bbox.y / pageHeight) * input.image.height))
  );
  const right = Math.max(
    left + 1,
    Math.min(
      input.image.width,
      Math.ceil(((input.bbox.x + input.bbox.width) / pageWidth) * input.image.width)
    )
  );
  const bottom = Math.max(
    top + 1,
    Math.min(
      input.image.height,
      Math.ceil(((input.bbox.y + input.bbox.height) / pageHeight) * input.image.height)
    )
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const PAGE_MARGIN = 36;
const PAGE_HEADER_HEIGHT = 32;
const QUESTION_LABEL_HEIGHT = 18;
const QUESTION_GAP = 18;
const FRAGMENT_GAP = 8;
const DOUBLE_COLUMN_GAP = 18;
const DOUBLE_COLUMN_WIDTH = (A4_WIDTH - PAGE_MARGIN * 2 - DOUBLE_COLUMN_GAP) / 2;

function sanitizeFileName(title: string) {
  return title.trim().replace(/[\\/:*?"<>|]/g, "_") || "specialized-paper";
}

function buildDateToken(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function resolveDisplayNumber(input: {
  document: SpecializedPaperDocument;
  question: SpecializedPaperQuestion;
  index: number;
}) {
  return input.document.numberingMode === "resequence"
    ? String(input.index + 1)
    : input.question.questionNumberLabel?.trim() || String(input.index + 1);
}

async function loadQuestionFragments(input: {
  question: SpecializedPaperQuestion;
  pageById: Map<string, SpecializedPaperPage>;
  readAsset: (assetId: string) => Promise<ReadableAsset | null>;
}) {
  const fragments: QuestionFragment[] = [];
  const attachmentByPageId = new Map(
    (input.question.questionImageAttachments ?? []).map((attachment) => [
      attachment.pageId,
      attachment
    ])
  );

  for (const pageId of input.question.pageIds) {
    const page = input.pageById.get(pageId);
    const bbox = input.question.bboxByPage[pageId];

    if (!page?.displayAssetId || !bbox || bbox.width <= 0 || bbox.height <= 0) {
      continue;
    }

    const attachment = attachmentByPageId.get(pageId);
    const durableAsset = attachment ? await input.readAsset(attachment.assetId) : null;

    if (durableAsset && attachment) {
      const image = await loadImage(durableAsset.data);
      fragments.push({
        image,
        bbox: { x: 0, y: 0, width: image.width, height: image.height },
        renderDpi: attachment.renderDpi
      });
      continue;
    }

    const asset = await input.readAsset(page.displayAssetId);
    if (!asset) {
      continue;
    }

    const image = await loadImage(asset.data);

    fragments.push({
      image,
      bbox: mapPageBBoxToImagePixels({ bbox, image, page })
    });
  }

  return fragments;
}

function resolveQuestionScale(input: {
  fragments: QuestionFragment[];
  availableHeight: number;
  availableWidth?: number;
}) {
  return resolveQuestionExportScale({
    fragments: input.fragments.map((fragment) => ({
      pixelWidth: fragment.bbox.width,
      pixelHeight: fragment.bbox.height,
      renderDpi: fragment.renderDpi
    })),
    availableHeight: input.availableHeight,
    availableWidth: input.availableWidth
  });
}

export function resolveQuestionExportScale(input: {
  fragments: Array<{ pixelWidth: number; pixelHeight: number; renderDpi?: number }>;
  availableHeight: number;
  availableWidth?: number;
}) {
  const maxWidth = Math.max(...input.fragments.map((fragment) => fragment.pixelWidth));
  const totalSourceHeight = input.fragments.reduce(
    (total, fragment) => total + fragment.pixelHeight,
    0
  );
  const gapHeight = Math.max(0, input.fragments.length - 1) * FRAGMENT_GAP;
  const widthScale =
    (input.availableWidth ?? A4_WIDTH - PAGE_MARGIN * 2) / Math.max(1, maxWidth);
  const heightScale =
    (input.availableHeight - QUESTION_LABEL_HEIGHT - gapHeight) /
    Math.max(1, totalSourceHeight);
  const naturalDpiScale = input.fragments.every(
    (fragment) => typeof fragment.renderDpi === "number" && fragment.renderDpi > 0
  )
    ? Math.min(...input.fragments.map((fragment) => 72 / fragment.renderDpi!))
    : Number.POSITIVE_INFINITY;

  return Math.max(0.05, Math.min(widthScale, heightScale, naturalDpiScale));
}

function resolveQuestionHeight(fragments: QuestionFragment[], scale: number) {
  return (
    QUESTION_LABEL_HEIGHT +
    fragments.reduce((total, fragment) => total + fragment.bbox.height * scale, 0) +
    Math.max(0, fragments.length - 1) * FRAGMENT_GAP
  );
}

export async function buildSpecializedPaperPdf(input: {
  document: SpecializedPaperDocument;
  questions: SpecializedPaperQuestion[];
  pages: SpecializedPaperPage[];
  readAsset: (assetId: string) => Promise<ReadableAsset | null>;
}): Promise<{
  fileName: string;
  data: Buffer;
  placements: SpecializedPaperPlacement[];
}> {
  const pdf = new PDFDocument({
    title: input.document.title,
    creator: "TeachHelper",
    producer: "TeachHelper",
    compressionLevel: 6
  });
  const questionById = new Map(input.questions.map((question) => [question.id, question]));
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const orderedQuestions = input.document.questionIds
    .map((questionId, originalIndex) => ({
      question: questionById.get(questionId),
      originalIndex
    }))
    .filter(
      (entry): entry is { question: SpecializedPaperQuestion; originalIndex: number } =>
        Boolean(entry.question)
    )
    .sort((left, right) => {
      const leftPriority = left.question.pageLayoutMode === "double_column" ? 0 : 1;
      const rightPriority = right.question.pageLayoutMode === "double_column" ? 0 : 1;
      return leftPriority - rightPriority || left.originalIndex - right.originalIndex;
    });
  const placements: SpecializedPaperPlacement[] = [];
  let context: SKRSContext2D | null = null;
  let cursorY = 0;
  let pageNumber = 0;
  let questionCountOnPage = 0;
  let activeLayoutMode: "single_column" | "double_column" | null = null;
  let doubleColumn: "left" | "right" = "left";

  const beginPage = () => {
    context = pdf.beginPage(A4_WIDTH, A4_HEIGHT) as SKRSContext2D;
    pageNumber += 1;
    questionCountOnPage = 0;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);
    context.fillStyle = "#111827";
    context.font = "bold 16px Microsoft YaHei, sans-serif";
    context.fillText(input.document.title, PAGE_MARGIN, PAGE_MARGIN - 8);
    context.fillStyle = "#64748b";
    context.font = "10px Microsoft YaHei, sans-serif";
    context.textAlign = "right";
    context.fillText(String(pageNumber), A4_WIDTH - PAGE_MARGIN, PAGE_MARGIN - 8);
    context.textAlign = "left";
    cursorY = PAGE_MARGIN + PAGE_HEADER_HEIGHT;
  };

  const finishPage = () => {
    if (context) {
      pdf.endPage();
      context = null;
    }
  };

  for (let index = 0; index < orderedQuestions.length; index += 1) {
    const question = orderedQuestions[index].question;
    const layoutMode = question.pageLayoutMode ?? "single_column";

    const fragments = await loadQuestionFragments({
      question,
      pageById,
      readAsset: input.readAsset
    });

    if (fragments.length === 0) {
      continue;
    }

    const fullPageAvailableHeight =
      A4_HEIGHT - PAGE_MARGIN - (PAGE_MARGIN + PAGE_HEADER_HEIGHT);
    const displayNumber = resolveDisplayNumber({ document: input.document, question, index });

    if (layoutMode === "single_column" && activeLayoutMode === "double_column") {
      finishPage();
    }

    activeLayoutMode = layoutMode;

    if (layoutMode === "double_column") {
      if (!context) {
        beginPage();
        doubleColumn = "left";
      }

      const scale = resolveQuestionScale({
        fragments,
        availableHeight: fullPageAvailableHeight,
        availableWidth: DOUBLE_COLUMN_WIDTH
      });
      const questionHeight = resolveQuestionHeight(fragments, scale);
      const remainingHeight = A4_HEIGHT - PAGE_MARGIN - cursorY;

      if (questionCountOnPage > 0 && questionHeight > remainingHeight) {
        if (doubleColumn === "left") {
          doubleColumn = "right";
          cursorY = PAGE_MARGIN + PAGE_HEADER_HEIGHT;
        } else {
          finishPage();
          beginPage();
          doubleColumn = "left";
        }
      }

      const columnX = doubleColumn === "left"
        ? PAGE_MARGIN
        : PAGE_MARGIN + DOUBLE_COLUMN_WIDTH + DOUBLE_COLUMN_GAP;
      const placementY = cursorY;
      const renderWidth = Math.max(...fragments.map((fragment) => fragment.bbox.width * scale));

      context!.fillStyle = "#0f172a";
      context!.font = "bold 12px Microsoft YaHei, sans-serif";
      context!.fillText(`Q${displayNumber}`, columnX, cursorY + 12);
      cursorY += QUESTION_LABEL_HEIGHT;

      fragments.forEach((fragment, fragmentIndex) => {
        const fragmentWidth = fragment.bbox.width * scale;
        const fragmentHeight = fragment.bbox.height * scale;

        context!.drawImage(
          fragment.image,
          fragment.bbox.x,
          fragment.bbox.y,
          fragment.bbox.width,
          fragment.bbox.height,
          columnX,
          cursorY,
          fragmentWidth,
          fragmentHeight
        );
        cursorY += fragmentHeight;

        if (fragmentIndex < fragments.length - 1) {
          cursorY += FRAGMENT_GAP;
        }
      });

      placements.push({
        questionId: question.id,
        pageNumber,
        column: doubleColumn,
        x: columnX,
        y: placementY,
        width: renderWidth,
        height: questionHeight,
        displayNumber
      });
      cursorY += QUESTION_GAP;
      questionCountOnPage += 1;
      continue;
    }

    if (!context) {
      beginPage();
    }

    const widthScale = resolveQuestionScale({
      fragments,
      availableHeight: Number.MAX_SAFE_INTEGER
    });
    const widthScaledHeight = resolveQuestionHeight(fragments, widthScale);
    const remainingHeight = A4_HEIGHT - PAGE_MARGIN - cursorY;

    if (questionCountOnPage > 0 && widthScaledHeight > remainingHeight) {
      finishPage();
      beginPage();
    }

    const scale = resolveQuestionScale({
      fragments,
      availableHeight: fullPageAvailableHeight
    });
    const placementY = cursorY;
    const renderWidth = Math.max(...fragments.map((fragment) => fragment.bbox.width * scale));
    const questionHeight = resolveQuestionHeight(fragments, scale);

    context!.fillStyle = "#0f172a";
    context!.font = "bold 12px Microsoft YaHei, sans-serif";
    context!.fillText(`Q${displayNumber}`, PAGE_MARGIN, cursorY + 12);
    cursorY += QUESTION_LABEL_HEIGHT;

    fragments.forEach((fragment, fragmentIndex) => {
      const fragmentWidth = fragment.bbox.width * scale;
      const fragmentHeight = fragment.bbox.height * scale;

      context!.drawImage(
        fragment.image,
        fragment.bbox.x,
        fragment.bbox.y,
        fragment.bbox.width,
        fragment.bbox.height,
        PAGE_MARGIN,
        cursorY,
        fragmentWidth,
        fragmentHeight
      );
      cursorY += fragmentHeight;

      if (fragmentIndex < fragments.length - 1) {
        cursorY += FRAGMENT_GAP;
      }
    });

    placements.push({
      questionId: question.id,
      pageNumber,
      column: "full",
      x: PAGE_MARGIN,
      y: placementY,
      width: renderWidth,
      height: questionHeight,
      displayNumber
    });
    cursorY += QUESTION_GAP;
    questionCountOnPage += 1;
  }

  if (!context && pageNumber === 0) {
    beginPage();
    context!.fillStyle = "#64748b";
    context!.font = "12px Microsoft YaHei, sans-serif";
    context!.fillText("当前专题卷没有可导出的题目。", PAGE_MARGIN, cursorY + 12);
  }

  finishPage();

  return {
    fileName: `${sanitizeFileName(input.document.title)}_${buildDateToken(new Date())}.pdf`,
    data: pdf.close(),
    placements
  };
}
