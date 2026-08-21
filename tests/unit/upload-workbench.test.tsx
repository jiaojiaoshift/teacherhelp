import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UploadWorkbench } from "@/components/upload/upload-workbench";
import { SUBJECT_SCOPES } from "@/lib/domain/enums";
import { renderPdfBlobToPagePreviews } from "@/lib/pdf/pdf-renderer";
import {
  prepareAiPreviewBlob,
  prepareAiPreviewDataUrl
} from "@/lib/services/ai-image-preview-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/services/upload-capacity";

vi.mock("@/lib/pdf/pdf-renderer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/pdf-renderer")>(
    "@/lib/pdf/pdf-renderer"
  );

  return {
    ...actual,
    renderPdfBlobToPagePreviews: vi.fn()
  };
});

vi.mock("@/lib/services/ai-image-preview-service", () => ({
  prepareAiPreviewBlob: vi.fn(async (blob: Blob) => blob),
  prepareAiPreviewDataUrl: vi.fn(async (dataUrl: string) => `compressed:${dataUrl}`)
}));

describe("upload-workbench", () => {
  beforeEach(() => {
    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      binaryAssets: [],
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      setBinaryAssets: useQuestionStore.getState().setBinaryAssets,
      appendBinaryAssets: useQuestionStore.getState().appendBinaryAssets,
      purgeSourceAssetsForDocument: useQuestionStore.getState().purgeSourceAssetsForDocument
    });
    vi.restoreAllMocks();
    vi.mocked(prepareAiPreviewDataUrl).mockImplementation(
      async (dataUrl: string) => `compressed:${dataUrl}`
    );
    vi.mocked(prepareAiPreviewBlob).mockImplementation(async (blob: Blob) => blob);
  });

  it("passes the uploaded PDF Blob to the renderer without materializing its ArrayBuffer", async () => {
    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(createElement(UploadWorkbench));

    const file = new File(["%PDF-1.4"], "large-source.pdf", {
      type: "application/pdf"
    });
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer").mockRejectedValue(
      new Error("The upload path must not materialize the complete PDF")
    );

    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨鏂囦欢/), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(renderPdfBlobToPagePreviews).toHaveBeenCalledWith(file, expect.any(Object));
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("creates multi-page preview records for uploaded pdf files", async () => {
    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" }),
        textLines: [
          {
            text: "1. 第一题",
            normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
          }
        ]
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:page-1")
      .mockReturnValueOnce("blob:page-2");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(createElement(UploadWorkbench));

    fireEvent.change(screen.getByRole("combobox"), {
      target: {
        value: SUBJECT_SCOPES[0]
      }
    });

    const file = new File(["%PDF-1.4"], "sample.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨鏂囦欢/), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    const [document] = useFileStore.getState().documents;

    expect(document.pageIds).toHaveLength(2);
    expect(document.status).toBe("pages_ready");
    expect(document.subjectScope).toBe(SUBJECT_SCOPES[0]);
    expect(document.answerSection).toMatchObject({
      status: "suggested",
      hasAnswerSection: true,
      suggestedSplitPage: 2,
      confirmedSplitPage: null
    });
    expect(useFileStore.getState().pages).toHaveLength(2);
    expect(useFileStore.getState().pages[0].textLines).toEqual([
      {
        text: "1. 第一题",
        normalizedBBox: { x1: 80, y1: 120, x2: 920, y2: 160 }
      }
    ]);
    expect(Object.keys(useQuestionStore.getState().pagePreviewUrls)).toHaveLength(2);
    expect(
      useQuestionStore
        .getState()
        .binaryAssets.filter((asset) => asset.documentId === document.id && asset.kind === "source")
    ).toHaveLength(1);
    const durableDisplayAssets = useQuestionStore
      .getState()
      .binaryAssets.filter(
        (asset) => asset.documentId === document.id && asset.kind === "display"
      );
    expect(durableDisplayAssets).toHaveLength(2);
    expect(durableDisplayAssets.map((asset) => asset.dataUrl)).toEqual([
      "compressed:data:image/png;base64,cGFnZS0x",
      "compressed:data:image/png;base64,cGFnZS0y"
    ]);
    expect(useFileStore.getState().selectedPageId).toBe(document.pageIds[0]);
  });

  it("stores the MIME type produced by PDF preview compression", async () => {
    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["raw-png"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue(
      "data:image/jpeg;base64,anBlZw=="
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(createElement(UploadWorkbench));

    const file = new File(["%PDF-1.4"], "compressed-preview.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨鏂囦欢/), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    const displayAsset = useQuestionStore
      .getState()
      .binaryAssets.find((asset) => asset.kind === "display");

    expect(displayAsset?.mimeType).toBe("image/jpeg");
    expect(displayAsset?.blob?.type).toBe("image/jpeg");
  });

  it("compresses a large rendered page as a Blob before creating its Data URL", async () => {
    const rawPageBlob = new Blob([new Uint8Array(300_001)], { type: "image/png" });
    const compressedPageBlob = new Blob(["jpeg"], { type: "image/jpeg" });

    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: rawPageBlob
      }
    ]);
    vi.mocked(prepareAiPreviewBlob).mockResolvedValue(compressedPageBlob);
    vi.mocked(prepareAiPreviewBlob).mockClear();
    vi.mocked(prepareAiPreviewDataUrl).mockClear();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(createElement(UploadWorkbench));

    const file = new File(["%PDF-1.4"], "large-page.pdf", {
      type: "application/pdf"
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });
    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨鏂囦欢/), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(prepareAiPreviewBlob).toHaveBeenCalledWith(rawPageBlob);
    expect(prepareAiPreviewDataUrl).not.toHaveBeenCalled();
    expect(
      useQuestionStore.getState().binaryAssets.find((asset) => asset.kind === "display")
    ).toMatchObject({
      mimeType: "image/jpeg",
      byteLength: compressedPageBlob.size,
      blob: compressedPageBlob
    });
  });

  it("imports files dropped onto the upload zone", async () => {
    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(createElement(UploadWorkbench));

    const file = new File(["%PDF-1.4"], "dropped.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.drop(screen.getByRole("region"), {
      dataTransfer: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(useFileStore.getState().documents[0]).toMatchObject({
      name: "dropped.pdf",
      subjectScope: SUBJECT_SCOPES[0]
    });
  });

  it("requests an answer-section suggestion for uploaded pdf files", async () => {
    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:page-1")
      .mockReturnValueOnce("blob:page-2");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 2
        }
      })
    } as Response);

    render(createElement(UploadWorkbench));

    const file = new File(["%PDF-1.4"], "split-source.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨鏂囦欢/), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents[0]?.answerSection?.suggestedSplitPage).toBe(2);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/ai/suggest-answer-section");

    const requestInit = fetchSpy.mock.calls[0][1];
    const requestBody = JSON.parse(String(requestInit?.body));

    expect(requestBody.pageCount).toBe(2);
    expect(requestBody.pageImageDataUrls).toEqual([
      "compressed:data:image/png;base64,cGFnZS0x",
      "compressed:data:image/png;base64,cGFnZS0y"
    ]);
  });

  it("keeps a 400-page upload bounded to representative answer-section samples", async () => {
    vi.mocked(renderPdfBlobToPagePreviews).mockResolvedValue(
      Array.from({ length: 400 }, (_, index) => ({
        pageNumber: index + 1,
        width: 1200,
        height: 1600,
        blob: new Blob([`page-${index + 1}`], { type: "image/png" })
      }))
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 300
        }
      })
    } as Response);

    render(createElement(UploadWorkbench));

    const file = new File(["%PDF-1.4"], "large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: MAX_UPLOAD_FILE_BYTES
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨文件|閫夋嫨鏂囦欢/), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    const requestBody = JSON.parse(
      String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body)
    );

    expect(requestBody.pageCount).toBe(400);
    expect(requestBody.pageImageDataUrls).toHaveLength(12);
    expect(requestBody.sampledPageNumbers).toHaveLength(12);
    expect(requestBody.sampledPageNumbers[0]).toBe(1);
    expect(requestBody.sampledPageNumbers.at(-1)).toBe(400);
  });

  it("rejects an oversized file before reading or rendering it", async () => {
    const renderSpy = vi.mocked(renderPdfBlobToPagePreviews);
    renderSpy.mockClear();
    const file = new File(["%PDF-1.4"], "too-large.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: MAX_UPLOAD_FILE_BYTES + 1
    });
    const arrayBufferSpy = vi.fn(async () => new ArrayBuffer(16));
    Object.defineProperty(file, "arrayBuffer", { value: arrayBufferSpy });

    render(createElement(UploadWorkbench));
    fireEvent.change(screen.getByLabelText(/选择文件|閫夋嫨文件|閫夋嫨鏂囦件/), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(screen.getByText(/超过 512 MiB/)).toBeInTheDocument();
    });
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(useFileStore.getState().documents).toHaveLength(0);
  });
});
