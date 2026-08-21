import type { MobileUploadPairingSessionEntity } from "@/lib/domain/entities";
import type { MobileUploadHelperQuestionDraftSummary } from "@/lib/server/mobile-upload-helper-state";
import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import { resolveMobileUploadPairingSessionState } from "@/lib/services/mobile-upload-pairing-service";

interface MobileUploadHelperWorkspaceSnapshot {
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  mobileUploadTasks: MobileUploadTaskEntity[];
  questionDrafts?: MobileUploadHelperQuestionDraftSummary[];
}

export interface MobileUploadHelperReadinessSummary {
  receiverReadiness: "idle" | "awaiting_workspace" | "ready";
  workspaceSnapshotReady: boolean;
  hasActivePairingSession: boolean;
}

function hasUsablePairingSession(session: MobileUploadPairingSessionEntity | null) {
  return session !== null && resolveMobileUploadPairingSessionState(session) !== "expired";
}

export function summarizeMobileUploadHelperReadiness(input: {
  activePairingSession: MobileUploadPairingSessionEntity | null;
  workspaceSnapshot: MobileUploadHelperWorkspaceSnapshot | null;
}): MobileUploadHelperReadinessSummary {
  const workspaceSnapshotReady = input.workspaceSnapshot !== null;
  const hasActivePairingSession = hasUsablePairingSession(input.activePairingSession);

  return {
    receiverReadiness: workspaceSnapshotReady
      ? "ready"
      : hasActivePairingSession
        ? "awaiting_workspace"
        : "idle",
    workspaceSnapshotReady,
    hasActivePairingSession
  };
}

export function resolveVisibleMobileUploadHelperReadiness(input: {
  reportedReadiness: MobileUploadHelperReadinessSummary | null;
  activePairingSession: MobileUploadPairingSessionEntity | null;
  mobileUploadTasks: MobileUploadTaskEntity[];
}): MobileUploadHelperReadinessSummary {
  const hasActivePairingSession =
    input.activePairingSession === null
      ? (input.reportedReadiness?.hasActivePairingSession ?? false)
      : hasUsablePairingSession(input.activePairingSession);
  const workspaceSnapshotReady =
    input.reportedReadiness?.workspaceSnapshotReady ?? false;

  if (workspaceSnapshotReady) {
    return {
      receiverReadiness: "ready",
      workspaceSnapshotReady: true,
      hasActivePairingSession
    };
  }

  if (hasActivePairingSession) {
    return {
      receiverReadiness: "awaiting_workspace",
      workspaceSnapshotReady: false,
      hasActivePairingSession: true
    };
  }

  return {
    receiverReadiness: "idle",
    workspaceSnapshotReady: false,
    hasActivePairingSession: false
  };
}
