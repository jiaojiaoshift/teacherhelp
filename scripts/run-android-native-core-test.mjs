import { runAndroidNativeCoreTest } from "./lib/android-command-runner.mjs";

const result = runAndroidNativeCoreTest();

if (result.status !== "passed") {
  process.exitCode = 1;
}
