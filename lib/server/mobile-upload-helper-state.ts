import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  BinaryAssetEntity,
  DocumentEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadHelperProcessedFullPaperDraftEntity,
  MobileUploadHelperProcessedQuestionBankImportEntity,
  MobileUploadPairingSessionEntity,
  MobileUploadTaskEntity,
  PageEntity,
  QuestionDraftEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";
import { isValidMobileUploadWorkspaceSnapshotShape } from "@/lib/services/mobile-upload-workspace-snapshot-validation";
import { removeMobileUploadHelperFile } from "@/lib/server/mobile-upload-helper-file-store";
import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

export interface MobileUploadHelperQuestionDraftSummary
  extends Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText"> {}

export interface MobileUploadHelperPendingUpload {
  id: string;
  taskId: string;
  deviceId?: string;
  uploadKind: "question_bank_pdf" | "full_paper_pdf";
  targetNodeId: string;
  targetNodePath: string[];
  originalFileName: string;
  normalizedFileName: string;
  mimeType: "application/pdf";
  createdAt: string;
  byteLength: number;
  /** Legacy persisted uploads used base64Data. New uploads use a temp file token. */
  base64Data?: string;
  fileToken?: string;
}

export interface MobileUploadHelperProcessedLectureUpload {
  id: string;
  task: MobileUploadTaskEntity;
  binaryAssets: BinaryAssetEntity[];
  /** The source PDF stays on the helper filesystem; it must not be serialized into JSON. */
  sourceFileToken?: string;
}

interface MobileUploadHelperWorkspaceSnapshot {
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  mobileUploadTasks: MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
  questionDrafts?: MobileUploadHelperQuestionDraftSummary[];
}

interface MobileUploadHelperPersistedState {
  activePairingSession: MobileUploadPairingSessionEntity | null;
  latestWorkspaceSnapshot: MobileUploadHelperWorkspaceSnapshot | null;
  pendingUploads: MobileUploadHelperPendingUpload[];
  processedQuestionBankImports: MobileUploadHelperProcessedQuestionBankImportEntity[];
  processedFullPaperDrafts: MobileUploadHelperProcessedFullPaperDraftEntity[];
  processedLectureUploads: MobileUploadHelperProcessedLectureUpload[];
}

let activePairingSession: MobileUploadPairingSessionEntity | null = null;
let latestWorkspaceSnapshot: MobileUploadHelperWorkspaceSnapshot | null = null;
let pendingUploads: MobileUploadHelperPendingUpload[] = [];
let processedQuestionBankImports: MobileUploadHelperProcessedQuestionBankImportEntity[] = [];
let processedFullPaperDrafts: MobileUploadHelperProcessedFullPaperDraftEntity[] = [];
let processedLectureUploads: MobileUploadHelperProcessedLectureUpload[] = [];
let helperStateLoaded = false;

function isObjectPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidMobileUploadPairingSession(
  value: unknown
): value is MobileUploadPairingSessionEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.helperBaseUrl === "string" &&
    typeof value.pairingCode === "string" &&
    typeof value.qrPayload === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.expiresAt === "string" &&
    isStringArray(value.pairedDeviceIds)
  );
}

function isValidMobileUploadHelperPendingUpload(
  value: unknown
): value is MobileUploadHelperPendingUpload {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.taskId === "string" &&
    (value.deviceId === undefined || typeof value.deviceId === "string") &&
    (value.uploadKind === "question_bank_pdf" || value.uploadKind === "full_paper_pdf") &&
    typeof value.targetNodeId === "string" &&
    isStringArray(value.targetNodePath) &&
    typeof value.originalFileName === "string" &&
    typeof value.normalizedFileName === "string" &&
    value.mimeType === "application/pdf" &&
    typeof value.createdAt === "string" &&
    typeof value.byteLength === "number" &&
    Number.isFinite(value.byteLength) &&
    value.byteLength >= 0 &&
    (typeof value.base64Data === "string" || typeof value.fileToken === "string")
  );
}

function isValidDocumentEntity(value: unknown): value is DocumentEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.kind === "pdf" || value.kind === "image") &&
    typeof value.status === "string" &&
    isStringArray(value.pageIds)
  );
}

function isValidPageEntity(value: unknown): value is PageEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    typeof value.pageNumber === "number" &&
    typeof value.width === "number" &&
    typeof value.height === "number" &&
    typeof value.analysisStatus === "string" &&
    typeof value.reviewStatus === "string"
  );
}

