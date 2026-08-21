import type { LectureArchiveNamingDraft } from "./upload-types";

export interface LectureArchiveNamingValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof LectureArchiveNamingDraft, string>>;
}

function sanitizeNamingField(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function buildLectureArchiveUploadFileName(
  draft: LectureArchiveNamingDraft
) {
  const studentName = sanitizeNamingField(draft.studentName);
  const gradeLabel = sanitizeNamingField(draft.gradeLabel);
  const year = sanitizeNamingField(draft.year);
  const month = sanitizeNamingField(draft.month);
  const day = sanitizeNamingField(draft.day);

  return `${studentName}_${gradeLabel}_${year}_${month}_${day}.pdf`;
}

export function validateLectureArchiveNamingDraft(
  draft: LectureArchiveNamingDraft
): LectureArchiveNamingValidationResult {
  const errors: LectureArchiveNamingValidationResult["errors"] = {};
  const studentName = sanitizeNamingField(draft.studentName);
  const gradeLabel = sanitizeNamingField(draft.gradeLabel);
  const year = sanitizeNamingField(draft.year);
  const month = sanitizeNamingField(draft.month);
  const day = sanitizeNamingField(draft.day);

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
