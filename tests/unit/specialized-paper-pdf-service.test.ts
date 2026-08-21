import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";

import {
  buildSpecializedPaperPdf,
  mapPageBBoxToImagePixels,
  resolveQuestionExportScale
} from "@/lib/server/specialized-paper-pdf-service";

describe("specialized paper PDF service", () => {
  it("maps logical page coordinates to the persisted image pixel size without clipping edges", () => {
    expect(
      mapPageBBoxToImagePixels({
        bbox: { x: 105, y: 123, width: 940, height: 438 },
        image: { width: 679, height: 960 },
        page: { width: 1191, height: 1684 }
      })
    ).toEqual({
      x: 59,
      y: 70,
      width: 537,
      height: 250
    });
  });

  it("embeds every persisted question fragment as an image in current paper order", async () => {
    const canvas = createCanvas(1000, 1400);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1000, 1400);
    context.fillStyle = "#111111";
    context.fillRect(80, 120, 840, 320);
    const pageImage = canvas.toBuffer("image/png");
    const readAsset = vi.fn().mockResolvedValue({
      mimeType: "image/png",
      data: pageImage
    });

    const result = await buildSpecializedPaperPdf({
      document: {
        title: "静电场专题卷",
        numberingMode: "resequence",
        questionIds: ["question-1"],
        questionBlocks: []
      },
      questions: [
        {
          id: "question-1",
          pageIds: ["page-1"],
          questionNumberLabel: "31",
          bboxByPage: {
            "page-1": { x: 80, y: 120, width: 840, height: 320 }
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-page-1"
        }
      ],
      readAsset
    });

    expect(result.fileName).toMatch(/^静电场专题卷_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(result.data.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(result.data.length).toBeGreaterThan(1_000);
    expect(result.data.toString("latin1")).toContain("/Subtype /Image");
    expect(readAsset).toHaveBeenCalledWith("asset-page-1");
  });

  it("keeps all fragments of one cross-page question in the exported image plan", async () => {
    const canvas = createCanvas(1000, 1400);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1000, 1400);
    const pageImage = canvas.toBuffer("image/png");
    const readAsset = vi.fn().mockResolvedValue({
      mimeType: "image/png",
      data: pageImage
    });

    await buildSpecializedPaperPdf({
      document: {
        title: "跨页专题卷",
        numberingMode: "resequence",
        questionIds: ["question-cross"],
        questionBlocks: []
      },
      questions: [
        {
          id: "question-cross",
          pageIds: ["page-1", "page-2"],
          questionNumberLabel: "8",
          bboxByPage: {
            "page-1": { x: 80, y: 900, width: 840, height: 360 },
            "page-2": { x: 80, y: 100, width: 840, height: 300 }
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-page-1"
        },
        {
          id: "page-2",
          pageNumber: 2,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-page-2"
        }
      ],
      readAsset
    });

    expect(readAsset).toHaveBeenCalledTimes(2);
    expect(readAsset).toHaveBeenNthCalledWith(1, "asset-page-1");
    expect(readAsset).toHaveBeenNthCalledWith(2, "asset-page-2");
  });

  it("prefers durable question crops and keeps their natural 300 DPI export scale", async () => {
    const cropCanvas = createCanvas(2000, 800);
    const cropContext = cropCanvas.getContext("2d");
    cropContext.fillStyle = "#ffffff";
    cropContext.fillRect(0, 0, 2000, 800);
    const readAsset = vi.fn().mockImplementation(async (assetId: string) => {
      if (assetId !== "asset-question-crop-1") {
        throw new Error(`unexpected asset ${assetId}`);
      }

      return {
        mimeType: "image/png",
        data: cropCanvas.toBuffer("image/png")
      };
    });

    const result = await buildSpecializedPaperPdf({
      document: {
        title: "高清专题卷",
        numberingMode: "resequence",
        questionIds: ["question-1"]
      },
      questions: [
        {
          id: "question-1",
          pageIds: ["page-1"],
          questionNumberLabel: "1",
          bboxByPage: {
            "page-1": { x: 80, y: 120, width: 840, height: 320 }
          },
          questionImageAttachments: [
            {
              id: "question-image-1",
              assetId: "asset-question-crop-1",
              pageId: "page-1",
              pixelWidth: 2000,
              pixelHeight: 800,
              renderDpi: 300,
              version: 1
            }
          ]
        }
      ],
      pages: [
        {
          id: "page-1",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-page-low-resolution"
        }
      ],
      readAsset
    });

    expect(result.data.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(readAsset).toHaveBeenCalledTimes(1);
    expect(readAsset).toHaveBeenCalledWith("asset-question-crop-1");
    expect(
      resolveQuestionExportScale({
        fragments: [{ pixelWidth: 2000, pixelHeight: 800, renderDpi: 300 }],
        availableHeight: 760
      })
    ).toBeCloseTo(72 / 300, 6);
  });

  it("lays out double-column questions first and starts single-column questions on a new page", async () => {
    const canvas = createCanvas(1000, 1400);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1000, 1400);
    const pageImage = canvas.toBuffer("image/png");
    const readAsset = vi.fn().mockResolvedValue({
      mimeType: "image/png",
      data: pageImage
    });
    const questionIds = ["single-1", "double-1", "single-2", "double-2"];
    const pages = questionIds.map((id, index) => ({
      id: `page-${id}`,
      pageNumber: index + 1,
      width: 1000,
      height: 1400,
      displayAssetId: `asset-${id}`
    }));
    const questions = questionIds.map((id) => ({
      id,
      pageIds: [`page-${id}`],
      pageLayoutMode: id.startsWith("double")
        ? ("double_column" as const)
        : ("single_column" as const),
      questionNumberLabel: id,
      bboxByPage: {
        [`page-${id}`]: { x: 80, y: 100, width: 400, height: 800 }
      }
    }));

    const result = await buildSpecializedPaperPdf({
      document: {
        title: "混合版式专题卷",
        numberingMode: "resequence",
        questionIds
      },
      questions,
      pages,
      readAsset
    });

    expect(result.placements.map((placement) => placement.questionId)).toEqual([
      "double-1",
      "double-2",
      "single-1",
      "single-2"
    ]);
    expect(result.placements.slice(0, 2)).toEqual([
      expect.objectContaining({ questionId: "double-1", pageNumber: 1, column: "left" }),
      expect.objectContaining({ questionId: "double-2", pageNumber: 1, column: "right" })
    ]);
    expect(result.placements[2]).toEqual(
      expect.objectContaining({
        questionId: "single-1",
        pageNumber: 2,
        column: "full"
      })
    );
    expect(readAsset.mock.calls.map(([assetId]) => assetId)).toEqual([
      "asset-double-1",
      "asset-double-2",
      "asset-single-1",
      "asset-single-2"
    ]);
  });
});
