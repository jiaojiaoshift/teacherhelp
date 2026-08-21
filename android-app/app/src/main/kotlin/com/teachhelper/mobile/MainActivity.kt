package com.teachhelper.mobile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.zxing.client.android.Intents
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import com.teachhelper.mobile.data.resolvePickedPdf
import com.teachhelper.mobile.ui.theme.TeachHelperMobileTheme
import java.io.File

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    setContent {
      TeachHelperMobileTheme {
        Surface(
          modifier = Modifier.fillMaxSize(),
          color = MaterialTheme.colorScheme.background
        ) {
          MobileUploadApp()
        }
      }
    }
  }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun MobileUploadApp(
  viewModel: MainViewModel = viewModel()
) {
  val context = LocalContext.current
  val snackbarHostState = remember { SnackbarHostState() }
  val uiState by viewModel.uiState.collectAsStateWithLifecycle()

  val documentPicker =
    rememberLauncherForActivityResult(
      contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
      if (uri != null) {
        context.contentResolver.takePersistableUriPermission(
          uri,
          Intent.FLAG_GRANT_READ_URI_PERMISSION
        )
        val pickedPdf = context.contentResolver.resolvePickedPdf(uri)
        viewModel.onPdfPicked(pickedPdf)
      }
    }

  val qrScanner =
    rememberLauncherForActivityResult(
      contract = ScanContract()
    ) { result ->
      if (!result.contents.isNullOrBlank()) {
        viewModel.onQrScanned(result.contents)
      }
    }

  LaunchedEffect(uiState.errorMessage, uiState.successMessage) {
    uiState.errorMessage?.let { snackbarHostState.showSnackbar(it) }
    uiState.successMessage?.let { snackbarHostState.showSnackbar(it) }
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = { Text("TeachHelper Mobile") }
      )
    },
    snackbarHost = {
      SnackbarHost(snackbarHostState)
    }
  ) { paddingValues ->
    Column(
      modifier =
        Modifier
          .fillMaxSize()
          .padding(paddingValues)
          .verticalScroll(rememberScrollState())
          .padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      PairingSection(
        uiState = uiState,
        onPairingInputChange = viewModel::onPairingInputChanged,
        onSavePairing = viewModel::savePairingSession,
        onClearPairing = viewModel::clearPairingSession,
        onScanQr = {
          qrScanner.launch(
            ScanOptions()
              .setPrompt("扫描 PC 端配对二维码")
              .setOrientationLocked(false)
              .setBeepEnabled(false)
              .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
          )
        }
      )

      UploadKindSection(
        uiState = uiState,
        onSelectKind = viewModel::selectUploadKind
      )

      TargetSelectionSection(
        uiState = uiState,
        onSelectTarget = viewModel::selectTargetNode
      )

      FileActionSection(
        uiState = uiState,
        onPickPdf = {
          documentPicker.launch(arrayOf("application/pdf"))
        },
        onDownloadPrimaryLecture = viewModel::downloadPrimaryLecture,
        onUploadFile = viewModel::uploadSelectedPdf,
        onOpenDownloadedFile = {
          uiState.lastDownloadedFile?.let { openPdfFile(context, it.file) }
        },
        onArchiveDraftChange = viewModel::updateArchiveDraft
      )
    }
  }
}

@Composable
private fun PairingSection(
  uiState: MainUiState,
  onPairingInputChange: (String) -> Unit,
  onSavePairing: () -> Unit,
  onClearPairing: () -> Unit,
  onScanQr: () -> Unit
) {
  SectionCard(title = "配对") {
    uiState.pairedSession?.let { session ->
      Text(
        text = "当前已连接: ${session.helperBaseUrl}",
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.SemiBold
      )
      Text(
        modifier = Modifier.padding(top = 4.dp),
        text = "设备 ID: ${session.deviceId}",
        style = MaterialTheme.typography.bodySmall
      )
      Spacer(modifier = Modifier.height(12.dp))
    }

    OutlinedTextField(
      value = uiState.pairingInput,
      onValueChange = onPairingInputChange,
      modifier = Modifier.fillMaxWidth(),
      minLines = 4,
      label = { Text("二维码 JSON") }
    )
    Spacer(modifier = Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = onSavePairing) {
        Text("保存配对")
      }
      Button(onClick = onScanQr) {
        Text("扫码配对")
      }
      TextButton(onClick = onClearPairing) {
        Text("清除")
      }
    }
  }
}

