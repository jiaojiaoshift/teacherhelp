package com.teachhelper.mobile.core.workspace

import com.teachhelper.mobile.core.upload.MobileUploadKind
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object MobileUploadRequestFieldsBuilder {
  private val json = Json

  fun build(
    uploadKind: MobileUploadKind,
    targetNode: WorkspaceTargetNode,
    fileName: String,
    deviceId: String,
    pairedSessionId: String
  ): Map<String, String> =
    mapOf(
      "uploadKind" to uploadKind.wireValue,
      "targetNodeId" to targetNode.id,
      "targetNodePath" to json.encodeToString(targetNode.path),
      "fileName" to fileName,
      "deviceId" to deviceId,
      "pairedSessionId" to pairedSessionId
    )
}