function isValidBinaryAssetEntity(value: unknown): value is BinaryAssetEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.documentId === "string" &&
    typeof value.pageId === "string" &&
    (value.kind === "thumbnail" ||
      value.kind === "display" ||
      value.kind === "source" ||
      value.kind === "question_crop") &&
    typeof value.mimeType === "string" &&
    typeof value.byteLength === "number" &&
    (value.dataUrl === undefined || value.dataUrl === null || typeof value.dataUrl === "string")
  );
}

function isValidUploadedFullPaperDraftEntity(value: unknown): value is UploadedFullPaperDraftEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.folderId === "string" &&
    typeof value.fileName === "string" &&
    typeof value.sourceAssetId === "string" &&
    typeof value.sourceDocumentId === "string" &&
    (value.sourceUploadTaskId === undefined || typeof value.sourceUploadTaskId === "string") &&
    typeof value.pageCount === "number" &&
    Number.isFinite(value.pageCount) &&
    value.pageCount >= 0 &&
    isObjectPayload(value.answerSection) &&
    (value.answerSection.status === "suggested" || value.answerSection.status === "confirmed") &&
    typeof value.answerSection.hasAnswerSection === "boolean" &&
    (value.answerSection.suggestedSplitPage === null ||
      typeof value.answerSection.suggestedSplitPage === "number") &&
    (value.answerSection.confirmedSplitPage === null ||
      typeof value.answerSection.confirmedSplitPage === "number") &&
    Array.isArray(value.uploadedPdfPages) &&
    value.uploadedPdfPages.every(
      (page) =>
        isObjectPayload(page) &&
        typeof page.pageId === "string" &&
        typeof page.pageNumber === "number" &&
        typeof page.width === "number" &&
        typeof page.height === "number" &&
        (page.reviewStatus === "unreviewed" || page.reviewStatus === "reviewed") &&
        typeof page.previewAssetId === "string"
    )
  );
}

function isValidMobileUploadTaskEntity(value: unknown): value is MobileUploadTaskEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.deviceId === "string" &&
    (value.uploadKind === "question_bank_pdf" ||
      value.uploadKind === "full_paper_pdf" ||
      value.uploadKind === "lecture_archive_pdf" ||
      value.uploadKind === "primary_lecture_pdf") &&
    typeof value.targetNodeId === "string" &&
    isStringArray(value.targetNodePath) &&
    typeof value.originalFileName === "string" &&
    typeof value.normalizedFileName === "string" &&
    value.mimeType === "application/pdf" &&
    (value.status === "received" ||
      value.status === "stored" ||
      value.status === "queued" ||
      value.status === "processing" ||
      value.status === "completed" ||
      value.status === "failed") &&
    typeof value.createdAt === "string" &&
    (value.errorMessage === undefined || value.errorMessage === null || typeof value.errorMessage === "string")
  );
}

function isValidProcessedQuestionBankPagePreview(
  value: unknown
): value is MobileUploadHelperProcessedQuestionBankImportEntity["pagePreviews"][number] {
  return (
    isObjectPayload(value) &&
    typeof value.pageId === "string" &&
    typeof value.dataUrl === "string"
  );
}

function isValidProcessedQuestionBankImport(
  value: unknown
): value is MobileUploadHelperProcessedQuestionBankImportEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    (value.sourceFileToken === undefined || typeof value.sourceFileToken === "string") &&
    isValidMobileUploadTaskEntity(value.task) &&
    value.task.uploadKind === "question_bank_pdf" &&
    Array.isArray(value.documents) &&
    value.documents.every((item) => isValidDocumentEntity(item)) &&
    Array.isArray(value.pages) &&
    value.pages.every((item) => isValidPageEntity(item)) &&
    Array.isArray(value.binaryAssets) &&
    value.binaryAssets.every((item) => isValidBinaryAssetEntity(item)) &&
    Array.isArray(value.pagePreviews) &&
    value.pagePreviews.every((item) => isValidProcessedQuestionBankPagePreview(item))
  );
}

function isValidProcessedFullPaperDraft(
  value: unknown
): value is MobileUploadHelperProcessedFullPaperDraftEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    (value.sourceFileToken === undefined || typeof value.sourceFileToken === "string") &&
    isValidMobileUploadTaskEntity(value.task) &&
    value.task.uploadKind === "full_paper_pdf" &&
    isValidUploadedFullPaperDraftEntity(value.pendingDraft) &&
    Array.isArray(value.binaryAssets) &&
    value.binaryAssets.every((item) => isValidBinaryAssetEntity(item))
  );
}