@Composable
private fun UploadKindSection(
  uiState: MainUiState,
  onSelectKind: (com.teachhelper.mobile.core.upload.MobileUploadKind) -> Unit
) {
  SectionCard(title = "上传用途") {
    Text(
      text = "先选用途，再拉取对应目录树。",
      style = MaterialTheme.typography.bodySmall
    )
    Spacer(modifier = Modifier.height(12.dp))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      com.teachhelper.mobile.core.upload.MobileUploadKind.entries.forEach { kind ->
        FilterChip(
          selected = uiState.selectedKind == kind,
          onClick = {
            onSelectKind(kind)
          },
          label = {
            Text(kind.toDisplayLabel())
          }
        )
      }
    }
  }
}

@Composable
private fun TargetSelectionSection(
  uiState: MainUiState,
  onSelectTarget: (com.teachhelper.mobile.core.workspace.WorkspaceTargetNode) -> Unit
) {
  if (uiState.selectedKind == null) {
    return
  }

  SectionCard(title = "目标目录") {
    Text(
      text =
        if (uiState.isFetchingTargets) {
          "正在拉取目标..."
        } else {
          "点击可选节点作为本次上传目标。"
        },
      style = MaterialTheme.typography.bodySmall
    )
    Spacer(modifier = Modifier.height(12.dp))

    if (uiState.targetRows.isEmpty()) {
      Text(
        text = if (uiState.isFetchingTargets) "请稍候" else "当前用途暂无可选目标",
        style = MaterialTheme.typography.bodyMedium
      )
      return@SectionCard
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
      uiState.targetRows.forEach { row ->
        val isSelected = uiState.selectedTargetNode?.id == row.targetNode?.id
        Box(
          modifier =
            Modifier
              .fillMaxWidth()
              .background(
                color =
                  when {
                    isSelected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.14f)
                    row.selectable -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)
                    else -> MaterialTheme.colorScheme.surface
                  },
                shape = RoundedCornerShape(12.dp)
              )
              .clickable(enabled = row.selectable && row.targetNode != null) {
                row.targetNode?.let(onSelectTarget)
              }
              .padding(start = (row.depth * 18).dp + 12.dp, top = 10.dp, end = 12.dp, bottom = 10.dp)
        ) {
          Text(
            text = row.label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (row.selectable) FontWeight.Medium else FontWeight.Normal
          )
        }
      }
    }
  }
}

@Composable
private fun FileActionSection(
  uiState: MainUiState,
  onPickPdf: () -> Unit,
  onDownloadPrimaryLecture: () -> Unit,
  onUploadFile: () -> Unit,
  onOpenDownloadedFile: () -> Unit,
  onArchiveDraftChange: (MainViewModel.ArchiveDraftField, String) -> Unit
) {
  if (uiState.selectedKind == null || uiState.selectedTargetNode == null) {
    return
  }

  SectionCard(title = "文件操作") {
    Text(
      text = "目标: ${uiState.selectedTargetNode.path.joinToString(" / ")}",
      style = MaterialTheme.typography.bodySmall
    )
    Spacer(modifier = Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      Button(onClick = onPickPdf) {
        Text("选择 PDF")
      }

      if (uiState.featurePolicy.supportsPrimaryLectureDownload) {
        Button(onClick = onDownloadPrimaryLecture, enabled = !uiState.isDownloadingPrimaryLecture) {
          Text(if (uiState.isDownloadingPrimaryLecture) "下载中..." else "下载主讲义")
        }
      }
    }

    uiState.selectedPdf?.let { pickedPdf ->
      Spacer(modifier = Modifier.height(12.dp))
      Text(
        text = "已选文件: ${pickedPdf.displayName}",
        style = MaterialTheme.typography.bodyMedium
      )
    }

    uiState.lastDownloadedFile?.let { downloadedFile ->
      Spacer(modifier = Modifier.height(12.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
          text = "最近下载: ${downloadedFile.displayName}",
          modifier = Modifier.weight(1f),
          style = MaterialTheme.typography.bodySmall
        )
        Spacer(modifier = Modifier.width(8.dp))
        TextButton(onClick = onOpenDownloadedFile) {
          Text("打开")
        }
      }
    }

    if (uiState.featurePolicy.requiresArchiveNaming) {
      Spacer(modifier = Modifier.height(16.dp))
      Divider()
      Spacer(modifier = Modifier.height(16.dp))
      Text(
        text = "讲义归档命名",
        style = MaterialTheme.typography.titleMedium
      )
      Spacer(modifier = Modifier.height(8.dp))
      ArchiveDraftFields(
        uiState = uiState,
        onArchiveDraftChange = onArchiveDraftChange
      )
    }

    Spacer(modifier = Modifier.height(16.dp))
    Button(
      onClick = onUploadFile,
      enabled = !uiState.isUploading
    ) {
      Text(if (uiState.isUploading) "上传中..." else "上传到 PC")
    }
  }
}

