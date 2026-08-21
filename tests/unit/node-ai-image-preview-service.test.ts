import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";

import { prepareNodeAiPreviewBlob } from "@/lib/server/node-ai-image-preview-service";

describe("node ai image preview service", () => {
  it("downscales rendered pages before they become AI data URLs", async () => {
    const canvas = createCanvas(2_000, 1_000);
    canvas.getContext("2d").fillStyle = "#ffffff";
    canvas.getContext("2d").fillRect(0, 0, 2_000, 1_000);
    const source = new Blob([Uint8Array.from(canvas.toBuffer("image/png")).buffer], {
      type: "image/png"
    });

    const result = await prepareNodeAiPreviewBlob(source, {
      maxDimension: 400,
      quality: 0.8
    });

    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBeLessThan(source.size);
  });
});
