import { describe, expect, it } from "vitest";

import {
  buildAndroidMaintenanceDecision,
  formatAndroidMaintenanceReport
} from "../../scripts/lib/android-line-status-service.mjs";

describe("android-line-status-service", () => {
  it("recommends the native compose line for ongoing development when native checks pass", () => {
    const decision = buildAndroidMaintenanceDecision({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "passed",
          assembleDebug: "passed"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "release",
          path: "android-app/android/app/build/outputs/apk/release/app-release.apk",
          sizeBytes: 84_477_549,
          lastModifiedAt: "2026-06-05T00:59:39.000Z"
        },
        {
          line: "native_compose",
          variant: "debug",
          path: "android-app/app/build/outputs/apk/debug/app-debug.apk",
          sizeBytes: 17_571_160,
          lastModifiedAt: "2026-06-05T01:00:20.000Z"
        }
      ]
    });

    expect(decision.development.line).toBe("native_compose");
    expect(decision.development.reason).toContain("core:test");
    expect(decision.installArtifact?.line).toBe("expo_react_native");
    expect(decision.installArtifact?.variant).toBe("release");
    expect(decision.risks).toContain(
      "The installable APK and the recommended development line are different; keep both the install artifact and the development line explicit in future maintenance."
    );
  });

  it("falls back to the expo line for development when the native line is not yet verified", () => {
    const decision = buildAndroidMaintenanceDecision({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "not_run",
          assembleDebug: "not_run"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "debug",
          path: "android-app/android/app/build/outputs/apk/debug/app-debug.apk",
          sizeBytes: 145_323_171,
          lastModifiedAt: "2026-06-05T00:41:49.000Z"
        }
      ]
    });

    expect(decision.development.line).toBe("expo_react_native");
    expect(decision.installArtifact?.path).toContain("app-debug.apk");
  });

  it("formats one report that highlights the install artifact and the development line separately", () => {
    const report = formatAndroidMaintenanceReport({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "passed",
          assembleDebug: "passed"
        },
        contract: {
          nativeMobileUpload: "passed"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "release",
          path: "android-app/android/app/build/outputs/apk/release/app-release.apk",
          sizeBytes: 84_477_549,
          lastModifiedAt: "2026-06-05T00:59:39.000Z"
        },
        {
          line: "native_compose",
          variant: "debug",
          path: "android-app/app/build/outputs/apk/debug/app-debug.apk",
          sizeBytes: 17_571_160,
          lastModifiedAt: "2026-06-05T01:00:20.000Z"
        }
      ]
    });

    expect(report).toContain("Install Artifact: Expo / React Native release APK");
    expect(report).toContain("Development Line: Native Android / Kotlin / Compose");
    expect(report).toContain("Native Upload Contract: passed");
    expect(report).toContain("android-app/android/app/build/outputs/apk/release/app-release.apk");
    expect(report).toContain("android-app/app/build/outputs/apk/debug/app-debug.apk");
  });

  it("flags contract drift in the Android maintenance report when the native upload contract check fails", () => {
    const decision = buildAndroidMaintenanceDecision({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "passed",
          assembleDebug: "passed"
        },
        contract: {
          nativeMobileUpload: "failed"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "release",
          path: "android-app/android/app/build/outputs/apk/release/app-release.apk",
          sizeBytes: 84_477_549,
          lastModifiedAt: "2026-06-05T00:59:39.000Z"
        }
      ]
    });

    const report = formatAndroidMaintenanceReport({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "passed",
          assembleDebug: "passed"
        },
        contract: {
          nativeMobileUpload: "failed"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "release",
          path: "android-app/android/app/build/outputs/apk/release/app-release.apk",
          sizeBytes: 84_477_549,
          lastModifiedAt: "2026-06-05T00:59:39.000Z"
        }
      ],
      contractVerification: {
        isConsistent: false,
        errors: ["Native upload kind list mismatch."],
        sharedContract: {
          pairingQrType: "teachhelper_mobile_upload_pairing",
          uploadKindValues: [
            "question_bank_pdf",
            "full_paper_pdf",
            "lecture_archive_pdf",
            "primary_lecture_pdf"
          ]
        },
        contract: {
          pairingQrType: "teachhelper_mobile_upload_pairing",
          uploadKindValues: [
            "question_bank_pdf",
            "full_paper_pdf",
            "lecture_archive_pdf"
          ],
          uploadKindNames: [
            "QUESTION_BANK_PDF",
            "FULL_PAPER_PDF",
            "LECTURE_ARCHIVE_PDF"
          ],
          displayLabelKinds: [
            "QUESTION_BANK_PDF",
            "FULL_PAPER_PDF",
            "LECTURE_ARCHIVE_PDF"
          ]
        }
      }
    });

    expect(decision.risks).toContain(
      "Native mobile-upload contract drift is present; keep the shared workspace contract and Kotlin upload literals aligned before further Android maintenance."
    );
    expect(report).toContain("Native Upload Contract: failed");
    expect(report).toContain("Contract Errors:");
    expect(report).toContain("- Native upload kind list mismatch.");
  });

  it("flags the install artifact as stale when launcher icon resources are newer", () => {
    const decision = buildAndroidMaintenanceDecision({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "passed",
          assembleDebug: "passed"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "release",
          path: "android-app/android/app/build/outputs/apk/release/app-release.apk",
          sizeBytes: 84_477_549,
          lastModifiedAt: "2026-06-04T16:59:39.000Z"
        },
        {
          line: "native_compose",
          variant: "debug",
          path: "android-app/app/build/outputs/apk/debug/app-debug.apk",
          sizeBytes: 17_571_160,
          lastModifiedAt: "2026-06-05T13:35:38.000Z"
        }
      ],
      sourceAssets: [
        {
          line: "expo_react_native",
          kind: "launcher_icon",
          path: "android-app/assets/icon.png",
          lastModifiedAt: "2026-06-05T13:18:25.000Z"
        }
      ]
    });

    const report = formatAndroidMaintenanceReport({
      verifications: {
        expo: {
          typecheck: "passed"
        },
        native: {
          coreTest: "passed",
          assembleDebug: "passed"
        }
      },
      artifacts: [
        {
          line: "expo_react_native",
          variant: "release",
          path: "android-app/android/app/build/outputs/apk/release/app-release.apk",
          sizeBytes: 84_477_549,
          lastModifiedAt: "2026-06-04T16:59:39.000Z"
        }
      ],
      sourceAssets: [
        {
          line: "expo_react_native",
          kind: "launcher_icon",
          path: "android-app/assets/icon.png",
          lastModifiedAt: "2026-06-05T13:18:25.000Z"
        }
      ]
    });

    expect(decision.risks).toContain(
      "The selected install artifact is older than Android launcher icon resources; rebuild that install line before claiming the APK contains the latest branding."
    );
    expect(report).toContain("Install Artifact Freshness: stale");
    expect(report).toContain(
      "- android-app/assets/icon.png | launcher_icon | 2026-06-05T13:18:25.000Z"
    );
  });
});
