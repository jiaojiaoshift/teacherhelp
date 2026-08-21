import { describe, expect, it } from "vitest";

import {
  MOBILE_UPLOAD_KIND_VALUES,
  MOBILE_UPLOAD_PAIRING_QR_TYPE
} from "@/lib/services/mobile-upload-contract";
import {
  MOBILE_UPLOAD_KIND_VALUES as ANDROID_MOBILE_UPLOAD_KIND_VALUES,
  MOBILE_UPLOAD_PAIRING_QR_TYPE as ANDROID_MOBILE_UPLOAD_PAIRING_QR_TYPE
} from "@/android-app/src/domain/upload-types";

describe("mobile-upload-contract", () => {
  it("keeps one identical pairing QR type across the workspace and expo client", () => {
    expect(MOBILE_UPLOAD_PAIRING_QR_TYPE).toBe("teachhelper_mobile_upload_pairing");
    expect(ANDROID_MOBILE_UPLOAD_PAIRING_QR_TYPE).toBe(MOBILE_UPLOAD_PAIRING_QR_TYPE);
  });

  it("keeps one identical ordered upload-kind list across the workspace and expo client", () => {
    expect(MOBILE_UPLOAD_KIND_VALUES).toEqual([
      "question_bank_pdf",
      "full_paper_pdf",
      "lecture_archive_pdf",
      "primary_lecture_pdf"
    ]);
    expect(ANDROID_MOBILE_UPLOAD_KIND_VALUES).toEqual(MOBILE_UPLOAD_KIND_VALUES);
  });
});
