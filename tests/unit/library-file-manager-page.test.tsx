import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FullLibraryPage from "@/app/library/full/page";
import QuestionsLibraryPage from "@/app/library/questions/page";
import SpecializedLibraryPage from "@/app/library/specialized/page";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";

describe("library file-manager pages", () => {
  beforeEach(() => {
    const folders = buildInitialFolderTree();

    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
    useFolderStore.setState({
      folders
    });
    useQuestionStore.setState({
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      binaryAssets: [],
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    });
    useExamStore.setState({
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      mobileUploadTasks: [],
      pendingUploadedFullPaperDraft: null
    });
  });

  it("renders the question bank as a file-manager page with folders and question files", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");
    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");

    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 3,
          width: 800,
          height: 1100,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewDataUrls: {
        "page-1": "data:image/png;base64,question-preview"
      }
    });

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
        pageLayoutMode: "double_column",
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.91,
        directoryPath: quadratic!.path,
        directoryCandidatePaths: [],
        questionType: "计算题",
        ocrText: "二次函数最值题",
        lastBulkConfirmationId: null
      }
    ]);

    render(<QuestionsLibraryPage />);

    const explorer = screen.getByLabelText("question-library-explorer");
    expect(within(explorer).getByLabelText("library-explorer-toolbar")).toBeInTheDocument();
    expect(within(explorer).getByLabelText("library-explorer-content-grid")).toBeInTheDocument();
    expect(within(explorer).getByRole("button", { name: "上一级" })).toBeDisabled();
    fireEvent.click(within(explorer).getByRole("button", { name: "打开目录-高中数学" }));
    fireEvent.click(within(explorer).getByRole("button", { name: "打开目录-函数" }));
    fireEvent.click(within(explorer).getByRole("button", { name: "下一级" }));

    expect(within(explorer).getByText("我的题库 / 高中数学 / 函数 / 二次函数")).toBeInTheDocument();
    expect(within(explorer).getByText("二次函数最值题")).toBeInTheDocument();
    expect(within(explorer).getByText("计算题")).toBeInTheDocument();
    expect(within(explorer).getByText("双栏题")).toBeInTheDocument();

    fireEvent.click(within(explorer).getByRole("button", { name: "上一级" }));

    expect(within(explorer).getByText("我的题库 / 高中数学 / 函数")).toBeInTheDocument();

    fireEvent.click(within(explorer).getByRole("button", { name: "下一级" }));
    fireEvent.click(within(explorer).getByRole("button", { name: "预览题目-二次函数最值题" }));

    const preview = within(explorer).getByLabelText("library-entry-preview");
    expect(within(preview).getByText("题目预览")).toBeInTheDocument();
    expect(within(preview).getByRole("heading", { name: "二次函数最值题" })).toBeInTheDocument();
    expect(within(preview).getByText("我的题库 / 高中数学 / 函数 / 二次函数")).toBeInTheDocument();
    expect(within(preview).getByText("第 3 页")).toBeInTheDocument();
    expect(within(preview).getByText("双栏题")).toBeInTheDocument();
    const previewImage = within(preview).getByAltText("题目预览-二次函数最值题");
    expect(previewImage).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
    expect(decodeURIComponent(previewImage.getAttribute("src") ?? "")).toContain(
      'viewBox="10 20 100 120"'
    );
  });

  it("renders an archived question preview from its durable display asset", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-archived-1",
          documentId: "doc-archived-1",
          pageNumber: 1,
          width: 800,
          height: 1100,
          displayAssetId: "asset-archived-display-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-archived-display-1",
          documentId: "doc-archived-1",
          pageId: "page-archived-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "data:image/png;base64,archived-question-page"
        }
      ],
      questionDrafts: [
        {
          id: "q-archived-1",
          documentId: "doc-archived-1",
          pageIds: ["page-archived-1"],
          primaryPageId: "page-archived-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-archived-1": { x: 40, y: 60, width: 500, height: 220 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.96,
          directoryPath: ["我的题库"],
          directoryCandidatePaths: [],
          questionType: "选择题",
          ocrText: "归档后的题目",
          lastBulkConfirmationId: null
        }
      ]
    });

    render(<QuestionsLibraryPage />);
    const explorer = screen.getByLabelText("question-library-explorer");
    fireEvent.click(within(explorer).getByRole("button", { name: "预览题目-归档后的题目" }));

    const previewImage = within(explorer).getByAltText("题目预览-归档后的题目");
    expect(previewImage).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
    expect(decodeURIComponent(previewImage.getAttribute("src") ?? "")).toContain(
      "data:image/png;base64,archived-question-page"
    );
  });

  it("prefers a durable high-resolution question crop over the low-resolution page asset", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-hires-1",
          documentId: "doc-hires-1",
          pageNumber: 2,
          width: 1191,
          height: 1684,
          displayAssetId: "asset-low-page-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ]
    });
    useQuestionStore.setState({
      binaryAssets: [
        {
          id: "asset-low-page-1",
          documentId: "doc-hires-1",
          pageId: "page-hires-1",
          kind: "display",
          mimeType: "image/jpeg",
          byteLength: 1024,
          dataUrl: "/api/local-library/asset?id=asset-low-page-1"
        },
        {
          id: "asset-question-crop-hires-1",
          documentId: "doc-hires-1",
          pageId: "page-hires-1",
          kind: "question_crop",
          mimeType: "image/png",
          byteLength: 8192,
          dataUrl: "/api/local-library/asset?id=asset-question-crop-hires-1"
        }
      ],
      questionDrafts: [
        {
          id: "q-hires-1",
          documentId: "doc-hires-1",
          pageIds: ["page-hires-1"],
          primaryPageId: "page-hires-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-hires-1": { x: 100, y: 200, width: 900, height: 400 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryPath: ["我的题库"],
          directoryCandidatePaths: [],
          ocrText: "高清持久题目",
          questionImageAttachments: [
            {
              id: "question-image-hires-1",
              assetId: "asset-question-crop-hires-1",
              pageId: "page-hires-1",
              pixelWidth: 1900,
              pixelHeight: 840,
              renderDpi: 300,
              version: 1
            }
          ]
        }
      ]
    });

    render(<QuestionsLibraryPage />);
    const explorer = screen.getByLabelText("question-library-explorer");
    fireEvent.click(within(explorer).getByRole("button", { name: "预览题目-高清持久题目" }));

    const previewImage = within(explorer).getByAltText("题目预览-高清持久题目");
    expect(previewImage).toHaveAttribute(
      "src",
      "/api/local-library/asset?id=asset-question-crop-hires-1"
    );
    expect(previewImage).toHaveAttribute("data-durable-question-crop", "true");
  });

  it("crops a filesystem-backed question preview without embedding its URL in a data SVG", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-local-1",
          documentId: "doc-local-1",
          pageNumber: 4,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-local-display-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-local-display-1",
          documentId: "doc-local-1",
          pageId: "page-local-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "/api/local-library/asset?id=asset-local-display-1"
        }
      ],
      questionDrafts: [
        {
          id: "q-local-1",
          documentId: "doc-local-1",
          pageIds: ["page-local-1"],
          primaryPageId: "page-local-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-local-1": { x: 50, y: 120, width: 500, height: 280 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryPath: ["我的题库"],
          directoryCandidatePaths: [],
          ocrText: "本机长期题目"
        }
      ]
    });

    render(<QuestionsLibraryPage />);
    const explorer = screen.getByLabelText("question-library-explorer");
    fireEvent.click(within(explorer).getByRole("button", { name: "预览题目-本机长期题目" }));

    const previewImage = within(explorer).getByAltText("题目预览-本机长期题目");
    expect(previewImage).toHaveAttribute(
      "src",
      "/api/local-library/asset?id=asset-local-display-1"
    );
    expect(previewImage).toHaveStyle({
      position: "absolute",
      width: "200%",
      left: "-10%"
    });
    expect(previewImage.parentElement).toHaveStyle({ aspectRatio: "500 / 280" });
  });

  it("renders every persisted fragment of a cross-page question preview", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-cross-1",
          documentId: "doc-cross-1",
          pageNumber: 1,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-cross-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-cross-2",
          documentId: "doc-cross-1",
          pageNumber: 2,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-cross-2",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-cross-1",
          documentId: "doc-cross-1",
          pageId: "page-cross-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "/api/local-library/asset?id=asset-cross-1"
        },
        {
          id: "asset-cross-2",
          documentId: "doc-cross-1",
          pageId: "page-cross-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "/api/local-library/asset?id=asset-cross-2"
        }
      ],
      questionDrafts: [
        {
          id: "q-cross-1",
          documentId: "doc-cross-1",
          pageIds: ["page-cross-1", "page-cross-2"],
          primaryPageId: "page-cross-1",
          localOrder: 1,
          globalOrder: 2,
          bboxByPage: {
            "page-cross-1": { x: 80, y: 900, width: 820, height: 420 },
            "page-cross-2": { x: 80, y: 80, width: 820, height: 260 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: "merge-cross-1",
          classificationStatus: "confirmed",
          directoryPath: ["我的题库"],
          directoryCandidatePaths: [],
          ocrText: "跨页圆周运动题"
        }
      ]
    });

    render(<QuestionsLibraryPage />);
    const explorer = screen.getByLabelText("question-library-explorer");
    fireEvent.click(within(explorer).getByRole("button", { name: "预览题目-跨页圆周运动题" }));

    expect(within(explorer).getByAltText("题目预览-跨页圆周运动题-第1页")).toHaveAttribute(
      "src",
      "/api/local-library/asset?id=asset-cross-1"
    );
    expect(within(explorer).getByAltText("题目预览-跨页圆周运动题-第2页")).toHaveAttribute(
      "src",
      "/api/local-library/asset?id=asset-cross-2"
    );
    expect(within(explorer).getByText("第 1-2 页")).toBeInTheDocument();
  });

  it("clears all question files only after explicit confirmation", () => {
    useQuestionStore.setState({
      questionDrafts: [
        {
          id: "q-clear-1",
          documentId: "doc-clear-1",
          pageIds: ["page-clear-1"],
          primaryPageId: "page-clear-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-clear-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.91,
          directoryPath: ["我的题库"],
          directoryCandidatePaths: [],
          ocrText: "待清空题目",
          lastBulkConfirmationId: null
        }
      ]
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<QuestionsLibraryPage />);

    const clearButton = screen.getByRole("button", { name: "清空题库（1 道题）" });
    fireEvent.click(clearButton);
    expect(useQuestionStore.getState().questionDrafts).toHaveLength(1);

    fireEvent.click(clearButton);
    expect(useQuestionStore.getState().questionDrafts).toEqual([]);
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    confirmSpy.mockRestore();
  });

  it("renders the specialized paper library as a separate file-manager page", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-specialized-1",
          documentId: "doc-specialized-1",
          pageNumber: 2,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-specialized-page-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-specialized-page-1",
          documentId: "doc-specialized-1",
          pageId: "page-specialized-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "data:image/png;base64,specialized-question-page"
        }
      ],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-specialized-1",
          pageIds: ["page-specialized-1"],
          primaryPageId: "page-specialized-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-specialized-1": { x: 120, y: 160, width: 720, height: 260 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.92,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["我的题库", "高中数学", "函数"],
          directoryCandidatePaths: [],
          questionType: "解答题",
          ocrText: "函数单调性综合题",
          questionNumberLabel: "1",
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "specialized-paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "函数专题卷",
          subjectScope: "高中数学",
          groupId: "group-specialized-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<SpecializedLibraryPage />);

    const explorer = screen.getByLabelText("specialized-library-explorer");
    const toolbar = within(explorer).getByLabelText("library-explorer-toolbar");

    expect(within(explorer).getByText("专题卷库")).toBeInTheDocument();
    expect(within(toolbar).getByRole("button", { name: "上一级" })).toBeDisabled();
    expect(within(toolbar).getByRole("button", { name: "下一级" })).toBeEnabled();
    expect(within(explorer).getByRole("button", { name: "打开目录-高中数学" })).toBeInTheDocument();
    expect(within(explorer).getByText("函数专题卷")).toBeInTheDocument();
    expect(within(explorer).getByText("试卷")).toBeInTheDocument();

    fireEvent.click(within(explorer).getByRole("button", { name: "预览卷子-函数专题卷" }));

    const preview = within(explorer).getByLabelText("library-entry-preview");
    expect(within(preview).getByText("卷子预览")).toBeInTheDocument();
    expect(within(preview).getByText("函数专题卷")).toBeInTheDocument();
    expect(within(preview).getByText("专题卷库")).toBeInTheDocument();
    expect(within(preview).getByText("1 道题")).toBeInTheDocument();
    const questionPreviewImage = within(preview).getByAltText("卷内题目预览-函数专题卷-Q1");
    expect(questionPreviewImage).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
    expect(decodeURIComponent(questionPreviewImage.getAttribute("src") ?? "")).toContain(
      'viewBox="120 160 720 260"'
    );
    expect(decodeURIComponent(questionPreviewImage.getAttribute("src") ?? "")).toContain(
      "data:image/png;base64,specialized-question-page"
    );
  });

  it("downloads a specialized paper PDF from the paper preview", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["%PDF-1.4"], { type: "application/pdf" }))
    } as Response);
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:specialized-paper");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "specialized-paper-download",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "静电场专题卷",
          subjectScope: "高中物理",
          groupId: "group-specialized-download",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<SpecializedLibraryPage />);
    const explorer = screen.getByLabelText("specialized-library-explorer");
    fireEvent.click(within(explorer).getByRole("button", { name: "预览卷子-静电场专题卷" }));
    fireEvent.click(within(explorer).getByRole("button", { name: "导出专题卷 PDF" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/local-library/export-specialized-pdf?documentId=specialized-paper-download"
      );
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(anchorClickSpy).toHaveBeenCalled();
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:specialized-paper");
    });

    anchorClickSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    fetchSpy.mockRestore();
  });

  it("renders every persisted fragment of a cross-page question in a specialized paper", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-paper-cross-1",
          documentId: "doc-paper-cross-1",
          pageNumber: 4,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-paper-cross-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-paper-cross-2",
          documentId: "doc-paper-cross-1",
          pageNumber: 5,
          width: 1000,
          height: 1400,
          displayAssetId: "asset-paper-cross-2",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      selectedPageId: null,
      uploadQueue: []
    });
    useQuestionStore.setState({
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-paper-cross-1",
          documentId: "doc-paper-cross-1",
          pageId: "page-paper-cross-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "/api/local-library/asset?id=asset-paper-cross-1"
        },
        {
          id: "asset-paper-cross-2",
          documentId: "doc-paper-cross-1",
          pageId: "page-paper-cross-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 32,
          dataUrl: "/api/local-library/asset?id=asset-paper-cross-2"
        }
      ],
      questionDrafts: [
        {
          id: "q-paper-cross-1",
          documentId: "doc-paper-cross-1",
          pageIds: ["page-paper-cross-1", "page-paper-cross-2"],
          primaryPageId: "page-paper-cross-1",
          localOrder: 1,
          globalOrder: 8,
          bboxByPage: {
            "page-paper-cross-1": { x: 80, y: 920, width: 820, height: 380 },
            "page-paper-cross-2": { x: 80, y: 80, width: 820, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.95,
          crossPageGroupId: "merge-paper-cross-1",
          classificationStatus: "confirmed",
          directoryPath: ["我的题库"],
          directoryCandidatePaths: [],
          ocrText: "专题卷跨页题",
          questionNumberLabel: "8"
        }
      ]
    });
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "specialized-paper-cross-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "跨页专题卷",
          subjectScope: "高中物理",
          groupId: "group-specialized-cross-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-paper-cross-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<SpecializedLibraryPage />);
    const explorer = screen.getByLabelText("specialized-library-explorer");
    fireEvent.click(within(explorer).getByRole("button", { name: "预览卷子-跨页专题卷" }));

    expect(
      within(explorer).getByAltText("卷内题目预览-跨页专题卷-Q8-第4页")
    ).toHaveAttribute("src", "/api/local-library/asset?id=asset-paper-cross-1");
    expect(
      within(explorer).getByAltText("卷内题目预览-跨页专题卷-Q8-第5页")
    ).toHaveAttribute("src", "/api/local-library/asset?id=asset-paper-cross-2");
  });

  it("renders durable answer attachments instead of question crops in an answer sheet preview", () => {
    useQuestionStore.setState({
      binaryAssets: [
        {
          id: "asset-answer-preview-1",
          documentId: "doc-answer-preview-1",
          pageId: "answer-page-preview-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 48,
          dataUrl: "/api/local-library/asset?id=asset-answer-preview-1"
        }
      ],
      questionDrafts: [
        {
          id: "q-answer-preview-1",
          documentId: "doc-answer-preview-1",
          pageIds: ["question-page-preview-1"],
          primaryPageId: "question-page-preview-1",
          localOrder: 1,
          globalOrder: 25,
          bboxByPage: {
            "question-page-preview-1": { x: 80, y: 120, width: 820, height: 360 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.96,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryPath: ["我的题库", "高中物理", "曲线运动"],
          directoryCandidatePaths: [],
          ocrText: "25. 平抛运动答案预览题",
          questionNumberLabel: "25",
          answerAttachments: [
            {
              id: "attachment-answer-preview-1",
              assetId: "asset-answer-preview-1",
              kind: "matched"
            }
          ]
        }
      ]
    });
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "specialized-answer-preview-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "answer_sheet",
          title: "平抛运动答案预览",
          subjectScope: "高中物理",
          groupId: "group-answer-preview-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-answer-preview-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<SpecializedLibraryPage />);
    const explorer = screen.getByLabelText("specialized-library-explorer");
    fireEvent.click(
      within(explorer).getByRole("button", { name: "预览卷子-平抛运动答案预览" })
    );

    expect(
      within(explorer).getByAltText("卷内答案预览-平抛运动答案预览-Q25-1")
    ).toHaveAttribute("src", "/api/local-library/asset?id=asset-answer-preview-1");
    expect(within(explorer).queryByAltText(/卷内题目预览/)).not.toBeInTheDocument();
  });

  it("clears specialized documents without deleting the full-paper library", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "specialized-clear-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "待清空专题卷",
          subjectScope: "高中物理",
          groupId: "specialized-clear-group",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "full-keep-1",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "保留套卷",
          subjectScope: "高中物理",
          groupId: "full-keep-group",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: [],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<SpecializedLibraryPage />);

    fireEvent.click(screen.getByRole("button", { name: "清空专题卷库（1 个文档）" }));

    expect(useExamStore.getState().examLibraryDocuments).toEqual([
      expect.objectContaining({ id: "full-keep-1", library: "full" })
    ]);
    confirmSpy.mockRestore();
  });

  it("reports stale specialized-paper references instead of presenting them as available questions", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "specialized-paper-stale",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "斜面平抛模型专题卷",
          subjectScope: "高中物理",
          groupId: "group-specialized-stale",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["q-1", "q-2", "q-3", "q-4", "q-5", "q-6"],
          pendingQuestionIds: [],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<SpecializedLibraryPage />);

    const explorer = screen.getByLabelText("specialized-library-explorer");
    fireEvent.click(
      within(explorer).getByRole("button", { name: "预览卷子-斜面平抛模型专题卷" })
    );

    const preview = within(explorer).getByLabelText("library-entry-preview");
    expect(within(preview).getByText("6 个题目引用已失效")).toBeInTheDocument();
    expect(
      within(preview).getByText("源文件或题目内容已被删除，需要重新导入原文件后再生成专题卷。")
    ).toBeInTheDocument();
  });

  it("renders the full paper library as a separate file-manager page", () => {
    useQuestionStore.setState({
      binaryAssets: [
        {
          id: "asset-full-page-1",
          documentId: "full-paper-1",
          pageId: "full-page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 24,
          dataUrl: "data:image/png;base64,full-page-preview"
        }
      ]
    });
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "full-paper-1",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "高一力学套卷",
          subjectScope: "高中物理",
          groupId: "group-full-1",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: [],
          rawPageAssetIds: ["asset-full-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          uploadedPdfPages: [
            {
              pageId: "full-page-1",
              pageNumber: 1,
              width: 800,
              height: 1100,
              reviewStatus: "reviewed",
              previewAssetId: "asset-full-page-1"
            }
          ]
        }
      ]
    });

    render(<FullLibraryPage />);

    const explorer = screen.getByLabelText("full-library-explorer");

    expect(within(explorer).getByText("套卷库")).toBeInTheDocument();
    expect(within(explorer).getByRole("button", { name: "打开目录-高中物理" })).toBeInTheDocument();
    expect(within(explorer).getByText("高一力学套卷")).toBeInTheDocument();
    expect(within(explorer).getByText("PDF 导入")).toBeInTheDocument();

    fireEvent.click(within(explorer).getByRole("button", { name: "预览卷子-高一力学套卷" }));

    const preview = within(explorer).getByLabelText("library-entry-preview");
    expect(within(preview).getByText("卷子预览")).toBeInTheDocument();
    expect(within(preview).getByText("高一力学套卷")).toBeInTheDocument();
    expect(within(preview).getByText("套卷库")).toBeInTheDocument();
    expect(within(preview).getByText("PDF 页面 1")).toBeInTheDocument();
    expect(within(preview).getByAltText("卷子预览-高一力学套卷-第1页")).toBeInTheDocument();
  });
});
