import { NextResponse } from "next/server";

import type {
  BinaryAssetEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity
} from "@/lib/domain/entities";
import {
  getActiveMobileUploadPairingSession,
  upsertMobileUploadHelperPendingUpload,
  upsertMobileUploadHelperProcessedFullPaperDraft,
  upsertMobileUploadHelperProcessedLectureUpload,
  upsertMobileUploadHelperProcessedQuestionBankImport,
  getMobileUploadHelperWorkspaceSnapshot,
  setActiveMobileUploadPairingSession,
  setMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import { POST as suggestAnswerSectionPost } from "@/app/api/ai/suggest-answer-section/route";
import { processFullPaperUploadForHelper } from "@/lib/services/mobile-upload-helper-full-paper-processing-service";
import { processQuestionBankUploadForHelper } from "@/lib/services/mobile-upload-helper-question-bank-processing-service";
import { registerPairedMobileUploadDevice } from "@/lib/services/mobile-upload-pairing-service";
import { isPdfUploadFile } from "@/lib/services/mobile-upload-service";
import { writeMobileUploadHelperFile } from "@/lib/server/mobile-upload-helper-file-store";
import { getPdfPageCountFromArrayBuffer } from "@/lib/pdf/pdf-renderer";
import {
  MAX_SYNCHRONOUS_MOBILE_PREPROCESS_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  UploadCapacityError
} from "@/lib/services/upload-capacity";
import { isValidMobileUploadReceiveWorkspaceSnapshot } from "@/lib/services/mobile-upload-workspace-snapshot-validation";
import { receiveWorkspaceMobileUpload } from "@/lib/services/workspace-mobile-upload-receiver-service";
import { isMobileUploadKind } from "@/lib/services/mobile-upload-workspace-target-service";
import { formatUploadSize, validateUploadByteLength } from "@/lib/services/upload-capacity";

interface MobileUploadWorkspaceSnapshotPayload {
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  mobileUploadTasks?: import("@/lib/domain/entities").MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft?: import("@/lib/domain/entities").UploadedFullPaperDraftEntity | null;
}

function isUploadedPdfLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof value !== "string" &&
    value !== null &&
    typeof value === "object" &&
    "name" in value &&
    "type" in value &&
    "size" in value
  );
}

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  return JSON.parse(value) as T;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function resolveUploadedFileName(file: File, requestedFileName: string) {
  const normalizedRequestedFileName = requestedFileName.trim();

  if (normalizedRequestedFileName) {
    return normalizedRequestedFileName;
  }

  const normalizedMultipartFileName = file.name.trim();

  if (normalizedMultipartFileName && normalizedMultipartFileName !== "blob") {
    return normalizedMultipartFileName;
  }

  if ((file.type || "").toLowerCase() === "application/pdf") {
    return "upload.pdf";
  }

  return normalizedMultipartFileName || "upload";
}

function shouldPersistPendingUpload(
  downstreamAction: import("@/lib/services/mobile-upload-processing-service").MobileUploadDownstreamAction
) {
  return (
    downstreamAction.kind === "question_bank_ingestion" ||
    downstreamAction.kind === "full_paper_split"
  );
}

function resolvePendingUploadKind(
  downstreamAction: import("@/lib/services/mobile-upload-processing-service").MobileUploadDownstreamAction
): "question_bank_pdf" | "full_paper_pdf" | null {
  if (downstreamAction.kind === "question_bank_ingestion") {
    return "question_bank_pdf";
  }

  if (downstreamAction.kind === "full_paper_split") {
    return "full_paper_pdf";
  }

  return null;
}

function createHelperRouteFetch(): typeof fetch {
  return (async (input, init) => {
    if (String(input) === "/api/ai/suggest-answer-section") {
      return await suggestAnswerSectionPost(
        new Request("http://localhost/api/ai/suggest-answer-section", {
          method: "POST",
          headers: init?.headers,
          body: init?.body as BodyInit | null | undefined
        })
      );
    }

    return await fetch(input, init);
  }) as typeof fetch;
}

function buildProcessedLectureUploadId(taskId: string) {
  return `processed-lecture-upload-${taskId}`;
}

function buildHelperLectureReplayAssets(input: {
  sourceAsset: BinaryAssetEntity;
  downstreamAction: import("@/lib/services/mobile-upload-processing-service").MobileUploadDownstreamAction;
}) {
  let documentId: string | null = null;

  if (input.downstreamAction.kind === "archive_applied") {
    documentId = input.downstreamAction.createdDocumentId;
  } else if (
    input.downstreamAction.kind === "primary_lecture_applied" ||
    input.downstreamAction.kind === "primary_lecture_sync_pending"
  ) {
    documentId = input.downstreamAction.targetDocumentId;
  }

  if (!documentId) {
    return [];
  }

  return [
    {
      ...input.sourceAsset,
      documentId,
      pageId: documentId
    }
  ];
}

