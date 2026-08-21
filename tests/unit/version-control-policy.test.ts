import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("version control policy", () => {
  it("keeps every release surface on version 1.0.0", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(projectRoot, "package.json"), "utf8")
    ) as { version: string };
    const packageLock = JSON.parse(
      readFileSync(path.join(projectRoot, "package-lock.json"), "utf8")
    ) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const androidPackageJson = JSON.parse(
      readFileSync(path.join(projectRoot, "android-app", "package.json"), "utf8")
    ) as { version: string };
    const androidPackageLock = JSON.parse(
      readFileSync(path.join(projectRoot, "android-app", "package-lock.json"), "utf8")
    ) as {
      version: string;
      packages: Record<string, { version?: string }>;
    };
    const expoConfig = JSON.parse(
      readFileSync(path.join(projectRoot, "android-app", "app.json"), "utf8")
    ) as { expo: { version: string } };
    const expoPrebuild = readFileSync(
      path.join(projectRoot, "android-app", "android", "app", "build.gradle"),
      "utf8"
    );
    const nativeCompose = readFileSync(
      path.join(projectRoot, "android-app", "app", "build.gradle"),
      "utf8"
    );
    const composeExample = readFileSync(
      path.join(projectRoot, "docker-compose.example.yml"),
      "utf8"
    );
    const securityPolicy = readFileSync(
      path.join(projectRoot, "SECURITY.md"),
      "utf8"
    );
    const license = readFileSync(path.join(projectRoot, "LICENSE"), "utf8");

    expect(packageJson.version).toBe("1.0.0");
    expect(packageLock.version).toBe("1.0.0");
    expect(packageLock.packages[""]?.version).toBe("1.0.0");
    expect(androidPackageJson.version).toBe("1.0.0");
    expect(androidPackageLock.version).toBe("1.0.0");
    expect(androidPackageLock.packages[""]?.version).toBe("1.0.0");
    expect(expoConfig.expo.version).toBe("1.0.0");

    for (const gradleConfig of [expoPrebuild, nativeCompose]) {
      expect(gradleConfig).toContain("versionCode 5");
      expect(gradleConfig).toContain('versionName "1.0.0"');
    }
    expect(composeExample).toContain("image: teachhelper:1.0.0");
    expect(securityPolicy).toContain("TeachHelper `1.0.0`");
    expect(packageJson.license).toBe("ISC");
    expect(license).toContain("ISC License");
  });

  it("excludes private and machine-local artifacts from Git", () => {
    const ignoreRules = readFileSync(path.join(projectRoot, ".gitignore"), "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);

    expect(ignoreRules).toEqual(
      expect.arrayContaining([
        ".env*",
        "!.env.example",
        ".cc-connect/",
        ".codex/",
        "data/",
        "logs/",
        "tmp/",
        "exports/",
        "backups/",
        "settings.json",
        "**/settings.json",
        "dist-desktop/",
        "/*.pdf",
        "*.pdf",
        "android-sdk/",
        "android-app/.android-sdk/",
        "android-app/.gradle*/",
        "android-app/.npm-cache*/",
        "**/local.properties",
        "*.jks",
        "*.keystore"
      ])
    );
  });

  it("keeps the published environment template on the supported model", () => {
    const environmentExample = readFileSync(path.join(projectRoot, ".env.example"), "utf8");

    expect(environmentExample).toContain("TEACHHELPER_AI_MODEL=gpt-5.6-sol");
    expect(environmentExample).toContain("TEACHHELPER_AI_REASONING_EFFORT=xhigh");
    expect(environmentExample).not.toContain("TEACHHELPER_AI_MODEL=gpt-5.5");
  });
});
