"use client";

import { useMemo, useState, type ReactNode } from "react";

import { CroppedQuestionImage } from "@/components/library/cropped-question-image";
import type {
  BinaryAssetEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  PageEntity,
  QuestionDraftEntity
} from "@/lib/domain/entities";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

const DOCUMENT_KIND_LABELS: Record<ExamLibraryDocumentEntity["kind"], string> = {
  paper: "试卷",
  lecture: "讲义",
  answer_sheet: "答案"
};

const SOURCE_MODE_LABELS: Record<ExamLibraryDocumentEntity["sourceMode"], string> = {
  question_bank: "题库同步",
  uploaded_pdf: "PDF 导入",
  freeform: "空白文档"
};

const LIBRARY_LABELS: Record<ExamLibraryFolderEntity["library"], string> = {
  specialized: "专题卷库",
  full: "套卷库"
};

function compareByName<T extends { name: string }>(left: T, right: T) {
  return left.name.localeCompare(right.name, "zh-Hans-CN");
}

function compareQuestions(left: QuestionDraftEntity, right: QuestionDraftEntity) {
  return left.globalOrder - right.globalOrder || left.localOrder - right.localOrder;
}

function formatQuestionTitle(question: QuestionDraftEntity) {
  return question.ocrText?.trim() || `题目 ${question.questionNumberLabel ?? question.globalOrder}`;
}

type QuestionImageFragment = {
  page: PageEntity;
  bbox: { x: number; y: number; width: number; height: number };
  sourceDataUrl: string;
  isDurableCrop: boolean;
};

function resolveQuestionImageFragments(input: {
  question: QuestionDraftEntity;
  pageById: Map<string, PageEntity>;
  pagePreviewDataUrls: Record<string, string>;
  assetById: Map<string, BinaryAssetEntity>;
  displayAssetByPageId: Map<string, BinaryAssetEntity>;
}): QuestionImageFragment[] {
  const attachmentByPageId = new Map(
    (input.question.questionImageAttachments ?? []).map((attachment) => [
      attachment.pageId,
      attachment
    ])
  );

  return input.question.pageIds.flatMap((pageId) => {
    const page = input.pageById.get(pageId) ?? null;
    const bbox = input.question.bboxByPage[pageId] ?? null;
    const durableAttachment = attachmentByPageId.get(pageId);
    const durableAsset = durableAttachment
      ? input.assetById.get(durableAttachment.assetId) ?? null
      : null;
    const sourceDataUrl = durableAsset?.dataUrl ?? (page
      ? input.pagePreviewDataUrls[pageId] ??
        (page.displayAssetId ? input.assetById.get(page.displayAssetId)?.dataUrl : null) ??
        input.displayAssetByPageId.get(pageId)?.dataUrl ??
        null
      : null);

    return page && bbox && sourceDataUrl
      ? [{ page, bbox, sourceDataUrl, isDurableCrop: Boolean(durableAsset) }]
      : [];
  });
}

function formatQuestionPageLabel(pages: PageEntity[]) {
  const pageNumbers = Array.from(new Set(pages.map((page) => page.pageNumber))).sort(
    (left, right) => left - right
  );

  if (pageNumbers.length === 0) {
    return "页码未知";
  }

  if (pageNumbers.length === 1) {
    return `第 ${pageNumbers[0]} 页`;
  }

  return `第 ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]} 页`;
}

function formatQuestionPageLayoutTag(question: QuestionDraftEntity) {
  return question.pageLayoutMode === "double_column" ? "双栏题" : "单栏题";
}

