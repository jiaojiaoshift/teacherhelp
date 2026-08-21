import { describe, expect, it } from "vitest";

import { buildUploadedPdfLecturePreview } from "@/lib/services/lecture-preview-service";

describe("lecture-preview-service", () => {
  it("moves the next question to a new preview page when the current page cannot fit it", () => {
    const preview = buildUploadedPdfLecturePreview({
      document: {
        questionIds: ["q-1", "q-2"],
        uploadedPdfPages: [
          {
            pageId: "page-1",
            pageNumber: 1,
            width: 1000,
            height: 1400,
            reviewStatus: "reviewed",
            previewAssetId: "asset-page-1"
          }
        ]
      },
      questionDrafts: [
        {
          id: "q-1",
          primaryPageId: "page-1",
          bboxByPage: {
            "page-1": {
              x: 100,
              y: 100,
              width: 800,
              height: 620
            }
          },
          questionNumberLabel: "1"
        },
        {
          id: "q-2",
          primaryPageId: "page-1",
          bboxByPage: {
            "page-1": {
              x: 120,
              y: 620,
              width: 780,
              height: 620
            }
          },
          questionNumberLabel: "2"
        }
      ],
      binaryAssets: [
        {
          id: "asset-page-1",
          dataUrl: "data:image/png;base64,cGFnZQ=="
        }
      ],
      layout: {
        pageWidth: 720,
        pageHeight: 820,
        padding: 40,
        gap: 24,
        labelHeight: 32
      }
    });

    expect(preview.pages).toHaveLength(2);
    expect(preview.pages[0].items.map((item) => item.questionId)).toEqual(["q-1"]);
    expect(preview.pages[1].items.map((item) => item.questionId)).toEqual(["q-2"]);
  });

  it("keeps the current question order when building preview pages", () => {
    const preview = buildUploadedPdfLecturePreview({
      document: {
        questionIds: ["q-2", "q-1"],
        uploadedPdfPages: [
          {
            pageId: "page-1",
            pageNumber: 1,
            width: 1000,
            height: 1400,
            reviewStatus: "reviewed",
            previewAssetId: "asset-page-1"
          }
        ]
      },
      questionDrafts: [
        {
          id: "q-1",
          primaryPageId: "page-1",
          bboxByPage: {
            "page-1": {
              x: 100,
              y: 100,
              width: 800,
              height: 240
            }
          },
          questionNumberLabel: "1"
        },
        {
          id: "q-2",
          primaryPageId: "page-1",
          bboxByPage: {
            "page-1": {
              x: 100,
              y: 400,
              width: 800,
              height: 240
            }
          },
          questionNumberLabel: "2"
        }
      ],
      binaryAssets: [
        {
          id: "asset-page-1",
          dataUrl: "data:image/png;base64,cGFnZQ=="
        }
      ]
    });

    expect(preview.pages).toHaveLength(1);
    expect(preview.pages[0].items.map((item) => item.questionId)).toEqual(["q-2", "q-1"]);
    expect(preview.pages[0].items.map((item) => item.displayNumber)).toEqual(["2", "1"]);
  });

  it("builds cropped preview data urls from the detected question box", () => {
    const preview = buildUploadedPdfLecturePreview({
      document: {
        questionIds: ["q-1"],
        uploadedPdfPages: [
          {
            pageId: "page-1",
            pageNumber: 1,
            width: 1000,
            height: 1400,
            reviewStatus: "reviewed",
            previewAssetId: "asset-page-1"
          }
        ]
      },
      questionDrafts: [
        {
          id: "q-1",
          primaryPageId: "page-1",
          bboxByPage: {
            "page-1": {
              x: 100,
              y: 120,
              width: 800,
              height: 240
            }
          },
          questionNumberLabel: "1"
        }
      ],
      binaryAssets: [
        {
          id: "asset-page-1",
          dataUrl: "data:image/png;base64,cGFnZQ=="
        }
      ]
    });

    expect(preview.pages).toHaveLength(1);
    expect(preview.pages[0].items[0].sourceDataUrl).toBe("data:image/png;base64,cGFnZQ==");
    expect(preview.pages[0].items[0].previewDataUrl).toContain("data:image/svg+xml");
    expect(decodeURIComponent(preview.pages[0].items[0].previewDataUrl)).toContain(
      'viewBox="100 120 800 240"'
    );
  });
});
