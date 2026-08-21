import type { MobileUploadKind } from "@/lib/domain/entities";
import { sanitizeDocumentName } from "@/lib/services/ingestion-service";

export type MobileUploadOperation =
  | "question_bank_ingestion"
  | "full_paper_split"
  | "archive_only"
  | "primary_lecture_update";

export interface LectureArchiveNamingFields {
  studentName: string;
  gradeLabel: string;
  year: string;
  month: string;
  day: string;
}

export interface LectureArchiveNamingValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof LectureArchiveNamingFields, string>>;
}

export interface LectureArchivePdfFileNameValidationResult {
  isValid: boolean;
  errorMessage: string | null;
}

export function isPdfUploadFile(input: { name: string; type: string }) {
  const normalizedName = sanitizeNamingField(input.name).trim().toLowerCase();
  const normalizedType = sanitizeNamingField(input.type).trim().toLowerCase();

  return normalizedType === "application/pdf" || normalizedName.endsWith(".pdf");
}

function sanitizeNamingField(value: string) {
  return sanitizeDocumentName(value);
}

function normalizePdfBaseName(value: string) {
  return sanitizeNamingField(value).replace(/\.pdf$/i, "").trim();
}

export function buildLectureArchivePdfFileName(fields: LectureArchiveNamingFields) {
  const studentName = sanitizeNamingField(fields.studentName);
  const gradeLabel = sanitizeNamingField(fields.gradeLabel);
  const year = sanitizeNamingField(fields.year);
  const month = sanitizeNamingField(fields.month);
  const day = sanitizeNamingField(fields.day);

  return `${studentName}_${gradeLabel}_${year}_${month}_${day}.pdf`;
}

export function validateLectureArchiveNamingFields(
  fields: LectureArchiveNamingFields
): LectureArchiveNamingValidationResult {
  const errors: LectureArchiveNamingValidationResult["errors"] = {};
  const studentName = sanitizeNamingField(fields.studentName);
  const gradeLabel = sanitizeNamingField(fields.gradeLabel);
  const year = sanitizeNamingField(fields.year);
  const month = sanitizeNamingField(fields.month);
  const day = sanitizeNamingField(fields.day);

  if (!/^[\u4e00-\u9fff]{1,4}$/u.test(studentName)) {
    errors.studentName = "姓名不得超过4个汉字";
  }

  if (gradeLabel.length !== 2) {
    errors.gradeLabel = "年级必须是2个字符";
  }

  if (!/^\d{2}$/.test(year)) {
    errors.year = "年份必须是2位阿拉伯数字";
  }

  if (!/^\d{2}$/.test(month)) {
    errors.month = "月份必须是2位阿拉伯数字";
  }

  if (!/^\d{2}$/.test(day)) {
    errors.day = "日期必须是2位阿拉伯数字";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function validateLectureArchivePdfFileName(
  fileName: string
): LectureArchivePdfFileNameValidationResult {
  const normalizedFileName = sanitizeNamingField(fileName).trim();
  const matchedFileName = normalizedFileName.match(/^(.+)\.pdf$/i);

  if (!matchedFileName) {
    return {
      isValid: false,
      errorMessage: "讲义归档文件名不符合命名规则"
    };
  }

  const [studentName, gradeLabel, year, month, day, ...restFields] = matchedFileName[1].split("_");

  if (
    restFields.length > 0 ||
    !studentName ||
    !gradeLabel ||
    !year ||
    !month ||
    !day
  ) {
    return {
      isValid: false,
      errorMessage: "讲义归档文件名不符合命名规则"
    };
  }

  const validationResult = validateLectureArchiveNamingFields({
    studentName,
    gradeLabel,
    year,
    month,
    day
  });

  if (!validationResult.isValid) {
    return {
      isValid: false,
      errorMessage: "讲义归档文件名不符合命名规则"
    };
  }

  return {
    isValid: true,
    errorMessage: null
  };
}

export function normalizePrimaryLectureUploadFileName(input: {
  uploadedFileName: string;
  immutableLectureName: string;
}) {
  const immutableBaseName = normalizePdfBaseName(input.immutableLectureName);

  return `${immutableBaseName}.pdf`;
}

export function resolveMobileUploadOperation(uploadKind: MobileUploadKind): MobileUploadOperation {
  switch (uploadKind) {
    case "question_bank_pdf":
      return "question_bank_ingestion";
    case "full_paper_pdf":
      return "full_paper_split";
    case "lecture_archive_pdf":
      return "archive_only";
    case "primary_lecture_pdf":
      return "primary_lecture_update";
  }
}
