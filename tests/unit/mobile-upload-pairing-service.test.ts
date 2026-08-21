import { describe, expect, it } from "vitest";

import {
  createMobileUploadPairingSession,
  registerPairedMobileUploadDevice,
  resolveMobileUploadPairingSessionState
} from "@/lib/services/mobile-upload-pairing-service";

describe("mobile-upload-pairing-service", () => {
  it("creates one ready pairing session with one QR payload", () => {
    expect(
      createMobileUploadPairingSession({
        helperBaseUrl: "http://192.168.1.8:3000",
        now: "2026-06-03T12:00:00.000Z",
        expiresInMinutes: 15,
        createId: () => "pairing-session-1",
        createPairingCode: () => "834271"
      })
    ).toEqual({
      id: "pairing-session-1",
      helperBaseUrl: "http://192.168.1.8:3000",
      pairingCode: "834271",
      qrPayload:
        '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://192.168.1.8:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
      createdAt: "2026-06-03T12:00:00.000Z",
      expiresAt: "2026-06-03T12:15:00.000Z",
      pairedDeviceIds: []
    });
    expect(
      resolveMobileUploadPairingSessionState(
        createMobileUploadPairingSession({
          helperBaseUrl: "http://192.168.1.8:3000",
          now: "2026-06-03T12:00:00.000Z",
          expiresInMinutes: 15,
          createId: () => "pairing-session-1",
          createPairingCode: () => "834271"
        }),
        "2026-06-03T12:10:00.000Z"
      )
    ).toBe("ready");
  });

  it("transitions one pairing session from ready to paired and later to expired", () => {
    const pairedSession = registerPairedMobileUploadDevice({
      session: createMobileUploadPairingSession({
        helperBaseUrl: "http://192.168.1.8:3000",
        now: "2026-06-03T12:00:00.000Z",
        expiresInMinutes: 15,
        createId: () => "pairing-session-2",
        createPairingCode: () => "512640"
      }),
      deviceId: "android-tablet"
    });

    expect(pairedSession.pairedDeviceIds).toEqual(["android-tablet"]);
    expect(
      resolveMobileUploadPairingSessionState(pairedSession, "2026-06-03T12:05:00.000Z")
    ).toBe("paired");
    expect(
      resolveMobileUploadPairingSessionState(pairedSession, "2026-06-03T12:16:00.000Z")
    ).toBe("expired");
  });
});
