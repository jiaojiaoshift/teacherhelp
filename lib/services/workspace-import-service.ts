import type { PageEntity, PageTextLine } from "@/lib/domain/entities";
import type { SubjectScope } from "@/lib/domain/enums";
import {
  createDocumentShell,
  deriveDisplayAssetFromImageUpload,
  derivePageRecordFromImageUpload,
  deriveSourceAssetFromUpload,
  inferUploadKind
} from "@/lib/services/ingestion-service";
import { createObjectUrlRegistry } from "@/lib/images/blob-url";
import {
  createPdfPageRecords,
  type PdfRenderOptions,
  type PdfCanvasFactory,
  type PdfRenderBatch,
  renderPdfBlobToPagePreviews
} from "@/lib/pdf/pdf-renderer";
import {
  prepareAiPreviewBlob,
  prepareAiPreviewDataUrl
} from "@/lib/services/ai-image-preview-service";
import {
  assertUploadByteLength,
  DEFAULT_PDF_RENDER_BATCH_SIZE,
  MAX_INLINE_SOURCE_ASSET_BYTES,
  selectRepresentativePageNumbers,
  UploadCapacityError
} from "@/lib/services/upload-capacity";
import { dataUrlToBlob, readBlobAsDataUrl } from "@/lib/utils/blob-data-url";
import type { useFileStore } from "@/lib/stores/file-store";
import type { useQuestionStore } from "@/lib/stores/question-store";

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const objectUrlRegistry = createObjectUrlRegistry();

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };

    image.onerror = () => {
      reject(new Error("图片读取失败"));
      URL.revokeObjectURL(url);
    };

    image.src = url;
  });
}

type FileStoreActions = Pick<
  ReturnType<typeof useFileStore.getState>,
  "upsertDocument" | "upsertPage"
>;

type QuestionStoreActions = Pick<
  ReturnType<typeof useQuestionStore.getState>,
  "setPagePreviewUrl" | "setPagePreviewDataUrl" | "appendBinaryAssets"
>;

async function requestAnswerSectionSuggestion(input: {
  documentId: string;
  pageCount: number;
  pageImageDataUrls: string[];
  sampledPageNumbers?: number[];
  fetchImpl: typeof fetch;
}): Promise<{ hasAnswerSection: boolean; suggestedSplitPage: number | null } | null> {
  if (input.pageCount === 0) {
    return null;
  }

  try {
    const response = await input.fetchImpl("/api/ai/suggest-answer-section", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        documentId: input.documentId,
        pageCount: input.pageCount,
        pageImageDataUrls: input.pageImageDataUrls,
        ...(input.sampledPageNumbers?.length
          ? { sampledPageNumbers: input.sampledPageNumbers }
          : {})
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      answerSection?: {
        hasAnswerSection?: boolean;
        suggestedSplitPage?: number | null;
      };
    };

    if (!payload.answerSection) {
      return null;
    }

    return {
      hasAnswerSection: payload.answerSection.hasAnswerSection ?? true,
      suggestedSplitPage: payload.answerSection.suggestedSplitPage ?? null
    };
  } catch {
    return null;
  }
}

export interface WorkspaceImportProgress {
  fileName: string;
  phase: "reading" | "rendering" | "answer_section";
  current: number;
  total: number;
  message: string;
}

