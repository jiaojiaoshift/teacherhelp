package com.teachhelper.mobile.core.upload

enum class MobileUploadKind(val wireValue: String) {
  QUESTION_BANK_PDF("question_bank_pdf"),
  FULL_PAPER_PDF("full_paper_pdf"),
  LECTURE_ARCHIVE_PDF("lecture_archive_pdf"),
  PRIMARY_LECTURE_PDF("primary_lecture_pdf");

  companion object {
    fun fromWireValue(value: String): MobileUploadKind? =
      entries.firstOrNull { it.wireValue == value }
  }
}
