import {
  MOBILE_UPLOAD_PAIRING_QR_TYPE,
  type MobileUploadPairingQrPayload
} from "./upload-types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMobileUploadPairingQrPayload(
  value: unknown
): value is MobileUploadPairingQrPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    candidate.type === MOBILE_UPLOAD_PAIRING_QR_TYPE &&
    isNonEmptyString(candidate.helperBaseUrl) &&
    isNonEmptyString(candidate.pairingSessionId) &&
    isNonEmptyString(candidate.pairingCode)
  );
}

export function parseMobileUploadPairingQrPayload(input: string):
  | {
      status: "valid";
      value: MobileUploadPairingQrPayload;
    }
  | {
      status: "invalid";
      errorMessage: string;
    } {
  try {
    const parsed = JSON.parse(input) as unknown;

    if (!isMobileUploadPairingQrPayload(parsed)) {
      return {
        status: "invalid",
        errorMessage: "配对二维码内容无效"
      };
    }

    return {
      status: "valid",
      value: parsed
    };
  } catch {
    return {
      status: "invalid",
      errorMessage: "配对二维码内容无效"
    };
  }
}
