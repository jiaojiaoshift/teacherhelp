import type {
  BinaryAssetEntity,
  PageEntity,
  QuestionDraftEntity,
  QuestionImageAttachment
} from "@/lib/domain/entities";
import {
  renderPdfArrayBufferToPagePreviews,
  renderPdfBlobToPagePreviews,
  type RenderedPdfPagePreview
} from "@/lib/pdf/pdf-renderer";
import { readBlobAsDataUrl } from "@/lib/utils/blob-data-url";
import { DEFAULT_PDF_RENDER_BATCH_SIZE } from "@/lib/services/upload-capacity";

export const DURABLE_QUESTION_RENDER_DPI = 300;
const PDF_POINTS_PER_INCH = 72;
const QUESTION_IMAGE_VERSION = 1 as const;

export interface RenderedQuestionCropInput {
  blob: Blob;
  sourceWidth: number;
  sourceHeight: number;
  crop: { x: number; y: number; width: number; height: number };
  mimeType: "image/png";
}

export interface RenderedQuestionCrop {
  dataUrl: string;
  width: number;
  height: number;
}

type RenderPdf = typeof renderPdfArrayBufferToPagePreviews;
type RenderPdfBlob = typeof renderPdfBlobToPagePreviews;
type CropRenderedPage = (input: RenderedQuestionCropInput) => Promise<RenderedQuestionCrop>;

const loadedPageImages = new WeakMap<Blob, Promise<HTMLImageElement>>();

function estimateDataUrlByteLength(dataUrl: string) {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

function loadRenderedPageImage(blob: Blob): Promise<HTMLImageElement> {
  const existing = loadedPageImages.get(blob);

  if (existing) {
    return existing;
  }

  const loaded = readBlobAsDataUrl(blob).then(
    (dataUrl) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load the high-resolution PDF page"));
        image.src = dataUrl;
      })
  );

  loadedPageImages.set(blob, loaded);
  return loaded;
}

export async function cropRenderedQuestionPage(
  input: RenderedQuestionCropInput
): Promise<RenderedQuestionCrop> {
  const image = await loadRenderedPageImage(input.blob);
  const canvas = document.createElement("canvas");
  canvas.width = input.crop.width;
  canvas.height = input.crop.height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create the durable question image canvas");
  }

  context.drawImage(
    image,
    input.crop.x,
    input.crop.y,
    input.crop.width,
    input.crop.height,
    0,
    0,
    input.crop.width,
    input.crop.height
  );

  return {
    dataUrl: canvas.toDataURL(input.mimeType),
    width: canvas.width,
    height: canvas.height
  };
}

