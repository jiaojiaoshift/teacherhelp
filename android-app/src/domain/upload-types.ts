export const MOBILE_UPLOAD_KIND_VALUES = [
  "question_bank_pdf",
  "full_paper_pdf",
  "lecture_archive_pdf",
  "primary_lecture_pdf"
] as const;

export type MobileUploadKind = (typeof MOBILE_UPLOAD_KIND_VALUES)[number];

export const MOBILE_UPLOAD_PAIRING_QR_TYPE = "teachhelper_mobile_upload_pairing" as const;

export interface MobileUploadPairingQrPayload {
  type: typeof MOBILE_UPLOAD_PAIRING_QR_TYPE;
  helperBaseUrl: string;
  pairingSessionId: string;
  pairingCode: string;
}

export interface MobileUploadTargetNode {
  id: string;
  name: string;
  path: string[];
  targetKind: "question_folder" | "exam_folder" | "exam_document";
}

export interface MobileUploadTargetTreeNode {
  key: string;
  name: string;
  path: string[];
  children: MobileUploadTargetTreeNode[];
  selectableTarget: MobileUploadTargetNode | null;
}

export interface LectureArchiveNamingDraft {
  studentName: string;
  gradeLabel: string;
  year: string;
  month: string;
  day: string;
}
