import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareAiPreviewBlob,
  prepareAiPreviewDataUrl
} from "@/lib/services/ai-image-preview-service";

describe("ai-image-preview-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps one already-small preview unchanged", async () => {
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 640;
      naturalHeight = 480;

      set src(_value: string) {
        this.onload?.();
      }
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;

    const preview = "data:image/png;base64,small-preview";
    const result = await prepareAiPreviewDataUrl(preview, {
      maxDimension: 960,
      maxDataUrlLength: 200
    });

    expect(result).toBe(preview);

    global.Image = originalImage;
  });

  it("downscales and re-encodes one oversized preview", async () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn().mockReturnValue("data:image/jpeg;base64,compressed-preview");
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({
        drawImage
      }),
      toDataURL
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 2000;
      naturalHeight = 1000;

      set src(_value: string) {
        this.onload?.();
      }
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;

    const result = await prepareAiPreviewDataUrl(`data:image/png;base64,${"x".repeat(400000)}`, {
      maxDimension: 960,
      maxDataUrlLength: 1000
    });

    expect(result).toBe("data:image/jpeg;base64,compressed-preview");
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(480);
    expect(drawImage).toHaveBeenCalled();
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.82);

    global.Image = originalImage;
  });

  it("uses a conservative default AI request dimension", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue("data:image/jpeg;base64,default-sized")
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 2_000;
      naturalHeight = 1_000;

      set src(_value: string) {
        this.onload?.();
      }
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;

    await expect(
      prepareAiPreviewDataUrl("data:image/png;base64,default-preview")
    ).resolves.toBe("data:image/jpeg;base64,default-sized");

    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(300);
    global.Image = originalImage;
  });

  it("falls back to the original preview when image loading stalls", async () => {
    vi.useFakeTimers();
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 2000;
      naturalHeight = 1000;

      set src(_value: string) {}
    }

    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;

    const preview = "data:image/png;base64,stalled-preview";
    const resultPromise = prepareAiPreviewDataUrl(preview, {
      loadTimeoutMs: 10
    });

    await vi.advanceTimersByTimeAsync(10);

    await expect(resultPromise).resolves.toBe(preview);

    global.Image = originalImage;
  });

  it("compresses a source Blob directly and releases its object URL", async () => {
    const sourceBlob = new Blob(["source"], { type: "image/png" });
    const compressedBlob = new Blob(["compressed"], { type: "image/jpeg" });
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const originalImage = global.Image;

    class MockImage {
      onload: null | (() => void) = null;
      onerror: null | (() => void) = null;
      naturalWidth = 2000;
      naturalHeight = 1000;

      set src(_value: string) {
        this.onload?.();
      }
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toBlob: vi.fn((callback: BlobCallback) => callback(compressedBlob))
    };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
      tagName === "canvas" ? (canvas as unknown as HTMLCanvasElement) : originalCreateElement(tagName)
    ) as typeof document.createElement);
    (global as typeof globalThis & { Image: typeof Image }).Image = MockImage as unknown as typeof Image;

    await expect(
      prepareAiPreviewBlob(sourceBlob, {
        maxDimension: 960,
        maxBlobBytes: 1
      })
    ).resolves.toBe(compressedBlob);

    expect(createObjectUrl).toHaveBeenCalledWith(sourceBlob);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:preview");
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(480);

    global.Image = originalImage;
  });
});
