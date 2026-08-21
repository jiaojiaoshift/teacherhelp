import { describe, expect, it } from "vitest";

import {
  MAX_PDF_PAGE_COUNT,
  MAX_UPLOAD_REQUEST_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  selectRepresentativePageNumbers,
  validatePdfPageCount,
  validateUploadByteLength
} from "@/lib/services/upload-capacity";

describe("upload capacity contract", () => {
  it("accepts the documented 400-page and 512 MiB boundaries", () => {
    expect(MAX_PDF_PAGE_COUNT).toBe(400);
    expect(MAX_UPLOAD_FILE_BYTES).toBe(512 * 1024 * 1024);
    expect(MAX_UPLOAD_REQUEST_BYTES).toBe(520 * 1024 * 1024);
    expect(validatePdfPageCount(400)).toEqual({ ok: true });
    expect(validateUploadByteLength(MAX_UPLOAD_FILE_BYTES)).toEqual({ ok: true });
  });

  it("rejects uploads just beyond either boundary with stable error codes", () => {
    expect(validatePdfPageCount(401)).toMatchObject({
      ok: false,
      code: "too_many_pages"
    });
    expect(validateUploadByteLength(MAX_UPLOAD_FILE_BYTES + 1)).toMatchObject({
      ok: false,
      code: "file_too_large"
    });
  });

  it("keeps answer-section sampling bounded for a 400-page document", () => {
    const pages = selectRepresentativePageNumbers(400);

    expect(pages.length).toBeLessThanOrEqual(12);
    expect(pages[0]).toBe(1);
    expect(pages.at(-1)).toBe(400);
    expect(new Set(pages).size).toBe(pages.length);
  });
});
