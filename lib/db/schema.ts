export const DB_NAME = "teachhelper-db";
export const DB_VERSION = 2;

export const DB_STORES = {
  documents: "documents",
  sourceAssets: "source_assets",
  pages: "pages",
  binaryAssets: "binary_assets",
  questions: "questions",
  folders: "folders",
  tags: "tags",
  analysisJobs: "analysis_jobs",
  settings: "settings",
  uiSnapshots: "ui_snapshots",
  examLibraries: "exam_libraries",
  examDocuments: "exam_documents"
} as const;

export type DbStoreName = (typeof DB_STORES)[keyof typeof DB_STORES];
