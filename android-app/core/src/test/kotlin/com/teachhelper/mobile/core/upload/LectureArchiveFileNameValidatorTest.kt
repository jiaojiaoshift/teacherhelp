package com.teachhelper.mobile.core.upload

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class LectureArchiveFileNameValidatorTest {
  @Test
  fun `builds a pdf file name when all fields are valid`() {
    val result =
      LectureArchiveFileNameValidator.validate(
        LectureArchiveFileNameFields(
          studentName = "朱姐",
          gradeLabel = "高二",
          year = "26",
          month = "06",
          day = "04"
        )
      )

    val success = assertIs<LectureArchiveFileNameValidationResult.Success>(result)
    assertEquals("朱姐_高二_26_06_04.pdf", success.fileName)
  }

  @Test
  fun `rejects names longer than four Chinese characters`() {
    val result =
      LectureArchiveFileNameValidator.validate(
        LectureArchiveFileNameFields(
          studentName = "超过四个汉字",
          gradeLabel = "高二",
          year = "26",
          month = "06",
          day = "04"
        )
      )

    val failure = assertIs<LectureArchiveFileNameValidationResult.Failure>(result)
    assertEquals("Student name must be 1 to 4 Chinese characters", failure.message)
  }
}
