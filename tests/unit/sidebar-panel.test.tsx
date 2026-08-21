import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastViewport } from "@/components/feedback/toast-viewport";
import { SidebarPanel } from "@/components/layout/sidebar";
import { renderPdfArrayBufferToPagePreviews } from "@/lib/pdf/pdf-renderer";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";

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

describe("sidebar-panel", () => {
  const createDragTransfer = () =>
    ({
      setData: vi.fn(),
      getData: vi.fn(),
      effectAllowed: "move",
      dropEffect: "move"
    }) as unknown as DataTransfer;

  beforeEach(() => {
    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useFolderStore.setState({
      folders: buildInitialFolderTree(),
      setFolders: useFolderStore.getState().setFolders,
      createFolder: useFolderStore.getState().createFolder,
      renameFolder: useFolderStore.getState().renameFolder,
      deleteFolder: useFolderStore.getState().deleteFolder,
      moveFolder: useFolderStore.getState().moveFolder
    });
    useExamStore.setState({
      examLibraryFolders: buildInitialExamLibraryFolders(buildInitialFolderTree()),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      pendingUploadedFullPaperDraft: null,
      hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
      setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
      createExamLibraryFolder: useExamStore.getState().createExamLibraryFolder,
      setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
      upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
      confirmExamDocumentSync: useExamStore.getState().confirmExamDocumentSync,
      setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft,
      setPendingUploadedFullPaperDraft: useExamStore.getState().setPendingUploadedFullPaperDraft,
      updateUploadedPdfPageReviewStatus:
        useExamStore.getState().updateUploadedPdfPageReviewStatus,
      confirmPendingUploadedFullPaperDraft:
        useExamStore.getState().confirmPendingUploadedFullPaperDraft
    });
    useQuestionStore.setState({
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      binaryAssets: [],
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      setBinaryAssets: useQuestionStore.getState().setBinaryAssets,
      appendBinaryAssets: useQuestionStore.getState().appendBinaryAssets,
      purgeSourceAssetsForDocument: useQuestionStore.getState().purgeSourceAssetsForDocument,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      addManualQuestionDraft: useQuestionStore.getState().addManualQuestionDraft,
      removeQuestionDraft: useQuestionStore.getState().removeQuestionDraft,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      moveQuestionToPendingBucket: useQuestionStore.getState().moveQuestionToPendingBucket,
      assignQuestionToDirectory: useQuestionStore.getState().assignQuestionToDirectory,
      rewriteDirectoryPaths: useQuestionStore.getState().rewriteDirectoryPaths,
      reassignQuestionsFromDeletedFolder: useQuestionStore.getState().reassignQuestionsFromDeletedFolder,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      queueQuestionForManualMerge: useQuestionStore.getState().queueQuestionForManualMerge,
      clearManualMergeQueue: useQuestionStore.getState().clearManualMergeQueue,
      executeManualMerge: useQuestionStore.getState().executeManualMerge,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
    useToastStore.setState({
      toasts: [],
      pushToast: useToastStore.getState().pushToast,
      dismissToast: useToastStore.getState().dismissToast,
      clearToasts: useToastStore.getState().clearToasts
    });
    useWorkbenchStore.getState().resetTransientProgress();
    vi.restoreAllMocks();
  });

  it("shows an empty state before any file is uploaded", () => {
    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(
      screen.getByText("上传 PDF 或图片后，这里会按文件和页码展示待处理内容。")
    ).toBeInTheDocument();
  });

  it("renders document pages and lets the user switch the selected page", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"]
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByText("高数试卷.pdf")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "第 1 页" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "第 2 页" }));

    expect(useFileStore.getState().selectedPageId).toBe("page-2");
    expect(screen.getByRole("button", { name: "第 2 页" })).toHaveAttribute("aria-pressed", "true");
  }, 10000);

  it("deletes one uploaded file from the left file list and clears its question artifacts", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "高数试卷.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"]
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewUrls: {
        "page-1": "blob:page-1"
      },
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,page-1"
      },
      binaryAssets: [
        {
          id: "asset-doc-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 1024
        }
      ],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["我的题库", "高中数学", "函数"],
          directoryCandidatePaths: [],
          ocrText: "题目 1",
          lastBulkConfirmationId: null
        }
      ],
      selectedQuestionId: "q-1"
    });
    useWorkbenchStore.getState().setClassificationRunMessage("已生成 138 条分类结果");
    useWorkbenchStore.getState().setClassificationRunProgress({
      status: "done",
      ocrCurrent: 2,
      ocrTotal: 2,
      classificationCurrent: 138,
      classificationTotal: 138,
      message: "Classification results applied"
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "删除文件-高数试卷.pdf" }));

    expect(useFileStore.getState().documents).toEqual([]);
    expect(useFileStore.getState().pages).toEqual([]);
    expect(useFileStore.getState().selectedPageId).toBeNull();
    expect(useQuestionStore.getState().questionDrafts).toEqual([]);
    expect(useQuestionStore.getState().binaryAssets).toEqual([]);
    expect(useQuestionStore.getState().pagePreviewUrls).toEqual({});
    expect(useQuestionStore.getState().selectedQuestionId).toBeNull();
    expect(useWorkbenchStore.getState().classificationRunMessage).toBeNull();
    expect(useWorkbenchStore.getState().classificationRunProgress).toMatchObject({
      status: "idle",
      classificationCurrent: 0,
      classificationTotal: 0
    });
    expect(screen.getByRole("status")).toHaveTextContent("已删除文件：高数试卷.pdf");
  });

  it("keeps a library-referenced question, page, and durable preview when deleting its source file", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-library-source",
          name: "力学专题.pdf",
          kind: "pdf",
          status: "import_ready",
          pageIds: ["page-library-1"]
        }
      ],
      pages: [
        {
          id: "page-library-1",
          documentId: "doc-library-source",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          displayAssetId: "asset-library-display",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: "page-library-1",
      uploadQueue: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-library-1": "data:image/png;base64,transient"
      },
      binaryAssets: [
        {
          id: "asset-library-display",
          documentId: "doc-library-source",
          pageId: "page-library-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 1024
        },
        {
          id: "asset-library-source",
          documentId: "doc-library-source",
          pageId: "page-library-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        },
        {
          id: "asset-library-question-crop",
          documentId: "doc-library-source",
          pageId: "page-library-1",
          kind: "question_crop",
          mimeType: "image/png",
          byteLength: 8192
        }
      ],
      questionDrafts: [
        {
          id: "q-library-1",
          documentId: "doc-library-source",
          pageIds: ["page-library-1"],
          primaryPageId: "page-library-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-library-1": { x: 100, y: 120, width: 900, height: 320 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.9,
          directoryPath: ["我的题库", "高中物理", "曲线运动", "斜面平抛模型"],
          directoryCandidatePaths: [],
          ocrText: "斜面平抛题",
          questionImageAttachments: [
            {
              id: "question-image-library-1",
              assetId: "asset-library-question-crop",
              pageId: "page-library-1",
              pixelWidth: 2100,
              pixelHeight: 760,
              renderDpi: 300,
              version: 1
            }
          ],
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "paper-library-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "斜面平抛模型专题卷",
          subjectScope: "高中物理",
          groupId: "group-library-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-library-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SidebarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "删除文件-力学专题.pdf" }));

    expect(useFileStore.getState().documents).toEqual([]);
    expect(useFileStore.getState().pages.map((page) => page.id)).toEqual(["page-library-1"]);
    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
      "q-library-1"
    ]);
    expect(useQuestionStore.getState().binaryAssets.map((asset) => asset.id)).toEqual([
      "asset-library-display",
      "asset-library-question-crop"
    ]);
    expect(useQuestionStore.getState().binaryAssets[0]?.dataUrl).toBe(
      "data:image/png;base64,transient"
    );
    expect(useQuestionStore.getState().pagePreviewDataUrls).toEqual({});
  });

  it("keeps imported questions that are not yet referenced by a specialized document", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-imported-source",
          name: "已入库试题.pdf",
          kind: "pdf",
          status: "source_purged",
          pageIds: ["page-imported-1"]
        }
      ],
      pages: [
        {
          id: "page-imported-1",
          documentId: "doc-imported-source",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: "page-imported-1",
      uploadQueue: []
    });
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      pagePreviewDataUrls: {
        "page-imported-1": "data:image/png;base64,imported-page"
      },
      binaryAssets: [],
      questionDrafts: [
        {
          id: "q-imported-1",
          documentId: "doc-imported-source",
          pageIds: ["page-imported-1"],
          primaryPageId: "page-imported-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-imported-1": { x: 100, y: 120, width: 900, height: 320 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.9,
          directoryPath: ["我的题库", "高中物理", "曲线运动", "斜面平抛模型"],
          directoryCandidatePaths: [],
          ocrText: "已入库但尚未生成专题卷的题目",
          lastBulkConfirmationId: null
        }
      ]
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SidebarPanel />);
    fireEvent.click(screen.getByRole("button", { name: "删除文件-已入库试题.pdf" }));

    expect(useFileStore.getState().documents).toEqual([]);
    expect(useFileStore.getState().pages.map((page) => page.id)).toEqual(["page-imported-1"]);
    expect(useQuestionStore.getState().questionDrafts.map((question) => question.id)).toEqual([
      "q-imported-1"
    ]);
    expect(useQuestionStore.getState().binaryAssets).toEqual([
      expect.objectContaining({
        id: "asset-display-page-imported-1",
        pageId: "page-imported-1",
        dataUrl: "data:image/png;base64,imported-page"
      })
    ]);
  });

  it("renders custom folders created under a subject root", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    useFolderStore.getState().createFolder(parent!.id, "函数");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByText("函数")).toBeInTheDocument();
  });

  it("links custom folders to their folder view page", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const created = useFolderStore.getState().createFolder(parent!.id, "函数");

    expect(created).toBeTruthy();

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByRole("link", { name: "函数" })).toHaveAttribute("href", `/folder/${created!.id}`);
  });

  it("lets the user create a folder under a specific subject root from that subject card", () => {
    vi.spyOn(window, "prompt").mockReturnValue("力学");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "新增子目录-高中物理" }));

    expect(
      useFolderStore.getState().folders.some(
        (folder) =>
          folder.name === "力学" &&
          folder.path.join(" / ") === "我的题库 / 高中物理 / 力学"
      )
    ).toBe(true);
  });

  it("uploads a pdf directly from a subject root and binds that subject to the document", async () => {
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    const file = new File(["%PDF-1.4"], "高数试卷.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn(async () => new ArrayBuffer(16))
    });

    fireEvent.change(screen.getByLabelText("上传到高中数学"), {
      target: {
        files: [file]
      }
    });

    await waitFor(() => {
      expect(useFileStore.getState().documents).toHaveLength(1);
    });

    expect(useFileStore.getState().documents[0]).toMatchObject({
      name: "高数试卷.pdf",
      subjectScope: "高中数学",
      status: "pages_ready"
    });
    expect(
      useQuestionStore
        .getState()
        .binaryAssets.find((asset) => asset.kind === "source")?.dataUrl
    ).toMatch(/^data:application\/pdf;base64,/);
  });

  it("renders and manages deeper custom folder levels recursively", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const level2 = useFolderStore.getState().createFolder(parent!.id, "函数");
    const level3 = useFolderStore.getState().createFolder(level2!.id, "二次函数");
    const level4 = useFolderStore.getState().createFolder(level3!.id, "图像变换");

    expect(level4).toBeTruthy();

    vi.spyOn(window, "prompt").mockReturnValue("顶点法");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByText("图像变换")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新增子目录-图像变换" }));

    expect(screen.getByText("顶点法")).toBeInTheDocument();
  });

  it("shows expand controls with folder icons for subject and nested folders", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const level2 = useFolderStore.getState().createFolder(parent!.id, "函数");
    useFolderStore.getState().createFolder(level2!.id, "二次函数");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    const subjectToggle = screen.getByRole("button", { name: "折叠目录-高中数学" });
    const nestedFolderToggle = screen.getByRole("button", { name: "折叠目录-函数" });

    expect(subjectToggle).toHaveTextContent("▾");
    expect(subjectToggle.parentElement).toHaveTextContent("📂");
    expect(nestedFolderToggle).toHaveTextContent("▾");
    expect(nestedFolderToggle.parentElement).toHaveTextContent("📂");
  });

  it("collapses and expands nested folder branches", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const level2 = useFolderStore.getState().createFolder(parent!.id, "函数");
    useFolderStore.getState().createFolder(level2!.id, "二次函数");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByText("二次函数")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "折叠目录-函数" }));

    expect(screen.queryByText("二次函数")).not.toBeInTheDocument();
    const collapsedToggle = screen.getByRole("button", { name: "展开目录-函数" });

    expect(collapsedToggle).toHaveTextContent("▸");
    expect(collapsedToggle.parentElement).toHaveTextContent("📁");

    fireEvent.click(screen.getByRole("button", { name: "展开目录-函数" }));

    expect(screen.getByText("二次函数")).toBeInTheDocument();
  });

  it("shows inclusive question count badges for subject and custom folders", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(math).toBeTruthy();

    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-count-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: functions!.path,
        directoryCandidatePaths: [],
        ocrText: "函数题目",
        lastBulkConfirmationId: null
      },
      {
        id: "q-count-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 20, y: 30, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.9,
        directoryPath: quadratic!.path,
        directoryCandidatePaths: [],
        ocrText: "二次函数题目",
        lastBulkConfirmationId: null
      }
    ]);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByLabelText("目录题目数-高中数学")).toHaveTextContent("2");
    expect(screen.getByLabelText("目录题目数-函数")).toHaveTextContent("2");
    expect(screen.getByLabelText("目录题目数-二次函数")).toHaveTextContent("1");
  });

  it("renders the library root like a folder node with an inclusive count badge", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(math).toBeTruthy();

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-root-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: math!.path,
        directoryCandidatePaths: [],
        ocrText: "学科根目录题目",
        lastBulkConfirmationId: null
      }
    ]);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    expect(screen.getByText("我的题库").parentElement).toHaveTextContent("📂");
    expect(screen.getByLabelText("目录题目数-我的题库")).toHaveTextContent("1");
  });

  it("renames a custom folder from the sidebar", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const created = useFolderStore.getState().createFolder(parent!.id, "函数");

    expect(created).toBeTruthy();

    vi.spyOn(window, "prompt").mockReturnValue("代数");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "重命名目录-函数" }));

    expect(screen.getByText("代数")).toBeInTheDocument();
    expect(useFolderStore.getState().folders.some((folder) => folder.name === "函数")).toBe(false);
  });

  it("syncs exam-library folder names and default specialized document titles after renaming a custom folder", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const chapter = useFolderStore.getState().createFolder(parent!.id, "函数");
    const leaf = useFolderStore.getState().createFolder(chapter!.id, "二次函数");

    expect(chapter).toBeTruthy();
    expect(leaf).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: buildInitialExamLibraryFolders(useFolderStore.getState().folders),
      examLibraryDocuments: createDefaultSpecializedDocuments({
        folder: buildInitialExamLibraryFolders(useFolderStore.getState().folders).find(
          (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf!.id
        )!,
        subjectScope: leaf!.subjectScope
      })
    });

    vi.spyOn(window, "prompt").mockReturnValue("代数");

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "重命名目录-函数" }));

    const renamedChapter = useFolderStore.getState().folders.find((folder) => folder.name === "代数");
    const renamedLeaf = useFolderStore
      .getState()
      .folders.find((folder) => folder.name === "二次函数" && folder.parentId === renamedChapter?.id);

    expect(renamedChapter).toBeTruthy();
    expect(renamedLeaf).toBeTruthy();

    expect(
      useExamStore
        .getState()
        .examLibraryFolders.find(
          (folder) =>
            folder.library === "specialized" &&
            folder.linkedQuestionFolderId === renamedChapter!.id
        )
    ).toMatchObject({
      name: "代数",
      path: ["专题卷库", "高中数学", "代数"]
    });
    expect(
      useExamStore
        .getState()
        .examLibraryFolders.find(
          (folder) =>
            folder.library === "specialized" &&
            folder.linkedQuestionFolderId === renamedLeaf!.id
        )
    ).toMatchObject({
      path: ["专题卷库", "高中数学", "代数", "二次函数"]
    });
    expect(
      useExamStore
        .getState()
        .examLibraryFolders.some(
          (folder) =>
            folder.library === "specialized" &&
            (folder.linkedQuestionFolderId === chapter!.id || folder.linkedQuestionFolderId === leaf!.id)
        )
    ).toBe(false);
    expect(
      useExamStore.getState().examLibraryDocuments.every(
        (document) => document.folderId === `specialized--${renamedLeaf!.id}`
      )
    ).toBe(true);
    expect(useExamStore.getState().examLibraryDocuments.map((document) => document.title)).toEqual([
      "二次函数专题卷",
      "二次函数空白讲义",
      "二次函数主讲义",
      "二次函数答案"
    ]);
  });

  it("deletes a custom folder from the sidebar after two confirmations and reassigns affected questions", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const created = useFolderStore.getState().createFolder(parent!.id, "函数");

    expect(created).toBeTruthy();

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数"],
        directoryCandidatePaths: [],
        ocrText: "题目 1",
        lastBulkConfirmationId: null
      }
    ]);

    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "删除目录-函数" }));

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("函数")).not.toBeInTheDocument();
    expect(useQuestionStore.getState().questionDrafts[0].directoryPath).toEqual([
      "我的题库",
      "未分类"
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("文件夹已删除，1 道题已移至未分类");
  });

  it("removes mirrored exam-library folders, documents, and workspace selection after deleting a third-level folder", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const chapter = useFolderStore.getState().createFolder(parent!.id, "函数");
    const leaf = useFolderStore.getState().createFolder(chapter!.id, "二次函数");

    expect(chapter).toBeTruthy();
    expect(leaf).toBeTruthy();

    const initialExamLibraryFolders = buildInitialExamLibraryFolders(useFolderStore.getState().folders);
    const specializedLeaf = initialExamLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf!.id
    );
    const defaultDocuments = createDefaultSpecializedDocuments({
      folder: specializedLeaf!,
      subjectScope: specializedLeaf!.subjectScope
    });

    expect(specializedLeaf).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: initialExamLibraryFolders,
      examLibraryDocuments: defaultDocuments,
      examWorkspaceDraft: {
        ...useExamStore.getState().examWorkspaceDraft,
        selectedFolderId: specializedLeaf!.id,
        selectedDocumentId: defaultDocuments[0].id
      }
    });

    vi.spyOn(window, "confirm").mockReturnValueOnce(true).mockReturnValueOnce(true);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "删除目录-二次函数" }));

    expect(
      useExamStore
        .getState()
        .examLibraryFolders.some(
          (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf!.id
        )
    ).toBe(false);
    expect(useExamStore.getState().examLibraryDocuments).toEqual([]);
    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedFolderId: null,
      selectedDocumentId: null
    });
  });

  it("shows a blue drop hint and moves a folder onto another folder while rewriting question paths", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");
    const physics = useFolderStore.getState().folders.find((folder) => folder.name === "高中物理");

    expect(math).toBeTruthy();
    expect(physics).toBeTruthy();

    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");
    const mechanics = useFolderStore.getState().createFolder(physics!.id, "力学");

    expect(functions).toBeTruthy();
    expect(quadratic).toBeTruthy();
    expect(mechanics).toBeTruthy();

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-move-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: ["我的题库", "高中数学", "函数", "二次函数"],
        directoryCandidatePaths: [["我的题库", "高中数学", "函数", "二次函数"]],
        ocrText: "题目 1",
        lastBulkConfirmationId: null
      }
    ]);

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    const dataTransfer = createDragTransfer();
    const sourceFolder = screen.getByTestId("folder-drop-zone-函数");
    const targetFolder = screen.getByTestId("folder-drop-zone-力学");

    fireEvent.dragStart(sourceFolder, { dataTransfer });
    fireEvent.dragOver(targetFolder, { dataTransfer });

    expect(screen.getByTestId("folder-drop-indicator-力学")).toBeInTheDocument();

    fireEvent.drop(targetFolder, { dataTransfer });

    expect(screen.queryByTestId("folder-drop-indicator-力学")).not.toBeInTheDocument();
    expect(useFolderStore.getState().folders.find((folder) => folder.name === "函数")).toMatchObject({
      parentId: mechanics!.id,
      path: ["我的题库", "高中物理", "力学", "函数"]
    });
    expect(useFolderStore.getState().folders.find((folder) => folder.name === "二次函数")).toMatchObject({
      path: ["我的题库", "高中物理", "力学", "函数", "二次函数"]
    });
    expect(useQuestionStore.getState().questionDrafts[0]).toMatchObject({
      directoryPath: ["我的题库", "高中物理", "力学", "函数", "二次函数"],
      directoryCandidatePaths: [["我的题库", "高中物理", "力学", "函数", "二次函数"]]
    });
  });

  it("syncs exam-library folders and default specialized documents after moving a third-level folder", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(math).toBeTruthy();

    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const geometry = useFolderStore.getState().createFolder(math!.id, "几何");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");

    expect(functions).toBeTruthy();
    expect(geometry).toBeTruthy();
    expect(quadratic).toBeTruthy();

    const initialExamLibraryFolders = buildInitialExamLibraryFolders(useFolderStore.getState().folders);
    const specializedLeaf = initialExamLibraryFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === quadratic!.id
    );

    expect(specializedLeaf).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: initialExamLibraryFolders,
      examLibraryDocuments: createDefaultSpecializedDocuments({
        folder: specializedLeaf!,
        subjectScope: specializedLeaf!.subjectScope
      }),
      examWorkspaceDraft: {
        ...useExamStore.getState().examWorkspaceDraft,
        selectedFolderId: specializedLeaf!.id
      }
    });

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    const dataTransfer = createDragTransfer();
    const sourceFolder = screen.getByTestId("folder-drop-zone-二次函数");
    const targetFolder = screen.getByTestId("folder-drop-zone-几何");

    fireEvent.dragStart(sourceFolder, { dataTransfer });
    fireEvent.dragOver(targetFolder, { dataTransfer });
    fireEvent.drop(targetFolder, { dataTransfer });

    const movedQuadratic = useFolderStore
      .getState()
      .folders.find((folder) => folder.name === "二次函数" && folder.parentId === geometry!.id);

    expect(movedQuadratic).toBeTruthy();
    expect(
      useExamStore
        .getState()
        .examLibraryFolders.find(
          (folder) =>
            folder.library === "specialized" &&
            folder.linkedQuestionFolderId === movedQuadratic!.id
        )
    ).toMatchObject({
      path: ["专题卷库", "高中数学", "几何", "二次函数"]
    });
    expect(
      useExamStore
        .getState()
        .examLibraryFolders.some(
          (folder) =>
            folder.library === "specialized" && folder.linkedQuestionFolderId === quadratic!.id
        )
    ).toBe(false);
    expect(
      useExamStore.getState().examLibraryDocuments.every(
        (document) => document.folderId === `specialized--${movedQuadratic!.id}`
      )
    ).toBe(true);
    expect(useExamStore.getState().examWorkspaceDraft.selectedFolderId).toBe(
      `specialized--${movedQuadratic!.id}`
    );
  });

  it("does not allow moving a folder into its own descendant", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(math).toBeTruthy();

    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");

    expect(functions).toBeTruthy();
    expect(quadratic).toBeTruthy();

    render(
      <>
        {createElement(SidebarPanel)}
        <ToastViewport />
      </>
    );

    const dataTransfer = createDragTransfer();
    const sourceFolder = screen.getByTestId("folder-drop-zone-函数");
    const targetFolder = screen.getByTestId("folder-drop-zone-二次函数");

    fireEvent.dragStart(sourceFolder, { dataTransfer });
    fireEvent.dragOver(targetFolder, { dataTransfer });

    expect(screen.queryByTestId("folder-drop-indicator-二次函数")).not.toBeInTheDocument();

    fireEvent.drop(targetFolder, { dataTransfer });

    expect(useFolderStore.getState().folders.find((folder) => folder.id === functions!.id)).toMatchObject({
      path: ["我的题库", "高中数学", "函数"]
    });
    expect(useFolderStore.getState().folders.find((folder) => folder.id === quadratic!.id)).toMatchObject({
      path: ["我的题库", "高中数学", "函数", "二次函数"]
    });
  });
});
