import { describe, expect, it } from "vitest";

import {
  createDocumentShell,
  deriveDisplayAssetFromImageUpload,
  deriveSourceAssetFromUpload,
  derivePageRecordFromImageUpload,
  inferUploadKind,
  sanitizeDocumentName
} from "@/lib/services/ingestion-service";

describe("ingestion-service", () => {
  it("infers supported upload kinds", () => {
    expect(inferUploadKind("paper.pdf")).toBe("pdf");
    expect(inferUploadKind("photo.png")).toBe("image");
    expect(inferUploadKind("photo.jpg")).toBe("image");
    expect(inferUploadKind("photo.jpeg")).toBe("image");
    expect(inferUploadKind("notes.docx")).toBeNull();
  });

  it("sanitizes document names by trimming duplicate spaces", () => {
    expect(sanitizeDocumentName("  高一   物理  周测.pdf  ")).toBe("高一 物理 周测.pdf");
  });

  it("creates a temporary uploaded document shell", () => {
    const document = createDocumentShell({
      id: "doc-1",
      name: "高数试卷.pdf",
      kind: "pdf",
      subjectScope: "高等数学"
    });

    expect(document.status).toBe("uploaded_temp");
    expect(document.pageIds).toEqual([]);
    expect(document.subjectScope).toBe("高等数学");
  });

  it("derives a single page record for direct image uploads", () => {
    const page = derivePageRecordFromImageUpload({
      documentId: "doc-1",
      pageId: "page-1",
      width: 1200,
      height: 1600,
      displayAssetId: "asset-1"
    });

    expect(page.documentId).toBe("doc-1");
    expect(page.pageNumber).toBe(1);
    expect(page.displayAssetId).toBe("asset-1");
    expect(page.analysisStatus).toBe("idle");
    expect(page.reviewStatus).toBe("unreviewed");
  });

  it("derives a display asset record for image uploads", () => {
    const asset = deriveDisplayAssetFromImageUpload({
      assetId: "asset-1",
      documentId: "doc-1",
      pageId: "page-1",
      mimeType: "image/png",
      byteLength: 2048
    });

    expect(asset.kind).toBe("display");
    expect(asset.pageId).toBe("page-1");
  });

  it("derives a source asset record for the original uploaded file", () => {
    const asset = deriveSourceAssetFromUpload({
      assetId: "asset-source-1",
      documentId: "doc-1",
      pageId: "page-1",
      mimeType: "application/pdf",
      byteLength: 8192
    });

    expect(asset).toMatchObject({
      id: "asset-source-1",
      documentId: "doc-1",
      pageId: "page-1",
      kind: "source",
      mimeType: "application/pdf",
      byteLength: 8192
    });
  });
});
