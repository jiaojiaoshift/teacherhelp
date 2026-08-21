import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadTaskEntity,
  QuestionDraftEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";

interface MobileUploadWorkspaceSnapshotShape {
  questionFolders?: FolderEntity[];
  examLibraryFolders?: ExamLibraryFolderEntity[];
  examLibraryDocuments?: ExamLibraryDocumentEntity[];
  mobileUploadTasks?: MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
  questionDrafts?: Array<Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText">>;
}

export interface MobileUploadReceiveWorkspaceSnapshotShape {
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  mobileUploadTasks?: MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
}

export interface MobileUploadWorkspaceSyncSnapshotShape
  extends MobileUploadReceiveWorkspaceSnapshotShape {
  questionDrafts?: Array<Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText">>;
}

function isObjectPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown) {
  return typeof value === "string" || value === null;
}

function isQuestionFolderLike(value: unknown): value is FolderEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isStringArray(value.path)
  );
}

function isExamLibraryFolderLike(value: unknown): value is ExamLibraryFolderEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    isStringArray(value.path) &&
    (value.library === "specialized" || value.library === "full") &&
    typeof value.depth === "number" &&
    (value.parentId === null || typeof value.parentId === "string") &&
    (value.linkedQuestionFolderId === null || typeof value.linkedQuestionFolderId === "string") &&
    (value.role === undefined || value.role === "lecture_archive")
  );
}

function isExamLibraryDocumentLike(value: unknown): value is ExamLibraryDocumentEntity {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    typeof value.folderId === "string" &&
    (value.library === "specialized" || value.library === "full") &&
    (value.kind === "paper" || value.kind === "lecture" || value.kind === "answer_sheet") &&
    typeof value.title === "string"
  );
}

function isMobileUploadTaskLike(value: unknown): value is MobileUploadTaskEntity {
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
    (value.errorMessage === undefined || isNullableString(value.errorMessage))
  );
}

function isQuestionDraftSummaryLike(
  value: unknown
): value is Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText"> {
  return (
    isObjectPayload(value) &&
    typeof value.id === "string" &&
    (value.questionNumberLabel === undefined || isNullableString(value.questionNumberLabel)) &&
    (value.ocrText === undefined || isNullableString(value.ocrText))
  );
}

function isUploadedFullPaperDraftLike(value: unknown): value is UploadedFullPaperDraftEntity {
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

function isOptionalCollection<T>(
  value: unknown,
  predicate: (item: unknown) => item is T
): value is T[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => predicate(item)));
}

export function isValidMobileUploadWorkspaceSnapshotShape(
  value: unknown
): value is MobileUploadWorkspaceSnapshotShape {
  if (!isObjectPayload(value)) {
    return false;
  }

  return (
    isOptionalCollection(value.questionFolders, isQuestionFolderLike) &&
    isOptionalCollection(value.examLibraryFolders, isExamLibraryFolderLike) &&
    isOptionalCollection(value.examLibraryDocuments, isExamLibraryDocumentLike) &&
    isOptionalCollection(value.mobileUploadTasks, isMobileUploadTaskLike) &&
    (value.pendingUploadedFullPaperDraft === undefined ||
      value.pendingUploadedFullPaperDraft === null ||
      isUploadedFullPaperDraftLike(value.pendingUploadedFullPaperDraft)) &&
    isOptionalCollection(value.questionDrafts, isQuestionDraftSummaryLike)
  );
}

export function isValidMobileUploadReceiveWorkspaceSnapshot(
  value: unknown
): value is MobileUploadReceiveWorkspaceSnapshotShape | null {
  if (value === null) {
    return true;
  }

  return (
    isValidMobileUploadWorkspaceSnapshotShape(value) &&
    Array.isArray(value.questionFolders) &&
    Array.isArray(value.examLibraryFolders) &&
    Array.isArray(value.examLibraryDocuments)
  );
}

export function isValidMobileUploadWorkspaceSyncSnapshot(
  value: unknown
): value is MobileUploadWorkspaceSyncSnapshotShape {
  return (
    isValidMobileUploadWorkspaceSnapshotShape(value) &&
    Array.isArray(value.questionFolders) &&
    Array.isArray(value.examLibraryFolders) &&
    Array.isArray(value.examLibraryDocuments)
  );
}
