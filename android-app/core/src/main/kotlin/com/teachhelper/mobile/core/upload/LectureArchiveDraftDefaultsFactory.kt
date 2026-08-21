package com.teachhelper.mobile.core.upload

object LectureArchiveDraftDefaultsFactory {
  fun create(today: String): LectureArchiveFileNameFields =
    today.split("-").let { segments ->
      LectureArchiveFileNameFields(
        studentName = "",
        gradeLabel = "",
        year = segments.getOrNull(0)?.takeLast(2) ?: "",
        month = segments.getOrNull(1) ?: "",
        day = segments.getOrNull(2) ?: ""
      )
    }
}
