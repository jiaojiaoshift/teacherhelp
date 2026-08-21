import { runAndroidExpoTypecheck } from "./lib/android-command-runner.mjs";

const result = runAndroidExpoTypecheck();

if (result.status !== "passed") {
  process.exitCode = 1;
}
