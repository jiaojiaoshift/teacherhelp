import { describe, expect, it } from "vitest";

import {
  buildAndroidPathOwnershipGuide,
  classifyAndroidPathOwnership,
  formatAndroidPathOwnershipGuide
} from "../../scripts/lib/android-path-ownership-service.mjs";

describe("android-path-ownership-service", () => {
  it("classifies the native app plus core directories as the default Android development line", () => {
    expect(classifyAndroidPathOwnership("android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt"))
      .toMatchObject({
        scope: "native_compose",
        label: "Native Android / Kotlin / Compose"
      });
    expect(classifyAndroidPathOwnership("android-app/core/src/main/kotlin/com/teachhelper/mobile/core/upload/MobileUploadKind.kt"))
      .toMatchObject({
        scope: "native_compose",
        label: "Native Android / Kotlin / Compose"
      });
  });

  it("keeps Expo source and Expo prebuild output separate from the native development line", () => {
    expect(classifyAndroidPathOwnership("android-app/src/domain/upload-types.ts")).toMatchObject({
      scope: "expo_react_native",
      label: "Expo / React Native support line"
    });
    expect(classifyAndroidPathOwnership("android-app/android/app/build.gradle")).toMatchObject({
      scope: "expo_prebuild",
      label: "Expo Android prebuild output"
    });
  });

  it("recognizes shared Android workspace files that are not owned by only one client line", () => {
    expect(classifyAndroidPathOwnership("android-app/build.gradle")).toMatchObject({
      scope: "shared_android_workspace",
      label: "Shared Android workspace"
    });
    expect(classifyAndroidPathOwnership("android-app/settings.gradle")).toMatchObject({
      scope: "shared_android_workspace",
      label: "Shared Android workspace"
    });
  });

  it("formats one boundary guide that makes the default devline and non-devline paths explicit", () => {
    const guide = formatAndroidPathOwnershipGuide([
      "android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt",
      "android-app/src/domain/upload-types.ts",
      "android-app/android/app/build.gradle"
    ]);

    expect(guide).toContain("Android Path Ownership");
    expect(guide).toContain("Default Development Line: Native Android / Kotlin / Compose");
    expect(guide).toContain("- android-app/app/**");
    expect(guide).toContain("- android-app/core/**");
    expect(guide).toContain("Expo Support Line:");
    expect(guide).toContain("Expo Prebuild Output:");
    expect(guide).toContain("Reviewed Paths:");
    expect(guide).toContain("android-app/src/domain/upload-types.ts -> Expo / React Native support line");
    expect(guide).toContain("android-app/android/app/build.gradle -> Expo Android prebuild output");
    expect(guide).toContain("Warnings:");
    expect(guide).toContain(
      "Reviewed paths span multiple Android ownership scopes; confirm that this maintenance slice really needs changes across both the native dev line and the Expo-related line."
    );
  });

  it("warns when one reviewed change set mixes the native devline with Expo-related paths", () => {
    const guide = buildAndroidPathOwnershipGuide([
      "android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt",
      "android-app/src/domain/upload-types.ts"
    ]);

    expect(guide.reviewedPaths).toHaveLength(2);
    expect(guide.status).toBe("warning");
    expect(guide.shouldFail).toBe(true);
    expect(guide.warnings).toContain(
      "Reviewed paths span multiple Android ownership scopes; confirm that this maintenance slice really needs changes across both the native dev line and the Expo-related line."
    );
  });

  it("does not warn when the reviewed paths stay within the native development line plus shared workspace files", () => {
    const guide = buildAndroidPathOwnershipGuide([
      "android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt",
      "android-app/core/src/main/kotlin/com/teachhelper/mobile/core/upload/MobileUploadKind.kt",
      "android-app/build.gradle"
    ]);

    expect(guide.status).toBe("ok");
    expect(guide.shouldFail).toBe(false);
    expect(guide.warnings).toEqual([]);
  });

  it("formats the boundary guide with one explicit warning status when mixed Android scopes are detected", () => {
    const guide = formatAndroidPathOwnershipGuide([
      "android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt",
      "android-app/src/domain/upload-types.ts"
    ]);

    expect(guide).toContain("Status: warning");
  });
});
