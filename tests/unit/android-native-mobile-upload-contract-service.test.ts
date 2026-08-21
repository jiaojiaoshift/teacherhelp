import { describe, expect, it } from "vitest";

import {
  MOBILE_UPLOAD_KIND_VALUES,
  MOBILE_UPLOAD_PAIRING_QR_TYPE
} from "@/lib/services/mobile-upload-contract";
import {
  collectNativeAndroidMobileUploadContract,
  verifyNativeAndroidMobileUploadContract
} from "../../scripts/lib/android-native-mobile-upload-contract-service.mjs";

describe("android-native-mobile-upload-contract-service", () => {
  it("keeps the native Kotlin pairing type and upload kind wire values aligned with the shared contract", () => {
    const contract = collectNativeAndroidMobileUploadContract({
      repositoryRoot: process.cwd()
    });

    expect(contract.pairingQrType).toBe(MOBILE_UPLOAD_PAIRING_QR_TYPE);
    expect(contract.uploadKindValues).toEqual([...MOBILE_UPLOAD_KIND_VALUES]);
  });

  it("verifies the native Android upload-kind labels still cover every Kotlin upload kind", () => {
    const verification = verifyNativeAndroidMobileUploadContract({
      repositoryRoot: process.cwd()
    });

    expect(verification.isConsistent).toBe(true);
    expect(verification.errors).toEqual([]);
    expect(verification.contract.displayLabelKinds).toEqual(verification.contract.uploadKindNames);
  });
});
