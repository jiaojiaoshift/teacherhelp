"use client";

import { useWorkbenchStore } from "@/lib/stores/workbench-store";
import type { DocumentProcessingTask } from "@/lib/services/document-task-service";
import {
  cancelDocumentTaskExecution,
  pauseDocumentTaskExecution,
  resumeDocumentTaskExecution
} from "@/lib/services/document-task-controller";

const STAGE_LABELS = {
  question_boxes: "自动框题",
  cross_page: "跨页检测",
  ocr: "OCR 与分类",
  answer_matching: "答案匹配",
  specialized_sync: "专题卷同步",
  done: "处理完成"
} as const;

interface DocumentTaskCenterProps {
  onPause?: (taskId: string) => void;
  onResume?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
}

function selectDisplayedTask(
  tasks: DocumentProcessingTask[],
  activeTaskId: string | null
): DocumentProcessingTask | null {
  const visibleTasks = tasks.filter((task) => task.status !== "cancelled");

  return (
    visibleTasks.find((task) => task.id === activeTaskId) ??
    visibleTasks.find((task) =>
      ["running", "pausing", "cancelling"].includes(task.status)
    ) ??
    visibleTasks
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
    null
  );
}

export function DocumentTaskCenter({
  onPause = pauseDocumentTaskExecution,
  onResume = resumeDocumentTaskExecution,
  onCancel = cancelDocumentTaskExecution
}: DocumentTaskCenterProps = {}) {
  const legacyProgress = useWorkbenchStore((state) => state.documentProcessingProgress);
  const retry = useWorkbenchStore((state) => state.documentProcessingRetry);
  const tasks = useWorkbenchStore((state) => state.documentTasks);
  const activeTaskId = useWorkbenchStore((state) => state.activeDocumentTaskId);
  const selectDocumentTask = useWorkbenchStore((state) => state.selectDocumentTask);
  const visibleTasks = tasks.filter((item) => item.status !== "cancelled");
  const task = selectDisplayedTask(tasks, activeTaskId);
  const progress = task?.progress ?? legacyProgress;

  if (!task && legacyProgress.status === "idle") {
    return null;
  }

  const displayStatus = task?.status ?? legacyProgress.status;
  const isFailed = displayStatus === "failed";
  const isDone = displayStatus === "done";

  const percent = progress.total > 0
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : isDone
      ? 100
      : 0;

  return (
    <aside
      aria-label="document-processing-task-center"
      className="fixed bottom-4 right-4 z-50 w-[min(380px,calc(100vw-2rem))] rounded-lg border border-[#2b3945] bg-[#101820] p-4 text-[#d8e2e7] shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#8797a2]">
            整卷处理任务{visibleTasks.length > 1 ? ` · 队列 ${visibleTasks.length}` : ""}
          </div>
          {task ? (
            <div className="mt-1 truncate text-sm font-semibold text-[#eef4f6]">
              {task.documentName}
            </div>
          ) : null}
          <div className="mt-1 text-xs font-medium text-[#75cdb8]">
            {STAGE_LABELS[progress.stage]}
          </div>
        </div>
        <span
          className={[
            "text-xs font-medium",
            isFailed
              ? "text-rose-600"
              : isDone
                ? "text-emerald-600"
                : displayStatus === "paused"
                  ? "text-amber-400"
                  : "text-[#75cdb8]"
          ].join(" ")}
        >
          {displayStatus === "running"
            ? "处理中"
            : displayStatus === "queued"
              ? "等待中"
              : displayStatus === "pausing"
                ? "暂停中"
                : displayStatus === "paused"
                  ? "已暂停"
                  : displayStatus === "cancelling"
                    ? "取消中"
                    : isDone
                      ? "已完成"
                      : "失败"}
        </span>
      </div>

      {visibleTasks.length > 1 ? (
        <div
          aria-label="document-task-queue"
          className="mt-3 max-h-28 space-y-1 overflow-auto border-y border-[#26313b] py-2"
        >
          {visibleTasks.map((queuedTask) => (
            <button
              aria-label={`查看任务-${queuedTask.documentName}`}
              className={[
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs",
                queuedTask.id === task?.id
                  ? "bg-[#193029] text-[#8ee0cb]"
                  : "text-[#9aa8ae] hover:bg-[#19242d] hover:text-[#d8e2e7]"
              ].join(" ")}
              key={queuedTask.id}
              onClick={() => selectDocumentTask(queuedTask.id)}
              type="button"
            >
              <span className="truncate">{queuedTask.documentName}</span>
              <span className="shrink-0">{queuedTask.status}</span>
            </button>
          ))}
        </div>
      ) : null}

      {progress.message ? (
        <p className="mt-3 text-sm leading-5 text-[#aebbc2]">{progress.message}</p>
      ) : null}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-[#8797a2]">
          <span>{percent}%</span>
          <span>{progress.current} / {progress.total}</span>
        </div>
        <div
          aria-label="document-processing-progress"
          aria-valuemax={progress.total}
          aria-valuemin={0}
          aria-valuenow={progress.current}
          className="h-2 overflow-hidden rounded-full bg-[#26313b]"
          role="progressbar"
        >
          <div
            className={[
              "h-full rounded-full transition-all",
              isFailed ? "bg-rose-500" : "bg-[#5fc4ad]"
            ].join(" ")}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {progress.summary ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#aebbc2]">
          <span>题目 {progress.summary.questionCount}</span>
          <span>跨页合并 {progress.summary.crossPageMergeCount}</span>
          <span>答案自动匹配 {progress.summary.autoMatchedAnswerCount}</span>
          <span>待复核 {progress.summary.pendingAnswerCount}</span>
          <span>专题文档 {progress.summary.specializedDocumentCount}</span>
        </div>
      ) : null}

      {task && ["running", "queued"].includes(task.status) ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="rounded-md border border-[#3b4a55] px-3 py-2 text-sm font-medium text-[#d8e2e7] hover:bg-[#19242d]"
            onClick={() => onPause(task.id)}
            type="button"
          >
            暂停任务
          </button>
          <button
            className="rounded-md border border-rose-900/80 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-950/40"
            onClick={() => {
              if (window.confirm(`确认取消“${task.documentName}”的处理任务？已完成的检查点会保留。`)) {
                onCancel(task.id);
              }
            }}
            type="button"
          >
            取消任务
          </button>
        </div>
      ) : null}

      {task?.status === "paused" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="rounded-md bg-[#287c69] px-3 py-2 text-sm font-medium text-white hover:bg-[#31947e]"
            onClick={() => onResume(task.id)}
            type="button"
          >
            继续任务
          </button>
          <button
            className="rounded-md border border-rose-900/80 px-3 py-2 text-sm font-medium text-rose-300 hover:bg-rose-950/40"
            onClick={() => {
              if (window.confirm(`确认取消“${task.documentName}”的处理任务？已完成的检查点会保留。`)) {
                onCancel(task.id);
              }
            }}
            type="button"
          >
            取消任务
          </button>
        </div>
      ) : null}

      {task?.status === "failed" ? (
        <button
          className="mt-4 w-full rounded-md bg-[#287c69] px-3 py-2 text-sm font-medium text-white hover:bg-[#31947e]"
          onClick={() => onResume(task.id)}
          type="button"
        >
          从失败处重试
        </button>
      ) : null}

      {!task && legacyProgress.status === "failed" && retry ? (
        <button
          className="mt-4 w-full rounded-md bg-[#287c69] px-3 py-2 text-sm font-medium text-white"
          onClick={retry}
          type="button"
        >
          重试整卷处理
        </button>
      ) : null}
    </aside>
  );
}
