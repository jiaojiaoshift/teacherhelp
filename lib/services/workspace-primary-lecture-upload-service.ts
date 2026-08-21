import type {
  BinaryAssetEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import { processMobileUploadTask } from "@/lib/services/mobile-upload-processing-service";
import { normalizePrimaryLectureUploadFileName } from "@/lib/services/mobile-upload-service";

function createWorkspaceId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export type WorkspacePrimaryLectureUploadResult =
  | {
      status: "rejected";
      errorMessage: string;
    }
  | {
      status: "processed";
      task: MobileUploadTaskEntity;
      examLibraryDocuments: ExamLibraryDocumentEntity[];
      sourceAsset: BinaryAssetEntity;
    };

export function processWorkspacePrimaryLectureUpload(input: {
  file: {
    name: string;
    type: string;
    size: number;
  };
  targetDocumentId: string;
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  now?: string;
  createId?: (prefix: string) => string;
}): WorkspacePrimaryLectureUploadResult {
  const targetDocument = input.examLibraryDocuments.find(
    (document) => document.id === input.targetDocumentId
  );

  if (!targetDocument || targetDocument.kind !== "lecture" || targetDocument.lectureVariant !== "primary") {
    return {
      status: "rejected",
      errorMessage: "主讲义文档不存在"
    };
  }

  if (!targetDocument.lastExportedSyncMetadata) {
    return {
      status: "rejected",
      errorMessage: "请先导出当前主讲义后再上传更新版本"
    };
  }

  const createId = input.createId ?? createWorkspaceId;
  const taskId = createId("mobile-upload-task");
  const sourceAssetId = createId("asset-source");
  const targetFolder =
    input.examLibraryFolders.find((folder) => folder.id === targetDocument.folderId) ?? null;
  const task: MobileUploadTaskEntity = {
    id: taskId,
    deviceId: "pc-workspace",
    uploadKind: "primary_lecture_pdf",
    targetNodeId: targetDocument.id,
    targetNodePath: targetFolder?.path ?? [targetDocument.title],
    originalFileName: input.file.name,
    normalizedFileName: normalizePrimaryLectureUploadFileName({
      uploadedFileName: input.file.name,
      immutableLectureName: targetDocument.immutableName ?? targetDocument.title
    }),
    mimeType: "application/pdf",
    status: "received",
    createdAt: input.now ?? new Date().toISOString()
  };
  const sourceAsset: BinaryAssetEntity = {
    id: sourceAssetId,
    documentId: targetDocument.id,
    pageId: targetDocument.id,
    kind: "source",
    mimeType: input.file.type || "application/pdf",
    byteLength: input.file.size
  };
  const result = processMobileUploadTask({
    task,
    sourceAssetId,
    questionFolders: [],
    examLibraryFolders: input.examLibraryFolders,
    examLibraryDocuments: input.examLibraryDocuments,
    uploadedSyncMetadata: targetDocument.lastExportedSyncMetadata
  });

  if (result.downstreamAction.kind === "rejected") {
    return {
      status: "rejected",
      errorMessage: result.downstreamAction.errorMessage
    };
  }

  return {
    status: "processed",
    task: result.task,
    examLibraryDocuments: result.examLibraryDocuments,
    sourceAsset
  };
}
