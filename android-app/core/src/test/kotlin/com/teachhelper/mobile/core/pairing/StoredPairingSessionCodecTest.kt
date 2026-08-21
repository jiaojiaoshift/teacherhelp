package com.teachhelper.mobile.core.pairing

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class StoredPairingSessionCodecTest {
  @Test
  fun `encodes and decodes a stored pairing session`() {
    val session =
      StoredPairingSession(
        helperBaseUrl = "http://10.0.0.8:3000",
        pairingSessionId = "pairing-001",
        pairingCode = "123456",
        deviceId = "device-001"
      )

    val encoded = StoredPairingSessionCodec.encode(session)
    val decoded = StoredPairingSessionCodec.decode(encoded)

    val success = assertIs<StoredPairingSessionDecodeResult.Success>(decoded)
    assertEquals(session, success.session)
  }

  @Test
  fun `rejects malformed stored session payloads`() {
    val decoded = StoredPairingSessionCodec.decode("{invalid-json}")

    val failure = assertIs<StoredPairingSessionDecodeResult.Failure>(decoded)
    assertEquals("Invalid stored pairing session payload", failure.message)
  }
}
