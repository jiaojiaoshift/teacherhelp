package com.teachhelper.mobile.core.pairing

data class PairingPayload(
  val helperBaseUrl: String,
  val pairingSessionId: String,
  val pairingCode: String
)

sealed interface PairingPayloadParseResult {
  data class Success(val payload: PairingPayload) : PairingPayloadParseResult

  data class Failure(val message: String) : PairingPayloadParseResult
}
