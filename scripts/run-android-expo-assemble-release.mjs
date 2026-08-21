import { runAndroidExpoAssembleRelease } from "./lib/android-command-runner.mjs";

const result = runAndroidExpoAssembleRelease();

if (result.status !== "passed") {
  process.exitCode = 1;
}