export async function importFilesIntoWorkspace(input: {
  files: FileList | File[] | null;
  subjectScope: SubjectScope;
  fileStore: FileStoreActions;
  questionStore: QuestionStoreActions;
  fetchImpl?: typeof fetch;
  pdfCanvasFactory?: PdfCanvasFactory;
  renderPdf?: (
    file: File,
    options?: PdfRenderOptions
  ) => Promise<Awaited<ReturnType<typeof renderPdfBlobToPagePreviews>>>;
  preparePreviewBlob?: (blob: Blob) => Promise<Blob>;
  onProgress?: (progress: WorkspaceImportProgress) => void;
}): Promise<{ unsupportedFileNames: string[]; importedDocumentIds: string[] }> {
  const unsupportedFileNames: string[] = [];
  const importedDocumentIds: string[] = [];
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);

  if (!input.files?.length) {
    return { unsupportedFileNames, importedDocumentIds };
  }

  for (const file of Array.from(input.files)) {
    const kind = inferUploadKind(file.name);

    if (!kind) {
      unsupportedFileNames.push(file.name);
      continue;
    }

    try {
      assertUploadByteLength(file.size);
    } catch (error) {
      if (error instanceof UploadCapacityError) {
        throw error;
      }

      throw new Error("文件大小校验失败");
    }

    const document = createDocumentShell({
      id: createId("doc"),
      name: file.name,
      kind,
      subjectScope: input.subjectScope
    });

    if (kind === "image") {
      const pageId = createId("page");
      const assetId = createId("asset");
      const sourceAssetId = createId("asset-source");
      const previewUrl = objectUrlRegistry.create(pageId, file);
      const previewDataUrl = await readBlobAsDataUrl(file);
      const size = await readImageSize(file);

      const asset = {
        ...deriveDisplayAssetFromImageUpload({
          assetId,
          documentId: document.id,
          pageId,
          mimeType: file.type || "image/png",
          byteLength: file.size
        }),
        blob: file,
        dataUrl: previewDataUrl
      };
      const sourceAsset = deriveSourceAssetFromUpload({
        assetId: sourceAssetId,
        documentId: document.id,
        pageId,
        mimeType: file.type || "image/png",
        byteLength: file.size
      });
      sourceAsset.blob = file;
      if (file.size <= MAX_INLINE_SOURCE_ASSET_BYTES) {
        sourceAsset.dataUrl = previewDataUrl;
      }

      const page = derivePageRecordFromImageUpload({
        documentId: document.id,
        pageId,
        width: size.width,
        height: size.height,
        displayAssetId: asset.id
      });

      document.pageIds = [pageId];
      document.status = "pages_ready";

      input.fileStore.upsertPage(page);
      input.questionStore.setPagePreviewUrl(pageId, previewUrl);
      input.questionStore.setPagePreviewDataUrl(pageId, previewDataUrl);
      input.questionStore.appendBinaryAssets([asset, sourceAsset]);
    }

    if (kind === "pdf") {
      input.onProgress?.({
        fileName: file.name,
        phase: "reading",
        current: 0,
        total: 1,
        message: "正在读取 PDF 文件"
      });
      const pageMetaById = new Map<string, {
        pageId: string;
        width: number;
        height: number;
        displayAssetId: string;
        pageNumber: number;
        textLines?: PageTextLine[];
      }>();
      const pages: PageEntity[] = [];
      const sampledPageNumbers = new Set<number>();
      const pageImageDataUrlsByNumber = new Map<number, string>();

      const processRenderedPages = async (
        renderedPages: PdfRenderBatch["pages"],
        pageCount: number
      ) => {
        const sampleNumbers = selectRepresentativePageNumbers(pageCount);
        sampleNumbers.forEach((pageNumber) => sampledPageNumbers.add(pageNumber));
        const preparedPages: Array<{
          pageId: string;
          displayAssetId: string;
          renderedPage: PdfRenderBatch["pages"][number];
          displayBlob: Blob;
          dataUrl: string;
        }> = [];

        for (const renderedPage of renderedPages) {
          let displayBlob: Blob;
          let dataUrl: string;

          if (input.preparePreviewBlob) {
            displayBlob = await input.preparePreviewBlob(renderedPage.blob);
            dataUrl = await readBlobAsDataUrl(displayBlob);
          } else if (
            renderedPage.blob.size > 300_000 &&
            typeof prepareAiPreviewBlob === "function"
          ) {
            const boundedBlob = await prepareAiPreviewBlob(renderedPage.blob);

            if (boundedBlob !== renderedPage.blob || boundedBlob.size < renderedPage.blob.size) {
              displayBlob = boundedBlob;
              dataUrl = await readBlobAsDataUrl(boundedBlob);
            } else {
              const rawDataUrl = await readBlobAsDataUrl(renderedPage.blob);
              dataUrl = await prepareAiPreviewDataUrl(rawDataUrl);
              displayBlob = dataUrlToBlob(dataUrl) ?? renderedPage.blob;
            }
          } else {
            const rawDataUrl = await readBlobAsDataUrl(renderedPage.blob);
            dataUrl = await prepareAiPreviewDataUrl(rawDataUrl);
            displayBlob = dataUrlToBlob(dataUrl) ?? renderedPage.blob;
          }

          if (sampledPageNumbers.has(renderedPage.pageNumber)) {
            pageImageDataUrlsByNumber.set(renderedPage.pageNumber, dataUrl);
          }

          const pageId = createId("page");
          const displayAssetId = createId("asset");
          const pageMeta = {
            pageId,
            width: renderedPage.width,
            height: renderedPage.height,
            displayAssetId,
            pageNumber: renderedPage.pageNumber,
            textLines: renderedPage.textLines
          };
          pageMetaById.set(pageId, pageMeta);
          preparedPages.push({
            pageId,
            displayAssetId,
            renderedPage,
            displayBlob,
            dataUrl
          });
        }

        const batchPages = createPdfPageRecords({
          documentId: document.id,
          baseName: file.name.replace(/\.pdf$/i, ""),
          pageMetas: preparedPages.map((preparedPage) => {
            const meta = pageMetaById.get(preparedPage.pageId)!;
            return meta;
          })
        });
        pages.push(...batchPages);
        input.questionStore.appendBinaryAssets(
          preparedPages.map((preparedPage) => ({
            id: preparedPage.displayAssetId,
            documentId: document.id,
            pageId: preparedPage.pageId,
            kind: "display" as const,
            mimeType: preparedPage.displayBlob.type || "image/png",
            byteLength: preparedPage.displayBlob.size,
            blob: preparedPage.displayBlob,
            dataUrl: preparedPage.dataUrl
          }))
        );
        preparedPages.forEach((preparedPage, index) => {
          const page = batchPages[index];
          if (!page) {
            return;
          }
          input.fileStore.upsertPage(page);
          input.questionStore.setPagePreviewUrl(
            page.id,
            objectUrlRegistry.create(page.id, preparedPage.displayBlob)
          );
          input.questionStore.setPagePreviewDataUrl(page.id, preparedPage.dataUrl);
        });
      };

      const renderPdf = input.renderPdf ?? renderPdfBlobToPagePreviews;
      const renderedPages = await renderPdf(file, {
        createCanvas: input.pdfCanvasFactory,
        batchSize: DEFAULT_PDF_RENDER_BATCH_SIZE,
        onProgress: ({ current, total }) => {
          input.onProgress?.({
            fileName: file.name,
            phase: "rendering",
            current,
            total,
            message: `正在生成页面预览 ${current}/${total}`
          });
        },
        onBatch: async ({ pages: batch, pageCount, current }) => {
          const sampleNumbers = selectRepresentativePageNumbers(pageCount);
          sampleNumbers.forEach((pageNumber) => sampledPageNumbers.add(pageNumber));
          await processRenderedPages(batch, pageCount);
          input.onProgress?.({
            fileName: file.name,
            phase: "rendering",
            current,
            total: pageCount,
            message: `已生成页面预览 ${current}/${pageCount}`
          });
        }
      });
      // Test adapters and older callers may return pages without invoking onBatch.
      if (renderedPages.length > 0) {
        const pageCount = renderedPages.length;
        const sampleNumbers = selectRepresentativePageNumbers(pageCount);
        sampleNumbers.forEach((pageNumber) => sampledPageNumbers.add(pageNumber));
        await processRenderedPages(renderedPages, pageCount);
      }

      const sourceAsset = deriveSourceAssetFromUpload({
        assetId: createId("asset-source"),
        documentId: document.id,
        pageId: pages[0]?.id ?? createId("page"),
        mimeType: file.type || "application/pdf",
        byteLength: file.size
      });
      sourceAsset.blob = file;
      if (file.size <= MAX_INLINE_SOURCE_ASSET_BYTES) {
        sourceAsset.dataUrl = await readBlobAsDataUrl(file);
      }

      document.pageIds = pages.map((page) => page.id);
      document.status = "pages_ready";

      const pageImageDataUrls = Array.from(pageImageDataUrlsByNumber.entries())
        .sort(([left], [right]) => left - right)
        .map(([, dataUrl]) => dataUrl);
      input.onProgress?.({
        fileName: file.name,
        phase: "answer_section",
        current: 0,
        total: 1,
        message: "正在识别答案页起始位置"
      });
      const answerSectionSuggestion = await requestAnswerSectionSuggestion({
        documentId: document.id,
        pageCount: pages.length,
        pageImageDataUrls,
        sampledPageNumbers: Array.from(sampledPageNumbers).sort((left, right) => left - right),
        fetchImpl
      });
      document.answerSection = {
        status: "suggested",
        hasAnswerSection: answerSectionSuggestion?.hasAnswerSection ?? true,
        suggestedSplitPage:
          answerSectionSuggestion?.suggestedSplitPage ?? (pages.length > 1 ? pages.length : 1),
        confirmedSplitPage: null
      };

      input.questionStore.appendBinaryAssets([sourceAsset]);
      input.onProgress?.({
        fileName: file.name,
        phase: "answer_section",
        current: 1,
        total: 1,
        message: "答案页起始位置识别完成"
      });
    }

    input.fileStore.upsertDocument(document);
    importedDocumentIds.push(document.id);
  }

  return { unsupportedFileNames, importedDocumentIds };
}
