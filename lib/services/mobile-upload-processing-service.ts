import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  ExamLectureSyncMetadata,
  FolderEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import {
  applyMobileUploadRouteToDocuments
} from "@/lib/services/mobile-upload-application-service";
import type { MobileUploadRoute } from "@/lib/services/mobile-upload-routing-service";
import {
  resolveMobileUploadRoute
} from "@/lib/services/mobile-upload-routing-service";

export type MobileUploadDownstreamAction =
  | {
      kind: "question_bank_ingestion";
      taskId: string;
      sourceAssetId: string;
      targetNodeId: string;
      targetNodePath: string[];
      normalizedFileName: string;
    }
  | {
      kind: "full_paper_split";
      taskId: string;
      sourceAssetId: string;
      targetFolderId: string;
      targetFolderPath: string[];
      normalizedFileName: string;
    }
  | {
      kind: "archive_applied";
      createdDocumentId: string;
    }
  | {
      kind: "primary_lecture_applied";
      targetDocumentId: string;
    }
  | {
      kind: "primary_lecture_sync_pending";
      targetDocumentId: string;
      normalizedFileName: string;
      syncPlan: Exclude<
        ReturnType<typeof applyMobileUploadRouteToDocuments>,
        { status: "applied" | "rejected" }
      >["syncPlan"];
    }
  | {
      kind: "rejected";
      errorMessage: string;
    };

export interface MobileUploadProcessingResult {
  task: MobileUploadTaskEntity;
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  downstreamAction: MobileUploadDownstreamAction;
}

function applyResolvedRouteTargetToTask(input: {
  task: MobileUploadTaskEntity;
  route: MobileUploadRoute;
  examLibraryFolders: ExamLibraryFolderEntity[];
}): MobileUploadTaskEntity {
  if (input.route.operation === "question_bank_ingestion") {
    return {
      ...input.task,
      targetNodeId: input.route.targetNodeId,
      targetNodePath: input.route.targetNodePath
    };
  }

  if (
    input.route.operation === "full_paper_split" ||
    input.route.operation === "archive_only"
  ) {
    return {
      ...input.task,
      targetNodeId: input.route.targetFolderId,
      targetNodePath: input.route.targetFolderPath
    };
  }

  if (input.route.operation === "primary_lecture_update") {
    const targetFolderId = input.route.targetFolderId;
    const targetFolderPath =
      input.examLibraryFolders.find((folder) => folder.id === targetFolderId)?.path ??
      input.task.targetNodePath;

    return {
      ...input.task,
      targetNodePath: targetFolderPath
    };
  }

  return input.task;
}

export function processMobileUploadTask(input: {
  task: MobileUploadTaskEntity;
  sourceAssetId: string;
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  uploadedSyncMetadata?: ExamLectureSyncMetadata;
}): MobileUploadProcessingResult {
  const routeResult = resolveMobileUploadRoute({
    task: input.task,
    questionFolders: input.questionFolders,
    examLibraryFolders: input.examLibraryFolders,
    examLibraryDocuments: input.examLibraryDocuments
  });

  if (!routeResult.ok) {
    return {
      task: {
        ...input.task,
        status: "failed",
        errorMessage: routeResult.errorMessage
      },
      examLibraryDocuments: input.examLibraryDocuments,
      downstreamAction: {
        kind: "rejected",
        errorMessage: routeResult.errorMessage
      }
    };
  }

  const task = applyResolvedRouteTargetToTask({
    task: input.task,
    route: routeResult.route,
    examLibraryFolders: input.examLibraryFolders
  });

  if (routeResult.route.operation === "question_bank_ingestion") {
    return {
      task: {
        ...task,
        status: "queued"
      },
      examLibraryDocuments: input.examLibraryDocuments,
      downstreamAction: {
        kind: "question_bank_ingestion",
        taskId: input.task.id,
        sourceAssetId: input.sourceAssetId,
        targetNodeId: routeResult.route.targetNodeId,
        targetNodePath: routeResult.route.targetNodePath,
        normalizedFileName: routeResult.route.normalizedFileName
      }
    };
  }

  if (routeResult.route.operation === "full_paper_split") {
    return {
      task: {
        ...task,
        status: "queued"
      },
      examLibraryDocuments: input.examLibraryDocuments,
      downstreamAction: {
        kind: "full_paper_split",
        taskId: input.task.id,
        sourceAssetId: input.sourceAssetId,
        targetFolderId: routeResult.route.targetFolderId,
        targetFolderPath: routeResult.route.targetFolderPath,
        normalizedFileName: routeResult.route.normalizedFileName
      }
    };
  }

  const applicationResult = applyMobileUploadRouteToDocuments({
    task,
    route: routeResult.route,
    sourceAssetId: input.sourceAssetId,
    uploadedSyncMetadata: input.uploadedSyncMetadata,
    examLibraryFolders: input.examLibraryFolders,
    examLibraryDocuments: input.examLibraryDocuments
  });

  if (applicationResult.status === "rejected") {
    return {
      task: {
        ...task,
        status: "failed",
        errorMessage: applicationResult.errorMessage
      },
      examLibraryDocuments: input.examLibraryDocuments,
      downstreamAction: {
        kind: "rejected",
        errorMessage: applicationResult.errorMessage
      }
    };
  }

  if (applicationResult.status === "awaiting_sync") {
    return {
      task: {
        ...task,
        status: "processing"
      },
      examLibraryDocuments: applicationResult.examLibraryDocuments,
      downstreamAction: {
        kind: "primary_lecture_sync_pending",
        targetDocumentId: applicationResult.targetDocumentId,
        normalizedFileName: applicationResult.normalizedFileName,
        syncPlan: applicationResult.syncPlan
      }
    };
  }

  if (routeResult.route.operation === "archive_only") {
    return {
      task: {
        ...task,
        status: "completed"
      },
      examLibraryDocuments: applicationResult.examLibraryDocuments,
      downstreamAction: {
        kind: "archive_applied",
        createdDocumentId: applicationResult.createdDocumentId as string
      }
    };
  }

  return {
    task: {
      ...task,
      status: "completed"
    },
    examLibraryDocuments: applicationResult.examLibraryDocuments,
    downstreamAction: {
      kind: "primary_lecture_applied",
      targetDocumentId: routeResult.route.targetDocumentId
    }
  };
}
