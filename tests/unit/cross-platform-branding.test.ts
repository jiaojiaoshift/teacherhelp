import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const sourcePath = path.join(
  repositoryRoot,
  "branding",
  "teachhelper-icon-source.png"
);
const expectedSourceSha256 =
  "9aaff0549c3620cf3caa838a15c9c2aca7e8b47baf80b4aef02f94ed1754e1f5";

async function readImage(relativePath: string) {
  return loadImage(readFileSync(path.join(repositoryRoot, relativePath)));
}

async function normalizedPixels(relativePath: string, size = 24) {
  const image = await readImage(relativePath);
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = Math.floor((image.width - sourceSize) / 2);
  const sourceY = Math.floor((image.height - sourceSize) / 2);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );
  return context.getImageData(0, 0, size, size).data;
}

function meanRgbDifference(left: Uint8ClampedArray, right: Uint8ClampedArray) {
  let difference = 0;
  let channelCount = 0;

  for (let index = 0; index < left.length; index += 4) {
    difference += Math.abs(left[index] - right[index]);
    difference += Math.abs(left[index + 1] - right[index + 1]);
    difference += Math.abs(left[index + 2] - right[index + 2]);
    channelCount += 3;
  }

  return difference / channelCount;
}

describe("cross-platform branding", () => {
  it("keeps the exact user-provided artwork as the single branding source", () => {
    expect(existsSync(sourcePath)).toBe(true);
    expect(
      createHash("sha256").update(readFileSync(sourcePath)).digest("hex")
    ).toBe(expectedSourceSha256);
  });

  it("derives Web, desktop and standard Android icons from the same square crop", async () => {
    const expectedDimensions = new Map<string, number>([
      ["post.jpg", 1024],
      ["app/icon.png", 512],
      ["desktop/resources/icon.png", 512],
      ["android-app/assets/icon.png", 1024]
    ]);
    const sourcePixels = await normalizedPixels(
      "branding/teachhelper-icon-source.png"
    );

    for (const [relativePath, expectedSize] of expectedDimensions) {
      const image = await readImage(relativePath);
      expect(image.width, relativePath).toBe(expectedSize);
      expect(image.height, relativePath).toBe(expectedSize);
      expect(
        meanRgbDifference(sourcePixels, await normalizedPixels(relativePath)),
        relativePath
      ).toBeLessThan(relativePath.endsWith(".jpg") ? 12 : 5);
    }
  });

  it("keeps Expo and native adaptive foregrounds identical with a transparent safe area", async () => {
    const expoPath = path.join(
      repositoryRoot,
      "android-app",
      "assets",
      "adaptive-icon.png"
    );
    const nativePath = path.join(
      repositoryRoot,
      "android-app",
      "app",
      "src",
      "main",
      "res",
      "drawable",
      "ic_launcher_foreground_image.png"
    );
    const expoBytes = readFileSync(expoPath);
    const nativeBytes = readFileSync(nativePath);
    const image = await loadImage(expoBytes);
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);

    expect(createHash("sha256").update(expoBytes).digest("hex")).toBe(
      createHash("sha256").update(nativeBytes).digest("hex")
    );
    expect(image.width).toBe(1024);
    expect(image.height).toBe(1024);
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(0);
    expect(context.getImageData(512, 512, 1, 1).data[3]).toBe(255);
  });

  it("updates Expo prebuild launcher and splash assets at every density", async () => {
    const launcherSizes = {
      mdpi: 48,
      hdpi: 72,
      xhdpi: 96,
      xxhdpi: 144,
      xxxhdpi: 192
    } as const;
    const splashSizes = {
      mdpi: 288,
      hdpi: 432,
      xhdpi: 576,
      xxhdpi: 864,
      xxxhdpi: 1152
    } as const;

    for (const [density, size] of Object.entries(launcherSizes)) {
      for (const fileName of ["ic_launcher.webp", "ic_launcher_round.webp"]) {
        const image = await readImage(
          `android-app/android/app/src/main/res/mipmap-${density}/${fileName}`
        );
        expect(image.width, `${density}/${fileName}`).toBe(size);
        expect(image.height, `${density}/${fileName}`).toBe(size);
      }
    }

    for (const [density, size] of Object.entries(splashSizes)) {
      const image = await readImage(
        `android-app/android/app/src/main/res/drawable-${density}/splashscreen_logo.png`
      );
      expect(image.width, `${density}/splashscreen_logo.png`).toBe(size);
      expect(image.height, `${density}/splashscreen_logo.png`).toBe(size);
    }
  });

  it("uses one adaptive background color and the packaged icon in Electron development", () => {
    const expoConfig = readFileSync(
      path.join(repositoryRoot, "android-app", "app.json"),
      "utf8"
    );
    const nativeColors = readFileSync(
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
    const prebuildColors = readFileSync(
      path.join(
        repositoryRoot,
        "android-app",
        "android",
        "app",
        "src",
        "main",
        "res",
        "values",
        "colors.xml"
      ),
      "utf8"
    );
    const electronMain = readFileSync(
      path.join(repositoryRoot, "desktop", "main.cjs"),
      "utf8"
    );
    const androidStatusScript = readFileSync(
      path.join(repositoryRoot, "scripts", "verify-android-lines.mjs"),
      "utf8"
    );

    expect(expoConfig).toContain('"backgroundColor": "#1B1E38"');
    expect(nativeColors).toContain(
      '<color name="ic_launcher_background">#1B1E38</color>'
    );
    expect(prebuildColors).toContain(
      '<color name="splashscreen_background">#1B1E38</color>'
    );
    expect(electronMain).toContain('"desktop", "resources", "icon.png"');
    expect(electronMain).not.toContain('path.join(projectRoot, "post.jpg")');
    expect(androidStatusScript).toContain(
      '"branding/teachhelper-icon-source.png"'
    );
  });
});
