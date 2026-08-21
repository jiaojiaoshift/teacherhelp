import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createCanvas, loadImage } from "@napi-rs/canvas";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(
  projectRoot,
  "branding",
  "teachhelper-icon-source.png"
);
const sourceImage = await loadImage(await readFile(sourcePath));
const sourceSize = Math.min(sourceImage.width, sourceImage.height);
const sourceX = Math.floor((sourceImage.width - sourceSize) / 2);
const sourceY = Math.floor((sourceImage.height - sourceSize) / 2);

function renderSquare(size, contentScale = 1) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const contentSize = Math.round(size * contentScale);
  const offset = Math.floor((size - contentSize) / 2);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceImage,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    offset,
    offset,
    contentSize,
    contentSize
  );
  return canvas;
}

async function writeAsset(relativePath, bytes) {
  const targetPath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, bytes);
  process.stdout.write(`Branding icon ready: ${targetPath}\n`);
}

const standard1024 = renderSquare(1024);
const standard512 = renderSquare(512);
const adaptive1024 = renderSquare(1024, 0.75);
const adaptiveBytes = await adaptive1024.encode("png");

await Promise.all([
  writeAsset("post.jpg", await standard1024.encode("jpeg", 95)),
  writeAsset("app/icon.png", await standard512.encode("png")),
  writeAsset("desktop/resources/icon.png", await standard512.encode("png")),
  writeAsset("android-app/assets/icon.png", await standard1024.encode("png")),
  writeAsset("android-app/assets/adaptive-icon.png", adaptiveBytes),
  writeAsset(
    "android-app/app/src/main/res/drawable/ic_launcher_foreground_image.png",
    adaptiveBytes
  )
]);

const launcherSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

for (const [density, size] of Object.entries(launcherSizes)) {
  const bytes = await renderSquare(size).encode("webp", 92);

  await Promise.all([
    writeAsset(
      `android-app/android/app/src/main/res/mipmap-${density}/ic_launcher.webp`,
      bytes
    ),
    writeAsset(
      `android-app/android/app/src/main/res/mipmap-${density}/ic_launcher_round.webp`,
      bytes
    )
  ]);
}

const splashSizes = {
  mdpi: 288,
  hdpi: 432,
  xhdpi: 576,
  xxhdpi: 864,
  xxxhdpi: 1152
};

for (const [density, size] of Object.entries(splashSizes)) {
  await writeAsset(
    `android-app/android/app/src/main/res/drawable-${density}/splashscreen_logo.png`,
    await renderSquare(size, 0.7).encode("png")
  );
}
