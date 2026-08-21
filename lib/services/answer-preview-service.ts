import { mapNormalizedBboxToPixels } from "@/lib/services/analysis-service";

export function buildPendingAnswerPreviewDataUrl(input: {
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
}) {
  const crop = mapNormalizedBboxToPixels(input.normalizedBBox, input.pageSize);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}">`,
    `<image href="${input.sourceDataUrl}" x="0" y="0" width="${input.pageSize.width}" height="${input.pageSize.height}" preserveAspectRatio="none" />`,
    "</svg>"
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
