import type {
  BinaryAssetEntity,
  ExamLibraryDocumentEntity,
  QuestionDraftEntity,
  UploadedPdfPageEntity
} from "@/lib/domain/entities";

type LecturePreviewLayout = {
  pageWidth: number;
  pageHeight: number;
  padding: number;
  gap: number;
  labelHeight: number;
};

type LecturePreviewQuestion = Pick<
  QuestionDraftEntity,
  "id" | "primaryPageId" | "bboxByPage" | "questionNumberLabel"
>;

type LecturePreviewDocument = Pick<ExamLibraryDocumentEntity, "questionIds" | "uploadedPdfPages">;

type LecturePreviewAsset = Pick<BinaryAssetEntity, "id" | "dataUrl">;

export interface UploadedPdfLecturePreviewItem {
  questionId: string;
  displayNumber: string;
  sourceDataUrl: string;
  previewDataUrl: string;
  sourcePage: {
    width: number;
    height: number;
  };
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface UploadedPdfLecturePreviewPage {
  index: number;
  items: UploadedPdfLecturePreviewItem[];
}

export interface UploadedPdfLecturePreviewResult {
  layout: LecturePreviewLayout;
  pages: UploadedPdfLecturePreviewPage[];
}

const DEFAULT_LAYOUT: LecturePreviewLayout = {
  pageWidth: 720,
  pageHeight: 960,
  padding: 40,
  gap: 24,
  labelHeight: 32
};

function resolveDisplayNumber(question: LecturePreviewQuestion, index: number): string {
  return question.questionNumberLabel?.trim() || String(index + 1);
}

function resolveQuestionRenderHeight(input: {
  page: UploadedPdfPageEntity;
  bbox: { x: number; y: number; width: number; height: number };
  layout: LecturePreviewLayout;
}) {
  const availableWidth = Math.max(1, input.layout.pageWidth - input.layout.padding * 2);
  const scale = availableWidth / input.page.width;

  return Math.max(1, Math.round(input.bbox.height * scale));
}

export function buildCroppedQuestionPreviewDataUrl(input: {
  sourceDataUrl: string;
  page: Pick<UploadedPdfPageEntity, "width" | "height">;
  bbox: { x: number; y: number; width: number; height: number };
}) {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${input.bbox.x} ${input.bbox.y} ${input.bbox.width} ${input.bbox.height}">`,
    `<image href="${input.sourceDataUrl}" x="0" y="0" width="${input.page.width}" height="${input.page.height}" preserveAspectRatio="none" />`,
    "</svg>"
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildUploadedPdfLecturePreview(input: {
  document: LecturePreviewDocument;
  questionDrafts: LecturePreviewQuestion[];
  binaryAssets: LecturePreviewAsset[];
  layout?: Partial<LecturePreviewLayout>;
}): UploadedPdfLecturePreviewResult {
  const layout = {
    ...DEFAULT_LAYOUT,
    ...input.layout
  };
  const pageById = new Map(
    (input.document.uploadedPdfPages ?? []).map((page) => [page.pageId, page])
  );
  const assetById = new Map(input.binaryAssets.map((asset) => [asset.id, asset]));
  const questionById = new Map(input.questionDrafts.map((question) => [question.id, question]));
  const previewPages: UploadedPdfLecturePreviewPage[] = [];
  let currentPage: UploadedPdfLecturePreviewPage = {
    index: 1,
    items: []
  };
  let currentY = layout.padding;

  input.document.questionIds.forEach((questionId, index) => {
    const question = questionById.get(questionId);

    if (!question) {
      return;
    }

    const page = pageById.get(question.primaryPageId);
    const bbox = question.bboxByPage[question.primaryPageId];

    if (!page || !bbox) {
      return;
    }

    const previewAsset = assetById.get(page.previewAssetId);

    if (!previewAsset?.dataUrl) {
      return;
    }

    const renderedHeight = resolveQuestionRenderHeight({
      page,
      bbox,
      layout
    });
    const questionBlockHeight = layout.labelHeight + renderedHeight;
    const usableBottom = layout.pageHeight - layout.padding;

    if (currentPage.items.length > 0 && currentY + questionBlockHeight > usableBottom) {
      previewPages.push(currentPage);
      currentPage = {
        index: currentPage.index + 1,
        items: []
      };
      currentY = layout.padding;
    }

    currentPage.items.push({
      questionId,
      displayNumber: resolveDisplayNumber(question, index),
      sourceDataUrl: previewAsset.dataUrl,
      previewDataUrl: buildCroppedQuestionPreviewDataUrl({
        sourceDataUrl: previewAsset.dataUrl,
        page,
        bbox
      }),
      sourcePage: {
        width: page.width,
        height: page.height
      },
      crop: bbox,
      frame: {
        x: layout.padding,
        y: currentY + layout.labelHeight,
        width: layout.pageWidth - layout.padding * 2,
        height: renderedHeight
      }
    });
    currentY += questionBlockHeight + layout.gap;
  });

  if (currentPage.items.length > 0) {
    previewPages.push(currentPage);
  }

  return {
    layout,
    pages: previewPages
  };
}
