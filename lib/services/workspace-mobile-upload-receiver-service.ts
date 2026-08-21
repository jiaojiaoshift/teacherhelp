import type {
  BinaryAssetEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadPairingSessionEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import type { MobileUploadDownstreamAction } from "@/lib/services/mobile-upload-processing-service";
import { processMobileUploadTask } from "@/lib/services/mobile-upload-processing-service";
import {
  isPdfUploadFile,
  normalizePrimaryLectureUploadFileName,
  validateLectureArchivePdfFileName
} from "@/lib/services/mobile-upload-service";
import {
  registerPairedMobileUploadDevice,
  resolveMobileUploadPairingSessionState
} from "@/lib/services/mobile-upload-pairing-service";

function createWorkspaceUploadId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function resolveInitialArchiveUploadTarget(input: {
  upload: {
    uploadKind: MobileUploadTaskEntity["uploadKind"];
    targetNodeId: string;
    targetNodePath: string[];
  };
  examLibraryFolders: ExamLibraryFolderEntity[];
}) {
  if (input.upload.uploadKind !== "lecture_archive_pdf") {
    return {
      targetNodeId: input.upload.targetNodeId,
      targetNodePath: input.upload.targetNodePath
    };
  }

  const selectedFolder = input.examLibraryFolders.find(
    (folder) => folder.id === input.upload.targetNodeId
  );

  if (!selectedFolder) {
    return {
      targetNodeId: input.upload.targetNodeId,
      targetNodePath: input.upload.targetNodePath
    };
  }

  if (selectedFolder.role === "lecture_archive") {
    return {
      targetNodeId: selectedFolder.id,
      targetNodePath: selectedFolder.path
    };
  }

  if (selectedFolder.depth !== 3) {
    return {
      targetNodeId: input.upload.targetNodeId,
      targetNodePath: input.upload.targetNodePath
    };
  }

  const archiveFolder =
    input.examLibraryFolders.find(
      (folder) => folder.role === "lecture_archive" && folder.parentId === selectedFolder.id
    ) ?? null;

  if (!archiveFolder) {
    return {
      targetNodeId: input.upload.targetNodeId,
      targetNodePath: input.upload.targetNodePath
    };
  }

  return {
    targetNodeId: archiveFolder.id,
    targetNodePath: archiveFolder.path
  };
}

export type WorkspaceMobileUploadReceiveResult =
  | {
      status: "rejected";
      errorMessage: string;
      task?: MobileUploadTaskEntity;
      examLibraryDocuments?: ExamLibraryDocumentEntity[];
    }
  | {
      status: "accepted";
      task: MobileUploadTaskEntity;
      sourceAsset: BinaryAssetEntity;
      examLibraryDocuments: ExamLibraryDocumentEntity[];
      downstreamAction: MobileUploadDownstreamAction;
      pairingSession: MobileUploadPairingSessionEntity;
    };

function resolveNormalizedFileName(input: {
  uploadKind: MobileUploadTaskEntity["uploadKind"];
  originalFileName: string;
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  targetNodeId: string;
}) {
  if (input.uploadKind !== "primary_lecture_pdf") {
    return input.originalFileName;
  }

  const targetDocument = input.examLibraryDocuments.find(
    (document) => document.id === input.targetNodeId
  );

  return normalizePrimaryLectureUploadFileName({
    uploadedFileName: input.originalFileName,
    immutableLectureName:
      targetDocument?.immutableName ?? targetDocument?.title ?? input.originalFileName
  });
}

function resolveUploadedSyncMetadata(input: {
  uploadKind: MobileUploadTaskEntity["uploadKind"];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  targetNodeId: string;
}) {
  if (input.uploadKind !== "primary_lecture_pdf") {
    return undefined;
  }

  return (
    input.examLibraryDocuments.find((document) => document.id === input.targetNodeId)
      ?.lastExportedSyncMetadata ?? undefined
  );
}

function createReceivedMobileUploadTask(input: {
  taskId: string;
  upload: {
    deviceId: string;
    uploadKind: MobileUploadTaskEntity["uploadKind"];
    targetNodeId: string;
    targetNodePath: string[];
  };
  file: {
    name: string;
  };
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  now?: string;
}): MobileUploadTaskEntity {
  const normalizedTarget = resolveInitialArchiveUploadTarget({
    upload: input.upload,
    examLibraryFolders: input.examLibraryFolders
  });

  return {
    id: input.taskId,
    deviceId: input.upload.deviceId,
    uploadKind: input.upload.uploadKind,
    targetNodeId: normalizedTarget.targetNodeId,
    targetNodePath: normalizedTarget.targetNodePath,
    originalFileName: input.file.name,
    normalizedFileName: resolveNormalizedFileName({
      uploadKind: input.upload.uploadKind,
      originalFileName: input.file.name,
      examLibraryDocuments: input.examLibraryDocuments,
      targetNodeId: input.upload.targetNodeId
    }),
    mimeType: "application/pdf",
    status: "received",
    createdAt: input.now ?? new Date().toISOString()
  };
}

export function receiveWorkspaceMobileUpload(input: {
  file: {
    name: string;
    type: string;
    size: number;
  };
  upload: {
    deviceId: string;
    pairedSessionId: string;
    uploadKind: MobileUploadTaskEntity["uploadKind"];
    targetNodeId: string;
    targetNodePath: string[];
  };
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  activePairingSession: MobileUploadPairingSessionEntity | null;
  now?: string;
  createId?: (prefix: string) => string;
}): WorkspaceMobileUploadReceiveResult {
  if (!isPdfUploadFile(input.file)) {
    return {
      status: "rejected",
      errorMessage: "\u4ec5\u652f\u6301 PDF \u6587\u4ef6\u4e0a\u4f20"
    };
  }

  if (
    !input.activePairingSession ||
    input.activePairingSession.id !== input.upload.pairedSessionId
  ) {
    return {
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u65e0\u6548"
    };
  }

  if (
    resolveMobileUploadPairingSessionState(input.activePairingSession, input.now) === "expired"
  ) {
    return {
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u5df2\u8fc7\u671f"
    };
  }

  const createId = input.createId ?? createWorkspaceUploadId;
  const taskId = createId("mobile-upload-task");
  const task = createReceivedMobileUploadTask({
    taskId,
    upload: input.upload,
    file: input.file,
    examLibraryFolders: input.examLibraryFolders,
    examLibraryDocuments: input.examLibraryDocuments,
    now: input.now
  });

  if (input.upload.uploadKind === "lecture_archive_pdf") {
    const validationResult = validateLectureArchivePdfFileName(input.file.name);
    const errorMessage =
      validationResult.errorMessage ??
      "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219";

    if (!validationResult.isValid) {
      return {
        status: "rejected",
        errorMessage,
        task: {
          ...task,
          status: "failed",
          errorMessage
        },
        examLibraryDocuments: input.examLibraryDocuments
      };
    }
  }

  const sourceAssetId = createId("asset-source");
  const sourceAsset: BinaryAssetEntity = {
    id: sourceAssetId,
    documentId: input.upload.targetNodeId,
    pageId: input.upload.targetNodeId,
    kind: "source",
    mimeType: input.file.type || "application/pdf",
    byteLength: input.file.size
  };
  const result = processMobileUploadTask({
    task,
    sourceAssetId,
    questionFolders: input.questionFolders,
    examLibraryFolders: input.examLibraryFolders,
    examLibraryDocuments: input.examLibraryDocuments,
    uploadedSyncMetadata: resolveUploadedSyncMetadata({
      uploadKind: input.upload.uploadKind,
      examLibraryDocuments: input.examLibraryDocuments,
      targetNodeId: input.upload.targetNodeId
    })
  });

  if (result.downstreamAction.kind === "rejected") {
    return {
      status: "rejected",
      errorMessage: result.downstreamAction.errorMessage,
      task: result.task,
      examLibraryDocuments: result.examLibraryDocuments
    };
  }

  return {
    status: "accepted",
    task: result.task,
    sourceAsset,
    examLibraryDocuments: result.examLibraryDocuments,
    downstreamAction: result.downstreamAction,
    pairingSession: registerPairedMobileUploadDevice({
      session: input.activePairingSession,
      deviceId: input.upload.deviceId
    })
  };
}
