import { NextResponse } from "next/server";

import type { MobileUploadTaskEntity } from "@/lib/domain/entities";
import {
  getMobileUploadHelperPendingUploads,
  getMobileUploadHelperProcessedFullPaperDrafts,
  getMobileUploadHelperProcessedLectureUploads,
  getMobileUploadHelperProcessedQuestionBankImports,
  getMobileUploadHelperWorkspaceSnapshot,
  removeMobileUploadHelperPendingUpload,
  removeMobileUploadHelperProcessedFullPaperDraft,
  removeMobileUploadHelperProcessedLectureUpload,
  removeMobileUploadHelperProcessedQuestionBankImport,
  setMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";

type AcknowledgedTaskStatus = Extract<
  MobileUploadTaskEntity["status"],
  "completed" | "failed" | "processing"
>;

function isAcknowledgedTaskStatus(value: unknown): value is AcknowledgedTaskStatus {
  return value === "completed" || value === "failed" || value === "processing";
}

function isObjectPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildInvalidPayloadResponse() {
  return NextResponse.json(
    {
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u5f85\u5904\u7406\u786e\u8ba4\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    },
    {
      status: 400
    }
  );
}

function buildMissingPendingUploadResponse() {
  return NextResponse.json(
    {
      status: "rejected",
      errorMessage: "移动上传待处理记录不存在"
    },
    {
      status: 404
    }
  );
}

export async function GET() {
  const currentSnapshot = getMobileUploadHelperWorkspaceSnapshot();
  const pendingUploads = getMobileUploadHelperPendingUploads().map((pendingUpload) => {
    if (!pendingUpload.fileToken) {
      return pendingUpload;
    }

    const { fileToken: _fileToken, ...metadata } = pendingUpload;
    return {
      ...metadata,
      fileUrl: `/api/mobile-upload/pending-uploads/file?id=${encodeURIComponent(
        pendingUpload.id
      )}`
    };
  });

  const processedQuestionBankImports = getMobileUploadHelperProcessedQuestionBankImports().map(
    (processedImport) => {
      if (!processedImport.sourceFileToken) {
        return processedImport;
      }

      const { sourceFileToken: _sourceFileToken, ...metadata } = processedImport;
      return {
        ...metadata,
        sourceFileUrl: `/api/mobile-upload/pending-uploads/file?id=${encodeURIComponent(
          processedImport.id
        )}`
      };
    }
  );
  const processedFullPaperDrafts = getMobileUploadHelperProcessedFullPaperDrafts().map((draft) => {
    if (!draft.sourceFileToken) {
      return draft;
    }

    const { sourceFileToken: _sourceFileToken, ...metadata } = draft;
    return {
      ...metadata,
      sourceFileUrl: `/api/mobile-upload/pending-uploads/file?id=${encodeURIComponent(draft.id)}`
    };
  });
  const processedLectureUploads = getMobileUploadHelperProcessedLectureUploads().map(
    (processedUpload) => {
      if (!processedUpload.sourceFileToken) {
        return processedUpload;
      }

      const { sourceFileToken: _sourceFileToken, ...metadata } = processedUpload;
      return {
        ...metadata,
        sourceFileUrl: `/api/mobile-upload/pending-uploads/file?id=${encodeURIComponent(
          processedUpload.id
        )}`
      };
    }
  );

  return NextResponse.json({
    pendingUploads,
    processedQuestionBankImports,
    processedFullPaperDrafts,
    processedLectureUploads,
    examLibraryDocuments: currentSnapshot?.examLibraryDocuments ?? [],
    mobileUploadTasks: currentSnapshot?.mobileUploadTasks ?? []
  });
}

export async function POST(request: Request) {
  let payload: {
    pendingUploadId?: string;
    processedQuestionBankImportId?: string;
    processedFullPaperDraftId?: string;
    processedLectureUploadId?: string;
    nextTaskStatus?: MobileUploadTaskEntity["status"];
    errorMessage?: string | null;
  };

  try {
    payload = (await request.json()) as {
      pendingUploadId?: string;
      processedQuestionBankImportId?: string;
      processedFullPaperDraftId?: string;
      processedLectureUploadId?: string;
      nextTaskStatus?: MobileUploadTaskEntity["status"];
      errorMessage?: string | null;
    };
  } catch {
    return buildInvalidPayloadResponse();
  }

  if (
    !isObjectPayload(payload) ||
    ((typeof payload.pendingUploadId !== "string" || !payload.pendingUploadId.trim()) &&
      (typeof payload.processedQuestionBankImportId !== "string" ||
        !payload.processedQuestionBankImportId.trim()) &&
      (typeof payload.processedFullPaperDraftId !== "string" ||
        !payload.processedFullPaperDraftId.trim()) &&
      (typeof payload.processedLectureUploadId !== "string" ||
        !payload.processedLectureUploadId.trim())) ||
    (payload.nextTaskStatus !== undefined &&
      !isAcknowledgedTaskStatus(payload.nextTaskStatus)) ||
    (payload.errorMessage !== undefined &&
      payload.errorMessage !== null &&
      typeof payload.errorMessage !== "string")
  ) {
    return buildInvalidPayloadResponse();
  }

  const acknowledgedPendingUpload =
    typeof payload.pendingUploadId === "string"
      ? (getMobileUploadHelperPendingUploads().find(
          (pendingUpload) => pendingUpload.id === payload.pendingUploadId
        ) ?? null)
      : null;
  const acknowledgedProcessedQuestionBankImport =
    typeof payload.processedQuestionBankImportId === "string"
      ? (getMobileUploadHelperProcessedQuestionBankImports().find(
          (processedImport) => processedImport.id === payload.processedQuestionBankImportId
        ) ?? null)
      : null;
  const acknowledgedProcessedFullPaperDraft =
    typeof payload.processedFullPaperDraftId === "string"
      ? (getMobileUploadHelperProcessedFullPaperDrafts().find(
          (processedDraft) => processedDraft.id === payload.processedFullPaperDraftId
        ) ?? null)
      : null;
  const acknowledgedProcessedLectureUpload =
    typeof payload.processedLectureUploadId === "string"
      ? (getMobileUploadHelperProcessedLectureUploads().find(
          (processedUpload) => processedUpload.id === payload.processedLectureUploadId
        ) ?? null)
      : null;

  if (
    !acknowledgedPendingUpload &&
    !acknowledgedProcessedQuestionBankImport &&
    !acknowledgedProcessedFullPaperDraft &&
    !acknowledgedProcessedLectureUpload
  ) {
    return buildMissingPendingUploadResponse();
  }

  const currentSnapshot = getMobileUploadHelperWorkspaceSnapshot();
  const nextTaskStatus = payload.nextTaskStatus;
  const acknowledgedTaskId =
    acknowledgedPendingUpload?.taskId ??
    acknowledgedProcessedQuestionBankImport?.task.id ??
    acknowledgedProcessedFullPaperDraft?.task.id ??
    acknowledgedProcessedLectureUpload?.task.id ??
    null;

  if (currentSnapshot && nextTaskStatus && acknowledgedTaskId) {
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: currentSnapshot.questionFolders,
      examLibraryFolders: currentSnapshot.examLibraryFolders,
      examLibraryDocuments: currentSnapshot.examLibraryDocuments,
      mobileUploadTasks: currentSnapshot.mobileUploadTasks.map((task) =>
        task.id === acknowledgedTaskId
          ? {
              ...task,
              status: nextTaskStatus,
              errorMessage:
                nextTaskStatus === "failed"
                  ? payload.errorMessage ?? task.errorMessage ?? "\u79fb\u52a8\u4e0a\u4f20\u5904\u7406\u5931\u8d25"
              : null
            }
          : task
      ),
      pendingUploadedFullPaperDraft:
        acknowledgedProcessedFullPaperDraft && nextTaskStatus === "failed"
          ? null
          : currentSnapshot.pendingUploadedFullPaperDraft,
      ...(currentSnapshot.questionDrafts
        ? {
            questionDrafts: currentSnapshot.questionDrafts
          }
        : {})
    });
  }

  if (acknowledgedPendingUpload) {
    removeMobileUploadHelperPendingUpload(acknowledgedPendingUpload.id);
  }

  if (acknowledgedProcessedQuestionBankImport) {
    removeMobileUploadHelperProcessedQuestionBankImport(
      acknowledgedProcessedQuestionBankImport.id
    );
  }

  if (acknowledgedProcessedFullPaperDraft) {
    removeMobileUploadHelperProcessedFullPaperDraft(acknowledgedProcessedFullPaperDraft.id);
  }

  if (acknowledgedProcessedLectureUpload) {
    removeMobileUploadHelperProcessedLectureUpload(acknowledgedProcessedLectureUpload.id);
  }

  return NextResponse.json({
    status: "acknowledged",
    pendingUploadCount: getMobileUploadHelperPendingUploads().length
  });
}

