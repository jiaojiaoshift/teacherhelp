import type { BinaryAssetEntity, PageEntity } from "@/lib/domain/entities";

function parseDataUrlMimeType(dataUrl: string): string {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] || "image/png";
}

function estimateDataUrlByteLength(dataUrl: string): number {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

export function ensureDurablePagePreviewAssets(input: {
  pages: Array<Pick<PageEntity, "id" | "documentId" | "displayAssetId">>;
  pagePreviewDataUrls: Record<string, string>;
  binaryAssets: BinaryAssetEntity[];
}): BinaryAssetEntity[] {
  const assetIndexById = new Map(input.binaryAssets.map((asset, index) => [asset.id, index]));
  let nextAssets = input.binaryAssets;

  for (const page of input.pages) {
    const dataUrl = input.pagePreviewDataUrls[page.id];

    if (!dataUrl) {
      continue;
    }

    const assetId = page.displayAssetId ?? `asset-display-${page.id}`;
    const existingAsset = input.binaryAssets.find((asset) => asset.id === assetId);
    const nextAsset: BinaryAssetEntity = {
      ...(existingAsset ?? {}),
      id: assetId,
      documentId: page.documentId,
      pageId: page.id,
      kind: "display",
      mimeType: parseDataUrlMimeType(dataUrl),
      byteLength: estimateDataUrlByteLength(dataUrl),
      dataUrl
    };

    if (
      existingAsset &&
      existingAsset.dataUrl === nextAsset.dataUrl &&
      existingAsset.mimeType === nextAsset.mimeType &&
      existingAsset.byteLength === nextAsset.byteLength
    ) {
      continue;
    }

    if (nextAssets === input.binaryAssets) {
      nextAssets = input.binaryAssets.slice();
    }

    const existingIndex = assetIndexById.get(nextAsset.id);

    if (existingIndex === undefined) {
      assetIndexById.set(nextAsset.id, nextAssets.length);
      nextAssets.push(nextAsset);
    } else {
      nextAssets[existingIndex] = nextAsset;
    }

  }

  return nextAssets;
}
