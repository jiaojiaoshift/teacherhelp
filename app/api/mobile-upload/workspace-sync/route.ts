import { NextResponse } from "next/server";

import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  UploadedFullPaperDraftEntity,
  QuestionDraftEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import {
  getMobileUploadHelperWorkspaceSnapshot,
  setMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import { isValidMobileUploadWorkspaceSyncSnapshot } from "@/lib/services/mobile-upload-workspace-snapshot-validation";
import {
  buildMobileUploadWorkspaceTargetNodes,
  isMobileUploadKind
} from "@/lib/services/mobile-upload-workspace-target-service";

const MOBILE_UPLOAD_TASK_STATUS_RANK: Record<MobileUploadTaskEntity["status"], number> = {
  received: 0,
  stored: 1,
  queued: 2,
  processing: 3,
  completed: 4,
  failed: 4
};

function mergeMobileUploadTasksById(
  currentTasks: MobileUploadTaskEntity[],
  incomingTasks: MobileUploadTaskEntity[]
) {
  const mergedTasks = new Map(currentTasks.map((task) => [task.id, task]));

  for (const incomingTask of incomingTasks) {
    const currentTask = mergedTasks.get(incomingTask.id);

    if (!currentTask) {
      mergedTasks.set(incomingTask.id, incomingTask);
      continue;
    }

    mergedTasks.set(
      incomingTask.id,
      MOBILE_UPLOAD_TASK_STATUS_RANK[incomingTask.status] >=
        MOBILE_UPLOAD_TASK_STATUS_RANK[currentTask.status]
        ? incomingTask
        : currentTask
    );
  }

  return Array.from(mergedTasks.values());
}

function hasLinkedUploadTask(document: ExamLibraryDocumentEntity) {
  return Boolean(document.sourceUploadTaskId || document.pendingSourceUploadTaskId);
}

function shouldPreserveCurrentUploadDocument(
  currentDocument: ExamLibraryDocumentEntity,
  incomingDocument: ExamLibraryDocumentEntity | undefined
) {
  if (!hasLinkedUploadTask(currentDocument)) {
    return false;
  }

  if (!incomingDocument) {
    return true;
  }

  if (
    currentDocument.sourceUploadTaskId &&
    incomingDocument.sourceUploadTaskId !== currentDocument.sourceUploadTaskId
  ) {
    return true;
  }

  if (
    currentDocument.pendingSourceUploadTaskId &&
    incomingDocument.pendingSourceUploadTaskId !== currentDocument.pendingSourceUploadTaskId
  ) {
    return true;
  }

  return false;
}

function mergeExamLibraryDocumentsByUploadTask(
  currentDocuments: ExamLibraryDocumentEntity[],
  incomingDocuments: ExamLibraryDocumentEntity[]
) {
  const mergedDocuments = new Map(incomingDocuments.map((document) => [document.id, document]));

  for (const currentDocument of currentDocuments) {
    const incomingDocument = mergedDocuments.get(currentDocument.id);

    if (shouldPreserveCurrentUploadDocument(currentDocument, incomingDocument)) {
      mergedDocuments.set(currentDocument.id, currentDocument);
    }
  }

  return Array.from(mergedDocuments.values());
}

function shouldPreserveCurrentPendingUploadedFullPaperDraft(input: {
  currentDraft: UploadedFullPaperDraftEntity | null;
  incomingDraft: UploadedFullPaperDraftEntity | null | undefined;
  mergedTasks: MobileUploadTaskEntity[];
}) {
  if (!input.currentDraft) {
    return false;
  }

  if (input.incomingDraft && input.incomingDraft.id === input.currentDraft.id) {
    return false;
  }

  if (!input.currentDraft.sourceUploadTaskId) {
    return false;
  }

  const linkedTask = input.mergedTasks.find(
    (task) => task.id === input.currentDraft?.sourceUploadTaskId
  );

  return (
    linkedTask?.status === "received" ||
    linkedTask?.status === "stored" ||
    linkedTask?.status === "queued" ||
    linkedTask?.status === "processing"
  );
}

function mergePendingUploadedFullPaperDraft(input: {
  currentDraft: UploadedFullPaperDraftEntity | null | undefined;
  incomingDraft: UploadedFullPaperDraftEntity | null | undefined;
  mergedTasks: MobileUploadTaskEntity[];
}) {
  if (input.incomingDraft === undefined) {
    return shouldPreserveCurrentPendingUploadedFullPaperDraft({
      currentDraft: input.currentDraft ?? null,
      incomingDraft: undefined,
      mergedTasks: input.mergedTasks
    })
      ? input.currentDraft ?? null
      : input.currentDraft ?? null;
  }

  if (
    input.incomingDraft === null &&
    shouldPreserveCurrentPendingUploadedFullPaperDraft({
      currentDraft: input.currentDraft ?? null,
      incomingDraft: null,
      mergedTasks: input.mergedTasks
    })
  ) {
    return input.currentDraft ?? null;
  }

  return input.incomingDraft;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uploadKind = searchParams.get("uploadKind") ?? "";

  if (!isMobileUploadKind(uploadKind)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "移动上传用途无效"
      },
      {
        status: 400
      }
    );
  }

  const snapshot = getMobileUploadHelperWorkspaceSnapshot() ?? {
    questionFolders: [],
    examLibraryFolders: [],
    examLibraryDocuments: [],
    mobileUploadTasks: []
  };

  return NextResponse.json({
    uploadKind,
    targetNodes: buildMobileUploadWorkspaceTargetNodes({
      uploadKind,
      questionFolders: snapshot.questionFolders,
      examLibraryFolders: snapshot.examLibraryFolders,
      examLibraryDocuments: snapshot.examLibraryDocuments
    })
  });
}

