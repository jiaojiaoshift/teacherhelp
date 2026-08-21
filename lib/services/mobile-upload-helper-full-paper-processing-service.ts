import type {
  BinaryAssetEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadHelperProcessedFullPaperDraftEntity,
  MobileUploadTaskEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";
import { createNodePdfCanvasFactory } from "@/lib/server/node-pdf-canvas-factory";
import { prepareNodeAiPreviewBlob } from "@/lib/server/node-ai-image-preview-service";
import { writeMobileUploadHelperFile } from "@/lib/server/mobile-upload-helper-file-store";
import { consumeMobileUploadHelperPendingUpload } from "@/lib/services/mobile-upload-pending-upload-consumer-service";

function buildProcessedDraftId(taskId: string) {
  return `processed-full-paper-draft-${taskId}`;
}

export async function processFullPaperUploadForHelper(input: {
  task: MobileUploadTaskEntity;
  file: File;
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  pendingUploadedFullPaperDraft: UploadedFullPaperDraftEntity | null;
  fetchImpl?: typeof fetch;
}): Promise<
  | {
      status: "processed";
      processedDraft: MobileUploadHelperProcessedFullPaperDraftEntity;
    }
  | {
      status: "blocked";
    }
  | {
      status: "failed";
      errorMessage: string;
    }
> {
  let nextPendingDraft: UploadedFullPaperDraftEntity | null = null;
  const binaryAssetsById = new Map<string, BinaryAssetEntity>();

  const result = await consumeMobileUploadHelperPendingUpload({
    pendingUpload: {
      taskId: input.task.id,
      deviceId: input.task.deviceId,
      uploadKind: "full_paper_pdf",
      targetNodeId: input.task.targetNodeId,
      targetNodePath: input.task.targetNodePath,
      originalFileName: input.task.originalFileName,
      normalizedFileName: input.task.normalizedFileName,
      mimeType: input.task.mimeType,
      createdAt: input.task.createdAt
    },
    questionFolders: input.questionFolders,
    examLibraryFolders: input.examLibraryFolders,
    pendingUploadedFullPaperDraft: input.pendingUploadedFullPaperDraft,
    fileStore: {
      upsertDocument: () => undefined,
      upsertPage: () => undefined
    },
    questionStore: {
      setPagePreviewUrl: () => undefined,
      setPagePreviewDataUrl: () => undefined,
      appendBinaryAssets: (assets) => {
        assets.forEach((asset) => {
          binaryAssetsById.set(asset.id, asset);
        });
      }
    },
    examStore: {
      setPendingUploadedFullPaperDraft: (draft) => {
        nextPendingDraft = draft;
      },
      setExamWorkspaceDraft: () => undefined
    },
    fetchImpl: input.fetchImpl,
    file: input.file,
    pdfCanvasFactory: createNodePdfCanvasFactory(),
    preparePreviewBlob: prepareNodeAiPreviewBlob
  });

  if (result.status === "blocked") {
    return {
      status: "blocked"
    };
  }

  if (result.status !== "consumed" || !nextPendingDraft) {
    return {
      status: "failed",
      errorMessage:
        result.status === "failed" ? result.errorMessage : "套卷 PDF 无法在 PC 助手中完成预处理"
    };
  }

  const sourceFileToken = `processed-full-paper-source-${input.task.id}`;
  await writeMobileUploadHelperFile(sourceFileToken, input.file);

  return {
    status: "processed",
    processedDraft: {
      id: buildProcessedDraftId(input.task.id),
      task: {
        ...input.task,
        status: "processing",
        errorMessage: null
      },
      pendingDraft: nextPendingDraft,
      binaryAssets: Array.from(binaryAssetsById.values()).map(({ blob: _blob, ...asset }) => asset),
      sourceFileToken
    }
  };
}
