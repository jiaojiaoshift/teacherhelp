import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface NodeAiImagePreviewOptions {
  maxDimension?: number;
  maxBlobBytes?: number;
  quality?: number;
}

export async function prepareNodeAiPreviewBlob(
  blob: Blob,
  options?: NodeAiImagePreviewOptions
): Promise<Blob> {
  const maxDimension = options?.maxDimension ?? 600;
  const maxBlobBytes = options?.maxBlobBytes ?? 300_000;
  const quality = options?.quality ?? 0.82;

  if (!blob.type.startsWith("image/")) {
    return blob;
  }

  try {
    const sourceBuffer = Buffer.from(await blob.arrayBuffer());
    const image = await loadImage(sourceBuffer);
    const longestSide = Math.max(image.width, image.height);

    if (sourceBuffer.byteLength <= maxBlobBytes && longestSide <= maxDimension) {
      return blob;
    }

    const scale = Math.min(1, maxDimension / longestSide);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    const output = canvas.toBuffer("image/jpeg", quality);

    return new Blob([Uint8Array.from(output).buffer], { type: "image/jpeg" });
  } catch {
    return blob;
  }
}