function isValidProcessedLectureUpload(
  value: unknown
): value is MobileUploadHelperProcessedLectureUpload {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    (value.sourceFileToken === undefined || typeof value.sourceFileToken === "string") &&
    isValidMobileUploadTaskEntity(value.task) &&
    (value.task.uploadKind === "lecture_archive_pdf" ||
      value.task.uploadKind === "primary_lecture_pdf") &&
    Array.isArray(value.binaryAssets) &&
    value.binaryAssets.every((item) => isValidBinaryAssetEntity(item))
  );
}

function sanitizePersistedWorkspaceSnapshot(
  value: unknown
): MobileUploadHelperWorkspaceSnapshot | null {
  if (!isValidMobileUploadWorkspaceSnapshotShape(value)) {
    return null;
  }

  if (
    !Array.isArray(value.questionFolders) ||
    !Array.isArray(value.examLibraryFolders) ||
    !Array.isArray(value.examLibraryDocuments)
  ) {
    return null;
  }

  return {
    questionFolders: value.questionFolders,
    examLibraryFolders: value.examLibraryFolders,
    examLibraryDocuments: value.examLibraryDocuments,
    mobileUploadTasks: value.mobileUploadTasks ?? [],
    ...(value.pendingUploadedFullPaperDraft !== undefined
      ? {
          pendingUploadedFullPaperDraft: isValidUploadedFullPaperDraftEntity(
            value.pendingUploadedFullPaperDraft
          )
            ? value.pendingUploadedFullPaperDraft
            : null
        }
      : {}),
    ...(value.questionDrafts
      ? {
          questionDrafts: value.questionDrafts
        }
      : {})
  };
}

function sanitizePersistedHelperState(value: unknown): MobileUploadHelperPersistedState {
  if (!isObjectPayload(value)) {
    return {
      activePairingSession: null,
      latestWorkspaceSnapshot: null,
      pendingUploads: [],
      processedQuestionBankImports: [],
      processedFullPaperDrafts: [],
      processedLectureUploads: []
    };
  }

  return {
    activePairingSession: isValidMobileUploadPairingSession(value.activePairingSession)
      ? value.activePairingSession
      : null,
    latestWorkspaceSnapshot: sanitizePersistedWorkspaceSnapshot(value.latestWorkspaceSnapshot),
    pendingUploads:
      Array.isArray(value.pendingUploads)
        ? value.pendingUploads.filter(isValidMobileUploadHelperPendingUpload)
        : [],
    processedQuestionBankImports:
      Array.isArray(value.processedQuestionBankImports)
        ? value.processedQuestionBankImports.filter(isValidProcessedQuestionBankImport)
        : [],
    processedFullPaperDrafts:
      Array.isArray(value.processedFullPaperDrafts)
        ? value.processedFullPaperDrafts.filter(isValidProcessedFullPaperDraft)
        : [],
    processedLectureUploads:
      Array.isArray(value.processedLectureUploads)
        ? value.processedLectureUploads.filter(isValidProcessedLectureUpload)
        : []
  };
}

function shouldUsePersistentMobileUploadHelperState() {
  return (
    process.env.NODE_ENV !== "test" ||
    Boolean(process.env.TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH)
  );
}

function resolveMobileUploadHelperStateFilePath() {
  return resolveTeachHelperStoragePaths().mobileUploadStateFile;
}

function loadPersistedMobileUploadHelperState() {
  if (!shouldUsePersistentMobileUploadHelperState()) {
    return;
  }

  const filePath = resolveMobileUploadHelperStateFilePath();

  if (!existsSync(filePath)) {
    return;
  }

  try {
    const persistedState = sanitizePersistedHelperState(
      JSON.parse(readFileSync(filePath, "utf8"))
    );

    activePairingSession = persistedState.activePairingSession ?? null;
    latestWorkspaceSnapshot = persistedState.latestWorkspaceSnapshot ?? null;
    pendingUploads = persistedState.pendingUploads;
    processedQuestionBankImports = persistedState.processedQuestionBankImports;
    processedFullPaperDrafts = persistedState.processedFullPaperDrafts;
    processedLectureUploads = persistedState.processedLectureUploads;
  } catch {
    activePairingSession = null;
    latestWorkspaceSnapshot = null;
    pendingUploads = [];
    processedQuestionBankImports = [];
    processedFullPaperDrafts = [];
    processedLectureUploads = [];
  }
}

function ensureMobileUploadHelperStateLoaded() {
  if (helperStateLoaded) {
    return;
  }

  helperStateLoaded = true;
  loadPersistedMobileUploadHelperState();
}

