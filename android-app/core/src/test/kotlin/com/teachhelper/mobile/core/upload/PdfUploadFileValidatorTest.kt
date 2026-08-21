package com.teachhelper.mobile.core.upload

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class PdfUploadFileValidatorTest {
  @Test
  fun `accepts application pdf mime types`() {
    val result =
      PdfUploadFileValidator.validate(
        fileName = "lecture-notes.bin",
        mimeType = "application/pdf"
      )

    val success = assertIs<PdfUploadFileValidationResult.Success>(result)
    assertEquals("lecture-notes.bin", success.fileName)
  }

  @Test
  fun `accepts pdf extension when mime type is missing`() {
    val result =
      PdfUploadFileValidator.validate(
        fileName = "lecture-notes.pdf",
        mimeType = null
      )

    val success = assertIs<PdfUploadFileValidationResult.Success>(result)
    assertEquals("lecture-notes.pdf", success.fileName)
  }

  @Test
  fun `rejects non pdf files`() {
    val result =
      PdfUploadFileValidator.validate(
        fileName = "lecture-notes.png",
        mimeType = "image/png"
      )

    val failure = assertIs<PdfUploadFileValidationResult.Failure>(result)
    assertEquals("Only PDF files are supported", failure.message)
  }

  @Test
  fun `accepts a pdf at the 512 MiB boundary`() {
    val result =
      PdfUploadFileValidator.validate(
        fileName = "large.pdf",
        mimeType = "application/pdf",
        byteLength = UploadCapacity.MAX_UPLOAD_FILE_BYTES
      )

    assertIs<PdfUploadFileValidationResult.Success>(result)
  }

  @Test
  fun `rejects a pdf above the 512 MiB boundary`() {
    val result =
      PdfUploadFileValidator.validate(
        fileName = "large.pdf",
        mimeType = "application/pdf",
        byteLength = UploadCapacity.MAX_UPLOAD_FILE_BYTES + 1
      )

    val failure = assertIs<PdfUploadFileValidationResult.Failure>(result)
    assertEquals("PDF exceeds the 512 MiB upload limit", failure.message)
  }
}
