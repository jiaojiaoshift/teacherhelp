import { describe, expect, it } from "vitest";

import { ensureDurablePagePreviewAssets } from "@/lib/services/library-preview-retention-service";

describe("library-preview-retention-service", () => {
  it("backfills page display assets without duplicating existing asset ids", () => {
    const sourceAsset = {
      id: "asset-source-1",
      documentId: "doc-1",
      pageId: "page-1",
      kind: "source" as const,
      mimeType: "application/pdf",
      byteLength: 4096
    };
    const existingDisplayAsset = {
      id: "asset-display-1",
      documentId: "doc-1",
      pageId: "page-1",
      kind: "display" as const,
      mimeType: "image/png",
      byteLength: 1024
    };
    const result = ensureDurablePagePreviewAssets({
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          displayAssetId: "asset-display-1"
        }
      ],
      pagePreviewDataUrls: {
        "page-1": "data:image/webp;base64,QUJDRA=="
      },
      binaryAssets: [sourceAsset, existingDisplayAsset]
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(sourceAsset);
    expect(result[1]).toEqual({
      ...existingDisplayAsset,
      mimeType: "image/webp",
      byteLength: 6,
      dataUrl: "data:image/webp;base64,QUJDRA=="
    });

    const repeated = ensureDurablePagePreviewAssets({
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          displayAssetId: "asset-display-1"
        }
      ],
      pagePreviewDataUrls: {
        "page-1": "data:image/webp;base64,QUJDRA=="
      },
      binaryAssets: result
    });

    expect(repeated).toBe(result);
  });

  it("creates a deterministic display asset when an imported page has no asset record", () => {
    expect(
      ensureDurablePagePreviewAssets({
        pages: [{ id: "page-2", documentId: "doc-1" }],
        pagePreviewDataUrls: {
          "page-2": "data:image/png;base64,QUJD"
        },
        binaryAssets: []
      })
    ).toEqual([
      {
        id: "asset-display-page-2",
        documentId: "doc-1",
        pageId: "page-2",
        kind: "display",
        mimeType: "image/png",
        byteLength: 3,
        dataUrl: "data:image/png;base64,QUJD"
      }
    ]);
  });

  it("does not overwrite an answer crop that happens to use the same page id", () => {
    const answerAsset = {
      id: "matched-answer-1",
      documentId: "doc-1",
      pageId: "page-2",
      kind: "display" as const,
      mimeType: "image/png",
      byteLength: 12,
      dataUrl: "data:image/png;base64,answer-crop"
    };

    const result = ensureDurablePagePreviewAssets({
      pages: [{ id: "page-2", documentId: "doc-1" }],
      pagePreviewDataUrls: {
        "page-2": "data:image/png;base64,full-page"
      },
      binaryAssets: [answerAsset]
    });

    expect(result[0]).toBe(answerAsset);
    expect(result[1]).toMatchObject({
      id: "asset-display-page-2",
      pageId: "page-2",
      kind: "display",
      dataUrl: "data:image/png;base64,full-page"
    });
  });
});
