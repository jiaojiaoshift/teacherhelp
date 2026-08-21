package com.teachhelper.mobile.core.pairing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class PairingPayloadParserTest {
  @Test
  fun `returns parsed payload for a valid QR json`() {
    val result =
      PairingPayloadParser.parse(
        """
        {
          "type": "teachhelper_mobile_upload_pairing",
          "helperBaseUrl": "http://10.0.0.8:3000",
          "pairingSessionId": "mobile-upload-pairing-001",
          "pairingCode": "123456"
        }
        """.trimIndent()
      )

    val success = assertIs<PairingPayloadParseResult.Success>(result)
    assertEquals("http://10.0.0.8:3000", success.payload.helperBaseUrl)
    assertEquals("mobile-upload-pairing-001", success.payload.pairingSessionId)
    assertEquals("123456", success.payload.pairingCode)
  }

  @Test
  fun `rejects payload with an unexpected type`() {
    val result =
      PairingPayloadParser.parse(
        """
        {
          "type": "other_payload",
          "helperBaseUrl": "http://10.0.0.8:3000",
          "pairingSessionId": "mobile-upload-pairing-001",
          "pairingCode": "123456"
        }
        """.trimIndent()
      )

    val failure = assertIs<PairingPayloadParseResult.Failure>(result)
    assertEquals("Unsupported pairing payload type", failure.message)
  }
}
