import { describe, expect, it, vi } from "vitest";

import {
  DURABLE_QUESTION_RENDER_DPI,
  materializeDurableQuestionImages
} from "@/lib/services/durable-question-image-service";

describe("durable question image service", () => {
  it("uses the retained source Blob for high-resolution crops without materializing the PDF", async () => {
    const sourcePdfBlob = new Blob(["pdf"], { type: "application/pdf" });
    const arrayBufferSpy = vi.spyOn(sourcePdfBlob, "arrayBuffer").mockRejectedValue(
      new Error("Durable browser rendering should not materialize the source PDF")
    );
    const renderPdfBlob = vi.fn().mockResolvedValue([
      {
        pageNumber: 1,
        width: 2500,
        height: 3500,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    const cropRenderedPage = vi.fn().mockResolvedValue({
      dataUrl: "data:image/png;base64,crop",
      width: 1000,
      height: 800
    });

    const result = await materializeDurableQuestionImages({
      documentId: "doc-blob",
      sourcePdfBlob,
      pages: [
        {
          id: "page-1",
          documentId: "doc-blob",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      questions: [
        {
          id: "question-blob",
          documentId: "doc-blob",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 100, y: 200, width: 800, height: 400 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.98,
          crossPageGroupId: null,
          classificationStatus: "confirmed"
        }
      ],
      renderPdfBlob,
      cropRenderedPage
    });

    expect(renderPdfBlob).toHaveBeenCalledWith(
      sourcePdfBlob,
      expect.objectContaining({ pageNumbers: [1] })
    );
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(result.assets).toHaveLength(1);
  });

  it("renders only referenced pages at 300 DPI and creates ordered lossless question fragments", async () => {
    const renderPdf = vi.fn().mockResolvedValue([
      {
        pageNumber: 2,
        width: 2500,
        height: 3500,
        blob: new Blob(["page-2"], { type: "image/png" })
      },
      {
        pageNumber: 3,
        width: 2500,
        height: 3500,
        blob: new Blob(["page-3"], { type: "image/png" })
      }
    ]);
    const cropRenderedPage = vi
      .fn()
      .mockImplementation(async ({ crop }: { crop: { width: number; height: number } }) => ({
        dataUrl: `data:image/png;base64,${crop.width}x${crop.height}`,
        width: crop.width,
        height: crop.height
      }));

    const result = await materializeDurableQuestionImages({
      documentId: "doc-1",
      sourcePdfArrayBuffer: new ArrayBuffer(8),
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1000,
          height: 1400,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-3",
          documentId: "doc-1",
          pageNumber: 3,
          width: 1000,
          height: 1400,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      questions: [
        {
          id: "question-cross",
          documentId: "doc-1",
          pageIds: ["page-2", "page-3"],
          primaryPageId: "page-2",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-2": { x: 100, y: 700, width: 800, height: 560 },
            "page-3": { x: 100, y: 70, width: 800, height: 280 }
          },
          status: "reviewed",
          source: "merged",
          confidence: 0.98,
          crossPageGroupId: "merge-1",
          classificationStatus: "confirmed"
        }
      ],
      renderPdf,
      cropRenderedPage
    });

    expect(renderPdf).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({
        scale: DURABLE_QUESTION_RENDER_DPI / 72,
        pageNumbers: [2, 3]
      })
    );
    expect(cropRenderedPage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        crop: { x: 250, y: 1750, width: 2000, height: 1400 },
        mimeType: "image/png"
      })
    );
    expect(cropRenderedPage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        crop: { x: 250, y: 175, width: 2000, height: 700 },
        mimeType: "image/png"
      })
    );
    expect(result.assets).toEqual([
      expect.objectContaining({
        id: "question-crop-v1-question-cross-page-2",
        pageId: "page-2",
        kind: "question_crop",
        mimeType: "image/png"
      }),
      expect.objectContaining({
        id: "question-crop-v1-question-cross-page-3",
        pageId: "page-3",
        kind: "question_crop",
        mimeType: "image/png"
      })
    ]);
    expect(result.questions[0].questionImageAttachments).toEqual([
      {
        id: "question-image-v1-question-cross-page-2",
        assetId: "question-crop-v1-question-cross-page-2",
        pageId: "page-2",
        pixelWidth: 2000,
        pixelHeight: 1400,
        renderDpi: 300,
        version: 1
      },
      {
        id: "question-image-v1-question-cross-page-3",
        assetId: "question-crop-v1-question-cross-page-3",
        pageId: "page-3",
        pixelWidth: 2000,
        pixelHeight: 700,
        renderDpi: 300,
        version: 1
      }
    ]);
    expect(result.questions[0].bboxByPage).toEqual({
      "page-2": { x: 100, y: 700, width: 800, height: 560 },
      "page-3": { x: 100, y: 70, width: 800, height: 280 }
    });
  });

  it("rejects the whole materialization when any fragment crop fails", async () => {
    const cropRenderedPage = vi
      .fn()
      .mockResolvedValueOnce({
        dataUrl: "data:image/png;base64,first",
        width: 2000,
        height: 700
      })
      .mockRejectedValueOnce(new Error("crop failed"));

    await expect(
      materializeDurableQuestionImages({
        documentId: "doc-1",
        sourcePdfArrayBuffer: new ArrayBuffer(8),
        pages: [
          {
            id: "page-1",
            documentId: "doc-1",
            pageNumber: 1,
            width: 1000,
            height: 1400,
            analysisStatus: "done",
            reviewStatus: "reviewed"
          },
          {
            id: "page-2",
            documentId: "doc-1",
            pageNumber: 2,
            width: 1000,
            height: 1400,
            analysisStatus: "done",
            reviewStatus: "reviewed"
          }
        ],
        questions: [
          {
            id: "question-cross",
            documentId: "doc-1",
            pageIds: ["page-1", "page-2"],
            primaryPageId: "page-1",
            localOrder: 1,
            globalOrder: 1,
            bboxByPage: {
              "page-1": { x: 100, y: 700, width: 800, height: 280 },
              "page-2": { x: 100, y: 70, width: 800, height: 280 }
            },
            status: "reviewed",
            source: "merged",
            confidence: 0.98,
            crossPageGroupId: "merge-1",
            classificationStatus: "confirmed"
          }
        ],
        renderPdf: vi.fn().mockResolvedValue([
          {
            pageNumber: 1,
            width: 2500,
            height: 3500,
            blob: new Blob(["page-1"], { type: "image/png" })
          },
          {
            pageNumber: 2,
            width: 2500,
            height: 3500,
            blob: new Blob(["page-2"], { type: "image/png" })
          }
        ]),
        cropRenderedPage
      })
    ).rejects.toThrow("crop failed");
  });
});
