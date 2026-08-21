package com.teachhelper.mobile.core.network

import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object DownloadedFileNameResolver {
  fun resolve(contentDisposition: String?, fallbackFileName: String): String {
    if (contentDisposition.isNullOrBlank()) {
      return fallbackFileName
    }

    val utf8Match =
      UTF8_FILE_NAME_PATTERN.find(contentDisposition)?.groupValues?.getOrNull(1)

    if (!utf8Match.isNullOrBlank()) {
      return URLDecoder.decode(utf8Match, StandardCharsets.UTF_8)
    }

    val plainMatch =
      PLAIN_FILE_NAME_PATTERN.find(contentDisposition)?.groupValues?.getOrNull(1)

    if (!plainMatch.isNullOrBlank()) {
      return plainMatch
    }

    return fallbackFileName
  }

  private val UTF8_FILE_NAME_PATTERN = Regex("filename\\*=UTF-8''([^;]+)")
  private val PLAIN_FILE_NAME_PATTERN = Regex("filename=\"([^\"]+)\"")
}
