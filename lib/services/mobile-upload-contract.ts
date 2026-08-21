export const MOBILE_UPLOAD_PAIRING_QR_TYPE = "teachhelper_mobile_upload_pairing" as const;

export const MOBILE_UPLOAD_KIND_VALUES = [
  "question_bank_pdf",
  "full_paper_pdf",
  "lecture_archive_pdf",
  "primary_lecture_pdf"
] as const;

export type SharedMobileUploadKind = (typeof MOBILE_UPLOAD_KIND_VALUES)[number];

export const MOBILE_UPLOAD_KIND_LABELS: Record<SharedMobileUploadKind, string> = {
  question_bank_pdf: "Question Bank PDF",
  full_paper_pdf: "Full Paper PDF",
  lecture_archive_pdf: "Lecture Archive PDF",
  primary_lecture_pdf: "Primary Lecture PDF"
};
