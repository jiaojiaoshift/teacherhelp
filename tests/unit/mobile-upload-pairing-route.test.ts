import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GET as getMobileUploadPairing,
  POST as postMobileUploadPairing
} from "@/app/api/mobile-upload/pairing/route";
import { clearMobileUploadHelperStateForTests } from "@/lib/server/mobile-upload-helper-state";

describe("mobile upload pairing route", () => {
  afterEach(() => {
    clearMobileUploadHelperStateForTests();
    vi.unstubAllEnvs();
  });

  it("returns null when no active pairing session exists yet", async () => {
    const response = await getMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pairingSession: null
    });
  });

  it("creates and returns one active pairing session with one env-configured helper base url", async () => {
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_BASE_URL", "http://192.168.1.8:3000");

    const response = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pairingSession.helperBaseUrl).toBe("http://192.168.1.8:3000");
    expect(payload.pairingSession.qrPayload).toContain("teachhelper_mobile_upload_pairing");
    expect(payload.pairingSession.qrPayload).toContain("http://192.168.1.8:3000");
    expect(payload.pairingSession.pairedDeviceIds).toEqual([]);

    const queryResponse = await getMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing")
    );

    expect(await queryResponse.json()).toEqual(payload);
  });
});