function buildFolderLookup<T extends { id: string }>(folders: T[]) {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

function collectFolderBreadcrumb<T extends { id: string; parentId: string | null; name: string }>(
  foldersById: Map<string, T>,
  selectedFolder: T | null
) {
  if (!selectedFolder) {
    return [];
  }

  const segments: string[] = [];
  let current: T | undefined = selectedFolder;

  while (current) {
    segments.unshift(current.name);

    if (!current.parentId) {
      break;
    }

    current = foldersById.get(current.parentId);
  }

  return segments;
}

function FolderButton({ folder, onOpen }: { folder: { id: string; name: string }; onOpen: () => void }) {
  return (
    <button
      aria-label={`打开目录-${folder.name}`}
      className="flex min-h-[76px] items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50"
      onClick={onOpen}
      type="button"
    >
      <span aria-hidden="true" className="text-xl">
        📁
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-800">{folder.name}</span>
        <span className="mt-1 block text-xs text-slate-500">文件夹</span>
      </span>
    </button>
  );
}

function ExplorerFrame({
  label,
  title,
  breadcrumb,
  itemCount,
  canNavigateUp,
  canNavigateDown,
  onNavigateUp,
  onNavigateDown,
  toolbarAction,
  children
}: {
  label: string;
  title: string;
  breadcrumb: string[];
  itemCount: number;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  toolbarAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="space-y-4">
      <div
        aria-label="library-explorer-toolbar"
        className="rounded-lg border border-slate-200 bg-white px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Library
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canNavigateUp}
              onClick={onNavigateUp}
              type="button"
            >
              上一级
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canNavigateDown}
              onClick={onNavigateDown}
              type="button"
            >
              下一级
            </button>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
              {itemCount} items
            </div>
            {toolbarAction}
          </div>
        </div>
        {breadcrumb.length > 1 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {breadcrumb.join(" / ")}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function QuestionPreview({
  question,
  pages,
  fragments,
  fallbackPreviewDataUrl
}: {
  question: QuestionDraftEntity;
  pages: PageEntity[];
  fragments: QuestionImageFragment[];
  fallbackPreviewDataUrl: string | null;
}) {
  const title = formatQuestionTitle(question);
  const isCrossPage = fragments.length > 1;

  return (
    <section
      aria-label="library-entry-preview"
      className="rounded-lg border border-slate-200 bg-white px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            题目预览
          </div>
          <h2 className="mt-1 line-clamp-2 text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
          Q{question.questionNumberLabel ?? question.globalOrder}
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-3">
          {fragments.length ? (
            fragments.map((fragment) => (
              <div
                key={fragment.page.id}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                {isCrossPage ? (
                  <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                    第 {fragment.page.pageNumber} 页
                  </div>
                ) : null}
                {fragment.isDurableCrop ? (
                  <img
                    alt={`题目预览-${title}${isCrossPage ? `-第${fragment.page.pageNumber}页` : ""}`}
                    className="w-full object-contain"
                    data-durable-question-crop="true"
                    src={fragment.sourceDataUrl}
                  />
                ) : (
                  <CroppedQuestionImage
                    alt={`题目预览-${title}${isCrossPage ? `-第${fragment.page.pageNumber}页` : ""}`}
                    bbox={fragment.bbox}
                    page={fragment.page}
                    sourceDataUrl={fragment.sourceDataUrl}
                  />
                )}
              </div>
            ))
          ) : fallbackPreviewDataUrl ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <img
                alt={`题目预览-${title}`}
                className="max-h-[360px] w-full object-contain"
                src={fallbackPreviewDataUrl}
              />
            </div>
          ) : (
            <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">
              暂无页面预览图。
            </div>
          )}
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            {question.directoryPath?.length ? question.directoryPath.join(" / ") : "尚未确认目录"}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              {formatQuestionPageLabel(pages)}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              {question.questionType ?? "题型未标注"}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              {formatQuestionPageLayoutTag(question)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
            <div className="mb-1 text-xs font-medium text-slate-400">OCR</div>
            <p className="whitespace-pre-wrap text-slate-700">{question.ocrText ?? "暂无 OCR 文本"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExamDocumentPreview({
  document,
  libraryLabel,
  questions,
  binaryAssets,
  pageById,
  pagePreviewDataUrls
}: {
  document: ExamLibraryDocumentEntity;
  libraryLabel: string;
  questions: QuestionDraftEntity[];
  binaryAssets: BinaryAssetEntity[];
  pageById: Map<string, PageEntity>;
  pagePreviewDataUrls: Record<string, string>;
}) {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const pushToast = useToastStore((state) => state.pushToast);
  const assetById = useMemo(() => new Map(binaryAssets.map((asset) => [asset.id, asset])), [binaryAssets]);
  const displayAssetByPageId = useMemo(
    () =>
      new Map(
        binaryAssets
          .filter((asset) => asset.kind === "display" && Boolean(asset.dataUrl))
          .map((asset) => [asset.pageId, asset])
      ),
    [binaryAssets]
  );
  const missingQuestionCount = Math.max(0, document.questionIds.length - questions.length);
  const uploadedPdfPreviews =
    document.uploadedPdfPages
      ?.map((page) => ({
        page,
        asset: assetById.get(page.previewAssetId) ?? null
      }))
      .filter((item) => Boolean(item.asset?.dataUrl)) ?? [];
  const questionImagePreviews = questions.slice(0, 4).flatMap((question, index) =>
    resolveQuestionImageFragments({
      question,
      pageById,
      pagePreviewDataUrls,
      assetById,
      displayAssetByPageId
    }).map((fragment) => ({
      ...fragment,
      question,
      displayNumber: question.questionNumberLabel?.trim() || String(index + 1),
      isCrossPage: question.pageIds.length > 1
    }))
  );
  const answerImagePreviews =
    document.kind === "answer_sheet"
      ? questions.slice(0, 4).flatMap((question, questionIndex) =>
          (question.answerAttachments ?? []).flatMap((attachment, attachmentIndex) => {
            const asset = assetById.get(attachment.assetId) ?? null;

            return asset?.dataUrl
              ? [
                  {
                    asset,
                    question,
                    attachmentIndex,
                    displayNumber:
                      question.questionNumberLabel?.trim() || String(questionIndex + 1)
                  }
                ]
              : [];
          })
        )
      : [];
  const canExportSpecializedPdf = document.library === "specialized" && document.kind === "paper";

  const exportSpecializedPdf = async () => {
    if (!canExportSpecializedPdf || isExportingPdf) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const response = await fetch(
        `/api/local-library/export-specialized-pdf?documentId=${encodeURIComponent(document.id)}`
      );

      if (!response.ok) {
        throw new Error("specialized_pdf_export_failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = `${document.title}.pdf`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      pushToast({ title: "专题卷 PDF 已导出", tone: "success" });
    } catch {
      pushToast({ title: "专题卷 PDF 导出失败", tone: "error" });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <section
      aria-label="library-entry-preview"
      className="rounded-lg border border-slate-200 bg-white px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            卷子预览
          </div>
          <h2 className="mt-1 text-base font-semibold text-slate-900">{document.title}</h2>
          <div className="mt-2 text-sm text-slate-500">{libraryLabel}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExportSpecializedPdf ? (
            <button
              aria-label="导出专题卷 PDF"
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 transition hover:border-sky-400 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExportingPdf}
              onClick={exportSpecializedPdf}
              type="button"
            >
              {isExportingPdf ? "正在导出..." : "导出 PDF"}
            </button>
          ) : null}
          <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            {DOCUMENT_KIND_LABELS[document.kind]}
          </span>
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            {document.questionIds.length} 道题
          </span>
        </div>
      </div>

      {missingQuestionCount > 0 ? (
        <div className="mt-4 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="font-semibold">{missingQuestionCount} 个题目引用已失效</div>
          <div className="mt-1">
            源文件或题目内容已被删除，需要重新导入原文件后再生成专题卷。
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-3">
          {document.kind === "answer_sheet" && answerImagePreviews.length ? (
            answerImagePreviews.map((item) => (
              <div
                key={`${item.question.id}-${item.asset.id}`}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                  Q{item.displayNumber} · 答案 {item.attachmentIndex + 1}
                </div>
                <img
                  alt={`卷内答案预览-${document.title}-Q${item.displayNumber}-${
                    item.attachmentIndex + 1
                  }`}
                  className="max-h-[360px] w-full object-contain"
                  src={item.asset.dataUrl ?? ""}
                />
              </div>
            ))
          ) : uploadedPdfPreviews.length ? (
            uploadedPdfPreviews.slice(0, 3).map(({ page, asset }) => (
              <div key={page.pageId} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                  PDF 页面 {page.pageNumber}
                </div>
                <img
                  alt={`卷子预览-${document.title}-第${page.pageNumber}页`}
                  className="max-h-[360px] w-full object-contain"
                  src={asset?.dataUrl ?? ""}
                />
              </div>
            ))
          ) : document.kind !== "answer_sheet" && questionImagePreviews.length ? (
            questionImagePreviews.map((item) => (
              <div
                key={`${item.question.id}-${item.page.id}`}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-600">
                  Q{item.displayNumber}
                  {item.isCrossPage ? ` · 第 ${item.page.pageNumber} 页` : ""}
                </div>
                  {item.isDurableCrop ? (
                    <img
                      alt={`卷内题目预览-${document.title}-Q${item.displayNumber}${
                        item.isCrossPage ? `-第${item.page.pageNumber}页` : ""
                      }`}
                      className="w-full object-contain"
                      data-durable-question-crop="true"
                      src={item.sourceDataUrl}
                    />
                  ) : (
                    <CroppedQuestionImage
                      alt={`卷内题目预览-${document.title}-Q${item.displayNumber}${
                        item.isCrossPage ? `-第${item.page.pageNumber}页` : ""
                      }`}
                      bbox={item.bbox}
                      page={item.page}
                      sourceDataUrl={item.sourceDataUrl}
                    />
                  )}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              当前卷子没有可显示的预览图。
            </div>
          )}
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              {SOURCE_MODE_LABELS[document.sourceMode]}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              {document.numberingMode === "resequence" ? "重新编号" : "保留原题号"}
            </div>
          </div>
          {questions.length ? (
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-400">
                题目列表
              </div>
              <div className="divide-y divide-slate-100">
                {questions.slice(0, 8).map((question) => (
                  <div key={question.id} className="px-3 py-2">
                    <div className="text-xs font-medium text-slate-500">
                      Q{question.questionNumberLabel ?? question.globalOrder}
                    </div>
                    <div className="mt-1 line-clamp-2 text-slate-700">{formatQuestionTitle(question)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              当前卷子没有可展开的题目文本。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyExplorerState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      当前目录没有内容。
    </div>
  );
}

export function QuestionLibraryFileManager() {
  const folders = useFolderStore((state) => state.folders);
  const pages = useFileStore((state) => state.pages);
  const pagePreviewDataUrls = useQuestionStore((state) => state.pagePreviewDataUrls);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const clearQuestionLibrary = useQuestionStore((state) => state.clearQuestionLibrary);
  const [selectedFolderId, setSelectedFolderId] = useState("root-library");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const foldersById = useMemo(() => buildFolderLookup(folders), [folders]);
  const selectedFolder = foldersById.get(selectedFolderId) ?? foldersById.get("root-library") ?? null;
  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const assetById = useMemo(
    () => new Map(binaryAssets.map((asset) => [asset.id, asset])),
    [binaryAssets]
  );
  const displayAssetByPageId = useMemo(
    () =>
      new Map(
        binaryAssets
          .filter((asset) => asset.kind === "display" && Boolean(asset.dataUrl))
          .map((asset) => [asset.pageId, asset])
      ),
    [binaryAssets]
  );
  const childFolders = useMemo(
    () =>
      folders
        .filter((folder) => folder.parentId === selectedFolder?.id)
        .sort(compareByName),
    [folders, selectedFolder?.id]
  );
  const questionsInFolder = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }

    return questionDrafts
      .filter((question) => {
        const directoryPath = question.directoryPath ?? [];

        return (
          directoryPath.length === selectedFolder.path.length &&
          directoryPath.every((segment, index) => segment === selectedFolder.path[index])
        );
      })
      .sort(compareQuestions);
  }, [questionDrafts, selectedFolder]);
  const breadcrumb = collectFolderBreadcrumb(foldersById, selectedFolder);
  const parentFolder = selectedFolder?.parentId ? foldersById.get(selectedFolder.parentId) ?? null : null;
  const firstChildFolder = childFolders[0] ?? null;
  const selectedQuestion =
    questionsInFolder.find((question) => question.id === selectedQuestionId) ?? null;
  const selectedQuestionPages = selectedQuestion
    ? selectedQuestion.pageIds
        .map((pageId) => pageById.get(pageId) ?? null)
        .filter((page): page is PageEntity => Boolean(page))
    : [];
  const selectedQuestionFragments = selectedQuestion
    ? resolveQuestionImageFragments({
        question: selectedQuestion,
        pageById,
        pagePreviewDataUrls,
        assetById,
        displayAssetByPageId
      })
    : [];
  const selectedQuestionPrimaryPage = selectedQuestion
    ? pageById.get(selectedQuestion.primaryPageId) ?? null
    : null;
  const selectedQuestionFallbackPreviewDataUrl = selectedQuestion
    ? pagePreviewDataUrls[selectedQuestion.primaryPageId] ??
      (selectedQuestionPrimaryPage?.displayAssetId
        ? assetById.get(selectedQuestionPrimaryPage.displayAssetId)?.dataUrl
        : null) ??
      displayAssetByPageId.get(selectedQuestion.primaryPageId)?.dataUrl ??
      null
    : null;
  const navigateToFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedQuestionId(null);
  };

  return (
    <ExplorerFrame
      breadcrumb={breadcrumb.length ? breadcrumb : ["我的题库"]}
      canNavigateDown={Boolean(firstChildFolder)}
      canNavigateUp={Boolean(parentFolder)}
      itemCount={childFolders.length + questionsInFolder.length}
      label="question-library-explorer"
      onNavigateDown={() => {
        if (firstChildFolder) {
          navigateToFolder(firstChildFolder.id);
        }
      }}
      onNavigateUp={() => {
        if (parentFolder) {
          navigateToFolder(parentFolder.id);
        }
      }}
      toolbarAction={
        <button
          aria-label={`清空题库（${questionDrafts.length} 道题）`}
          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={questionDrafts.length === 0}
          onClick={() => {
            if (
              window.confirm(
                `确认清空题库中的 ${questionDrafts.length} 道题？目录结构和源文件会保留。`
              )
            ) {
              clearQuestionLibrary();
              setSelectedQuestionId(null);
            }
          }}
          type="button"
        >
          清空题库
        </button>
      }
      title="题库"
    >
      <div aria-label="library-explorer-content-grid" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {childFolders.map((folder) => (
          <FolderButton key={folder.id} folder={folder} onOpen={() => navigateToFolder(folder.id)} />
        ))}
        {questionsInFolder.map((question) => (
          <button
            key={question.id}
            aria-label={`预览题目-${formatQuestionTitle(question)}`}
            className={[
              "min-h-[104px] rounded-lg border px-4 py-3 text-left transition",
              selectedQuestionId === question.id
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40"
            ].join(" ")}
            onClick={() => setSelectedQuestionId(question.id)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="line-clamp-2 text-sm font-semibold text-slate-800">
                  {formatQuestionTitle(question)}
                </h2>
                <p className="mt-2 text-xs text-slate-500">Q{question.globalOrder}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                  {formatQuestionPageLayoutTag(question)}
                </span>
                {question.questionType ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700">
                    {question.questionType}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        ))}
      </div>
      {childFolders.length === 0 && questionsInFolder.length === 0 ? <EmptyExplorerState /> : null}
      {selectedQuestion ? (
        <QuestionPreview
          fallbackPreviewDataUrl={selectedQuestionFallbackPreviewDataUrl}
          fragments={selectedQuestionFragments}
          pages={selectedQuestionPages}
          question={selectedQuestion}
        />
      ) : null}
    </ExplorerFrame>
  );
}

export function ExamLibraryFileManager({ library }: { library: "specialized" | "full" }) {
  const examLibraryFolders = useExamStore((state) => state.examLibraryFolders);
  const examLibraryDocuments = useExamStore((state) => state.examLibraryDocuments);
  const clearExamLibraryDocuments = useExamStore((state) => state.clearExamLibraryDocuments);
  const pages = useFileStore((state) => state.pages);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const pagePreviewDataUrls = useQuestionStore((state) => state.pagePreviewDataUrls);
  const rootFolderId = `${library}-root`;
  const [selectedFolderId, setSelectedFolderId] = useState(rootFolderId);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const folders = useMemo(
    () => examLibraryFolders.filter((folder) => folder.library === library),
    [examLibraryFolders, library]
  );
  const foldersById = useMemo(() => buildFolderLookup(folders), [folders]);
  const selectedFolder = foldersById.get(selectedFolderId) ?? foldersById.get(rootFolderId) ?? null;
  const childFolders = useMemo(
    () =>
      folders
        .filter((folder) => folder.parentId === selectedFolder?.id)
        .sort(compareByName),
    [folders, selectedFolder?.id]
  );
  const documents = useMemo(
    () =>
      examLibraryDocuments
        .filter((document) => document.library === library && document.folderId === selectedFolder?.id)
        .sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN")),
    [examLibraryDocuments, library, selectedFolder?.id]
  );
  const breadcrumb = collectFolderBreadcrumb(foldersById, selectedFolder);
  const parentFolder = selectedFolder?.parentId ? foldersById.get(selectedFolder.parentId) ?? null : null;
  const firstChildFolder = childFolders[0] ?? null;
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ?? null;
  const libraryDocumentCount = examLibraryDocuments.filter(
    (document) => document.library === library
  ).length;
  const questionById = useMemo(
    () => new Map(questionDrafts.map((question) => [question.id, question])),
    [questionDrafts]
  );
  const pageById = useMemo(() => new Map(pages.map((page) => [page.id, page])), [pages]);
  const selectedDocumentQuestions = selectedDocument
    ? selectedDocument.questionIds
        .map((questionId) => questionById.get(questionId))
        .filter((question): question is QuestionDraftEntity => Boolean(question))
    : [];
  const navigateToFolder = (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedDocumentId(null);
  };

  return (
    <ExplorerFrame
      breadcrumb={breadcrumb.length ? breadcrumb : [LIBRARY_LABELS[library]]}
      canNavigateDown={Boolean(firstChildFolder)}
      canNavigateUp={Boolean(parentFolder)}
      itemCount={childFolders.length + documents.length}
      label={`${library}-library-explorer`}
      onNavigateDown={() => {
        if (firstChildFolder) {
          navigateToFolder(firstChildFolder.id);
        }
      }}
      onNavigateUp={() => {
        if (parentFolder) {
          navigateToFolder(parentFolder.id);
        }
      }}
      toolbarAction={
        library === "specialized" ? (
          <button
            aria-label={`清空专题卷库（${libraryDocumentCount} 个文档）`}
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={libraryDocumentCount === 0}
            onClick={() => {
              if (
                window.confirm(
                  `确认清空专题卷库中的 ${libraryDocumentCount} 个文档？目录结构和套卷库会保留。`
                )
              ) {
                clearExamLibraryDocuments("specialized");
                setSelectedDocumentId(null);
              }
            }}
            type="button"
          >
            清空专题卷库
          </button>
        ) : null
      }
      title={LIBRARY_LABELS[library]}
    >
      <div aria-label="library-explorer-content-grid" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {childFolders.map((folder) => (
          <FolderButton key={folder.id} folder={folder} onOpen={() => navigateToFolder(folder.id)} />
        ))}
        {documents.map((document) => (
          <button
            key={document.id}
            aria-label={`预览卷子-${document.title}`}
            className={[
              "min-h-[104px] rounded-lg border px-4 py-3 text-left transition",
              selectedDocumentId === document.id
                ? "border-sky-300 bg-sky-50"
                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40"
            ].join(" ")}
            onClick={() => setSelectedDocumentId(document.id)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-800">{document.title}</h2>
                <p className="mt-2 text-xs text-slate-500">{SOURCE_MODE_LABELS[document.sourceMode]}</p>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                {DOCUMENT_KIND_LABELS[document.kind]}
              </span>
            </div>
            <div className="mt-3 text-xs text-slate-500">{document.questionIds.length} 道题</div>
          </button>
        ))}
      </div>
      {childFolders.length === 0 && documents.length === 0 ? <EmptyExplorerState /> : null}
      {selectedDocument ? (
        <ExamDocumentPreview
          binaryAssets={binaryAssets}
          document={selectedDocument}
          libraryLabel={LIBRARY_LABELS[library]}
          pageById={pageById}
          pagePreviewDataUrls={pagePreviewDataUrls}
          questions={selectedDocumentQuestions}
        />
      ) : null}
    </ExplorerFrame>
  );
}

