package com.teachhelper.mobile

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.teachhelper.mobile.core.pairing.PairingPayloadParser
import com.teachhelper.mobile.core.upload.LectureArchiveDraftDefaultsFactory
import com.teachhelper.mobile.core.upload.LectureArchiveFileNameFields
import com.teachhelper.mobile.core.upload.LectureArchiveFileNameValidationResult
import com.teachhelper.mobile.core.upload.LectureArchiveFileNameValidator
import com.teachhelper.mobile.core.upload.MobileUploadFeaturePolicy
import com.teachhelper.mobile.core.upload.MobileUploadKind
import com.teachhelper.mobile.core.upload.PdfUploadFileValidationResult
import com.teachhelper.mobile.core.upload.PdfUploadFileValidator
import com.teachhelper.mobile.core.workspace.WorkspaceTargetNode
import com.teachhelper.mobile.core.workspace.WorkspaceTargetTreeBuilder
import com.teachhelper.mobile.data.MobileUploadApiClient
import com.teachhelper.mobile.data.MobileUploadSessionStore
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class MainViewModel(
  application: Application
) : AndroidViewModel(application) {
  enum class ArchiveDraftField {
    STUDENT_NAME,
    GRADE_LABEL,
    YEAR,
    MONTH,
    DAY
  }

  private val sessionStore = MobileUploadSessionStore(application)
  private val apiClient = MobileUploadApiClient()

  private val _uiState = MutableStateFlow(MainUiState())
  val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

  init {
    viewModelScope.launch {
      val storedSession = sessionStore.loadSession()
      _uiState.update { state ->
        state.copy(
          pairedSession = storedSession
        )
      }
    }
  }

  fun onPairingInputChanged(value: String) {
    _uiState.update { state ->
      state.copy(
        pairingInput = value,
        errorMessage = null,
        successMessage = null
      )
    }
  }

  fun onQrScanned(rawContents: String) {
    _uiState.update { state ->
      state.copy(
        pairingInput = rawContents
      )
    }
    savePairingSession()
  }

  fun savePairingSession() {
    val parseResult = PairingPayloadParser.parse(_uiState.value.pairingInput)

    when (parseResult) {
      is com.teachhelper.mobile.core.pairing.PairingPayloadParseResult.Failure -> {
        _uiState.update { state ->
          state.copy(errorMessage = parseResult.message, successMessage = null)
        }
      }

      is com.teachhelper.mobile.core.pairing.PairingPayloadParseResult.Success -> {
        viewModelScope.launch {
          val storedSession = sessionStore.savePairingPayload(parseResult.payload)
          _uiState.update { state ->
            state.copy(
              pairedSession = storedSession,
              successMessage = "配对会话已保存",
              errorMessage = null
            )
          }
        }
      }
    }
  }

  fun clearPairingSession() {
    viewModelScope.launch {
      sessionStore.clearSession()
      _uiState.update {
        MainUiState(
          pairingInput = it.pairingInput,
          successMessage = "已清除当前配对"
        )
      }
    }
  }

  fun selectUploadKind(kind: MobileUploadKind) {
    val session = _uiState.value.pairedSession
    if (session == null) {
      _uiState.update { state ->
        state.copy(errorMessage = "请先完成配对", successMessage = null)
      }
      return
    }

    val policy = MobileUploadFeaturePolicy.forKind(kind)
    val archiveDraft =
      if (policy.requiresArchiveNaming) {
        LectureArchiveDraftDefaultsFactory.create(LocalDate.now().toString())
      } else {
        null
      }

    _uiState.update { state ->
      state.copy(
        selectedKind = kind,
        featurePolicy = policy,
        isFetchingTargets = true,
        targetRows = emptyList(),
        selectedTargetNode = null,
        selectedPdf = null,
        archiveDraft = archiveDraft,
        archiveDraftPreviewFileName = archiveDraft?.let(::buildArchivePreviewFileName),
        lastDownloadedFile =
          if (policy.supportsPrimaryLectureDownload) state.lastDownloadedFile else null,
        errorMessage = null,
        successMessage = null
      )
    }

    viewModelScope.launch {
      runCatching {
        apiClient.fetchTargets(session, kind)
      }.onSuccess { response ->
        _uiState.update { state ->
          state.copy(
            targetRows = WorkspaceTargetTreeBuilder.build(response.targetNodes),
            isFetchingTargets = false,
            errorMessage =
              if (response.targetNodes.isEmpty()) "当前用途暂无可选目标" else null
          )
        }
      }.onFailure { throwable ->
        _uiState.update { state ->
          state.copy(
            isFetchingTargets = false,
            errorMessage = throwable.message ?: "目标拉取失败",
            successMessage = null
          )
        }
      }
    }
  }

  fun selectTargetNode(targetNode: WorkspaceTargetNode) {
    _uiState.update { state ->
      state.copy(
        selectedTargetNode = targetNode,
        errorMessage = null,
        successMessage = null
      )
    }
  }

  fun onPdfPicked(pickedPdf: PickedPdf?) {
    if (pickedPdf == null) {
      _uiState.update { state ->
        state.copy(errorMessage = "无法读取所选 PDF", successMessage = null)
      }
      return
    }

    when (
      val validationResult =
        PdfUploadFileValidator.validate(
          pickedPdf.displayName,
          pickedPdf.mimeType,
          pickedPdf.byteLength
        )
    ) {
      is PdfUploadFileValidationResult.Failure -> {
        _uiState.update { state ->
          state.copy(errorMessage = validationResult.message, successMessage = null)
        }
      }

      is PdfUploadFileValidationResult.Success -> {
        _uiState.update { state ->
          state.copy(
            selectedPdf = pickedPdf.copy(displayName = validationResult.fileName),
            errorMessage = null,
            successMessage = "PDF 已选择"
          )
        }
      }
    }
  }

  fun updateArchiveDraft(field: ArchiveDraftField, value: String) {
    val currentDraft = _uiState.value.archiveDraft ?: return

    val nextDraft =
      when (field) {
        ArchiveDraftField.STUDENT_NAME -> currentDraft.copy(studentName = value)
        ArchiveDraftField.GRADE_LABEL -> currentDraft.copy(gradeLabel = value)
        ArchiveDraftField.YEAR -> currentDraft.copy(year = value)
        ArchiveDraftField.MONTH -> currentDraft.copy(month = value)
        ArchiveDraftField.DAY -> currentDraft.copy(day = value)
      }

    _uiState.update { state ->
      state.copy(
        archiveDraft = nextDraft,
        archiveDraftPreviewFileName = buildArchivePreviewFileName(nextDraft),
        errorMessage = null,
        successMessage = null
      )
    }
  }

  fun uploadSelectedPdf() {
    val state = _uiState.value
    val session = state.pairedSession ?: run {
      _uiState.update { it.copy(errorMessage = "请先完成配对") }
      return
    }
    val uploadKind = state.selectedKind ?: run {
      _uiState.update { it.copy(errorMessage = "请先选择上传用途") }
      return
    }
    val targetNode = state.selectedTargetNode ?: run {
      _uiState.update { it.copy(errorMessage = "请先选择目标目录") }
      return
    }
    val pickedPdf = state.selectedPdf ?: run {
      _uiState.update { it.copy(errorMessage = "请先选择 PDF") }
      return
    }

    val archiveFileName =
      if (state.featurePolicy.requiresArchiveNaming) {
        val archiveDraft = state.archiveDraft ?: run {
          _uiState.update { it.copy(errorMessage = "讲义归档命名信息缺失") }
          return
        }

        when (val validationResult = LectureArchiveFileNameValidator.validate(archiveDraft)) {
          is LectureArchiveFileNameValidationResult.Failure -> {
            _uiState.update { it.copy(errorMessage = validationResult.message) }
            return
          }

          is LectureArchiveFileNameValidationResult.Success -> validationResult.fileName
        }
      } else {
        null
      }

    _uiState.update { it.copy(isUploading = true, errorMessage = null, successMessage = null) }

    viewModelScope.launch {
      runCatching {
        apiClient.uploadPdf(
          application = getApplication(),
          session = session,
          uploadKind = uploadKind,
          targetNode = targetNode,
          pickedPdf = pickedPdf,
          overrideFileName = archiveFileName
        )
      }.onSuccess { successMessage ->
        _uiState.update { currentState ->
          currentState.copy(
            isUploading = false,
            successMessage = successMessage,
            errorMessage = null
          )
        }
      }.onFailure { throwable ->
        _uiState.update { currentState ->
          currentState.copy(
            isUploading = false,
            errorMessage = throwable.message ?: "上传失败",
            successMessage = null
          )
        }
      }
    }
  }

  fun downloadPrimaryLecture() {
    val state = _uiState.value
    val session = state.pairedSession ?: run {
      _uiState.update { it.copy(errorMessage = "请先完成配对") }
      return
    }
    val targetNode = state.selectedTargetNode ?: run {
      _uiState.update { it.copy(errorMessage = "请先选择主讲义目标") }
      return
    }

    if (!state.featurePolicy.supportsPrimaryLectureDownload) {
      _uiState.update { it.copy(errorMessage = "当前用途不支持主讲义下载") }
      return
    }

    _uiState.update { it.copy(isDownloadingPrimaryLecture = true, errorMessage = null, successMessage = null) }

    viewModelScope.launch {
      runCatching {
        apiClient.downloadPrimaryLecture(
          application = getApplication(),
          session = session,
          targetNode = targetNode
        )
      }.onSuccess { downloadedFile ->
        _uiState.update { currentState ->
          currentState.copy(
            isDownloadingPrimaryLecture = false,
            lastDownloadedFile = downloadedFile,
            successMessage = "主讲义已下载",
            errorMessage = null
          )
        }
      }.onFailure { throwable ->
        _uiState.update { currentState ->
          currentState.copy(
            isDownloadingPrimaryLecture = false,
            errorMessage = throwable.message ?: "主讲义下载失败",
            successMessage = null
          )
        }
      }
    }
  }

  private fun buildArchivePreviewFileName(fields: LectureArchiveFileNameFields): String =
    "${fields.studentName}_${fields.gradeLabel}_${fields.year}_${fields.month}_${fields.day}.pdf"
}