@Composable
private fun ArchiveDraftFields(
  uiState: MainUiState,
  onArchiveDraftChange: (MainViewModel.ArchiveDraftField, String) -> Unit
) {
  val draft = uiState.archiveDraft ?: return

  Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
    OutlinedTextField(
      value = draft.studentName,
      onValueChange = { onArchiveDraftChange(MainViewModel.ArchiveDraftField.STUDENT_NAME, it) },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("姓名") }
    )
    OutlinedTextField(
      value = draft.gradeLabel,
      onValueChange = { onArchiveDraftChange(MainViewModel.ArchiveDraftField.GRADE_LABEL, it) },
      modifier = Modifier.fillMaxWidth(),
      label = { Text("年级") }
    )
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      OutlinedTextField(
        value = draft.year,
        onValueChange = { onArchiveDraftChange(MainViewModel.ArchiveDraftField.YEAR, it) },
        modifier = Modifier.weight(1f),
        label = { Text("年") }
      )
      OutlinedTextField(
        value = draft.month,
        onValueChange = { onArchiveDraftChange(MainViewModel.ArchiveDraftField.MONTH, it) },
        modifier = Modifier.weight(1f),
        label = { Text("月") }
      )
      OutlinedTextField(
        value = draft.day,
        onValueChange = { onArchiveDraftChange(MainViewModel.ArchiveDraftField.DAY, it) },
        modifier = Modifier.weight(1f),
        label = { Text("日") }
      )
    }
    uiState.archiveDraftPreviewFileName?.let { preview ->
      Text(
        text = "预览文件名: $preview",
        style = MaterialTheme.typography.bodySmall
      )
    }
  }
}

@Composable
private fun SectionCard(
  title: String,
  content: @Composable () -> Unit
) {
  Card(
    colors =
      CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surface
      )
  ) {
    Column(
      modifier = Modifier.fillMaxWidth().padding(16.dp)
    ) {
      Text(
        text = title,
        style = MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.SemiBold
      )
      Spacer(modifier = Modifier.height(12.dp))
      content()
    }
  }
}

private fun com.teachhelper.mobile.core.upload.MobileUploadKind.toDisplayLabel(): String =
  when (this) {
    com.teachhelper.mobile.core.upload.MobileUploadKind.QUESTION_BANK_PDF -> "题库 PDF"
    com.teachhelper.mobile.core.upload.MobileUploadKind.FULL_PAPER_PDF -> "套卷 PDF"
    com.teachhelper.mobile.core.upload.MobileUploadKind.LECTURE_ARCHIVE_PDF -> "讲义归档文件"
    com.teachhelper.mobile.core.upload.MobileUploadKind.PRIMARY_LECTURE_PDF -> "主讲义更新"
  }

private fun openPdfFile(context: android.content.Context, file: File) {
  val uri: Uri =
    FileProvider.getUriForFile(
      context,
      "${context.packageName}.fileprovider",
      file
    )

  val intent =
    Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/pdf")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

  try {
    context.startActivity(intent)
  } catch (_: ActivityNotFoundException) {
  }
}
