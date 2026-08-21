import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import FolderPage from "@/app/folder/[id]/page";
import { ToastViewport } from "@/components/feedback/toast-viewport";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

describe("folder-page", () => {
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
      deleteFolder: useFolderStore.getState().deleteFolder
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
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      updateQuestionOcrText: useQuestionStore.getState().updateQuestionOcrText,
      updateQuestionType: useQuestionStore.getState().updateQuestionType,
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
  });

  it("renders folder breadcrumbs and questions inside the selected folder", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");
    const topic = useFolderStore.getState().createFolder(subject!.id, "函数");
    const leaf = useFolderStore.getState().createFolder(topic!.id, "二次函数");

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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: leaf!.path,
        directoryCandidatePaths: [],
        questionType: "计算题",
        ocrText: "已知二次函数 y=x^2+2x+1，求最小值",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 20, y: 30, width: 100, height: 120 }
        },
        status: "pending_bucket",
        source: "manual",
        confidence: 0.51,
        crossPageGroupId: null,
        classificationStatus: "pending_bucket",
        directoryMatchConfidence: 0.4,
        directoryPath: ["我的题库", "高中数学", "待定区"],
        directoryCandidatePaths: [],
        ocrText: "待定题目",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: leaf!.id }} />);

    expect(screen.getByText("我的题库 > 高中数学 > 函数 > 二次函数")).toBeInTheDocument();
    expect(screen.getByText("已知二次函数 y=x^2+2x+1，求最小值")).toBeInTheDocument();
    expect(screen.queryByText("待定题目")).not.toBeInTheDocument();
  });

  it("renders the folder route inside the shared app shell", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(subject).toBeTruthy();

    render(<FolderPage params={{ id: subject!.id }} />);

    expect(screen.getByLabelText("全局搜索")).toBeInTheDocument();
    expect(screen.getByLabelText("目录题目数-我的题库")).toBeInTheDocument();
  });

  it("highlights the current folder in the shared sidebar tree", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");
    const topic = useFolderStore.getState().createFolder(subject!.id, "函数");
    const leaf = useFolderStore.getState().createFolder(topic!.id, "二次函数");

    render(<FolderPage params={{ id: leaf!.id }} />);

    expect(screen.getByRole("link", { name: "二次函数" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("folder-drop-zone-二次函数")).toHaveClass("bg-sky-50");
  });

  it("decodes a percent-encoded Chinese folder id from the dynamic route", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.name === "高中物理");
    const topic = useFolderStore.getState().createFolder(subject!.id, "静电场");

    render(<FolderPage params={{ id: encodeURIComponent(topic!.id) }} />);

    expect(screen.queryByText("目录不存在")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "静电场" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "静电场" })).toHaveAttribute("aria-current", "page");
  });

  it("shows an empty state when the folder contains no questions", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.name === "高等数学");

    render(<FolderPage params={{ id: subject!.id }} />);

    expect(screen.getByText("此目录为空，上传或归类题目后会显示在这里。")).toBeInTheDocument();
  });
  it("filters folder questions by OCR text and tags", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");

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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "quadratic vertex problem",
        chapterTag: "functions",
        knowledgeTags: ["vertex"],
        customTags: ["important"],
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
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
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "填空题",
        ocrText: "linear equation problem",
        chapterTag: "algebra",
        knowledgeTags: ["equation"],
        customTags: ["review-later"],
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    fireEvent.change(screen.getByLabelText("folder-question-search"), {
      target: { value: "vertex" }
    });

    expect(screen.getByText("quadratic vertex problem")).toBeInTheDocument();
    expect(screen.queryByText("linear equation problem")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("folder-question-search"), {
      target: { value: "review-later" }
    });

    expect(screen.queryByText("quadratic vertex problem")).not.toBeInTheDocument();
    expect(screen.getByText("linear equation problem")).toBeInTheDocument();
  });

  it("filters folder questions by question type", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");

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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "multiple choice problem",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
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
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "证明题",
        ocrText: "proof problem",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    fireEvent.change(screen.getByLabelText("folder-question-type-filter"), {
      target: { value: "证明题" }
    });

    expect(screen.queryByText("multiple choice problem")).not.toBeInTheDocument();
    expect(screen.getByText("proof problem")).toBeInTheDocument();
  });

  it("renders folder question cards with type-colored accent rails", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");

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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "choice card",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
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
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "证明题",
        ocrText: "proof card",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    expect(screen.getByText("choice card").closest("article")).toHaveClass("border-l-4", "border-l-sky-500", "bg-white");
    expect(screen.getByText("proof card").closest("article")).toHaveClass("border-l-4", "border-l-violet-500", "bg-white");
  });

  it("shows the current directory breadcrumb on each folder question card", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "函数");
    const leaf = useFolderStore.getState().createFolder(topic!.id, "二次函数");

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-crumb-1",
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
        directoryPath: leaf!.path,
        directoryCandidatePaths: [],
        questionType: "计算题",
        ocrText: "card with breadcrumb",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: leaf!.id }} />);

    const article = screen.getByRole("article");
    const breadcrumb = within(article).getByText(
      (_, element) =>
        element?.tagName === "DIV" &&
        typeof element.className === "string" &&
        element.className.includes("text-xs text-slate-500") &&
        element.textContent === "我的题库 / 高中数学 / 函数 / 二次函数"
    );

    expect(breadcrumb).toBeInTheDocument();
  });

  it("expands long OCR text on demand from the folder question card", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");
    const longText = "第一行题干\n第二行题干\n第三行题干\n第四行题干\n第五行题干";

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-expand-1",
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
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "简答题",
        ocrText: longText,
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    const article = screen.getByRole("article");
    const questionText = within(article).getByText(
      (_, element) =>
        element?.tagName === "DIV" &&
        typeof element.className === "string" &&
        element.className.includes("leading-6") &&
        element.textContent === longText
    );

    expect(questionText).toHaveClass("line-clamp-4");
    expect(screen.getByRole("button", { name: "展开全部-Q1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开全部-Q1" }));

    expect(questionText).not.toHaveClass("line-clamp-4");
    expect(screen.queryByRole("button", { name: "展开全部-Q1" })).not.toBeInTheDocument();
  });

  it("opens the shared question drawer from a folder question card action", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-drawer-1",
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
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "drawer target question",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    fireEvent.click(screen.getByRole("button", { name: "查看详情-Q1" }));

    expect(screen.getByLabelText("drawer-ocr-input")).toHaveValue("drawer target question");
    expect(useQuestionStore.getState().selectedQuestionId).toBe("q-drawer-1");
  });

  it("moves a folder question card directly into another directory", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const sourceFolder = useFolderStore.getState().createFolder(subject!.id, "函数");
    const targetFolder = useFolderStore.getState().createFolder(subject!.id, "解析几何");

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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: sourceFolder!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "movable question",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: sourceFolder!.id }} />);

    fireEvent.change(screen.getByLabelText("移动到目录-Q1"), {
      target: { value: targetFolder!.id }
    });

    expect(useQuestionStore.getState().questionDrafts[0].directoryPath).toEqual(targetFolder!.path);
    expect(screen.getAllByRole("status").some((item) => item.textContent?.includes(`题目已移至 ${targetFolder!.name}`))).toBe(true);
  });

  it("sorts folder questions by selected mode", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");

    useQuestionStore.getState().upsertQuestionDrafts([
      {
        id: "q-1",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 3,
        globalOrder: 3,
        bboxByPage: {
          "page-1": { x: 10, y: 20, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "计算题",
        ocrText: "question three",
        lastBulkConfirmationId: null
      },
      {
        id: "q-2",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 20, y: 30, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.91,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.9,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "question one",
        lastBulkConfirmationId: null
      },
      {
        id: "q-3",
        documentId: "doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "page-1": { x: 30, y: 40, width: 100, height: 120 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.9,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.88,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "证明题",
        ocrText: "question two",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    const getQuestionTitles = () =>
      screen
        .getAllByRole("article")
        .map((item) => item.textContent ?? "")
        .map((text) => (text.includes("question one") ? "question one" : text.includes("question two") ? "question two" : "question three"));

    expect(getQuestionTitles()).toEqual(["question one", "question two", "question three"]);

    fireEvent.change(screen.getByLabelText("folder-question-sort"), {
      target: { value: "question-type" }
    });

    expect(getQuestionTitles()).toEqual(["question one", "question two", "question three"]);
  });

  it("toggles folder question cards between grid and list views", () => {
    const subject = useFolderStore.getState().folders.find((folder) => folder.depth === 1 && folder.subjectScope);
    const topic = useFolderStore.getState().createFolder(subject!.id, "folder-a");

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
        confidence: 0.95,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.93,
        directoryPath: topic!.path,
        directoryCandidatePaths: [],
        questionType: "选择题",
        ocrText: "question one",
        lastBulkConfirmationId: null
      }
    ]);

    render(<FolderPage params={{ id: topic!.id }} />);

    expect(screen.getByLabelText("folder-question-results")).toHaveClass("grid");

    fireEvent.click(screen.getByRole("button", { name: "列表视图" }));

    expect(screen.getByLabelText("folder-question-results")).toHaveClass("flex");
    expect(screen.getByRole("button", { name: "列表视图" })).toHaveAttribute("aria-pressed", "true");
  });
});
