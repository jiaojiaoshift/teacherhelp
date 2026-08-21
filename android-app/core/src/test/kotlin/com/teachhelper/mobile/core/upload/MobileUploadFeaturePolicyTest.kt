package com.teachhelper.mobile.core.upload

import kotlin.test.Test
import kotlin.test.assertEquals

class MobileUploadFeaturePolicyTest {
  @Test
  fun `marks lecture archive uploads as requiring archive naming`() {
    val policy = MobileUploadFeaturePolicy.forKind(MobileUploadKind.LECTURE_ARCHIVE_PDF)

    assertEquals(true, policy.requiresArchiveNaming)
    assertEquals(false, policy.supportsPrimaryLectureDownload)
  }

  @Test
  fun `marks primary lecture uploads as supporting download`() {
    val policy = MobileUploadFeaturePolicy.forKind(MobileUploadKind.PRIMARY_LECTURE_PDF)

    assertEquals(false, policy.requiresArchiveNaming)
    assertEquals(true, policy.supportsPrimaryLectureDownload)
  }
}
