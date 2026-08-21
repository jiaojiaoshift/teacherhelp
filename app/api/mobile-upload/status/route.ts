import { NextResponse } from "next/server";

import {
  getActiveMobileUploadPairingSession,
  getMobileUploadHelperPendingUploads,
  getMobileUploadHelperProcessedFullPaperDrafts,
  getMobileUploadHelperProcessedLectureUploads,
  getMobileUploadHelperProcessedQuestionBankImports,
  getMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import { summarizeMobileUploadHelperReadiness } from "@/lib/services/mobile-upload-helper-readiness-service";

export async function GET() {
  const pairingSession = getActiveMobileUploadPairingSession();
  const snapshot = getMobileUploadHelperWorkspaceSnapshot();
  const pendingUploads = getMobileUploadHelperPendingUploads();
  const processedQuestionBankImports = getMobileUploadHelperProcessedQuestionBankImports();
  const processedFullPaperDrafts = getMobileUploadHelperProcessedFullPaperDrafts();
  const processedLectureUploads = getMobileUploadHelperProcessedLectureUploads();
  const helperBacklogTaskIds = Array.from(
    new Set([
      ...pendingUploads.map((pendingUpload) => pendingUpload.taskId),
      ...processedQuestionBankImports.map((processedImport) => processedImport.task.id),
      ...processedFullPaperDrafts.map((processedDraft) => processedDraft.task.id),
      ...processedLectureUploads.map((processedUpload) => processedUpload.task.id)
    ])
  );

  return NextResponse.json({
    helperReadiness: summarizeMobileUploadHelperReadiness({
      activePairingSession: pairingSession,
      workspaceSnapshot: snapshot
    }),
    helperPendingUploadCount: helperBacklogTaskIds.length,
    helperPendingUploadTaskIds: helperBacklogTaskIds,
    processedLectureUploads,
    pairingSession,
    examLibraryDocuments: snapshot?.examLibraryDocuments ?? [],
    mobileUploadTasks: snapshot?.mobileUploadTasks ?? []
  });
}

