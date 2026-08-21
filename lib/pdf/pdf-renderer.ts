import type { PageEntity, PageTextLine } from "@/lib/domain/entities";

const PDFJS_VERSION = "4.10.38";
const DEFAULT_PDF_RENDER_SCALE = 2;

import {
  assertPdfPageCount,
  DEFAULT_PDF_RENDER_BATCH_SIZE,
  MAX_PDF_PAGE_COUNT,
  UploadCapacityError
} from "@/lib/services/upload-capacity";

type PdfViewportLike = {
  width: number;
  height: number;
  convertToViewportPoint?: (x: number, y: number) => [number, number];
};

type PdfTextItemLike = {
  str?: unknown;
  width?: unknown;
  height?: unknown;
  transform?: unknown;
};

type PdfPageLike = {
  getViewport: (input: { scale: number }) => PdfViewportLike;
  render: (input: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewportLike;
  }) => { promise: Promise<void> };
  getTextContent?: () => Promise<{ items?: unknown[] }>;
  cleanup?: () => void;
};

type PdfDocumentLike = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
};

export type PdfjsModuleLike = {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (input: { data: Uint8Array } | { url: string }) => {
    promise: Promise<PdfDocumentLike>;
  };
};

type CanvasLike = {
  width: number;
  height: number;
  getContext: (contextId: "2d") => CanvasRenderingContext2D | null;
  toBlob: (
    callback: BlobCallback,
    type?: string,
    quality?: number
  ) => void;
};

export type PdfCanvasFactory = () => CanvasLike;

export interface RenderedPdfPagePreview {
  pageNumber: number;
  width: number;
  height: number;
  blob: Blob;
  textLines?: PageTextLine[];
}

export interface PdfRenderBatch {
  pages: RenderedPdfPagePreview[];
  pageCount: number;
  current: number;
}

export interface PdfRenderOptions {
  scale?: number;
  pageNumbers?: number[];
  createCanvas?: PdfCanvasFactory;
  pdfjsModule?: PdfjsModuleLike;
  maxPageCount?: number;
  batchSize?: number;
  onBatch?: (batch: PdfRenderBatch) => void | Promise<void>;
  onProgress?: (progress: {
    current: number;
    total: number;
    pageNumber: number;
  }) => void | Promise<void>;
}

type PdfDocumentSource = { data: Uint8Array } | { url: string };

function createCanvasElement(): CanvasLike {
  if (typeof document === "undefined") {
    throw new Error("PDF rendering outside the browser requires an injected canvas factory");
  }

  return document.createElement("canvas");
}

