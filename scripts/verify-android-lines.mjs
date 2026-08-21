import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { formatAndroidMaintenanceReport } from "./lib/android-line-status-service.mjs";
import { verifyNativeAndroidMobileUploadContract } from "./lib/android-native-mobile-upload-contract-service.mjs";
import {
  repositoryRoot,
  runAndroidExpoTypecheck,
  runAndroidNativeAssembleDebug,
  runAndroidNativeCoreTest
} from "./lib/android-command-runner.mjs";

function collectArtifact(line, variant, relativePath) {
  const fullPath = path.join(repositoryRoot, relativePath);

  if (!existsSync(fullPath)) {
    return null;
  }

  const fileStats = statSync(fullPath);

  return {
    line,
    variant,
    path: relativePath.replaceAll("\\", "/"),
    sizeBytes: fileStats.size,
    lastModifiedAt: fileStats.mtime.toISOString()
  };
}

function collectSourceAsset(line, kind, relativePath) {
  const fullPath = path.join(repositoryRoot, relativePath);

  if (!existsSync(fullPath)) {
    return null;
  }

  const fileStats = statSync(fullPath);

  return {
    line,
    kind,
    path: relativePath.replaceAll("\\", "/"),
    lastModifiedAt: fileStats.mtime.toISOString()
  };
}

const expoTypecheck = runAndroidExpoTypecheck();
const nativeCoreTest = runAndroidNativeCoreTest();
const nativeAssembleDebug = runAndroidNativeAssembleDebug();
const nativeUploadContract = verifyNativeAndroidMobileUploadContract({
  repositoryRoot
});

const artifacts = [
  collectArtifact(
    "expo_react_native",
    "debug",
    "android-app/android/app/build/outputs/apk/debug/app-debug.apk"
  ),
  collectArtifact(
    "expo_react_native",
    "release",
    "android-app/android/app/build/outputs/apk/release/app-release.apk"
  ),
  collectArtifact("native_compose", "debug", "android-app/app/build/outputs/apk/debug/app-debug.apk")
].filter(Boolean);

const sourceAssets = [
  collectSourceAsset(
    "shared_android_branding",
    "launcher_icon_source",
    "branding/teachhelper-icon-source.png"
  ),
  collectSourceAsset("expo_react_native", "launcher_icon", "android-app/assets/icon.png"),
  collectSourceAsset("expo_react_native", "adaptive_launcher_icon", "android-app/assets/adaptive-icon.png"),
  collectSourceAsset("expo_react_native", "app_config", "android-app/app.json"),
  collectSourceAsset(
    "expo_react_native",
    "prebuild_launcher_icon",
    "android-app/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp"
  ),
  collectSourceAsset(
    "native_compose",
    "launcher_icon",
    "android-app/app/src/main/res/drawable/ic_launcher_foreground_image.png"
  ),
  collectSourceAsset(
    "native_compose",
    "launcher_icon_config",
    "android-app/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"
  )
].filter(Boolean);

console.log(`\n${formatAndroidMaintenanceReport({
  verifications: {
    expo: {
      typecheck: expoTypecheck.status
    },
    native: {
      coreTest: nativeCoreTest.status,
      assembleDebug: nativeAssembleDebug.status
    },
    contract: {
      nativeMobileUpload: nativeUploadContract.isConsistent ? "passed" : "failed"
    }
  },
  artifacts,
  sourceAssets,
  contractVerification: nativeUploadContract
})}`);

const failedCommands = [expoTypecheck, nativeCoreTest, nativeAssembleDebug].filter(
  (result) => result.status !== "passed"
);

if (failedCommands.length > 0 || !nativeUploadContract.isConsistent) {
  process.exitCode = 1;
}
