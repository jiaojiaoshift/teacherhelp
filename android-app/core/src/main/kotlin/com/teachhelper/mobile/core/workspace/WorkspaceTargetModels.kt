package com.teachhelper.mobile.core.workspace

import com.teachhelper.mobile.core.upload.MobileUploadKind

enum class WorkspaceTargetKind {
  QUESTION_FOLDER,
  EXAM_FOLDER,
  EXAM_DOCUMENT
}

data class WorkspaceTargetNode(
  val id: String,
  val name: String,
  val path: List<String>,
  val targetKind: WorkspaceTargetKind
)

data class WorkspaceTargetResponse(
  val uploadKind: MobileUploadKind,
  val targetNodes: List<WorkspaceTargetNode>
)

sealed interface WorkspaceTargetResponseParseResult {
  data class Success(val response: WorkspaceTargetResponse) : WorkspaceTargetResponseParseResult

  data class Failure(val message: String) : WorkspaceTargetResponseParseResult
}
