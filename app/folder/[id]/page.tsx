"use client";

import { useMemo, useState } from "react";

import { QuestionDrawer } from "@/components/layout/drawer";
import { AppShell } from "@/components/layout/shell";
import { SidebarPanel } from "@/components/layout/sidebar";
import type { QuestionDraftEntity } from "@/lib/domain/entities";
import { QUESTION_TYPES, type QuestionType } from "@/lib/domain/enums";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

interface FolderPageProps {
  params: {
    id: string;
  };
}

function decodeFolderId(id: string): string {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

type FolderQuestionSortMode = "question-order" | "question-type";
type FolderQuestionViewMode = "grid" | "list";
type FolderQuestionCardVisual = {
  accentClass: string;
  badgeClass: string;
};

const FOLDER_QUESTION_CARD_VISUALS: Record<QuestionType | "default", FolderQuestionCardVisual> = {
  选择题: {
    accentClass: "border-l-sky-500",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700"
  },
  填空题: {
    accentClass: "border-l-emerald-500",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  简答题: {
    accentClass: "border-l-amber-500",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700"
  },
  证明题: {
    accentClass: "border-l-violet-500",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700"
  },
  计算题: {
    accentClass: "border-l-rose-500",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700"
  },
  其他: {
    accentClass: "border-l-slate-400",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700"
  },
  default: {
    accentClass: "border-l-slate-400",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700"
  }
};

function getSearchableText(question: QuestionDraftEntity): string {
  return [
    question.ocrText,
    question.questionType,
    question.chapterTag,
    ...(question.knowledgeTags ?? []),
    ...(question.customTags ?? []),
    question.directoryPath?.join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getQuestionTags(question: QuestionDraftEntity): string[] {
  return [
    question.chapterTag,
    ...(question.knowledgeTags ?? []),
    ...(question.customTags ?? [])
  ].filter((tag): tag is string => Boolean(tag));
}

function getQuestionTypeRank(questionType?: QuestionType | null): number {
  if (!questionType) {
    return Number.MAX_SAFE_INTEGER;
  }

  return QUESTION_TYPES.indexOf(questionType);
}

function sortQuestions(
  questions: QuestionDraftEntity[],
  sortMode: FolderQuestionSortMode
): QuestionDraftEntity[] {
  const nextQuestions = [...questions];

  if (sortMode === "question-type") {
    return nextQuestions.sort((left, right) => {
      const typeDifference = getQuestionTypeRank(left.questionType) - getQuestionTypeRank(right.questionType);

      if (typeDifference !== 0) {
        return typeDifference;
      }

      return left.globalOrder - right.globalOrder;
    });
  }

  return nextQuestions.sort((left, right) => left.globalOrder - right.globalOrder);
}

function getFolderQuestionCardVisual(questionType?: QuestionType | null): FolderQuestionCardVisual {
  if (!questionType) {
    return FOLDER_QUESTION_CARD_VISUALS.default;
  }

  return FOLDER_QUESTION_CARD_VISUALS[questionType] ?? FOLDER_QUESTION_CARD_VISUALS.default;
}

function FolderPageContent({ params }: FolderPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionType | "">("");
  const [sortMode, setSortMode] = useState<FolderQuestionSortMode>("question-order");
  const [viewMode, setViewMode] = useState<FolderQuestionViewMode>("grid");
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<string[]>([]);
  const folders = useFolderStore((state) => state.folders);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const selectQuestion = useQuestionStore((state) => state.selectQuestion);
  const assignQuestionToDirectory = useQuestionStore((state) => state.assignQuestionToDirectory);
  const documents = useFileStore((state) => state.documents);
  const pushToast = useToastStore((state) => state.pushToast);

  const folder = folders.find((item) => item.id === params.id) ?? null;
  const questions = useMemo(() => {
    if (!folder) {
      return [];
    }

    return questionDrafts.filter((question) => question.directoryPath?.join(" / ") === folder.path.join(" / "));
  }, [folder, questionDrafts]);
  const filteredQuestions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const typeFilteredQuestions = questionTypeFilter
      ? questions.filter((question) => question.questionType === questionTypeFilter)
      : questions;
    const searchedQuestions = normalizedQuery
      ? typeFilteredQuestions.filter((question) => getSearchableText(question).includes(normalizedQuery))
      : typeFilteredQuestions;

    return sortQuestions(searchedQuestions, sortMode);
  }, [questions, questionTypeFilter, searchQuery, sortMode]);
  const toggleExpandedQuestion = (questionId: string) => {
    setExpandedQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((currentQuestionId) => currentQuestionId !== questionId)
        : current.concat(questionId)
    );
  };

  if (!folder) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold">目录不存在</h1>
        <p className="mt-3 text-sm text-slate-500">当前目录已被删除或尚未创建。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-sm text-slate-500">{folder.path.join(" > ")}</div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{folder.name}</h1>
            <p className="mt-2 text-sm text-slate-500">
              当前目录共 {questions.length} 道题，可继续在工作台中调整归类、OCR 和复核状态。
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            目录深度：{folder.depth}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">题目列表</h2>
            <p className="mt-1 text-sm text-slate-500">
              可按 OCR 文本、题型、章节标签、考点标签或自定义标签筛选。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
            {filteredQuestions.length} / {questions.length} 题
          </span>
        </div>

        <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <input
            aria-label="folder-question-search"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索题目文本、题型、章节或标签"
            type="search"
            value={searchQuery}
          />
          <select
            aria-label="folder-question-type-filter"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            onChange={(event) => setQuestionTypeFilter(event.target.value as QuestionType | "")}
            value={questionTypeFilter}
          >
            <option value="">全部题型</option>
            {QUESTION_TYPES.map((questionType) => (
              <option key={questionType} value={questionType}>
                {questionType}
              </option>
            ))}
          </select>
          <select
            aria-label="folder-question-sort"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            onChange={(event) => setSortMode(event.target.value as FolderQuestionSortMode)}
            value={sortMode}
          >
            <option value="question-order">按题号排序</option>
            <option value="question-type">按题型排序</option>
          </select>
          <div className="flex items-center gap-2">
            <button
              aria-label="网格视图"
              aria-pressed={viewMode === "grid"}
              className={[
                "rounded-2xl border px-4 py-3 text-sm transition",
                viewMode === "grid"
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              ].join(" ")}
              onClick={() => setViewMode("grid")}
              type="button"
            >
              网格
            </button>
            <button
              aria-label="列表视图"
              aria-pressed={viewMode === "list"}
              className={[
                "rounded-2xl border px-4 py-3 text-sm transition",
                viewMode === "list"
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              ].join(" ")}
              onClick={() => setViewMode("list")}
              type="button"
            >
              列表
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
            此目录为空，上传或归类题目后会显示在这里。
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
            没有匹配当前筛选条件的题目。
          </div>
        ) : (
          <div
            aria-label="folder-question-results"
            className={
              viewMode === "grid"
                ? "grid gap-3 lg:grid-cols-2"
                : "flex flex-col gap-3"
            }
          >
            {filteredQuestions.map((question) => {
              const tags = getQuestionTags(question);
              const visual = getFolderQuestionCardVisual(question.questionType);
              const isExpanded = expandedQuestionIds.includes(question.id);
              const shouldClamp = Boolean(question.ocrText?.includes("\n")) && !isExpanded;
              const subjectScope =
                documents.find((document) => document.id === question.documentId)?.subjectScope ?? null;
              const directoryOptions = folders
                .filter((folderItem) => folderItem.kind === "custom" || folderItem.kind === "pending_bucket")
                .filter((folderItem) => !subjectScope || folderItem.subjectScope === subjectScope)
                .sort((left, right) => left.path.join(" / ").localeCompare(right.path.join(" / "), "zh-CN"));

              return (
                <article
                  key={question.id}
                  className={[
                    "rounded-2xl border border-slate-200 border-l-4 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                    visual.accentClass
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Q{question.globalOrder}</div>
                      <div
                        className={[
                          "mt-2 text-sm leading-6 text-slate-700 whitespace-pre-line",
                          shouldClamp ? "line-clamp-4" : ""
                        ].join(" ")}
                      >
                        {question.ocrText ?? "尚未生成 OCR 文本"}
                      </div>
                      {shouldClamp ? (
                        <button
                          aria-label={`展开全部-Q${question.globalOrder}`}
                          className="mt-2 text-xs font-medium text-sky-700 transition hover:text-sky-800"
                          onClick={() => toggleExpandedQuestion(question.id)}
                          type="button"
                        >
                          展开全部
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-medium",
                          visual.badgeClass
                        ].join(" ")}
                      >
                        {question.questionType ?? "未定题型"}
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
                        {question.classificationStatus ?? "unclassified"}
                      </div>
                      <button
                        aria-label={`查看详情-Q${question.globalOrder}`}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-sky-200 hover:text-sky-700"
                        onClick={() => selectQuestion(question.id)}
                        type="button"
                      >
                        查看详情
                      </button>
                    </div>
                  </div>
                  {tags.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {question.directoryPath?.length ? (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                      <div className="text-xs text-slate-500">{question.directoryPath.join(" / ")}</div>
                      <label className="block text-xs font-medium text-slate-500">
                        <span className="sr-only">移动到目录</span>
                        <select
                          aria-label={`移动到目录-Q${question.globalOrder}`}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                          onChange={(event) => {
                            const nextFolder = directoryOptions.find(
                              (folderOption) => folderOption.id === event.target.value
                            );

                            if (!nextFolder) {
                              return;
                            }

                            assignQuestionToDirectory(question.id, nextFolder.path, "confirmed");
                            pushToast({
                              title: `题目已移至 ${nextFolder.name}`,
                              tone: "success"
                            });
                          }}
                          value={
                            directoryOptions.find(
                              (folderOption) =>
                                folderOption.path.join(" / ") === question.directoryPath?.join(" / ")
                            )?.id ?? ""
                          }
                        >
                          <option value="">选择目标目录</option>
                          {directoryOptions.map((folderOption) => (
                            <option key={folderOption.id} value={folderOption.id}>
                              {folderOption.path.join(" / ")}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function FolderPage({ params }: FolderPageProps) {
  const folderId = decodeFolderId(params.id);
  const decodedParams = { id: folderId };

  return (
    <AppShell aside={<QuestionDrawer />} sidebar={<SidebarPanel currentFolderId={folderId} />}>
      <FolderPageContent params={decodedParams} />
    </AppShell>
  );
}
