package com.teachhelper.mobile.core.upload

sealed interface PdfUploadFileValidationResult {
  data class Success(val fileName: String) : PdfUploadFileValidationResult

  data class Failure(val message: String) : PdfUploadFileValidationResult
}

object PdfUploadFileValidator {
  fun validate(
    fileName: String,
    mimeType: String?,
    byteLength: Long? = null
  ): PdfUploadFileValidationResult {
    val normalizedFileName = fileName.trim()
    val normalizedMimeType = mimeType?.trim()?.lowercase()

    if (
      normalizedMimeType == "application/pdf" ||
        normalizedFileName.lowercase().endsWith(".pdf")
    ) {
      if (byteLength != null && byteLength > UploadCapacity.MAX_UPLOAD_FILE_BYTES) {
        return PdfUploadFileValidationResult.Failure("PDF exceeds the 512 MiB upload limit")
      }

      return PdfUploadFileValidationResult.Success(normalizedFileName)
    }

    return PdfUploadFileValidationResult.Failure("Only PDF files are supported")
  }
}
