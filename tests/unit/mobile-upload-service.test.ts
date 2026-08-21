import { describe, expect, it } from "vitest";

import {
  buildLectureArchivePdfFileName,
  isPdfUploadFile,
  normalizePrimaryLectureUploadFileName,
  validateLectureArchivePdfFileName,
  validateLectureArchiveNamingFields,
  resolveMobileUploadOperation
} from "@/lib/services/mobile-upload-service";

describe("mobile-upload-service", () => {
  it("builds one lecture-archive pdf file name from validated naming fields", () => {
    const fileName = buildLectureArchivePdfFileName({
      studentName: "张三",
      gradeLabel: "高一",
      year: "26",
      month: "06",
      day: "03"
    });

    expect(fileName).toBe("张三_高一_26_06_03.pdf");
  });

  it("validates lecture-archive naming fields against the agreed constraints", () => {
    expect(
      validateLectureArchiveNamingFields({
        studentName: "王小明甲",
        gradeLabel: "初三",
        year: "26",
        month: "06",
        day: "03"
      })
    ).toEqual({
      isValid: true,
      errors: {}
    });

    expect(
      validateLectureArchiveNamingFields({
        studentName: "王小明甲乙",
        gradeLabel: "初三",
        year: "26",
        month: "6",
        day: "ab"
      })
    ).toEqual({
      isValid: false,
      errors: {
        studentName: "姓名不得超过4个汉字",
        month: "月份必须是2位阿拉伯数字",
        day: "日期必须是2位阿拉伯数字"
      }
    });
  });

  it("validates one lecture-archive pdf file name string against the agreed fixed format", () => {
    expect(validateLectureArchivePdfFileName("王明_高二_26_06_03.pdf")).toEqual({
      isValid: true,
      errorMessage: null
    });

    expect(validateLectureArchivePdfFileName("王明_高二_26_6_03.pdf")).toEqual({
      isValid: false,
      errorMessage: "讲义归档文件名不符合命名规则"
    });

    expect(validateLectureArchivePdfFileName("camera-scan.pdf")).toEqual({
      isValid: false,
      errorMessage: "讲义归档文件名不符合命名规则"
    });
  });

  it("keeps the primary lecture upload file name aligned with the immutable lecture name", () => {
    expect(
      normalizePrimaryLectureUploadFileName({
        uploadedFileName: "随手命名.pdf",
        immutableLectureName: "力学主讲义"
      })
    ).toBe("力学主讲义.pdf");

    expect(
      normalizePrimaryLectureUploadFileName({
        uploadedFileName: "力学主讲义.pdf",
        immutableLectureName: "力学主讲义"
      })
    ).toBe("力学主讲义.pdf");
  });

  it("accepts pdf uploads by mime type or extension and rejects non-pdf uploads", () => {
    expect(
      isPdfUploadFile({
        name: "lecture.bin",
        type: "application/pdf"
      })
    ).toBe(true);
    expect(
      isPdfUploadFile({
        name: "lecture.PDF",
        type: ""
      })
    ).toBe(true);
    expect(
      isPdfUploadFile({
        name: "lecture.png",
        type: "image/png"
      })
    ).toBe(false);
  });

  it("routes each mobile upload kind to the expected downstream operation", () => {
    expect(resolveMobileUploadOperation("question_bank_pdf")).toBe("question_bank_ingestion");
    expect(resolveMobileUploadOperation("full_paper_pdf")).toBe("full_paper_split");
    expect(resolveMobileUploadOperation("lecture_archive_pdf")).toBe("archive_only");
    expect(resolveMobileUploadOperation("primary_lecture_pdf")).toBe("primary_lecture_update");
  });
});
