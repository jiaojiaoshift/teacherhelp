import { afterEach, describe, expect, it, vi } from "vitest";

import { createNodePdfCanvasFactory } from "@/lib/server/node-pdf-canvas-factory";

type PdfjsRuntimeGlobals = typeof globalThis & {
  pdfjsWorker?: {
    WorkerMessageHandler: unknown;
  };
};

const runtimeGlobals = globalThis as PdfjsRuntimeGlobals;
const originalPath2D = globalThis.Path2D;
const originalDomMatrix = globalThis.DOMMatrix;
const originalImageData = globalThis.ImageData;
const originalPdfjsWorker = runtimeGlobals.pdfjsWorker;

afterEach(() => {
  vi.stubGlobal("Path2D", originalPath2D);
  vi.stubGlobal("DOMMatrix", originalDomMatrix);
  vi.stubGlobal("ImageData", originalImageData);
  if (originalPdfjsWorker) {
    runtimeGlobals.pdfjsWorker = originalPdfjsWorker;
  } else {
    delete runtimeGlobals.pdfjsWorker;
  }
});

describe("node-pdf-canvas-factory", () => {
  it("installs the canvas geometry globals required by PDF.js before rendering", () => {
    vi.stubGlobal("Path2D", undefined);
    vi.stubGlobal("DOMMatrix", undefined);
    vi.stubGlobal("ImageData", undefined);

    const result = createNodePdfCanvasFactory()();

    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(globalThis.Path2D).toBeTypeOf("function");
    expect(globalThis.DOMMatrix).toBeTypeOf("function");
    expect(globalThis.ImageData).toBeTypeOf("function");
  });

  it("installs the local PDF.js worker before the renderer imports PDF.js", () => {
    delete runtimeGlobals.pdfjsWorker;

    createNodePdfCanvasFactory();

    expect(runtimeGlobals.pdfjsWorker?.WorkerMessageHandler).toBeTypeOf("function");
  });
});
