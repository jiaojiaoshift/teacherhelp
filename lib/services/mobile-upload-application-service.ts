import type {
  ExamDocumentQuestionBlock,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  ExamLectureSyncMetadata,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import {
  createLectureArchiveDocument
} from "@/lib/services/exam-library-service";
import {
  planPrimaryLectureSyncUpdate
} from "@/lib/services/lecture-sync-metadata-service";
import type { MobileUploadRoute } from "@/lib/services/mobile-upload-routing-service";

export type MobileUploadApplicationResult =
  | {
      status: "applied";
      createdDocumentId: string | null;
      examLibraryDocuments: ExamLibraryDocumentEntity[];
    }
  | {
      status: "awaiting_sync";
      targetDocumentId: string;
      normalizedFileName: string;
      syncPlan: ReturnType<typeof planPrimaryLectureSyncUpdate>;
      examLibraryDocuments: ExamLibraryDocumentEntity[];
    }
  | {
      status: "rejected";
      errorMessage: string;
    };

function createArchiveDocumentId(taskId: string) {
  return `lecture-archive-${taskId}`;
}

function mapMetadataBlocks(metadata: ExamLectureSyncMetadata) {
  return metadata.blocks.map((block) => ({
    blockId: block.blockId,
    questionIds: block.questionIds
  }));
}

function buildPendingPrimaryLectureQuestionBlocks(input: {
  currentBlocks: ExamDocumentQuestionBlock[] | undefined;
  nextMetadata: ExamLectureSyncMetadata;
}) {
  const labelByBlockId = new Map(
    (input.currentBlocks ?? []).map((block) => [block.key, block.label])
  );

  return input.nextMetadata.blocks.map<ExamDocumentQuestionBlock>((block) => ({
    key: block.blockId,
    label: labelByBlockId.get(block.blockId) ?? block.blockId,
    questionIds: block.questionIds
  }));
}

export function applyMobileUploadRouteToDocuments(input: {
  task: MobileUploadTaskEntity;
  route: MobileUploadRoute;
  sourceAssetId: string;
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  uploadedSyncMetadata?: ExamLectureSyncMetadata;
}): MobileUploadApplicationResult {
  const route = input.route;

  if (route.operation === "archive_only") {
    const folder = input.examLibraryFolders.find((candidate) => candidate.id === route.targetFolderId);

    if (!folder) {
      return {
        status: "rejected",
        errorMessage: "讲义归档目录不存在"
      };
    }

    const document = createLectureArchiveDocument({
      id: createArchiveDocumentId(input.task.id),
      folder,
      fileName: route.normalizedFileName,
      sourceAssetId: input.sourceAssetId,
      sourceUploadTaskId: input.task.id
    });

    return {
      status: "applied",
      createdDocumentId: document.id,
      examLibraryDocuments: input.examLibraryDocuments.concat(document)
    };
  }

  if (route.operation !== "primary_lecture_update") {
    return {
      status: "rejected",
      errorMessage: "当前路由不生成试卷库文档变更"
    };
  }

  const targetDocument = input.examLibraryDocuments.find(
    (document) => document.id === route.targetDocumentId
  );

  if (!targetDocument) {
    return {
      status: "rejected",
      errorMessage: "主讲义文档不存在"
    };
  }

  if (!targetDocument.syncMetadata || !input.uploadedSyncMetadata) {
    return {
      status: "rejected",
      errorMessage: "主讲义上传缺少同步信息"
    };
  }

  const syncPlan = planPrimaryLectureSyncUpdate({
    currentMetadata: input.uploadedSyncMetadata,
    nextBlocks: mapMetadataBlocks(targetDocument.syncMetadata)
  });

  if (syncPlan.status === "conflict") {
    return {
      status: "rejected",
      errorMessage: "主讲义同步信息与当前题块结构冲突"
    };
  }

  if (syncPlan.status === "delta") {
    const stagedQuestionBlocks = buildPendingPrimaryLectureQuestionBlocks({
      currentBlocks: targetDocument.pendingQuestionBlocks ?? targetDocument.questionBlocks,
      nextMetadata: targetDocument.syncMetadata
    });

    return {
      status: "awaiting_sync",
      targetDocumentId: targetDocument.id,
      normalizedFileName: route.normalizedFileName,
      syncPlan,
      examLibraryDocuments: input.examLibraryDocuments.map((document) =>
        document.id === targetDocument.id
          ? {
              ...document,
              syncStatus: "pending_confirmation",
              pendingQuestionIds: targetDocument.syncMetadata?.questionIds ?? document.questionIds,
              pendingQuestionBlocks: stagedQuestionBlocks,
              pendingManualPlacementQuestionIds: [],
              pendingRawPageAssetIds: [input.sourceAssetId],
              pendingSourceUploadTaskId: input.task.id
            }
          : document
      )
    };
  }

  return {
    status: "applied",
    createdDocumentId: null,
    examLibraryDocuments: input.examLibraryDocuments.map((document) =>
      document.id === targetDocument.id
        ? {
            ...document,
            rawPageAssetIds: [input.sourceAssetId],
            sourceUploadTaskId: input.task.id,
            syncMetadata: targetDocument.syncMetadata
          }
        : document
    )
  };
}
