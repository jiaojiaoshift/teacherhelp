export const MAX_PDF_PAGE_COUNT = 400;
export const MAX_UPLOAD_FILE_BYTES = 512 * 1024 * 1024;
/** Allow multipart fields and the mobile workspace snapshot around the PDF bytes. */
export const MAX_UPLOAD_REQUEST_OVERHEAD_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_REQUEST_BYTES =
  MAX_UPLOAD_FILE_BYTES + MAX_UPLOAD_REQUEST_OVERHEAD_BYTES;
/** Keep tiny source files inline for legacy callers; large uploads stay as Blob/file bytes. */
export const MAX_INLINE_SOURCE_ASSET_BYTES = 8 * 1024 * 1024;
/** Keep the mobile receive request responsive; larger PDFs are consumed by the PC helper queue. */
export const MAX_SYNCHRONOUS_MOBILE_PREPROCESS_BYTES = 16 * 1024 * 1024;
export const MAX_ANSWER_SECTION_SAMPLE_PAGES = 12;
export const DEFAULT_PDF_RENDER_BATCH_SIZE = 8;

export type UploadCapacityErrorCode = "file_too_large" | "too_many_pages";

export interface UploadCapacitySuccess {
  ok: true;
}

export interface UploadCapacityFailure {
  ok: false;
  code: UploadCapacityErrorCode;
  actual: number;
  limit: number;
  message: string;
}

export type UploadCapacityValidation = UploadCapacitySuccess | UploadCapacityFailure;

export class UploadCapacityError extends Error {
  readonly code: UploadCapacityErrorCode;
  readonly actual: number;
  readonly limit: number;

  constructor(input: {
    code: UploadCapacityErrorCode;
    actual: number;
    limit: number;
    message: string;
  }) {
    super(input.message);
    this.name = "UploadCapacityError";
    this.code = input.code;
    this.actual = input.actual;
    this.limit = input.limit;
  }
}

export function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
  }

  return `${Math.max(0, Math.round(bytes / (1024 * 1024)))} MiB`;
}

export function validateUploadByteLength(byteLength: number): UploadCapacityValidation {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return {
      ok: false,
      code: "file_too_large",
      actual: byteLength,
      limit: MAX_UPLOAD_FILE_BYTES,
      message: "文件大小无法确认，请重新选择文件。"
    };
  }

  if (byteLength > MAX_UPLOAD_FILE_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      actual: byteLength,
      limit: MAX_UPLOAD_FILE_BYTES,
      message: `文件大小为 ${formatUploadSize(byteLength)}，超过 ${formatUploadSize(
        MAX_UPLOAD_FILE_BYTES
      )} 上限，请压缩或拆分 PDF 后重试。`
    };
  }

  return { ok: true };
}

export function validatePdfPageCount(pageCount: number): UploadCapacityValidation {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    return {
      ok: false,
      code: "too_many_pages",
      actual: pageCount,
      limit: MAX_PDF_PAGE_COUNT,
      message: "PDF 页数无法读取，请确认文件没有损坏。"
    };
  }

  if (pageCount > MAX_PDF_PAGE_COUNT) {
    return {
      ok: false,
      code: "too_many_pages",
      actual: pageCount,
      limit: MAX_PDF_PAGE_COUNT,
      message: `PDF 共 ${pageCount} 页，超过 ${MAX_PDF_PAGE_COUNT} 页上限，请拆分文件后重试。`
    };
  }

  return { ok: true };
}

export function assertUploadByteLength(byteLength: number): void {
  const result = validateUploadByteLength(byteLength);

  if (!result.ok) {
    throw new UploadCapacityError(result);
  }
}

export function assertPdfPageCount(pageCount: number): void {
  const result = validatePdfPageCount(pageCount);

  if (!result.ok) {
    throw new UploadCapacityError(result);
  }
}

export function selectRepresentativePageNumbers(
  pageCount: number,
  maximum = MAX_ANSWER_SECTION_SAMPLE_PAGES
): number[] {
  if (!Number.isInteger(pageCount) || pageCount <= 0 || maximum <= 0) {
    return [];
  }

  const count = Math.min(pageCount, Math.max(1, Math.floor(maximum)));

  if (count === 1) {
    return [1];
  }

  const selected = new Set<number>();

  for (let index = 0; index < count; index += 1) {
    selected.add(Math.round(1 + (index * (pageCount - 1)) / (count - 1)));
  }

  return Array.from(selected).sort((left, right) => left - right);
}
