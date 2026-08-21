import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/shell";
import { UploadWorkbench } from "@/components/upload/upload-workbench";
import { renderPdfArrayBufferToPagePreviews } from "@/lib/pdf/pdf-renderer";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

vi.mock("@/lib/pdf/pdf-renderer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/pdf-renderer")>(
    "@/lib/pdf/pdf-renderer"
  );

  const renderPdfMock = vi.fn();

  return {
    ...actual,
    renderPdfArrayBufferToPagePreviews: renderPdfMock,
    renderPdfBlobToPagePreviews: renderPdfMock
  };
});

describe("upload toast workflow", () => {
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
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
    vi.restoreAllMocks();
  });

  it("shows a success toast after a supported upload finishes", async () => {
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { container } = render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <UploadWorkbench />
      </AppShell>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["%PDF-1.4"], "success.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(fileInput!, {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("upload success");
    });
  });

  it("shows an error toast when unsupported files are included", async () => {
    const { container } = render(
      <AppShell aside={<div>aside</div>} sidebar={<div>sidebar</div>}>
        <UploadWorkbench />
      </AppShell>
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(["hello"], "unsupported.txt", { type: "text/plain" });

    fireEvent.change(fileInput!, {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("unsupported file type");
    });
  });
});
