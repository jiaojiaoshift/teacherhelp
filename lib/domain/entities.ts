import type { DocumentStatus, FolderKind, QuestionType, SubjectScope } from "@/lib/domain/enums";

export type QuestionPageLayoutMode = "single_column" | "double_column";

export interface FolderEntity {
  id: string;
  parentId: string | null;
  name: string;
  kind: FolderKind;
  subjectScope: SubjectScope | null;
  depth: number;
  path: string[];
}

export interface DocumentEntity {
  id: string;
  name: string;
  kind: "pdf" | "image";
  status: DocumentStatus;
  pageIds: string[];
  subjectScope?: SubjectScope;
  questionPageLayoutMode?: QuestionPageLayoutMode;
  answerSection?: DocumentAnswerSectionState;
  pendingAnswerMatch?: boolean;
  pendingAnswerMatchCount?: number;
  pendingAnswerMatches?: DocumentPendingAnswerMatchEntry[];
}

export interface DocumentAnswerSectionState {
  status: "suggested" | "confirmed";
  hasAnswerSection: boolean;
  suggestedSplitPage: number | null;
  confirmedSplitPage: number | null;
}

export interface DocumentPendingAnswerMatchEntry {
  id: string;
  answerLabel: string;
  suggestedQuestionId: string | null;
  status: "pending";
  pageId?: string;
  pageNumber?: number;
  confidence?: number;
  ocrText?: string | null;
  normalizedBBox?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface PageEntity {
  id: string;
  documentId: string;
  pageNumber: number;
  width: number;
  height: number;
  thumbnailAssetId?: string;
  displayAssetId?: string;
  analysisStatus: "idle" | "queued" | "running" | "done" | "failed" | "manual_only";
  reviewStatus: "unreviewed" | "reviewed";
  textLines?: PageTextLine[];
}

export interface PageTextLine {
  text: string;
  role?:
    | "question_anchor"
    | "question_content"
    | "question_continuation"
    | "knowledge_note"
    | "directory"
    | "header"
    | "footer"
    | "other";
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface BinaryAssetEntity {
  id: string;
  documentId: string;
  pageId: string;
  kind: "thumbnail" | "display" | "source" | "question_crop";
  mimeType: string;
  byteLength: number;
  dataUrl?: string | null;
  /** Browser/Electron workspace storage can retain the original bytes without base64 expansion. */
  blob?: Blob | null;
}

export interface SourcePurgeDecisionInput {
  documentStatus: DocumentStatus;
  hasUnsavedChanges: boolean;
  hasDurableQuestionImages: boolean;
  userConfirmedPurge: boolean;
}

export interface QuestionImageAttachment {
  id: string;
  assetId: string;
  pageId: string;
  pixelWidth: number;
  pixelHeight: number;
  renderDpi: number;
  version: 1;
}

export type QuestionDraftStatus =
  | "geometry_draft"
  | "geometry_reviewed"
  | "semantic_draft"
  | "auto_classified"
  | "needs_choice"
  | "reviewed"
  | "pending_bucket"
  | "manual_only";

export type QuestionClassificationStatus =
  | "unclassified"
  | "matched"
  | "needs_choice"
  | "pending_bucket"
  | "confirmed";

export interface QuestionClassificationSnapshot {
  id: string;
  documentId: string;
  directoryMatchConfidence?: number | null;
  directoryPath?: string[] | null;
  status?: QuestionDraftStatus;
  classificationStatus?: QuestionClassificationStatus;
}

export interface QuestionDraftEntity {
  id: string;
  documentId: string;
  pageIds: string[];
  primaryPageId: string;
  localOrder: number;
  globalOrder: number;
  bboxByPage: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  >;
  status: QuestionDraftStatus;
  source: "ai" | "manual" | "merged";
  confidence: number | null;
  crossPageGroupId: string | null;
  pageLayoutMode?: QuestionPageLayoutMode;
  classificationStatus?: QuestionClassificationStatus;
  directoryMatchConfidence?: number | null;
  directoryPath?: string[] | null;
  directoryCandidatePaths?: string[][];
  questionNumberLabel?: string | null;
  questionType?: QuestionType | null;
  ocrText?: string | null;
  chapterTag?: string | null;
  knowledgeTags?: string[];
  customTags?: string[];
  analysisData?: QuestionAnalysisData | null;
  questionImageAttachments?: QuestionImageAttachment[];
  answerAttachments?: QuestionAnswerAttachment[];
  lastBulkConfirmationId?: string | null;
  lastSemanticRevisionSource?:
    | "initial_classification"
    | "geometry_rerun_pending"
    | "geometry_preserved_without_rerun"
    | null;
}

export interface CrossPageCandidateEntity {
  id: string;
  documentId: string;
  leftPageId: string;
  rightPageId: string;
  sourceQuestionIds: string[];
  confidence: number;
  status: "suggested" | "accepted" | "dismissed";
}

export interface QuestionClassificationResult {
  questionId: string;
  classificationStatus: Exclude<QuestionClassificationStatus, "unclassified">;
  directoryMatchConfidence: number | null;
  directoryPath: string[] | null;
  directoryCandidatePaths: string[][];
  questionType?: QuestionType | null;
  chapterTag?: string | null;
  knowledgeTags?: string[];
  questionNumberLabel?: string | null;
  ocrText: string | null;
}

export interface QuestionBulkConfirmationSnapshot {
  id: string;
  status: QuestionDraftStatus;
  classificationStatus: QuestionClassificationStatus;
  lastBulkConfirmationId: string | null;
}

export interface TagEntity {
  id: string;
  name: string;
  type: "chapter" | "knowledge" | "custom";
  usageCount: number;
}

export interface QuestionAnalysisData {
  status: "idle" | "running" | "done" | "failed";
  updatedAt: string;
  solution: string | null;
  answer: string | null;
}

export interface QuestionAnswerAttachment {
  id: string;
  assetId: string;
  kind: "matched" | "manual";
}

export interface ExamLibraryFolderEntity {
  id: string;
  parentId: string | null;
  name: string;
  library: "specialized" | "full";
  kind: "system" | "custom";
  role?: "lecture_archive";
  subjectScope: SubjectScope | null;
  depth: number;
  path: string[];
  linkedQuestionFolderId: string | null;
}

export interface ExamDocumentQuestionBlock {
  key: string;
  label: string;
  questionIds: string[];
}

export interface ExamLectureSpacingState {
  defaultGap: number;
  perQuestionGapOverrides: Record<string, number>;
}

export interface ExamDocumentEditSnapshot {
  questionIds: string[];
  questionBlocks?: ExamDocumentQuestionBlock[];
  numberingMode: "resequence" | "custom_numeric";
  answerPlaceholder: boolean;
  lectureSpacing: ExamLectureSpacingState;
}

export interface ExamDocumentEditorState {
  undoStack: ExamDocumentEditSnapshot[];
}

export interface ExamLibraryDocumentEntity {
  id: string;
  folderId: string;
  library: "specialized" | "full";
  kind: "paper" | "lecture" | "answer_sheet";
  lectureVariant?: "blank" | "primary" | "archive";
  title: string;
  immutableName?: string;
  subjectScope: SubjectScope | null;
  groupId: string | null;
  isDefault: boolean;
  sourceMode: "question_bank" | "uploaded_pdf" | "freeform";
  syncBinding: "strong" | "independent";
  syncStatus: "idle" | "pending_confirmation";
  numberingMode: "resequence" | "custom_numeric";
  questionIds: string[];
  questionBlocks?: ExamDocumentQuestionBlock[];
  pendingQuestionIds?: string[];
  pendingQuestionBlocks?: ExamDocumentQuestionBlock[];
  pendingManualPlacementQuestionIds?: string[];
  pendingRawPageAssetIds?: string[];
  pendingSourceUploadTaskId?: string | null;
  rawPageAssetIds: string[];
  placeholderAnswerPage: boolean;
  pendingPlaceholderAnswerPage?: boolean;
  lectureSpacing?: ExamLectureSpacingState;
  editorState?: ExamDocumentEditorState;
  syncMetadata?: ExamLectureSyncMetadata | null;
  lastExportedSyncMetadata?: ExamLectureSyncMetadata | null;
  allowsQuestionMutations: boolean;
  sourceUploadTaskId?: string | null;
  uploadedPdfWorkflowStatus?: "draft_review" | "finalized";
  uploadedPdfAnswerSection?: DocumentAnswerSectionState | null;
  uploadedPdfPages?: UploadedPdfPageEntity[] | null;
}

export interface ExamLectureSyncMetadataBlock {
  blockId: string;
  questionIds: string[];
  exportOrder: number;
  pageRange: {
    start: number;
    end: number;
  };
  anchorBBox: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ExamLectureSyncMetadata {
  version: 1;
  sourceDocumentId: string;
  generatedAt: string;
  questionIds: string[];
  blocks: ExamLectureSyncMetadataBlock[];
}

export interface MobileUploadPairingSessionEntity {
  id: string;
  helperBaseUrl: string;
  pairingCode: string;
  qrPayload: string;
  createdAt: string;
  expiresAt: string;
  pairedDeviceIds: string[];
}

export type MobileUploadKind =
  | "question_bank_pdf"
  | "full_paper_pdf"
  | "lecture_archive_pdf"
  | "primary_lecture_pdf";

export type MobileUploadTaskStatus =
  | "received"
  | "stored"
  | "queued"
  | "processing"
  | "completed"
  | "failed";

export interface MobileUploadTaskEntity {
  id: string;
  deviceId: string;
  uploadKind: MobileUploadKind;
  targetNodeId: string;
  targetNodePath: string[];
  originalFileName: string;
  normalizedFileName: string;
  mimeType: "application/pdf";
  status: MobileUploadTaskStatus;
  createdAt: string;
  errorMessage?: string | null;
}

export interface MobileUploadHelperProcessedQuestionBankImportEntity {
  id: string;
  task: MobileUploadTaskEntity;
  documents: DocumentEntity[];
  pages: PageEntity[];
  binaryAssets: BinaryAssetEntity[];
  pagePreviews: Array<{
    pageId: string;
    dataUrl: string;
  }>;
  /** The source PDF stays on the helper filesystem; it must not be serialized into JSON. */
  sourceFileToken?: string;
}

export interface MobileUploadHelperProcessedFullPaperDraftEntity {
  id: string;
  task: MobileUploadTaskEntity;
  pendingDraft: UploadedFullPaperDraftEntity;
  binaryAssets: BinaryAssetEntity[];
  /** The source PDF stays on the helper filesystem; it must not be serialized into JSON. */
  sourceFileToken?: string;
}

export interface UploadedFullPaperDraftEntity {
  id: string;
  folderId: string;
  fileName: string;
  sourceAssetId: string;
  sourceDocumentId: string;
  sourceUploadTaskId?: string;
  pageCount: number;
  answerSection: DocumentAnswerSectionState;
  uploadedPdfPages: UploadedPdfPageEntity[];
}

export interface ExamWorkspaceDraft {
  selectedLibrary: "specialized" | "full";
  selectedFolderId: string | null;
  selectedDocumentId: string | null;
}

export interface UploadedPdfPageEntity {
  pageId: string;
  pageNumber: number;
  width: number;
  height: number;
  reviewStatus: "unreviewed" | "reviewed";
  previewAssetId: string;
  textLines?: PageTextLine[];
}
