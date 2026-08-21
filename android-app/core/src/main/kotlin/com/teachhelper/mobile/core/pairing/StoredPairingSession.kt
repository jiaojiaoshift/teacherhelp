package com.teachhelper.mobile.core.pairing

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class StoredPairingSession(
  val helperBaseUrl: String,
  val pairingSessionId: String,
  val pairingCode: String,
  val deviceId: String
)

sealed interface StoredPairingSessionDecodeResult {
  data class Success(val session: StoredPairingSession) : StoredPairingSessionDecodeResult

  data class Failure(val message: String) : StoredPairingSessionDecodeResult
}

object StoredPairingSessionCodec {
  private val json = Json {
    ignoreUnknownKeys = true
  }

  fun encode(session: StoredPairingSession): String =
    json.encodeToString(
      StoredPairingSessionEnvelope(
        helperBaseUrl = session.helperBaseUrl,
        pairingSessionId = session.pairingSessionId,
        pairingCode = session.pairingCode,
        deviceId = session.deviceId
      )
    )

  fun decode(rawValue: String): StoredPairingSessionDecodeResult {
    val payload =
      try {
        json.decodeFromString<StoredPairingSessionEnvelope>(rawValue)
      } catch (_: Exception) {
        return StoredPairingSessionDecodeResult.Failure("Invalid stored pairing session payload")
      }

    return StoredPairingSessionDecodeResult.Success(
      session =
        StoredPairingSession(
          helperBaseUrl = payload.helperBaseUrl,
          pairingSessionId = payload.pairingSessionId,
          pairingCode = payload.pairingCode,
          deviceId = payload.deviceId
        )
    )
  }
}

@Serializable
private data class StoredPairingSessionEnvelope(
  @SerialName("helperBaseUrl") val helperBaseUrl: String,
  @SerialName("pairingSessionId") val pairingSessionId: String,
  @SerialName("pairingCode") val pairingCode: String,
  @SerialName("deviceId") val deviceId: String
)