export async function POST(request: Request) {
  const declaredContentLengthHeader = request.headers?.get?.("content-length");
  const declaredContentLength = declaredContentLengthHeader
    ? Number(declaredContentLengthHeader)
    : null;

  if (
    declaredContentLength !== null &&
    Number.isFinite(declaredContentLength) &&
    declaredContentLength > MAX_UPLOAD_REQUEST_BYTES
  ) {
    return NextResponse.json(
      {
        status: "rejected",
        code: "file_too_large",
        errorMessage: `上传请求体超过 ${formatUploadSize(
          MAX_UPLOAD_REQUEST_BYTES
        )}，请确认文件不超过 ${formatUploadSize(MAX_UPLOAD_FILE_BYTES)}。`
      },
      { status: 413 }
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "上传请求无法解析，请确认文件未超过大小限制"
      },
      { status: 400 }
    );
  }

  const file = formData.get("file");

  if (!isUploadedPdfLike(file)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "上传缺少 PDF 文件"
      },
      {
        status: 400
      }
    );
  }

  if (!isPdfUploadFile(file)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "仅支持 PDF 文件上传"
      },
      {
        status: 400
      }
    );
  }

  const fileSizeValidation = validateUploadByteLength(file.size);

  if (!fileSizeValidation.ok) {
    return NextResponse.json(
      {
        status: "rejected",
        code: fileSizeValidation.code,
        errorMessage: fileSizeValidation.message
      },
      { status: 413 }
    );
  }

  const uploadKind = String(formData.get("uploadKind") ?? "");
  const deviceId = String(formData.get("deviceId") ?? "").trim();
  const uploadedFileName = resolveUploadedFileName(
    file,
    String(formData.get("fileName") ?? "")
  );

  if (!isMobileUploadKind(uploadKind)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u7528\u9014\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  if (!deviceId) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u8bbe\u5907\u6807\u8bc6\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  let normalizedFile = file;

  if (file.name !== uploadedFileName || file.type !== "application/pdf") {
    normalizedFile = new File([file], uploadedFileName, {
      type: file.type || "application/pdf"
    });
  }

  let requestWorkspaceSnapshot: MobileUploadWorkspaceSnapshotPayload | null;
  let targetNodePath: string[];

  try {
    requestWorkspaceSnapshot = parseJsonField<MobileUploadWorkspaceSnapshotPayload | null>(
      formData.get("workspaceSnapshot"),
      null
    );
    targetNodePath = parseJsonField<string[]>(formData.get("targetNodePath"), []);
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  if (!isStringArray(targetNodePath)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  if (!isValidMobileUploadReceiveWorkspaceSnapshot(requestWorkspaceSnapshot)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  const helperWorkspaceSnapshot = getMobileUploadHelperWorkspaceSnapshot();
  const workspaceSnapshot = helperWorkspaceSnapshot ?? requestWorkspaceSnapshot;

  if (!workspaceSnapshot) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "PC 后台助手尚未同步工作区快照"
      },
      {
        status: 409
      }
    );
  }

  const activePairingSession = getActiveMobileUploadPairingSession();
  const result = receiveWorkspaceMobileUpload({
    file: {
      name: uploadedFileName,
      type: normalizedFile.type,
      size: normalizedFile.size
    },
    upload: {
      deviceId,
      pairedSessionId: String(formData.get("pairedSessionId") ?? ""),
      uploadKind,
      targetNodeId: String(formData.get("targetNodeId") ?? ""),
      targetNodePath
    },
    questionFolders: workspaceSnapshot.questionFolders,
    examLibraryFolders: workspaceSnapshot.examLibraryFolders,
    examLibraryDocuments: workspaceSnapshot.examLibraryDocuments,
    activePairingSession
  });

  if (result.status === "rejected") {
    if (result.task) {
      if (activePairingSession) {
        setActiveMobileUploadPairingSession(
          registerPairedMobileUploadDevice({
            session: activePairingSession,
            deviceId
          })
        );
      }

      setMobileUploadHelperWorkspaceSnapshot({
        questionFolders: workspaceSnapshot.questionFolders,
        examLibraryFolders: workspaceSnapshot.examLibraryFolders,
        examLibraryDocuments: result.examLibraryDocuments ?? workspaceSnapshot.examLibraryDocuments,
        mobileUploadTasks: [
          ...(workspaceSnapshot.mobileUploadTasks ?? []),
          result.task
        ].filter(
          (task, index, tasks) =>
            tasks.findIndex((candidate) => candidate.id === task.id) === index
        ),
        pendingUploadedFullPaperDraft: workspaceSnapshot.pendingUploadedFullPaperDraft ?? null
      });
    }

    return NextResponse.json(result, {
      status: 409
    });
  }

  if (
    result.downstreamAction.kind !== "question_bank_ingestion" &&
    result.downstreamAction.kind !== "full_paper_split"
  ) {
    try {
      await getPdfPageCountFromArrayBuffer(await normalizedFile.arrayBuffer());
    } catch (error) {
      if (error instanceof UploadCapacityError) {
        return NextResponse.json(
          {
            status: "rejected",
            code: error.code,
            errorMessage: error.message
          },
          { status: 413 }
        );
      }

      // Lecture uploads are archived or reviewed later and historically accepted
      // files without a readable text/page structure. Keep that compatibility while
      // still rejecting a page count that was successfully proven to exceed the cap.
    }
  }

  setActiveMobileUploadPairingSession(result.pairingSession);
  let nextTask = result.task;
  let nextSourceAsset = result.sourceAsset;
  let shouldQueuePendingUpload = true;
  const deferLargeHelperPreprocessing =
    normalizedFile.size > MAX_SYNCHRONOUS_MOBILE_PREPROCESS_BYTES;

  if (
    result.downstreamAction.kind === "question_bank_ingestion" &&
    !deferLargeHelperPreprocessing
  ) {
    const helperProcessingResult = await processQuestionBankUploadForHelper({
      task: result.task,
      file: normalizedFile,
      questionFolders: workspaceSnapshot.questionFolders,
      examLibraryFolders: workspaceSnapshot.examLibraryFolders,
      fetchImpl: createHelperRouteFetch()
    });

    if (helperProcessingResult.status === "processed") {
      upsertMobileUploadHelperProcessedQuestionBankImport(
        helperProcessingResult.processedImport
      );
      nextTask = helperProcessingResult.processedImport.task;
      shouldQueuePendingUpload = false;
    }
  }

  let nextPendingUploadedFullPaperDraft = workspaceSnapshot.pendingUploadedFullPaperDraft ?? null;

  if (result.downstreamAction.kind === "full_paper_split" && !deferLargeHelperPreprocessing) {
    const helperProcessingResult = await processFullPaperUploadForHelper({
      task: result.task,
      file: normalizedFile,
      questionFolders: workspaceSnapshot.questionFolders,
      examLibraryFolders: workspaceSnapshot.examLibraryFolders,
      pendingUploadedFullPaperDraft: workspaceSnapshot.pendingUploadedFullPaperDraft ?? null,
      fetchImpl: createHelperRouteFetch()
    });

    if (helperProcessingResult.status === "processed") {
      upsertMobileUploadHelperProcessedFullPaperDraft(helperProcessingResult.processedDraft);
      nextTask = helperProcessingResult.processedDraft.task;
      nextPendingUploadedFullPaperDraft = helperProcessingResult.processedDraft.pendingDraft;
      shouldQueuePendingUpload = false;
    }
  }

  if (
    result.downstreamAction.kind === "archive_applied" ||
    result.downstreamAction.kind === "primary_lecture_applied" ||
    result.downstreamAction.kind === "primary_lecture_sync_pending"
  ) {
    const replayAssets = buildHelperLectureReplayAssets({
      sourceAsset: result.sourceAsset,
      downstreamAction: result.downstreamAction
    });

    if (replayAssets.length > 0) {
      const sourceFileToken = `processed-lecture-source-${nextTask.id}`;
      await writeMobileUploadHelperFile(sourceFileToken, normalizedFile);
      nextSourceAsset = replayAssets[0]!;
      upsertMobileUploadHelperProcessedLectureUpload({
        id: buildProcessedLectureUploadId(nextTask.id),
        task: nextTask,
        binaryAssets: replayAssets,
        sourceFileToken
      });
    }
  }

  const pendingUploadKind = shouldQueuePendingUpload
    ? resolvePendingUploadKind(result.downstreamAction)
    : null;

  if (pendingUploadKind) {
    await writeMobileUploadHelperFile(nextTask.id, normalizedFile);
    upsertMobileUploadHelperPendingUpload({
      id: `pending-upload-${nextTask.id}`,
      taskId: nextTask.id,
      deviceId: nextTask.deviceId,
      uploadKind: pendingUploadKind,
      targetNodeId: nextTask.targetNodeId,
      targetNodePath: nextTask.targetNodePath,
      originalFileName: nextTask.originalFileName,
      normalizedFileName: nextTask.normalizedFileName,
      mimeType: "application/pdf",
      createdAt: nextTask.createdAt,
      byteLength: normalizedFile.size,
      fileToken: nextTask.id
    });
  }

  setMobileUploadHelperWorkspaceSnapshot({
    questionFolders: workspaceSnapshot.questionFolders,
    examLibraryFolders: workspaceSnapshot.examLibraryFolders,
    examLibraryDocuments: result.examLibraryDocuments,
    mobileUploadTasks: [
      ...(workspaceSnapshot.mobileUploadTasks ?? []),
      nextTask
    ].filter(
      (task, index, tasks) => tasks.findIndex((candidate) => candidate.id === task.id) === index
    ),
    pendingUploadedFullPaperDraft: nextPendingUploadedFullPaperDraft
  });

  return NextResponse.json({
    ...result,
    task: nextTask,
    sourceAsset: nextSourceAsset
  });
}

