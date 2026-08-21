import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("android icon config", () => {
  it("keeps expo and native android lines pointed at the same updated icon asset set", () => {
    const expoConfig = JSON.parse(
      readFileSync(path.join(repositoryRoot, "android-app", "app.json"), "utf8")
    ) as {
      expo: {
        icon?: string;
        android?: {
          adaptiveIcon?: {
            foregroundImage?: string;
            backgroundColor?: string;
          };
        };
      };
    };
    const nativeAdaptiveIcon = readFileSync(
      path.join(
        repositoryRoot,
        "android-app",
        "app",
        "src",
        "main",
        "res",
        "mipmap-anydpi-v26",
        "ic_launcher.xml"
      ),
      "utf8"
    );
    const nativeRoundAdaptiveIcon = readFileSync(
      path.join(
        repositoryRoot,
        "android-app",
        "app",
        "src",
        "main",
        "res",
        "mipmap-anydpi-v26",
        "ic_launcher_round.xml"
      ),
      "utf8"
    );
    const nativeLauncherColors = readFileSync(
      path.join(
        repositoryRoot,
        "android-app",
        "app",
        "src",
        "main",
        "res",
        "values",
        "colors.xml"
      ),
      "utf8"
    );

    expect(expoConfig.expo.icon).toBe("./assets/icon.png");
    expect(expoConfig.expo.android?.adaptiveIcon?.foregroundImage).toBe(
      "./assets/adaptive-icon.png"
    );
    expect(expoConfig.expo.android?.adaptiveIcon?.backgroundColor).toBe("#1B1E38");
    expect(nativeAdaptiveIcon).toContain('@drawable/ic_launcher_foreground_image');
    expect(nativeAdaptiveIcon).toContain('@color/ic_launcher_background');
    expect(nativeRoundAdaptiveIcon).toContain('@drawable/ic_launcher_foreground_image');
    expect(nativeRoundAdaptiveIcon).toContain('@color/ic_launcher_background');
    expect(nativeLauncherColors).toContain('<color name="ic_launcher_background">#1B1E38</color>');

    expect(
      existsSync(path.join(repositoryRoot, "android-app", "assets", "icon.png"))
    ).toBe(true);
    expect(
      existsSync(path.join(repositoryRoot, "android-app", "assets", "adaptive-icon.png"))
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          repositoryRoot,
          "android-app",
          "app",
          "src",
          "main",
          "res",
          "drawable",
          "ic_launcher_foreground_image.png"
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          repositoryRoot,
          "android-app",
          "android",
          "app",
          "src",
          "main",
          "res",
          "mipmap-xxxhdpi",
          "ic_launcher.webp"
        )
      )
    ).toBe(true);
    expect(
      existsSync(
        path.join(
          repositoryRoot,
          "android-app",
          "android",
          "app",
          "src",
          "main",
          "res",
          "mipmap-xxxhdpi",
          "ic_launcher_round.webp"
        )
      )
    ).toBe(true);
  });
});