function canvasToBlob(canvas: CanvasLike): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("PDF 页面转图片失败"));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function clampNormalizedCoordinate(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

function mergeAdjacentPdfTextFragments(fragments: PageTextLine[]): PageTextLine[] {
  const sorted = fragments.slice().sort(
    (left, right) =>
      left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1
  );
  const merged: PageTextLine[] = [];

  for (const fragment of sorted) {
    let existing: PageTextLine | undefined;

    for (let index = merged.length - 1; index >= 0; index -= 1) {
      const line = merged[index];
      const verticalOverlap = Math.max(
        0,
        Math.min(line.normalizedBBox.y2, fragment.normalizedBBox.y2) -
          Math.max(line.normalizedBBox.y1, fragment.normalizedBBox.y1)
      );
      const smallerHeight = Math.min(
        line.normalizedBBox.y2 - line.normalizedBBox.y1,
        fragment.normalizedBBox.y2 - fragment.normalizedBBox.y1
      );
      const horizontalGap = fragment.normalizedBBox.x1 - line.normalizedBBox.x2;

      if (smallerHeight > 0 &&
        verticalOverlap / smallerHeight >= 0.6 &&
        horizontalGap >= -8 &&
        horizontalGap <= Math.max(20, smallerHeight)) {
        existing = line;
        break;
      }
    }

    if (!existing) {
      merged.push({
        text: fragment.text,
        normalizedBBox: { ...fragment.normalizedBBox }
      });
      continue;
    }

    const omitSpace = /[\s([{（【]$/.test(existing.text) || /^[,.;:!?，。；：！？)\]】）]/.test(fragment.text);
    existing.text = `${existing.text}${omitSpace ? "" : " "}${fragment.text}`;
    existing.normalizedBBox = {
      x1: Math.min(existing.normalizedBBox.x1, fragment.normalizedBBox.x1),
      y1: Math.min(existing.normalizedBBox.y1, fragment.normalizedBBox.y1),
      x2: Math.max(existing.normalizedBBox.x2, fragment.normalizedBBox.x2),
      y2: Math.max(existing.normalizedBBox.y2, fragment.normalizedBBox.y2)
    };
  }

  return merged.sort(
    (left, right) =>
      left.normalizedBBox.y1 - right.normalizedBBox.y1 ||
      left.normalizedBBox.x1 - right.normalizedBBox.x1
  );
}

async function extractNativePdfTextLines(
  page: PdfPageLike,
  viewport: PdfViewportLike
): Promise<PageTextLine[]> {
  if (!page.getTextContent || !viewport.convertToViewportPoint) {
    return [];
  }

  const textContent = await page.getTextContent();

  const fragments = (textContent.items ?? []).flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object") {
      return [];
    }

    const item = rawItem as PdfTextItemLike;
    const text = typeof item.str === "string" ? item.str.trim() : "";
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const x = typeof transform[4] === "number" ? transform[4] : null;
    const y = typeof transform[5] === "number" ? transform[5] : null;
    const width = typeof item.width === "number" ? item.width : 0;
    const height = typeof item.height === "number" ? item.height : 0;

    if (!text || x === null || y === null || width <= 0 || height <= 0) {
      return [];
    }

    const corners = [
      viewport.convertToViewportPoint!(x, y),
      viewport.convertToViewportPoint!(x + width, y),
      viewport.convertToViewportPoint!(x, y + height),
      viewport.convertToViewportPoint!(x + width, y + height)
    ];
    const xCoordinates = corners.map(([pointX]) => pointX);
    const yCoordinates = corners.map(([, pointY]) => pointY);
    const normalizedBBox = {
      x1: clampNormalizedCoordinate((Math.min(...xCoordinates) / viewport.width) * 1000),
      y1: clampNormalizedCoordinate((Math.min(...yCoordinates) / viewport.height) * 1000),
      x2: clampNormalizedCoordinate((Math.max(...xCoordinates) / viewport.width) * 1000),
      y2: clampNormalizedCoordinate((Math.max(...yCoordinates) / viewport.height) * 1000)
    };

    return normalizedBBox.x2 > normalizedBBox.x1 && normalizedBBox.y2 > normalizedBBox.y1
      ? [{ text, normalizedBBox }]
      : [];
  });

  return mergeAdjacentPdfTextFragments(fragments);
}

async function loadPdfjsModule(): Promise<PdfjsModuleLike> {
  return import("pdfjs-dist/build/pdf.mjs") as Promise<PdfjsModuleLike>;
}

export function buildPdfPageDisplayName(baseName: string, pageNumber: number): string {
  return `${baseName}_第${pageNumber}页`;
}

export function buildPdfWorkerSrc(): string {
  return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
}

async function getPdfPageCountFromSource(
  source: PdfDocumentSource,
  options?: {
    pdfjsModule?: PdfjsModuleLike;
    maxPageCount?: number;
  }
): Promise<number> {
  const pdfjsModule = options?.pdfjsModule ?? (await loadPdfjsModule());

  if (options?.pdfjsModule) {
    pdfjsModule.GlobalWorkerOptions.workerSrc = buildPdfWorkerSrc();
  }

  const loadingTask = pdfjsModule.getDocument(source);
  const pdfDocument = await loadingTask.promise;

  try {
    const pageCount = pdfDocument.numPages;
    const maxPageCount = options?.maxPageCount ?? MAX_PDF_PAGE_COUNT;
    assertPdfPageCount(pageCount);

    if (pageCount > maxPageCount) {
      throw new UploadCapacityError({
        code: "too_many_pages",
        actual: pageCount,
        limit: maxPageCount,
        message: `PDF 共 ${pageCount} 页，超过 ${maxPageCount} 页上限，请拆分文件后重试。`
      });
    }

    return pageCount;
  } finally {
    await pdfDocument.destroy?.();
  }
}

export function getPdfPageCountFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  options?: {
    pdfjsModule?: PdfjsModuleLike;
    maxPageCount?: number;
  }
): Promise<number> {
  return getPdfPageCountFromSource({ data: new Uint8Array(arrayBuffer) }, options);
}

export async function getPdfPageCountFromBlob(
  blob: Blob,
  options?: {
    pdfjsModule?: PdfjsModuleLike;
    maxPageCount?: number;
  }
): Promise<number> {
  if (
    typeof window === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return getPdfPageCountFromArrayBuffer(await blob.arrayBuffer(), options);
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    return await getPdfPageCountFromSource({ url: objectUrl }, options);
  } finally {
    URL.revokeObjectURL?.(objectUrl);
  }
}

