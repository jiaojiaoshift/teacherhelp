package com.teachhelper.mobile

import android.net.Uri
import com.teachhelper.mobile.core.pairing.StoredPairingSession
import com.teachhelper.mobile.core.upload.LectureArchiveFileNameFields
import com.teachhelper.mobile.core.upload.MobileUploadFeaturePolicy
import com.teachhelper.mobile.core.upload.MobileUploadKind
import com.teachhelper.mobile.core.workspace.WorkspaceTargetNode
import com.teachhelper.mobile.core.workspace.WorkspaceTargetTreeRow
import java.io.File

data class PickedPdf(
  val uri: Uri,
  val displayName: String,
  val mimeType: String?,
  val byteLength: Long?
)

data class DownloadedPrimaryLecture(
  val file: File,
  val displayName: String
)

data class MainUiState(
  val pairingInput: String = "",
  val pairedSession: StoredPairingSession? = null,
  val selectedKind: MobileUploadKind? = null,
  val featurePolicy: MobileUploadFeaturePolicy =
    MobileUploadFeaturePolicy.forKind(MobileUploadKind.QUESTION_BANK_PDF),
  val targetRows: List<WorkspaceTargetTreeRow> = emptyList(),
  val selectedTargetNode: WorkspaceTargetNode? = null,
  val selectedPdf: PickedPdf? = null,
  val archiveDraft: LectureArchiveFileNameFields? = null,
  val archiveDraftPreviewFileName: String? = null,
  val isFetchingTargets: Boolean = false,
  val isUploading: Boolean = false,
  val isDownloadingPrimaryLecture: Boolean = false,
  val lastDownloadedFile: DownloadedPrimaryLecture? = null,
  val errorMessage: String? = null,
  val successMessage: String? = null
)
