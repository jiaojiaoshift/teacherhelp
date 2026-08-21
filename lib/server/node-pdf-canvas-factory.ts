import {
  createCanvas,
  DOMMatrix,
  ImageData,
  Path2D
} from "@napi-rs/canvas";
import { WorkerMessageHandler } from "pdfjs-dist/build/pdf.worker.mjs";

import type { PdfCanvasFactory } from "@/lib/pdf/pdf-renderer";

export function createNodePdfCanvasFactory(): PdfCanvasFactory {
  (
    globalThis as typeof globalThis & {
      pdfjsWorker?: { WorkerMessageHandler: typeof WorkerMessageHandler };
    }
  ).pdfjsWorker ??= { WorkerMessageHandler };

  return () => {
    globalThis.Path2D ??= Path2D as unknown as typeof globalThis.Path2D;
    globalThis.DOMMatrix ??= DOMMatrix as unknown as typeof globalThis.DOMMatrix;
    globalThis.ImageData ??= ImageData as unknown as typeof globalThis.ImageData;
    return createCanvas(1, 1) as unknown as ReturnType<PdfCanvasFactory>;
  };
}
