"use client";

import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { PageEntity, QuestionDraftEntity } from "@/lib/domain/entities";
import type { QuestionType } from "@/lib/domain/enums";
import { hasProcessedQuestionSemantics } from "@/lib/services/review-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";

type QuestionBBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type InteractionMode = "move" | "resize";

type QuestionBoxVisual = {
  borderClass: string;
  fillClass: string;
  textClass: string;
  badgeClass: string;
  handleClass: string;
  selectedBorderClass: string;
  selectedFillClass: string;
  selectedTextClass: string;
  selectedRingClass: string;
  icon: string;
};

const MIN_BOX_SIZE = 24;

const QUESTION_BOX_VISUALS: Record<QuestionType | "default", QuestionBoxVisual> = {
  选择题: {
    borderClass: "border-sky-500",
    fillClass: "bg-sky-100/60",
    textClass: "text-sky-700",
    badgeClass: "bg-sky-500",
    handleClass: "border-sky-500",
    selectedBorderClass: "border-sky-600",
    selectedFillClass: "bg-sky-200/75",
    selectedTextClass: "text-sky-800",
    selectedRingClass: "ring-sky-200/80",
    icon: "☐"
  },
  填空题: {
    borderClass: "border-emerald-500",
    fillClass: "bg-emerald-100/60",
    textClass: "text-emerald-700",
    badgeClass: "bg-emerald-500",
    handleClass: "border-emerald-500",
    selectedBorderClass: "border-emerald-600",
    selectedFillClass: "bg-emerald-200/75",
    selectedTextClass: "text-emerald-800",
    selectedRingClass: "ring-emerald-200/80",
    icon: "✎"
  },
  简答题: {
    borderClass: "border-amber-500",
    fillClass: "bg-amber-100/60",
    textClass: "text-amber-700",
    badgeClass: "bg-amber-500",
    handleClass: "border-amber-500",
    selectedBorderClass: "border-amber-600",
    selectedFillClass: "bg-amber-200/75",
    selectedTextClass: "text-amber-800",
    selectedRingClass: "ring-amber-200/80",
    icon: "📝"
  },
  证明题: {
    borderClass: "border-violet-500",
    fillClass: "bg-violet-100/60",
    textClass: "text-violet-700",
    badgeClass: "bg-violet-500",
    handleClass: "border-violet-500",
    selectedBorderClass: "border-violet-600",
    selectedFillClass: "bg-violet-200/75",
    selectedTextClass: "text-violet-800",
    selectedRingClass: "ring-violet-200/80",
    icon: "🔷"
  },
  计算题: {
    borderClass: "border-rose-500",
    fillClass: "bg-rose-100/60",
    textClass: "text-rose-700",
    badgeClass: "bg-rose-500",
    handleClass: "border-rose-500",
    selectedBorderClass: "border-rose-600",
    selectedFillClass: "bg-rose-200/75",
    selectedTextClass: "text-rose-800",
    selectedRingClass: "ring-rose-200/80",
    icon: "🧮"
  },
  其他: {
    borderClass: "border-slate-400",
    fillClass: "bg-slate-200/70",
    textClass: "text-slate-700",
    badgeClass: "bg-slate-500",
    handleClass: "border-slate-400",
    selectedBorderClass: "border-slate-500",
    selectedFillClass: "bg-slate-300/75",
    selectedTextClass: "text-slate-800",
    selectedRingClass: "ring-slate-200/80",
    icon: "•"
  },
  default: {
    borderClass: "border-amber-400",
    fillClass: "bg-amber-100/50",
    textClass: "text-amber-700",
    badgeClass: "bg-amber-500",
    handleClass: "border-amber-400",
    selectedBorderClass: "border-sky-500",
    selectedFillClass: "bg-sky-100/70",
    selectedTextClass: "text-sky-700",
    selectedRingClass: "ring-sky-200/80",
    icon: "•"
  }
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampBBoxToPage(
  bbox: QuestionBBox,
  page: { width: number; height: number },
  mode: InteractionMode
): QuestionBBox {
  const minWidth = Math.min(MIN_BOX_SIZE, page.width);
  const minHeight = Math.min(MIN_BOX_SIZE, page.height);

  if (mode === "resize") {
    const x = clamp(Math.round(bbox.x), 0, Math.max(0, page.width - minWidth));
    const y = clamp(Math.round(bbox.y), 0, Math.max(0, page.height - minHeight));

    return {
      x,
      y,
      width: clamp(Math.round(bbox.width), minWidth, Math.max(minWidth, page.width - x)),
      height: clamp(Math.round(bbox.height), minHeight, Math.max(minHeight, page.height - y))
    };
  }

  const width = clamp(Math.round(bbox.width), minWidth, page.width);
  const height = clamp(Math.round(bbox.height), minHeight, page.height);

  return {
    x: clamp(Math.round(bbox.x), 0, Math.max(0, page.width - width)),
    y: clamp(Math.round(bbox.y), 0, Math.max(0, page.height - height)),
    width,
    height
  };
}

function toPageDelta(clientDelta: number, renderedLength: number, pageLength: number): number {
  if (renderedLength <= 0) {
    return clientDelta;
  }

  return (clientDelta / renderedLength) * pageLength;
}

function areBBoxesEqual(left: QuestionBBox, right: QuestionBBox): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function getQuestionBoxVisual(questionType?: QuestionType | null): QuestionBoxVisual {
  if (!questionType) {
    return QUESTION_BOX_VISUALS.default;
  }

  return QUESTION_BOX_VISUALS[questionType] ?? QUESTION_BOX_VISUALS.default;
}

interface PagePreviewProps {
  page?: Pick<PageEntity, "id" | "pageNumber" | "width" | "height"> | null;
  previewUrl?: string | null;
  questions?: QuestionDraftEntity[];
}

export function PagePreview(props: PagePreviewProps = {}) {
  const activePointerCleanupRef = useRef<(() => void) | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    questionId: string;
    x: number;
    y: number;
  } | null>(null);
  const selectedPageIdFromStore = useFileStore((state) => state.selectedPageId);
  const pages = useFileStore((state) => state.pages);
  const pagePreviewUrls = useQuestionStore((state) => state.pagePreviewUrls);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const selectedQuestionId = useQuestionStore((state) => state.selectedQuestionId);
  const selectQuestion = useQuestionStore((state) => state.selectQuestion);
  const updateQuestionBBox = useQuestionStore((state) => state.updateQuestionBBox);
  const removeQuestionDraft = useQuestionStore((state) => state.removeQuestionDraft);
  const selectedPageId = props.page?.id ?? selectedPageIdFromStore;

  useEffect(
    () => () => {
      activePointerCleanupRef.current?.();
      activePointerCleanupRef.current = null;
    },
    []
  );

  const selectedPage = useMemo(
    () => props.page ?? pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, props.page, selectedPageId]
  );
  const selectedPageQuestions = useMemo(
    () => (props.questions ?? (selectedPageId
      ? questionDrafts.filter((question) => question.pageIds.includes(selectedPageId))
      : []))
      .slice()
      .sort(
        (left, right) =>
          left.globalOrder - right.globalOrder || left.localOrder - right.localOrder
      ),
    [props.questions, questionDrafts, selectedPageId]
  );

  if (!selectedPage || !selectedPageId) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        上传并生成页图后，这里显示页面画布、题目框和跨页候选。
      </div>
    );
  }

  const startBoxInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    input: {
      bbox: QuestionBBox;
      mode: InteractionMode;
      questionId: string;
      shouldPromptForSemanticRerun: boolean;
    }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectQuestion(input.questionId);

    const surface = surfaceRef.current;
    if (!surface) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const renderedWidth = rect.width || selectedPage.width;
    const renderedHeight = rect.height || selectedPage.height;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const startBBox = input.bbox;
    let latestBBox = startBBox;
    let hasGeometryChanged = false;

    activePointerCleanupRef.current?.();

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Some test and browser environments reject capture for synthetic events.
    }

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      pointerEvent.preventDefault();

      const deltaX = toPageDelta(pointerEvent.clientX - startClientX, renderedWidth, selectedPage.width);
      const deltaY = toPageDelta(pointerEvent.clientY - startClientY, renderedHeight, selectedPage.height);
      const nextBBox =
        input.mode === "move"
          ? {
              ...startBBox,
              x: startBBox.x + deltaX,
              y: startBBox.y + deltaY
            }
          : {
              ...startBBox,
              width: startBBox.width + deltaX,
              height: startBBox.height + deltaY
            };
      const clampedBBox = clampBBoxToPage(nextBBox, selectedPage, input.mode);

      latestBBox = clampedBBox;
      hasGeometryChanged = !areBBoxesEqual(clampedBBox, startBBox);
      updateQuestionBBox(input.questionId, selectedPageId, clampedBBox);
    };

    const cleanup = (commitSemanticDecision: boolean) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      activePointerCleanupRef.current = null;

      if (!commitSemanticDecision || !hasGeometryChanged || !input.shouldPromptForSemanticRerun) {
        return;
      }

      const userChoseRerun = window.confirm("检测到已处理题目发生变化，是否重跑该题的 OCR 与分类？");

      updateQuestionBBox(input.questionId, selectedPageId, latestBBox, {
        userChoseRerun
      });
    };

    const handlePointerUp = () => {
      cleanup(true);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    activePointerCleanupRef.current = () => cleanup(false);
  };

  const handleBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>, questionId: string) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    selectQuestion(questionId);
  };

  const handleDeleteContextQuestion = () => {
    if (!contextMenu) {
      return;
    }

    const confirmed = window.confirm("确认删除当前题目吗？");

    if (!confirmed) {
      setContextMenu(null);
      return;
    }

    const confirmedAgain = window.confirm("将同步影响相关默认专题卷内容，是否再次确认删除？");

    if (!confirmedAgain) {
      setContextMenu(null);
      return;
    }

    removeQuestionDraft(contextMenu.questionId);
    setContextMenu(null);
  };

  const previewUrl = props.previewUrl ?? pagePreviewUrls[selectedPageId];
  const crossPageFragmentCount = selectedPageQuestions.filter(
    (question) => question.pageIds.length > 1 || Boolean(question.crossPageGroupId)
  ).length;

  if (!previewUrl) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-sm text-slate-500">
        当前页面预览尚未生成。
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 shadow-sm"
      onClick={() => setContextMenu(null)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-sm font-semibold text-slate-900">
            第 {selectedPage.pageNumber} 页
          </span>
          <span className="text-xs text-slate-500">
            {selectedPage.width} × {selectedPage.height}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
            {selectedPageQuestions.length} 个题框
          </span>
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
            {crossPageFragmentCount} 个跨页片段
          </span>
        </div>
      </div>
      <div className="flex min-h-[560px] items-start justify-center bg-slate-900 p-2 md:p-3">
        <div className="relative inline-block">
          <img
            alt={`第 ${selectedPage.pageNumber} 页预览`}
            className="max-h-[calc(100vh-10rem)] max-w-full rounded-lg border border-slate-200 bg-white object-contain shadow-md"
            src={previewUrl}
          />
          <div
            ref={surfaceRef}
            aria-label="题目框图层"
            className="pointer-events-none absolute inset-0"
          >
            {selectedPageQuestions.map((question) => {
              const bbox = question.bboxByPage[selectedPageId];

              if (!bbox) {
                return null;
              }

              const isSelected = question.id === selectedQuestionId;
              const visual = getQuestionBoxVisual(question.questionType);
              const shouldPromptForSemanticRerun =
                hasProcessedQuestionSemantics(question) &&
                !(question.source === "manual" && question.status === "manual_only");
              const questionLabel =
                question.questionNumberLabel?.trim() || String(question.globalOrder);
              const isCrossPage =
                question.pageIds.length > 1 || Boolean(question.crossPageGroupId);
              const pageQuestionLabel = `P${selectedPage.pageNumber} · Q${questionLabel}${
                isCrossPage ? " · 跨页" : ""
              }`;

              return (
                <div
                  key={question.id}
                  aria-label={pageQuestionLabel}
                  className={[
                    "pointer-events-auto absolute cursor-move rounded-lg border-2 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-300",
                    isSelected
                      ? [
                          visual.selectedBorderClass,
                          visual.selectedFillClass,
                          visual.selectedTextClass,
                          "shadow-md ring-2 ring-offset-1",
                          visual.selectedRingClass
                        ].join(" ")
                      : [visual.borderClass, visual.fillClass, visual.textClass].join(" ")
                  ].join(" ")}
                  onClick={() => selectQuestion(question.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    selectQuestion(question.id);
                    setContextMenu({
                      questionId: question.id,
                      x: event.clientX,
                      y: event.clientY
                    });
                  }}
                  onKeyDown={(event) => handleBoxKeyDown(event, question.id)}
                  onPointerDown={(event) =>
                    startBoxInteraction(event, {
                      bbox,
                      mode: "move",
                      questionId: question.id,
                      shouldPromptForSemanticRerun
                    })
                  }
                  role="button"
                  style={{
                    left: `${(bbox.x / selectedPage.width) * 100}%`,
                    top: `${(bbox.y / selectedPage.height) * 100}%`,
                    width: `${(bbox.width / selectedPage.width) * 100}%`,
                    height: `${(bbox.height / selectedPage.height) * 100}%`
                  }}
                  tabIndex={0}
                >
                  <span
                    className={[
                      "absolute -top-3 left-2 rounded-md px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm",
                      visual.badgeClass
                    ].join(" ")}
                  >
                    {pageQuestionLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className={[
                      "pointer-events-none absolute -bottom-3 right-2 rounded-full bg-white/95 px-1.5 py-0.5 text-[11px] shadow-sm",
                      isSelected ? visual.selectedTextClass : visual.textClass
                    ].join(" ")}
                  >
                    {visual.icon}
                  </span>
                  <button
                    aria-label={`调整大小-${pageQuestionLabel}`}
                    className={[
                      "absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-300",
                      isSelected ? visual.selectedBorderClass : visual.handleClass
                    ].join(" ")}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) =>
                      startBoxInteraction(event, {
                        bbox,
                        mode: "resize",
                        questionId: question.id,
                        shouldPromptForSemanticRerun
                      })
                    }
                    type="button"
                  />
                </div>
              );
            })}
          </div>
          {contextMenu ? (
            <div
              className="fixed z-50 min-w-36 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm"
              onClick={(event) => event.stopPropagation()}
              role="menu"
              style={{
                left: contextMenu.x,
                top: contextMenu.y
              }}
            >
              <button
                className="w-full rounded-lg px-3 py-2 text-left text-rose-700 hover:bg-rose-50"
                onClick={handleDeleteContextQuestion}
                role="menuitem"
                type="button"
              >
                删除题目
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

