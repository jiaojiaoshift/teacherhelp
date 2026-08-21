import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("Expo Android release command", () => {
  it("builds the prebuild release through the repository Android toolchain environment", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    const commandRunner = readFileSync(
      path.join(repositoryRoot, "scripts", "lib", "android-command-runner.mjs"),
      "utf8"
    );
    const releaseScript = readFileSync(
      path.join(repositoryRoot, "scripts", "run-android-expo-assemble-release.mjs"),
      "utf8"
    );
    const readme = readFileSync(path.join(repositoryRoot, "README.md"), "utf8");

    expect(packageJson.scripts?.["android:expo:release"]).toBe(
      "node ./scripts/run-android-expo-assemble-release.mjs"
    );
    expect(commandRunner).toContain("export function runAndroidExpoAssembleRelease()");
    expect(commandRunner).toContain('path.join(androidAppRoot, "android")');
    expect(commandRunner).toContain('releaseEnvironment.NODE_ENV = "production"');
    expect(releaseScript).toContain("runAndroidExpoAssembleRelease");
    expect(readme).toContain("npm.cmd run android:expo:release");
    expect(readme).toContain("JDK 21");
  });
});
