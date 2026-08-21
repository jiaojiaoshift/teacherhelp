import type {
  BinaryAssetEntity,
  DocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadHelperProcessedQuestionBankImportEntity,
  MobileUploadTaskEntity,
  PageEntity
} from "@/lib/domain/entities";
import { createNodePdfCanvasFactory } from "@/lib/server/node-pdf-canvas-factory";
import { prepareNodeAiPreviewBlob } from "@/lib/server/node-ai-image-preview-service";
import { writeMobileUploadHelperFile } from "@/lib/server/mobile-upload-helper-file-store";
import { consumeMobileUploadHelperPendingUpload } from "@/lib/services/mobile-upload-pending-upload-consumer-service";

function buildProcessedImportId(taskId: string) {
  return `processed-question-bank-import-${taskId}`;
}

export async function processQuestionBankUploadForHelper(input: {
  task: MobileUploadTaskEntity;
  file: File;
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  fetchImpl?: typeof fetch;
}): Promise<
  | {
      status: "processed";
      processedImport: MobileUploadHelperProcessedQuestionBankImportEntity;
    }
  | {
      status: "failed";
      errorMessage: string;
    }
> {
  const documentsById = new Map<string, DocumentEntity>();
  const pagesById = new Map<string, PageEntity>();
  const binaryAssetsById = new Map<string, BinaryAssetEntity>();
  const pagePreviewsById = new Map<string, string>();

  const result = await consumeMobileUploadHelperPendingUpload({
    pendingUpload: {
      taskId: input.task.id,
      deviceId: input.task.deviceId,
      uploadKind: "question_bank_pdf",
      targetNodeId: input.task.targetNodeId,
      targetNodePath: input.task.targetNodePath,
      originalFileName: input.task.originalFileName,
      normalizedFileName: input.task.normalizedFileName,
      mimeType: input.task.mimeType,
      createdAt: input.task.createdAt
    },
    questionFolders: input.questionFolders,
    examLibraryFolders: input.examLibraryFolders,
    pendingUploadedFullPaperDraft: null,
    fileStore: {
      upsertDocument: (document) => {
        documentsById.set(document.id, document);
      },
      upsertPage: (page) => {
        pagesById.set(page.id, page);
      }
    },
    questionStore: {
      setPagePreviewUrl: () => undefined,
      setPagePreviewDataUrl: (pageId, dataUrl) => {
        pagePreviewsById.set(pageId, dataUrl);
      },
      appendBinaryAssets: (assets) => {
        assets.forEach((asset) => {
          binaryAssetsById.set(asset.id, asset);
        });
      }
    },
    examStore: {
      setPendingUploadedFullPaperDraft: () => undefined,
      setExamWorkspaceDraft: () => undefined
    },
    fetchImpl: input.fetchImpl,
    file: input.file,
    pdfCanvasFactory: createNodePdfCanvasFactory(),
    preparePreviewBlob:
      typeof window === "undefined" ? prepareNodeAiPreviewBlob : undefined
  });

  if (result.status !== "consumed") {
    return {
      status: "failed",
      errorMessage:
        result.status === "failed" ? result.errorMessage : "题库 PDF 无法在 PC 助手中完成处理"
    };
  }

  const sourceFileToken = `processed-question-bank-source-${input.task.id}`;
  await writeMobileUploadHelperFile(sourceFileToken, input.file);

  return {
    status: "processed",
    processedImport: {
      id: buildProcessedImportId(input.task.id),
      task: {
        ...input.task,
        status: "processing",
        errorMessage: null
      },
      documents: Array.from(documentsById.values()),
      pages: Array.from(pagesById.values()),
      binaryAssets: Array.from(binaryAssetsById.values()).map(
        ({ blob: _blob, dataUrl: _dataUrl, ...asset }) => asset
      ),
      pagePreviews: Array.from(pagePreviewsById.entries()).map(([pageId, dataUrl]) => ({
        pageId,
        dataUrl
      })),
      sourceFileToken
    }
  };
}