function persistMobileUploadHelperState() {
  if (!shouldUsePersistentMobileUploadHelperState()) {
    return;
  }

  const filePath = resolveMobileUploadHelperStateFilePath();

  mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  writeFileSync(
    filePath,
    JSON.stringify(
      {
        activePairingSession,
        latestWorkspaceSnapshot,
        pendingUploads,
        processedQuestionBankImports,
        processedFullPaperDrafts,
        processedLectureUploads
      } satisfies MobileUploadHelperPersistedState
    ),
    "utf8"
  );
}

export function getActiveMobileUploadPairingSession() {
  ensureMobileUploadHelperStateLoaded();

  return activePairingSession;
}

export function setActiveMobileUploadPairingSession(
  session: MobileUploadPairingSessionEntity | null
) {
  ensureMobileUploadHelperStateLoaded();
  activePairingSession = session;
  persistMobileUploadHelperState();

  return activePairingSession;
}

export function getMobileUploadHelperWorkspaceSnapshot() {
  ensureMobileUploadHelperStateLoaded();

  return latestWorkspaceSnapshot;
}

export function getMobileUploadHelperPendingUploads() {
  ensureMobileUploadHelperStateLoaded();

  return pendingUploads;
}

export function getMobileUploadHelperProcessedQuestionBankImports() {
  ensureMobileUploadHelperStateLoaded();

  return processedQuestionBankImports;
}

export function getMobileUploadHelperProcessedFullPaperDrafts() {
  ensureMobileUploadHelperStateLoaded();

  return processedFullPaperDrafts;
}

export function getMobileUploadHelperProcessedLectureUploads() {
  ensureMobileUploadHelperStateLoaded();

  return processedLectureUploads;
}

export function upsertMobileUploadHelperPendingUpload(
  pendingUpload: MobileUploadHelperPendingUpload
) {
  ensureMobileUploadHelperStateLoaded();

  const nextPendingUploads = pendingUploads.filter(
    (currentPendingUpload) => currentPendingUpload.id !== pendingUpload.id
  );

  pendingUploads = nextPendingUploads.concat(pendingUpload);
  persistMobileUploadHelperState();

  return pendingUploads;
}

export function upsertMobileUploadHelperProcessedQuestionBankImport(
  processedImport: MobileUploadHelperProcessedQuestionBankImportEntity
) {
  ensureMobileUploadHelperStateLoaded();

  processedQuestionBankImports = processedQuestionBankImports
    .filter((currentImport) => currentImport.id !== processedImport.id)
    .concat(processedImport);
  persistMobileUploadHelperState();

  return processedQuestionBankImports;
}

export function upsertMobileUploadHelperProcessedFullPaperDraft(
  processedDraft: MobileUploadHelperProcessedFullPaperDraftEntity
) {
  ensureMobileUploadHelperStateLoaded();

  processedFullPaperDrafts = processedFullPaperDrafts
    .filter((currentDraft) => currentDraft.id !== processedDraft.id)
    .concat(processedDraft);
  persistMobileUploadHelperState();

  return processedFullPaperDrafts;
}

export function upsertMobileUploadHelperProcessedLectureUpload(
  processedUpload: MobileUploadHelperProcessedLectureUpload
) {
  ensureMobileUploadHelperStateLoaded();

  processedLectureUploads = processedLectureUploads
    .filter((currentUpload) => currentUpload.id !== processedUpload.id)
    .concat(processedUpload);
  persistMobileUploadHelperState();

  return processedLectureUploads;
}

export function removeMobileUploadHelperPendingUpload(pendingUploadId: string) {
  ensureMobileUploadHelperStateLoaded();

  const removedUploads = pendingUploads.filter(
    (currentPendingUpload) => currentPendingUpload.id === pendingUploadId
  );
  pendingUploads = pendingUploads.filter(
    (currentPendingUpload) => currentPendingUpload.id !== pendingUploadId
  );
  removedUploads.forEach((pendingUpload) => {
    if (pendingUpload.fileToken) {
      void removeMobileUploadHelperFile(pendingUpload.fileToken).catch(() => undefined);
    }
  });
  persistMobileUploadHelperState();

  return pendingUploads;
}

