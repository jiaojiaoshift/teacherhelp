package com.teachhelper.mobile.core.upload

data class LectureArchiveFileNameFields(
  val studentName: String,
  val gradeLabel: String,
  val year: String,
  val month: String,
  val day: String
)

sealed interface LectureArchiveFileNameValidationResult {
  data class Success(val fileName: String) : LectureArchiveFileNameValidationResult

  data class Failure(val message: String) : LectureArchiveFileNameValidationResult
}

object LectureArchiveFileNameValidator {
  private val studentNamePattern = Regex("^[\\p{IsHan}]{1,4}$")
  private val twoDigitPattern = Regex("^\\d{2}$")

  fun validate(fields: LectureArchiveFileNameFields): LectureArchiveFileNameValidationResult {
    val normalizedFields =
      fields.copy(
        studentName = fields.studentName.trim(),
        gradeLabel = fields.gradeLabel.trim(),
        year = fields.year.trim(),
        month = fields.month.trim(),
        day = fields.day.trim()
      )

    if (!studentNamePattern.matches(normalizedFields.studentName)) {
      return LectureArchiveFileNameValidationResult.Failure(
        "Student name must be 1 to 4 Chinese characters"
      )
    }

    if (normalizedFields.gradeLabel.length != 2) {
      return LectureArchiveFileNameValidationResult.Failure(
        "Grade label must be exactly 2 characters"
      )
    }

    if (!twoDigitPattern.matches(normalizedFields.year)) {
      return LectureArchiveFileNameValidationResult.Failure("Year must be exactly 2 digits")
    }

    if (!twoDigitPattern.matches(normalizedFields.month)) {
      return LectureArchiveFileNameValidationResult.Failure("Month must be exactly 2 digits")
    }

    if (!twoDigitPattern.matches(normalizedFields.day)) {
      return LectureArchiveFileNameValidationResult.Failure("Day must be exactly 2 digits")
    }

    return LectureArchiveFileNameValidationResult.Success(
      fileName =
        "${normalizedFields.studentName}_${normalizedFields.gradeLabel}_${normalizedFields.year}_${normalizedFields.month}_${normalizedFields.day}.pdf"
    )
  }
}
