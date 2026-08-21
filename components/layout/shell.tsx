"use client";

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { ToastViewport } from "@/components/feedback/toast-viewport";
import { DocumentTaskCenter } from "@/components/workbench/document-task-center";
import type { QuestionDraftEntity } from "@/lib/domain/entities";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useAppSettingsStore } from "@/lib/stores/app-settings-store";

const navItems = [
  { href: "/", label: "工作台" },
  { href: "/library/questions", label: "题库" },
  { href: "/library/specialized", label: "专题卷库" },
  { href: "/library/full", label: "套卷库" },
  { href: "/tags", label: "标签" },
  { href: "/exam/create", label: "组卷" },
  { href: "/exam/history", label: "历史" },
  { href: "/notebooks", label: "笔记本" },
  { href: "/settings", label: "设置" }
];

function getQuestionSearchText(question: QuestionDraftEntity): string {
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

export function AppShell({
  children,
  sidebar,
  aside
}: {
  children: ReactNode;
  sidebar: ReactNode;
  aside?: ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const folders = useFolderStore((state) => state.folders);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const selectQuestion = useQuestionStore((state) => state.selectQuestion);
  const selectPage = useFileStore((state) => state.selectPage);
  const theme = useAppSettingsStore((state) => state.settings.theme);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const questionResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return questionDrafts
      .filter((question) => getQuestionSearchText(question).includes(normalizedSearchQuery))
      .slice(0, 5);
  }, [normalizedSearchQuery, questionDrafts]);
  const folderResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return folders
      .filter((folder) => folder.depth > 0)
      .filter((folder) =>
        [folder.name, folder.path.join(" ")].join(" ").toLowerCase().includes(normalizedSearchQuery)
      )
      .slice(0, 5);
  }, [folders, normalizedSearchQuery]);
  const shouldShowSearchResults = Boolean(normalizedSearchQuery);

  return (
    <div className="h-screen overflow-hidden bg-app-background text-app-ink">
      <div
        aria-label="teachhelper-workspace-shell"
        className="mx-auto flex h-screen max-w-[1880px] flex-col overflow-hidden border-x border-app-line bg-app-shell shadow-[0_0_48px_rgba(0,0,0,0.18)]"
        data-theme={theme}
      >
        <header className="sticky top-0 z-30 shrink-0 border-b border-app-line bg-app-header px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Image
                alt="智题库应用图标"
                className="h-10 w-10 shrink-0 rounded-lg border border-app-line object-cover"
                height={40}
                priority
                src="/icon.png"
                unoptimized
                width={40}
              />
              <div>
                <div className="text-base font-semibold tracking-tight text-app-ink">智题库</div>
                <div className="text-xs text-muted">数理题库整理与复核工作台</div>
              </div>
            </div>

            <div className="flex flex-1 items-start gap-3 md:max-w-2xl">
              <div className="relative flex-1">
                <input
                  aria-label="全局搜索"
                  className="w-full rounded-lg border border-app-line bg-app-panel px-3 py-2.5 text-sm text-app-ink outline-none transition placeholder:text-muted focus:border-accent focus:bg-app-panel-strong focus:ring-4 focus:ring-emerald-500/10"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索题目、标签、目录"
                  type="search"
                  value={searchQuery}
                />
                {shouldShowSearchResults ? (
                  <div
                    aria-label="global-search-results"
                    className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    {questionResults.length || folderResults.length ? (
                      <div className="space-y-3">
                        {questionResults.length ? (
                          <section>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              题目
                            </div>
                            <div className="space-y-2">
                              {questionResults.map((question) => (
                                <Link
                                  key={question.id}
                                  className="block rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
                                  href="/"
                                  onClick={() => {
                                    selectPage(question.primaryPageId);
                                    selectQuestion(question.id);
                                    setSearchQuery("");
                                  }}
                                >
                                  <div className="font-medium">
                                    Q{question.globalOrder}
                                    {question.questionType ? ` · ${question.questionType}` : ""}
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                                    {question.ocrText ?? "尚未生成 OCR 文本"}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </section>
                        ) : null}

                        {folderResults.length ? (
                          <section>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                              目录
                            </div>
                            <div className="space-y-2">
                              {folderResults.map((folder) => (
                                <Link
                                  key={folder.id}
                                  aria-label={folder.name}
                                  className="block rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
                                  href={`/folder/${folder.id}`}
                                  onClick={() => setSearchQuery("")}
                                >
                                  <div className="font-medium">{folder.name}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {folder.path.join(" / ")}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        没有匹配的题目或目录。
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <nav aria-label="workspace-navigation" className="mt-3 flex flex-wrap gap-1 border-t border-app-line pt-2.5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                className="rounded-md border border-transparent px-3 py-1.5 text-sm text-muted transition hover:border-accent hover:bg-accent-soft hover:text-accent"
                href={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-[320px_minmax(0,1fr)_380px]">
          <aside
            aria-label="workspace-sidebar-region"
            className="min-h-0 overflow-auto border-b border-app-line bg-app-panel-muted p-4 md:border-b-0 md:border-r"
          >
            {sidebar}
          </aside>
          <main
            aria-label="workspace-main-region"
            className="min-h-0 overflow-auto bg-app-background p-4 md:p-5"
          >
            {children}
          </main>
          <aside
            aria-label="workspace-detail-region"
            className="min-h-0 overflow-auto border-t border-app-line bg-app-panel-muted p-4 md:border-l md:border-t-0"
          >
            {aside}
          </aside>
        </div>
      </div>
      <DocumentTaskCenter />
      <ToastViewport />
    </div>
  );
}