export async function POST(request: Request) {
  let payload: {
    questionFolders?: FolderEntity[];
    examLibraryFolders?: ExamLibraryFolderEntity[];
    examLibraryDocuments?: ExamLibraryDocumentEntity[];
    mobileUploadTasks?: MobileUploadTaskEntity[];
    pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
    questionDrafts?: Array<
      Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText">
    >;
  };

  try {
    payload = (await request.json()) as {
      questionFolders?: FolderEntity[];
      examLibraryFolders?: ExamLibraryFolderEntity[];
      examLibraryDocuments?: ExamLibraryDocumentEntity[];
      mobileUploadTasks?: MobileUploadTaskEntity[];
      pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
      questionDrafts?: Array<
        Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText">
      >;
    };
  } catch {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  if (!isValidMobileUploadWorkspaceSyncSnapshot(payload)) {
    return NextResponse.json(
      {
        status: "rejected",
        errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  const currentSnapshot = getMobileUploadHelperWorkspaceSnapshot();
  const mergedMobileUploadTasks = mergeMobileUploadTasksById(
    currentSnapshot?.mobileUploadTasks ?? [],
    payload.mobileUploadTasks ?? []
  );

  const snapshot = setMobileUploadHelperWorkspaceSnapshot({
    questionFolders: payload.questionFolders ?? [],
    examLibraryFolders: payload.examLibraryFolders ?? [],
    examLibraryDocuments: mergeExamLibraryDocumentsByUploadTask(
      currentSnapshot?.examLibraryDocuments ?? [],
      payload.examLibraryDocuments ?? []
    ),
    mobileUploadTasks: mergedMobileUploadTasks,
    pendingUploadedFullPaperDraft: mergePendingUploadedFullPaperDraft({
      currentDraft: currentSnapshot?.pendingUploadedFullPaperDraft,
      incomingDraft: payload.pendingUploadedFullPaperDraft,
      mergedTasks: mergedMobileUploadTasks
    }),
    ...(payload.questionDrafts !== undefined
      ? {
          questionDrafts: payload.questionDrafts
        }
      : {})
  });

  return NextResponse.json({
    status: "synced",
    questionFolderCount: snapshot.questionFolders.length,
    examLibraryFolderCount: snapshot.examLibraryFolders.length,
    examLibraryDocumentCount: snapshot.examLibraryDocuments.length
  });
}

