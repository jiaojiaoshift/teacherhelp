export const SUBJECT_SCOPES = [
  "高中数学",
  "高中物理",
  "大学物理",
  "高等数学"
] as const;

export type SubjectScope = (typeof SUBJECT_SCOPES)[number];

export const QUESTION_TYPES = [
  "选择题",
  "填空题",
  "简答题",
  "证明题",
  "计算题",
  "其他"
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "uploaded_temp",
  "pages_ready",
  "geometry_analyzing",
  "geometry_review_pending",
  "semantic_analyzing",
  "semantic_review_pending",
  "import_ready",
  "imported",
  "source_purge_pending",
  "source_purged"
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const FOLDER_KINDS = ["system", "custom", "pending_bucket"] as const;

export type FolderKind = (typeof FOLDER_KINDS)[number];