async function renderPdfSourceToPagePreviews(
  source: PdfDocumentSource,
  options?: PdfRenderOptions
): Promise<RenderedPdfPagePreview[]> {
  const pdfjsModule = options?.pdfjsModule ?? (await loadPdfjsModule());
  const scale = options?.scale ?? DEFAULT_PDF_RENDER_SCALE;

  if (options?.pdfjsModule || !options?.createCanvas) {
    pdfjsModule.GlobalWorkerOptions.workerSrc = buildPdfWorkerSrc();
  }

  const loadingTask = pdfjsModule.getDocument(source);
  const pdfDocument = await loadingTask.promise;

  try {
    const pageCount = pdfDocument.numPages;
    const maxPageCount = options?.maxPageCount ?? MAX_PDF_PAGE_COUNT;
    assertPdfPageCount(pageCount);

    if (pageCount > maxPageCount) {
      throw new UploadCapacityError({
        code: "too_many_pages",
        actual: pageCount,
        limit: maxPageCount,
        message: `PDF 共 ${pageCount} 页，超过 ${maxPageCount} 页上限，请拆分文件后重试。`
      });
    }

    const pageNumbers = resolvePdfPageNumbers(pdfDocument.numPages, options?.pageNumbers);
    const batchSize = Math.max(
      1,
      Math.min(
        pageNumbers.length || 1,
        Math.floor(options?.batchSize ?? DEFAULT_PDF_RENDER_BATCH_SIZE)
      )
    );
    const previews: RenderedPdfPagePreview[] = [];
    let batch: RenderedPdfPagePreview[] = [];
    let renderedCount = 0;

    for (const pageNumber of pageNumbers) {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = options?.createCanvas ? options.createCanvas() : createCanvasElement();
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("无法创建 PDF 渲染画布");
      }

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      await page.render({
        canvasContext: context,
        viewport
      }).promise;

      const renderedPage: RenderedPdfPagePreview = {
        pageNumber,
        width: canvas.width,
        height: canvas.height,
        blob: await canvasToBlob(canvas),
        textLines: await extractNativePdfTextLines(page, viewport)
      };

      page.cleanup?.();
      batch.push(renderedPage);
      renderedCount += 1;
      await options?.onProgress?.({
        current: renderedCount,
        total: pageNumbers.length,
        pageNumber
      });

      if (batch.length >= batchSize) {
        if (options?.onBatch) {
          await options.onBatch({
            pages: batch,
            pageCount,
            current: renderedCount
          });
        } else {
          previews.push(...batch);
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      if (options?.onBatch) {
        await options.onBatch({
          pages: batch,
          pageCount,
          current: renderedCount
        });
      } else {
        previews.push(...batch);
      }
    }

    return previews;
  } finally {
    await pdfDocument.destroy?.();
  }
}

export function renderPdfArrayBufferToPagePreviews(
  arrayBuffer: ArrayBuffer,
  options?: PdfRenderOptions
): Promise<RenderedPdfPagePreview[]> {
  return renderPdfSourceToPagePreviews({ data: new Uint8Array(arrayBuffer) }, options);
}

export async function renderPdfBlobToPagePreviews(
  blob: Blob,
  options?: PdfRenderOptions
): Promise<RenderedPdfPagePreview[]> {
  if (
    typeof window === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return renderPdfArrayBufferToPagePreviews(await blob.arrayBuffer(), options);
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    return await renderPdfSourceToPagePreviews({ url: objectUrl }, options);
  } finally {
    URL.revokeObjectURL?.(objectUrl);
  }
}

function resolvePdfPageNumbers(pageCount: number, requestedPageNumbers?: number[]) {
  return requestedPageNumbers
    ? Array.from(
        new Set(
          requestedPageNumbers.filter(
            (pageNumber) =>
              Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount
          )
        )
      ).sort((left, right) => left - right)
    : Array.from({ length: pageCount }, (_, index) => index + 1);
}

export function createPdfPageRecords(input: {
  documentId: string;
  baseName: string;
  pageMetas: Array<{
    pageId: string;
    pageNumber?: number;
    width: number;
    height: number;
    displayAssetId: string;
    textLines?: PageTextLine[];
  }>;
}): PageEntity[] {
  return input.pageMetas.map((meta, index) => ({
    id: meta.pageId,
    documentId: input.documentId,
    pageNumber: meta.pageNumber ?? index + 1,
    width: meta.width,
    height: meta.height,
    displayAssetId: meta.displayAssetId,
    analysisStatus: "idle",
    reviewStatus: "unreviewed",
    ...(meta.textLines?.length ? { textLines: meta.textLines } : {})
  }));
}
