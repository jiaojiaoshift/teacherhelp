import { runAndroidNativeAssembleDebug } from "./lib/android-command-runner.mjs";

const result = runAndroidNativeAssembleDebug();

if (result.status !== "passed") {
  process.exitCode = 1;
}
