package com.teachhelper.mobile.core.upload

data class MobileUploadFeaturePolicy(
  val requiresArchiveNaming: Boolean,
  val supportsPrimaryLectureDownload: Boolean
) {
  companion object {
    fun forKind(kind: MobileUploadKind): MobileUploadFeaturePolicy =
      when (kind) {
        MobileUploadKind.LECTURE_ARCHIVE_PDF ->
          MobileUploadFeaturePolicy(
            requiresArchiveNaming = true,
            supportsPrimaryLectureDownload = false
          )

        MobileUploadKind.PRIMARY_LECTURE_PDF ->
          MobileUploadFeaturePolicy(
            requiresArchiveNaming = false,
            supportsPrimaryLectureDownload = true
          )

        else ->
          MobileUploadFeaturePolicy(
            requiresArchiveNaming = false,
            supportsPrimaryLectureDownload = false
          )
      }
  }
}
