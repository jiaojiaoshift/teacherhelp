import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatNativeAndroidMobileUploadContractReport,
  verifyNativeAndroidMobileUploadContract
} from "./lib/android-native-mobile-upload-contract-service.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const repositoryRoot = path.resolve(currentDirectory, "..");

const verification = verifyNativeAndroidMobileUploadContract({
  repositoryRoot
});

console.log(formatNativeAndroidMobileUploadContractReport(verification));

if (!verification.isConsistent) {
  process.exitCode = 1;
}
