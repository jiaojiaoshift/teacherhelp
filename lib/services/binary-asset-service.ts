import { mapNormalizedBboxToPixels } from "@/lib/services/analysis-service";

import type { BinaryAssetEntity } from "@/lib/domain/entities";

export function createBinaryAssetRecord(input: BinaryAssetEntity): BinaryAssetEntity {
  return input;
}

export function createManualAnswerAssetRecord(
  input: Omit<BinaryAssetEntity, "kind"> & { dataUrl: string }
): BinaryAssetEntity {
  return {
    ...input,
    kind: "display"
  };
}

function estimateByteLengthFromDataUrl(dataUrl: string): number {
  const [, payload = ""] = dataUrl.split(",", 2);

  return Math.ceil((payload.length * 3) / 4);
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load source preview image"));
    image.src = dataUrl;
  });
}

async function createCroppedDisplayAssetRecord(input: {
  id: string;
  documentId: string;
  pageId: string;
  mimeType: string;
  sourceDataUrl: string;
  pageSize: {
    width: number;
    height: number;
  };
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}): Promise<BinaryAssetEntity> {
  const crop = mapNormalizedBboxToPixels(input.normalizedBBox, input.pageSize);
  const safeWidth = Math.max(1, crop.width);
  const safeHeight = Math.max(1, crop.height);
  const image = await loadImageFromDataUrl(input.sourceDataUrl);
  const canvas = document.createElement("canvas");

  canvas.width = safeWidth;
  canvas.height = safeHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create canvas context");
  }

  context.drawImage(image, crop.x, crop.y, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight);

  const dataUrl = canvas.toDataURL(input.mimeType || "image/png");

  return {
    id: input.id,
    documentId: input.documentId,
    pageId: input.pageId,
    kind: "display",
    mimeType: input.mimeType || "image/png",
    byteLength: estimateByteLengthFromDataUrl(dataUrl),
    dataUrl
  };
}

export async function createCroppedManualAnswerAssetRecord(input: {
  id: string;
  documentId: string;
  pageId: string;
  mimeType: string;
  sourceDataUrl: string;
  pageSize: {
    width: number;
    height: number;
  };
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}): Promise<BinaryAssetEntity> {
  return createCroppedDisplayAssetRecord(input);
}

export async function createMatchedAnswerAssetRecord(input: {
  id: string;
  documentId: string;
  pageId: string;
  mimeType: string;
  sourceDataUrl: string;
  pageSize: {
    width: number;
    height: number;
  };
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}): Promise<BinaryAssetEntity> {
  return createCroppedDisplayAssetRecord(input);
}

export function purgeBinaryAssetsForDocument(
  assets: BinaryAssetEntity[],
  documentId: string,
  kindsToRemove: Array<BinaryAssetEntity["kind"]>
): BinaryAssetEntity[] {
  const removableKinds = new Set(kindsToRemove);

  return assets.filter(
    (asset) => !(asset.documentId === documentId && removableKinds.has(asset.kind))
  );
}
