import { describe, expect, it, vi } from "vitest";

import {
  buildPdfPageDisplayName,
  buildPdfWorkerSrc,
  createPdfPageRecords,
  getPdfPageCountFromBlob,
  getPdfPageCountFromArrayBuffer,
  renderPdfBlobToPagePreviews,
  renderPdfArrayBufferToPagePreviews
} from "@/lib/pdf/pdf-renderer";

describe("pdf-renderer", () => {
  it("reads a Blob page count through an object URL without materializing its ArrayBuffer", async () => {
    const pdfDocument = {
      numPages: 2,
      getPage: vi.fn(),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) }))
    };
    const sourceFile = new Blob(["pdf"], { type: "application/pdf" });
    const arrayBufferSpy = vi.spyOn(sourceFile, "arrayBuffer").mockRejectedValue(
      new Error("Blob PDF should not be materialized")
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:count-pdf");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await expect(
      getPdfPageCountFromBlob(sourceFile, { pdfjsModule })
    ).resolves.toBe(2);

    expect(pdfjsModule.getDocument).toHaveBeenCalledWith({ url: "blob:count-pdf" });
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:count-pdf");
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("renders a Blob through a temporary object URL without materializing its ArrayBuffer", async () => {
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: () => ({ width: 100, height: 120 }),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
        cleanup: vi.fn()
      })),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) }))
    };
    const sourceFile = new Blob(["pdf"], { type: "application/pdf" });
    const arrayBufferSpy = vi.spyOn(sourceFile, "arrayBuffer").mockRejectedValue(
      new Error("Blob PDF should not be materialized")
    );
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source-pdf");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await renderPdfBlobToPagePreviews(sourceFile, {
      pdfjsModule,
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({})),
        toBlob: (callback: BlobCallback) => callback(new Blob(["page"], { type: "image/png" }))
      }) as unknown as HTMLCanvasElement
    });

    expect(createObjectUrlSpy).toHaveBeenCalledWith(sourceFile);
    expect(pdfjsModule.getDocument).toHaveBeenCalledWith({ url: "blob:source-pdf" });
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:source-pdf");
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("reads a valid page count without rendering any page", async () => {
    const pdfDocument = {
      numPages: 400,
      getPage: vi.fn(),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) }))
    };

    await expect(
      getPdfPageCountFromArrayBuffer(new ArrayBuffer(8), { pdfjsModule })
    ).resolves.toBe(400);
    expect(pdfDocument.getPage).not.toHaveBeenCalled();
    expect(pdfDocument.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects a PDF whose physical page count exceeds the upload contract", async () => {
    const pdfDocument = {
      numPages: 401,
      getPage: vi.fn(),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) }))
    };

    await expect(
      renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
        pdfjsModule,
        createCanvas: () => ({
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({})),
          toBlob: vi.fn()
        }) as unknown as HTMLCanvasElement
      })
    ).rejects.toMatchObject({
      code: "too_many_pages"
    });
    expect(pdfDocument.getPage).not.toHaveBeenCalled();
    expect(pdfDocument.destroy).toHaveBeenCalledTimes(1);
  });

  it("delivers rendered pages in bounded batches without retaining the full result", async () => {
    const pages = Array.from({ length: 5 }, (_, index) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale
      }),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      cleanup: vi.fn(),
      pageNumber: index + 1
    }));
    const pdfDocument = {
      numPages: pages.length,
      getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) }))
    };
    const batches: number[][] = [];

    const result = await renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
      pdfjsModule,
      batchSize: 2,
      onBatch: ({ pages: batch }) => {
        batches.push(batch.map((page) => page.pageNumber));
      },
      createCanvas: () => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({})),
        toBlob: (callback: BlobCallback) => callback(new Blob(["page"], { type: "image/png" }))
      }) as unknown as HTMLCanvasElement
    });

    expect(result).toEqual([]);
    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    expect(pdfDocument.destroy).toHaveBeenCalledTimes(1);
  });

  it("builds display names for pdf pages", () => {
    expect(buildPdfPageDisplayName("高数试卷", 3)).toBe("高数试卷_第3页");
  });

  it("builds a worker url for the pinned pdfjs version", () => {
    expect(buildPdfWorkerSrc()).toContain("pdf.worker.min.mjs");
    expect(buildPdfWorkerSrc()).toContain("pdfjs-dist@");
  });

  it("creates page records for each rendered pdf page", () => {
    const pages = createPdfPageRecords({
      documentId: "doc-1",
      baseName: "高数试卷",
      pageMetas: [
        { pageId: "page-1", width: 1200, height: 1600, displayAssetId: "asset-1" },
        { pageId: "page-2", width: 1200, height: 1600, displayAssetId: "asset-2" }
      ]
    });

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
    expect(pages[1].displayAssetId).toBe("asset-2");
  });

  it("renders every pdf page through an injected pdfjs adapter", async () => {
    const pageOne = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale
      }),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      cleanup: vi.fn()
    };
    const pageTwo = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 500 * scale,
        height: 700 * scale
      }),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      cleanup: vi.fn()
    };
    const pdfDocument = {
      numPages: 2,
      getPage: vi.fn(async (pageNumber: number) => (pageNumber === 1 ? pageOne : pageTwo)),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: {
        workerSrc: ""
      },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve(pdfDocument)
      }))
    };

    const renderedPages = await renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
      pdfjsModule,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({})),
          toBlob: (callback: BlobCallback) => {
            callback(new Blob(["page"], { type: "image/png" }));
          }
        }) as unknown as HTMLCanvasElement
    });

    expect(renderedPages).toHaveLength(2);
    expect(renderedPages[0]).toMatchObject({
      pageNumber: 1,
      width: 1200,
      height: 1600
    });
    expect(renderedPages[1]).toMatchObject({
      pageNumber: 2,
      width: 1000,
      height: 1400
    });
    expect(pdfjsModule.GlobalWorkerOptions.workerSrc).toContain("pdf.worker.min.mjs");
    expect(pdfDocument.getPage).toHaveBeenCalledTimes(2);
    expect(pageOne.render).toHaveBeenCalledTimes(1);
    expect(pageTwo.render).toHaveBeenCalledTimes(1);
  });

  it("renders only the requested unique pdf pages in page-number order", async () => {
    const pages = Array.from({ length: 4 }, (_, index) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale
      }),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      cleanup: vi.fn(),
      pageNumber: index + 1
    }));
    const pdfDocument = {
      numPages: pages.length,
      getPage: vi.fn(async (pageNumber: number) => pages[pageNumber - 1]),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: vi.fn(() => ({ promise: Promise.resolve(pdfDocument) }))
    };

    const renderedPages = await renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
      pdfjsModule,
      pageNumbers: [4, 2, 2],
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({})),
          toBlob: (callback: BlobCallback) => callback(new Blob(["page"], { type: "image/png" }))
        }) as unknown as HTMLCanvasElement
    });

    expect(renderedPages.map((page) => page.pageNumber)).toEqual([2, 4]);
    expect(pdfDocument.getPage).toHaveBeenCalledTimes(2);
    expect(pdfDocument.getPage).toHaveBeenNthCalledWith(1, 2);
    expect(pdfDocument.getPage).toHaveBeenNthCalledWith(2, 4);
    expect(pages[0].render).not.toHaveBeenCalled();
    expect(pages[2].render).not.toHaveBeenCalled();
  });

  it("extracts native PDF text into normalized page coordinates", async () => {
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
        convertToViewportPoint: (x: number, y: number) => [x * scale, 800 * scale - y * scale]
      }),
      getTextContent: vi.fn(async () => ({
        items: [
          {
            str: "12.",
            width: 20,
            height: 20,
            transform: [1, 0, 0, 1, 60, 700]
          },
          {
            str: "如图所示",
            width: 98,
            height: 20,
            transform: [1, 0, 0, 1, 82, 700]
          }
        ]
      })),
      render: vi.fn(() => ({ promise: Promise.resolve() })),
      cleanup: vi.fn()
    };
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => page),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: {
        workerSrc: ""
      },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve(pdfDocument)
      }))
    };

    const [renderedPage] = await renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
      pdfjsModule,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          getContext: vi.fn(() => ({})),
          toBlob: (callback: BlobCallback) => {
            callback(new Blob(["page"], { type: "image/png" }));
          }
        }) as unknown as HTMLCanvasElement
    });

    expect(renderedPage.textLines).toEqual([
      {
        text: "12. 如图所示",
        normalizedBBox: { x1: 100, y1: 100, x2: 300, y2: 125 }
      }
    ]);
  });

  it("renders one pdf page without one browser document when one canvas factory is injected", async () => {
    const originalDocument = global.document;
    vi.stubGlobal("document", undefined);

    const page = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 320 * scale,
        height: 480 * scale
      }),
      render: vi.fn(({ canvasContext }: { canvasContext: CanvasRenderingContext2D }) => {
        canvasContext.fillStyle = "#111827";
        canvasContext.fillRect(0, 0, 10, 10);

        return { promise: Promise.resolve() };
      }),
      cleanup: vi.fn()
    };
    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => page),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: {
        workerSrc: ""
      },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve(pdfDocument)
      }))
    };

    await expect(
      renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
        pdfjsModule,
        createCanvas: () =>
          ({
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              fillStyle: "",
              fillRect: vi.fn()
            })),
            toBlob: (callback: BlobCallback) => {
              callback(new Blob(["page"], { type: "image/png" }));
            }
          }) as unknown as HTMLCanvasElement
      })
    ).resolves.toEqual([
      expect.objectContaining({
        pageNumber: 1,
        width: 640,
        height: 960,
        blob: expect.any(Blob)
      })
    ]);

    global.document = originalDocument;
  });

  it("rejects one pdf render outside the browser when no canvas factory is injected", async () => {
    const originalDocument = global.document;
    vi.stubGlobal("document", undefined);

    const pdfDocument = {
      numPages: 1,
      getPage: vi.fn(async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 320 * scale,
          height: 480 * scale
        }),
        render: vi.fn(() => ({ promise: Promise.resolve() })),
        cleanup: vi.fn()
      })),
      destroy: vi.fn(async () => undefined)
    };
    const pdfjsModule = {
      GlobalWorkerOptions: {
        workerSrc: ""
      },
      getDocument: vi.fn(() => ({
        promise: Promise.resolve(pdfDocument)
      }))
    };

    await expect(
      renderPdfArrayBufferToPagePreviews(new ArrayBuffer(8), {
        pdfjsModule
      })
    ).rejects.toThrow("requires an injected canvas factory");

    global.document = originalDocument;
  });
});
