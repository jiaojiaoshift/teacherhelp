import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("Expo Android Gradle toolchain", () => {
  it("uses Gradle 8.13 with React Native 0.83 and AGP 8.12", () => {
    const wrapperProperties = readFileSync(
      path.join(
        repositoryRoot,
        "android-app",
        "android",
        "gradle",
        "wrapper",
        "gradle-wrapper.properties"
      ),
      "utf8"
    );
    const reactNativeVersionsPath = path.join(
      repositoryRoot,
      "android-app",
      "node_modules",
      "@react-native",
      "gradle-plugin",
      "gradle",
      "libs.versions.toml"
    );
    if (existsSync(reactNativeVersionsPath)) {
      expect(readFileSync(reactNativeVersionsPath, "utf8")).toContain(
        'agp = "8.12.0"'
      );
    } else {
      const androidPackage = JSON.parse(
        readFileSync(
          path.join(repositoryRoot, "android-app", "package.json"),
          "utf8"
        )
      ) as {
        dependencies?: Record<string, string>;
      };
      expect(androidPackage.dependencies?.expo).toMatch(/^~55\./);
      expect(androidPackage.dependencies?.["react-native"]).toMatch(/^0\.83\./);
    }
    expect(wrapperProperties).toContain(
      "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.13-bin.zip"
    );
    expect(wrapperProperties).toContain("networkTimeout=120000");
    expect(wrapperProperties).not.toContain("gradle-9.0.0-bin.zip");
  });
});
