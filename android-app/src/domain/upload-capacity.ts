export const MAX_UPLOAD_FILE_BYTES = 512 * 1024 * 1024;

export function validateMobileUploadFileSize(byteLength: number) {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return {
      ok: false as const,
      message: "文件大小无法确认，请重新选择 PDF。"
    };
  }

  if (byteLength > MAX_UPLOAD_FILE_BYTES) {
    return {
      ok: false as const,
      message: "PDF 超过 512 MiB 上限，请压缩或拆分后重试。"
    };
  }

  return { ok: true as const };
}
