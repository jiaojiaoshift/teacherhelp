import { describe, expect, it } from "vitest";

import {
  buildAndroidMaintenanceWorkflow,
  formatAndroidMaintenanceWorkflowGuide
} from "../../scripts/lib/android-maintenance-workflow-service.mjs";

describe("android-maintenance-workflow-service", () => {
  it("defaults ongoing Android development to the native app plus core line", () => {
    const workflow = buildAndroidMaintenanceWorkflow();

    expect(workflow.baselineCommand).toBe("npm.cmd run status:android");
    expect(workflow.development.line).toBe("native_compose");
    expect(workflow.development.label).toBe("Native Android / Kotlin / Compose");
    expect(workflow.development.commands).toEqual([
      "npm.cmd run android:dev:test",
      "npm.cmd run android:dev:build"
    ]);
  });

  it("keeps the install artifact explicit as the Expo release APK instead of the native dev line", () => {
    const workflow = buildAndroidMaintenanceWorkflow();

    expect(workflow.installArtifact.line).toBe("expo_react_native");
    expect(workflow.installArtifact.label).toBe("Expo / React Native release APK");
    expect(workflow.installArtifact.path).toBe(
      "android-app/android/app/build/outputs/apk/release/app-release.apk"
    );
    expect(workflow.supportingCommands).toEqual({
      boundaries: "npm.cmd run android:boundaries",
      contract: "npm.cmd run verify:android-contract",
      expoTypecheck: "npm.cmd run android:expo:typecheck"
    });
  });

  it("formats one guide that separates the baseline check, the native devline commands, and the install artifact", () => {
    const guide = formatAndroidMaintenanceWorkflowGuide();

    expect(guide).toContain("Android Maintenance Workflow");
    expect(guide).toContain("Baseline Check: npm.cmd run status:android");
    expect(guide).toContain("Development Line: Native Android / Kotlin / Compose");
    expect(guide).toContain("Development Commands:");
    expect(guide).toContain("- npm.cmd run android:dev:test");
    expect(guide).toContain("- npm.cmd run android:dev:build");
    expect(guide).toContain("Boundary Guide: npm.cmd run android:boundaries");
    expect(guide).toContain("Install Artifact: Expo / React Native release APK");
    expect(guide).toContain("android-app/android/app/build/outputs/apk/release/app-release.apk");
  });
});