export function removeMobileUploadHelperProcessedQuestionBankImport(processedImportId: string) {
  ensureMobileUploadHelperStateLoaded();

  const removedImports = processedQuestionBankImports.filter(
    (currentImport) => currentImport.id === processedImportId
  );
  processedQuestionBankImports = processedQuestionBankImports.filter(
    (currentImport) => currentImport.id !== processedImportId
  );
  removedImports.forEach((processedImport) => {
    if (processedImport.sourceFileToken) {
      void removeMobileUploadHelperFile(processedImport.sourceFileToken).catch(() => undefined);
    }
  });
  persistMobileUploadHelperState();

  return processedQuestionBankImports;
}

export function removeMobileUploadHelperProcessedFullPaperDraft(processedDraftId: string) {
  ensureMobileUploadHelperStateLoaded();

  const removedDrafts = processedFullPaperDrafts.filter(
    (currentDraft) => currentDraft.id === processedDraftId
  );
  processedFullPaperDrafts = processedFullPaperDrafts.filter(
    (currentDraft) => currentDraft.id !== processedDraftId
  );
  removedDrafts.forEach((draft) => {
    if (draft.sourceFileToken) {
      void removeMobileUploadHelperFile(draft.sourceFileToken).catch(() => undefined);
    }
  });
  persistMobileUploadHelperState();

  return processedFullPaperDrafts;
}

export function removeMobileUploadHelperProcessedLectureUpload(processedUploadId: string) {
  ensureMobileUploadHelperStateLoaded();

  const removedUploads = processedLectureUploads.filter(
    (currentUpload) => currentUpload.id === processedUploadId
  );
  processedLectureUploads = processedLectureUploads.filter(
    (currentUpload) => currentUpload.id !== processedUploadId
  );
  removedUploads.forEach((processedUpload) => {
    if (processedUpload.sourceFileToken) {
      void removeMobileUploadHelperFile(processedUpload.sourceFileToken).catch(() => undefined);
    }
  });
  persistMobileUploadHelperState();

  return processedLectureUploads;
}

export function setMobileUploadHelperWorkspaceSnapshot(snapshot: {
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  mobileUploadTasks?: MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
  questionDrafts?: MobileUploadHelperQuestionDraftSummary[];
}) {
  ensureMobileUploadHelperStateLoaded();

  latestWorkspaceSnapshot = {
    questionFolders: snapshot.questionFolders,
    examLibraryFolders: snapshot.examLibraryFolders,
    examLibraryDocuments: snapshot.examLibraryDocuments,
    mobileUploadTasks:
      snapshot.mobileUploadTasks ?? latestWorkspaceSnapshot?.mobileUploadTasks ?? [],
    ...(snapshot.pendingUploadedFullPaperDraft !== undefined ||
    latestWorkspaceSnapshot?.pendingUploadedFullPaperDraft !== undefined
      ? {
          pendingUploadedFullPaperDraft:
            snapshot.pendingUploadedFullPaperDraft ??
            latestWorkspaceSnapshot?.pendingUploadedFullPaperDraft ??
            null
        }
      : {}),
    ...(snapshot.questionDrafts || latestWorkspaceSnapshot?.questionDrafts
      ? {
          questionDrafts:
            snapshot.questionDrafts ?? latestWorkspaceSnapshot?.questionDrafts ?? []
        }
      : {})
  };
  persistMobileUploadHelperState();

  return latestWorkspaceSnapshot;
}

export function clearMobileUploadHelperStateForTests() {
  const filePath = resolveMobileUploadHelperStateFilePath();

  activePairingSession = null;
  latestWorkspaceSnapshot = null;
  pendingUploads.forEach((pendingUpload) => {
    if (pendingUpload.fileToken) {
      void removeMobileUploadHelperFile(pendingUpload.fileToken).catch(() => undefined);
    }
  });
  processedQuestionBankImports.forEach((processedImport) => {
    if (processedImport.sourceFileToken) {
      void removeMobileUploadHelperFile(processedImport.sourceFileToken).catch(() => undefined);
    }
  });
  processedFullPaperDrafts.forEach((processedDraft) => {
    if (processedDraft.sourceFileToken) {
      void removeMobileUploadHelperFile(processedDraft.sourceFileToken).catch(() => undefined);
    }
  });
  processedLectureUploads.forEach((processedUpload) => {
    if (processedUpload.sourceFileToken) {
      void removeMobileUploadHelperFile(processedUpload.sourceFileToken).catch(() => undefined);
    }
  });
  pendingUploads = [];
  processedQuestionBankImports = [];
  processedFullPaperDrafts = [];
  processedLectureUploads = [];
  helperStateLoaded = true;

  if (existsSync(filePath)) {
    rmSync(filePath, {
      force: true
    });
  }
}
