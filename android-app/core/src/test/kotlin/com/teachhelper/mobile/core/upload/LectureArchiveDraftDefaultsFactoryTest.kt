package com.teachhelper.mobile.core.upload

import kotlin.test.Test
import kotlin.test.assertEquals

class LectureArchiveDraftDefaultsFactoryTest {
  @Test
  fun `creates empty name and grade with two digit date fields`() {
    val draft = LectureArchiveDraftDefaultsFactory.create(today = "2026-06-04")

    assertEquals("", draft.studentName)
    assertEquals("", draft.gradeLabel)
    assertEquals("26", draft.year)
    assertEquals("06", draft.month)
    assertEquals("04", draft.day)
  }
}
