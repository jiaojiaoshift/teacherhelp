package com.teachhelper.mobile.core.pairing

import java.net.URI
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

object PairingPayloadParser {
  private val json = Json {
    ignoreUnknownKeys = true
  }

  fun parse(rawPayload: String): PairingPayloadParseResult {
    val payload =
      try {
        json.decodeFromString<PairingPayloadEnvelope>(rawPayload)
      } catch (_: Exception) {
        return PairingPayloadParseResult.Failure("Invalid pairing payload JSON")
      }

    if (payload.type != "teachhelper_mobile_upload_pairing") {
      return PairingPayloadParseResult.Failure("Unsupported pairing payload type")
    }

    if (!isValidHelperBaseUrl(payload.helperBaseUrl)) {
      return PairingPayloadParseResult.Failure("Invalid helper base URL")
    }

    if (payload.pairingSessionId.isBlank()) {
      return PairingPayloadParseResult.Failure("Missing pairing session ID")
    }

    if (payload.pairingCode.isBlank()) {
      return PairingPayloadParseResult.Failure("Missing pairing code")
    }

    return PairingPayloadParseResult.Success(
      payload =
        PairingPayload(
          helperBaseUrl = payload.helperBaseUrl,
          pairingSessionId = payload.pairingSessionId,
          pairingCode = payload.pairingCode
        )
    )
  }

  private fun isValidHelperBaseUrl(value: String): Boolean =
    try {
      val uri = URI(value)
      (uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank()
    } catch (_: Exception) {
      false
    }
}

@Serializable
private data class PairingPayloadEnvelope(
  @SerialName("type") val type: String,
  @SerialName("helperBaseUrl") val helperBaseUrl: String,
  @SerialName("pairingSessionId") val pairingSessionId: String,
  @SerialName("pairingCode") val pairingCode: String
)
