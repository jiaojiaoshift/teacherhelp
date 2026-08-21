package com.teachhelper.mobile.core.network

import kotlin.test.Test
import kotlin.test.assertEquals

class DownloadedFileNameResolverTest {
  @Test
  fun `prefers utf8 filename star value from content disposition`() {
    val fileName =
      DownloadedFileNameResolver.resolve(
        contentDisposition =
          "attachment; filename=\"primary-lecture.pdf\"; filename*=UTF-8''%E7%89%9B%E9%A1%BF%E5%AE%9A%E5%BE%8B%E4%B8%BB%E8%AE%B2%E4%B9%89.pdf",
        fallbackFileName = "download.pdf"
      )

    assertEquals("牛顿定律主讲义.pdf", fileName)
  }

  @Test
  fun `falls back to regular filename when utf8 variant is missing`() {
    val fileName =
      DownloadedFileNameResolver.resolve(
        contentDisposition = "attachment; filename=\"primary-lecture.pdf\"",
        fallbackFileName = "download.pdf"
      )

    assertEquals("primary-lecture.pdf", fileName)
  }
}
