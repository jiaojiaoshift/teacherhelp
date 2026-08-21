import { beforeEach, describe, expect, it, vi } from "vitest";

import { createObjectUrlRegistry } from "@/lib/images/blob-url";
import {
  createBinaryAssetRecord,
  createMatchedAnswerAssetRecord,
  createManualAnswerAssetRecord,
  purgeBinaryAssetsForDocument
} from "@/lib/services/binary-asset-service";

describe("binary-asset-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a binary asset record for persisted page images", () => {
    const asset = createBinaryAssetRecord({
      id: "asset-1",
      documentId: "doc-1",
      pageId: "page-1",
      kind: "display",
      mimeType: "image/png",
      byteLength: 1024
    });

    expect(asset).toMatchObject({
      id: "asset-1",
      documentId: "doc-1",
      pageId: "page-1",
      kind: "display",
      mimeType: "image/png",
      byteLength: 1024
    });
  });

  it("creates a manual answer asset record with inline preview data", () => {
    const asset = createManualAnswerAssetRecord({
      id: "answer-asset-1",
      documentId: "doc-1",
      pageId: "page-1",
      mimeType: "image/png",
      byteLength: 512,
      dataUrl: "data:image/png;base64,YW5zd2Vy"
    });

    expect(asset).toMatchObject({
      id: "answer-asset-1",
      documentId: "doc-1",
      pageId: "page-1",
      kind: "display",
      mimeType: "image/png",
      byteLength: 512,
      dataUrl: "data:image/png;base64,YW5zd2Vy"
    });
  });

  it("creates one matched answer asset record by cropping the source page preview", async () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn().mockReturnValue("data:image/png;base64,Y3JvcHBlZA==");
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage
      }),
      toDataURL
    };
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockImplementation(((tagName: string) => {
        if (tagName === "canvas") {
          return canvas as unknown as HTMLCanvasElement;
        }

        return originalCreateElement(tagName);
      }) as typeof document.createElement);
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 1200;
      naturalHeight = 1600;

      set src(_value: string) {
        this.onload?.();
      }
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;

    const asset = await createMatchedAnswerAssetRecord({
      id: "answer-asset-2",
      documentId: "doc-1",
      pageId: "page-3",
      mimeType: "image/png",
      sourceDataUrl: "data:image/png;base64,cGFnZQ==",
      pageSize: {
        width: 1200,
        height: 1600
      },
      normalizedBBox: {
        x1: 100,
        y1: 120,
        x2: 900,
        y2: 320
      }
    });

    expect(createElementSpy).toHaveBeenCalledWith("canvas");
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(320);
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 120, 192, 960, 320, 0, 0, 960, 320);
    expect(toDataURL).toHaveBeenCalledWith("image/png");
    expect(asset).toMatchObject({
      id: "answer-asset-2",
      documentId: "doc-1",
      pageId: "page-3",
      kind: "display",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,Y3JvcHBlZA=="
    });

    global.Image = originalImage;
  });

  it("filters out all binary assets for the purged document only", () => {
    const remaining = purgeBinaryAssetsForDocument([
      {
        id: "asset-source-1",
        documentId: "doc-1",
        pageId: "page-1",
        kind: "source",
        mimeType: "application/pdf",
        byteLength: 4096
      },
      {
        id: "asset-display-1",
        documentId: "doc-1",
        pageId: "page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 1024
      },
      {
        id: "asset-source-2",
        documentId: "doc-2",
        pageId: "page-9",
        kind: "source",
        mimeType: "image/png",
        byteLength: 2048
      }
    ], "doc-1", ["source"]);

    expect(remaining).toEqual([
      {
        id: "asset-display-1",
        documentId: "doc-1",
        pageId: "page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 1024
      },
      {
        id: "asset-source-2",
        documentId: "doc-2",
        pageId: "page-9",
        kind: "source",
        mimeType: "image/png",
        byteLength: 2048
      }
    ]);
  });

  it("creates and revokes object urls through the registry", () => {
    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:demo");
    const revokeSpy = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    const registry = createObjectUrlRegistry();
    const blob = new Blob(["demo"], { type: "image/png" });

    const url = registry.create("page-1", blob);
    registry.revoke("page-1");

    expect(url).toBe("blob:demo");
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith("blob:demo");
  });
});