export function mapQuestionBBoxToRenderedPixels(input: {
  bbox: { x: number; y: number; width: number; height: number };
  page: Pick<PageEntity, "width" | "height">;
  renderedPage: Pick<RenderedPdfPagePreview, "width" | "height">;
}) {
  const pageWidth = Math.max(1, input.page.width);
  const pageHeight = Math.max(1, input.page.height);
  const left = Math.max(
    0,
    Math.min(
      input.renderedPage.width - 1,
      Math.floor((input.bbox.x / pageWidth) * input.renderedPage.width)
    )
  );
  const top = Math.max(
    0,
    Math.min(
      input.renderedPage.height - 1,
      Math.floor((input.bbox.y / pageHeight) * input.renderedPage.height)
    )
  );
  const right = Math.max(
    left + 1,
    Math.min(
      input.renderedPage.width,
      Math.ceil(((input.bbox.x + input.bbox.width) / pageWidth) * input.renderedPage.width)
    )
  );
  const bottom = Math.max(
    top + 1,
    Math.min(
      input.renderedPage.height,
      Math.ceil(((input.bbox.y + input.bbox.height) / pageHeight) * input.renderedPage.height)
    )
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function buildAssetId(questionId: string, pageId: string) {
  return `question-crop-v${QUESTION_IMAGE_VERSION}-${questionId}-${pageId}`;
}

function buildAttachmentId(questionId: string, pageId: string) {
  return `question-image-v${QUESTION_IMAGE_VERSION}-${questionId}-${pageId}`;
}

export async function materializeDurableQuestionImages(input: {
  documentId: string;
  sourcePdfArrayBuffer?: ArrayBuffer;
  sourcePdfBlob?: Blob;
  pages: PageEntity[];
  questions: QuestionDraftEntity[];
  renderPdf?: RenderPdf;
  renderPdfBlob?: RenderPdfBlob;
  cropRenderedPage?: CropRenderedPage;
}): Promise<{ assets: BinaryAssetEntity[]; questions: QuestionDraftEntity[] }> {
  const pages = input.pages.filter((page) => page.documentId === input.documentId);
  const questions = input.questions.filter((question) => question.documentId === input.documentId);
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const pageNumbers = Array.from(
    new Set(
      questions.flatMap((question) =>
        question.pageIds.map((pageId) => {
          const page = pageById.get(pageId);

          if (!page) {
            throw new Error(`Question ${question.id} references unavailable page ${pageId}`);
          }

          return page.pageNumber;
        })
      )
    )
  ).sort((left, right) => left - right);
  const cropRenderedPage = input.cropRenderedPage ?? cropRenderedQuestionPage;
  const assets: BinaryAssetEntity[] = [];
  const attachmentByQuestionAndPage = new Map<string, QuestionImageAttachment>();
  const processedPageNumbers = new Set<number>();

  const processRenderedPages = async (renderedPages: RenderedPdfPagePreview[]) => {
    for (const renderedPage of renderedPages) {
      if (processedPageNumbers.has(renderedPage.pageNumber)) {
        continue;
      }

      processedPageNumbers.add(renderedPage.pageNumber);

      const page = pages.find((candidate) => candidate.pageNumber === renderedPage.pageNumber);

      if (!page) {
        continue;
      }

      const pageQuestions = questions.filter((question) => question.pageIds.includes(page.id));

      for (const question of pageQuestions) {
        const bbox = question.bboxByPage[page.id];

        if (!bbox) {
          throw new Error(`Question ${question.id} has incomplete geometry for page ${page.id}`);
        }

        const crop = mapQuestionBBoxToRenderedPixels({ bbox, page, renderedPage });
        const cropped = await cropRenderedPage({
          blob: renderedPage.blob,
          sourceWidth: renderedPage.width,
          sourceHeight: renderedPage.height,
          crop,
          mimeType: "image/png"
        });
        const assetId = buildAssetId(question.id, page.id);

        assets.push({
          id: assetId,
          documentId: input.documentId,
          pageId: page.id,
          kind: "question_crop",
          mimeType: "image/png",
          byteLength: estimateDataUrlByteLength(cropped.dataUrl),
          dataUrl: cropped.dataUrl
        });
        attachmentByQuestionAndPage.set(`${question.id}:${page.id}`, {
          id: buildAttachmentId(question.id, page.id),
          assetId,
          pageId: page.id,
          pixelWidth: cropped.width,
          pixelHeight: cropped.height,
          renderDpi: DURABLE_QUESTION_RENDER_DPI,
          version: QUESTION_IMAGE_VERSION
        });
      }
    }
  };

  const renderOptions = {
    scale: DURABLE_QUESTION_RENDER_DPI / PDF_POINTS_PER_INCH,
    pageNumbers,
    batchSize: DEFAULT_PDF_RENDER_BATCH_SIZE,
    onBatch: async ({ pages: batch }: { pages: RenderedPdfPagePreview[] }) => {
      await processRenderedPages(batch);
    }
  };
  let renderedPages: RenderedPdfPagePreview[];

  if (input.sourcePdfBlob) {
    const renderPdfBlob = input.renderPdfBlob ?? renderPdfBlobToPagePreviews;
    renderedPages = await renderPdfBlob(input.sourcePdfBlob, renderOptions);
  } else if (input.sourcePdfArrayBuffer) {
    const renderPdf = input.renderPdf ?? renderPdfArrayBufferToPagePreviews;
    renderedPages = await renderPdf(input.sourcePdfArrayBuffer, renderOptions);
  } else {
    throw new Error("Durable question images require a source PDF");
  }

  // Test adapters and older renderers may return pages without invoking onBatch.
  if (renderedPages.length > 0) {
    await processRenderedPages(renderedPages);
  }

  const nextQuestions: QuestionDraftEntity[] = [];

  for (const question of questions) {
    const attachments: QuestionImageAttachment[] = [];

    for (const pageId of question.pageIds) {
      const page = pageById.get(pageId);

      if (!page) {
        throw new Error(`Question ${question.id} references unavailable page ${pageId}`);
      }

      const attachment = attachmentByQuestionAndPage.get(`${question.id}:${pageId}`);

      if (!attachment) {
        throw new Error(`High-resolution render is unavailable for PDF page ${page.pageNumber}`);
      }

      attachments.push(attachment);
    }

    nextQuestions.push({
      ...question,
      questionImageAttachments: attachments
    });
  }

  return { assets, questions: nextQuestions };
}

export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const match = /^data:[^;,]+(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error("Durable question images require an embedded source PDF");
  }

  const binary = match[1]
    ? atob(match[2])
    : decodeURIComponent(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export function hasCompleteDurableQuestionImages(input: {
  questions: QuestionDraftEntity[];
  binaryAssets: BinaryAssetEntity[];
}) {
  if (input.questions.length === 0) {
    return false;
  }

  const assetIds = new Set(
    input.binaryAssets
      .filter((asset) => asset.kind === "question_crop")
      .map((asset) => asset.id)
  );

  return input.questions.every((question) => {
    const attachments = question.questionImageAttachments ?? [];
    const attachmentByPageId = new Map(attachments.map((attachment) => [attachment.pageId, attachment]));

    return question.pageIds.every((pageId) => {
      const attachment = attachmentByPageId.get(pageId);
      return Boolean(
        attachment &&
          attachment.pixelWidth > 0 &&
          attachment.pixelHeight > 0 &&
          attachment.renderDpi >= 240 &&
          assetIds.has(attachment.assetId)
      );
    });
  });
}
