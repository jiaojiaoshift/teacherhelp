"use client";

import { useMemo, useState } from "react";

import { collectTagsFromQuestions } from "@/lib/services/tag-service";
import { useQuestionStore } from "@/lib/stores/question-store";

const TAG_TYPE_LABELS = {
  chapter: "章节标签",
  knowledge: "考点标签",
  custom: "自定义标签"
} as const;

export default function TagsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const mergeTagEverywhere = useQuestionStore((state) => state.mergeTagEverywhere);
  const renameTagEverywhere = useQuestionStore((state) => state.renameTagEverywhere);
  const removeTagEverywhere = useQuestionStore((state) => state.removeTagEverywhere);

  const tags = useMemo(() => collectTagsFromQuestions(questionDrafts), [questionDrafts]);
  const filteredTags = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return tags;
    }

    return tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  }, [searchQuery, tags]);
  const tagsByType = useMemo(
    () => ({
      chapter: filteredTags.filter((tag) => tag.type === "chapter"),
      knowledge: filteredTags.filter((tag) => tag.type === "knowledge"),
      custom: filteredTags.filter((tag) => tag.type === "custom")
    }),
    [filteredTags]
  );

  const handleRenameTag = (type: "chapter" | "knowledge" | "custom", name: string) => {
    const nextName = window.prompt("输入新的标签名称", name);
    if (!nextName || nextName === name) {
      return;
    }

    renameTagEverywhere(type, name, nextName);
  };

  const handleDeleteTag = (type: "chapter" | "knowledge" | "custom", name: string) => {
    const accepted = window.confirm(`确定要删除标签“${name}”吗？`);
    if (!accepted) {
      return;
    }

    removeTagEverywhere(type, name);
  };

  const handleMergeTag = (type: "chapter" | "knowledge" | "custom", name: string) => {
    const targetName = window.prompt("Merge into tag", name);
    if (!targetName || targetName === name) {
      return;
    }

    mergeTagEverywhere(type, name, targetName);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <h1 className="text-2xl font-semibold">标签管理</h1>
        <p className="mt-3 text-sm text-slate-500">
          这里汇总当前题库中的章节标签、考点标签和自定义标签，并支持统一重命名或删除。
        </p>
        <input
          aria-label="tag-search-input"
          className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search tags"
          type="search"
          value={searchQuery}
        />
      </section>

      {(Object.keys(TAG_TYPE_LABELS) as Array<keyof typeof TAG_TYPE_LABELS>).map((type) => (
        <section key={type} className="rounded-lg border border-slate-100 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{TAG_TYPE_LABELS[type]}</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
              {tagsByType[type].length} 个
            </span>
          </div>

          {tagsByType[type].length ? (
            <div className="space-y-3">
              {tagsByType[type].map((tag) => (
                <article
                  key={tag.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{tag.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{tag.usageCount} 次</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      aria-label={`merge-tag-${tag.name}`}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700"
                      onClick={() => handleMergeTag(type, tag.name)}
                      type="button"
                    >
                      鍚堝苟
                    </button>
                    <button
                      aria-label={`重命名标签-${tag.name}`}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                      onClick={() => handleRenameTag(type, tag.name)}
                      type="button"
                    >
                      重命名
                    </button>
                    <button
                      aria-label={`删除标签-${tag.name}`}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"
                      onClick={() => handleDeleteTag(type, tag.name)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
              当前还没有{TAG_TYPE_LABELS[type]}。
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

