package com.teachhelper.mobile.core.workspace

import com.teachhelper.mobile.core.upload.MobileUploadKind
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

object WorkspaceTargetResponseParser {
  private val json = Json {
    ignoreUnknownKeys = true
  }

  fun parse(rawPayload: String): WorkspaceTargetResponseParseResult {
    val payload =
      try {
        json.decodeFromString<WorkspaceTargetResponseEnvelope>(rawPayload)
      } catch (_: Exception) {
        return WorkspaceTargetResponseParseResult.Failure(
          "Invalid workspace target response JSON"
        )
      }

    val uploadKind =
      MobileUploadKind.fromWireValue(payload.uploadKind)
        ?: return WorkspaceTargetResponseParseResult.Failure("Unsupported mobile upload kind")

    val targetNodes =
      payload.targetNodes.map { targetNode ->
        WorkspaceTargetNode(
          id = targetNode.id,
          name = targetNode.name,
          path = targetNode.path,
          targetKind =
            when (targetNode.targetKind) {
              "question_folder" -> WorkspaceTargetKind.QUESTION_FOLDER
              "exam_folder" -> WorkspaceTargetKind.EXAM_FOLDER
              "exam_document" -> WorkspaceTargetKind.EXAM_DOCUMENT
              else -> return WorkspaceTargetResponseParseResult.Failure("Unsupported target kind")
            }
        )
      }

    return WorkspaceTargetResponseParseResult.Success(
      response =
        WorkspaceTargetResponse(
          uploadKind = uploadKind,
          targetNodes = targetNodes
        )
    )
  }
}

@Serializable
private data class WorkspaceTargetResponseEnvelope(
  @SerialName("uploadKind") val uploadKind: String,
  @SerialName("targetNodes") val targetNodes: List<WorkspaceTargetNodeEnvelope>
)

@Serializable
private data class WorkspaceTargetNodeEnvelope(
  @SerialName("id") val id: String,
  @SerialName("name") val name: String,
  @SerialName("path") val path: List<String>,
  @SerialName("targetKind") val targetKind: String
)
