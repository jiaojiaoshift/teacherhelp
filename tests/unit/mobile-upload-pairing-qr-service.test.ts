import { describe, expect, it } from "vitest";

import { buildMobileUploadPairingQrImageDataUrl } from "@/lib/services/mobile-upload-pairing-qr-service";

describe("mobile-upload-pairing-qr-service", () => {
  it("builds one SVG QR image data url for one pairing payload", () => {
    const dataUrl = buildMobileUploadPairingQrImageDataUrl(
      '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}'
    );

    expect(dataUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);

    const decodedSvg = decodeURIComponent(dataUrl.slice("data:image/svg+xml;charset=utf-8,".length));

    expect(decodedSvg).toContain("<svg");
    expect(decodedSvg).toContain("viewBox=");
    expect(decodedSvg).toContain("<path");
  });

  it("returns one empty result when the pairing payload is blank", () => {
    expect(buildMobileUploadPairingQrImageDataUrl("")).toBeNull();
  });
});
