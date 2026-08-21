"use client";

import { useId, useState } from "react";

import { SUBJECT_SCOPES, type SubjectScope } from "@/lib/domain/enums";
import {
  importFilesIntoWorkspace,
  type WorkspaceImportProgress
} from "@/lib/services/workspace-import-service";
import { UploadCapacityError } from "@/lib/services/upload-capacity";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

export function UploadWorkbench() {
  const inputId = useId();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<WorkspaceImportProgress | null>(null);
  const [selectedSubjectScope, setSelectedSubjectScope] = useState<SubjectScope>(SUBJECT_SCOPES[0]);
  const upsertDocument = useFileStore((state) => state.upsertDocument);
  const upsertPage = useFileStore((state) => state.upsertPage);
  const setPagePreviewUrl = useQuestionStore((state) => state.setPagePreviewUrl);
  const setPagePreviewDataUrl = useQuestionStore((state) => state.setPagePreviewDataUrl);
  const appendBinaryAssets = useQuestionStore((state) => state.appendBinaryAssets);
  const pushToast = useToastStore((state) => state.pushToast);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }

    setErrorMessage(null);
    setStatusMessage("正在处理上传文件...");
    setImportProgress(null);
    setIsImporting(true);

    try {
      const result = await importFilesIntoWorkspace({
        files,
        subjectScope: selectedSubjectScope,
        fileStore: {
          upsertDocument,
          upsertPage
        },
        questionStore: {
          setPagePreviewUrl,
          setPagePreviewDataUrl,
          appendBinaryAssets
        },
        fetchImpl: fetch,
        onProgress: setImportProgress
      });

      if (result.unsupportedFileNames.length > 0) {
        const unsupportedMessage = `不支持的文件类型：${result.unsupportedFileNames.join("、")}`;
        setErrorMessage(unsupportedMessage);
        pushToast({
          title: "unsupported file type",
          tone: "error"
        });
      }

      setStatusMessage("上传处理完成");

      if (result.importedDocumentIds.length > 0) {
        pushToast({
          title: "upload success",
          tone: "success"
        });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof UploadCapacityError
          ? error.message
          : "上传处理失败，请检查文件后重试。"
      );
      setStatusMessage(null);
      pushToast({
        title: "upload failed",
        tone: "error"
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section
      aria-label="上传拖拽区域"
      className={[
        "rounded-lg border border-dashed bg-white p-6 shadow-sm transition",
        isDragging ? "border-sky-500 ring-4 ring-sky-100" : "border-sky-200"
      ].join(" ")}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
      role="region"
    >
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-2xl">
          📄
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">
          拖拽 PDF 或图片到此处
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          主流程会先自动框选题目，再由你确认框选与跨页关系，最后按当前文件统一触发 OCR 与分类。
        </p>
        <label className="mx-auto mt-5 flex max-w-xs flex-col gap-2 text-left text-xs font-medium text-slate-500">
          选择一级学科
          <select
            aria-label="选择一级学科"
            className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            onChange={(event) => setSelectedSubjectScope(event.target.value as SubjectScope)}
            value={selectedSubjectScope}
          >
            {SUBJECT_SCOPES.map((subjectScope) => (
              <option key={subjectScope} value={subjectScope}>
                {subjectScope}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <label
            className="cursor-pointer rounded-lg bg-sky-500 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-sky-600"
            htmlFor={inputId}
          >
            选择文件
          </label>
          <input
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            id={inputId}
            multiple
            onChange={(event) => void handleFiles(event.target.files)}
            type="file"
          />
          <span className="rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-500 shadow-sm">
            支持 PDF / PNG / JPG
          </span>
        </div>
        {isImporting ? (
          <div className="mx-auto mt-5 max-w-md text-left">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>{importProgress?.message ?? "准备上传..."}</span>
              {importProgress && importProgress.total > 0 ? (
                <span>
                  {Math.min(
                    100,
                    Math.round((importProgress.current / importProgress.total) * 100)
                  )}%
                </span>
              ) : null}
            </div>
            <div
              aria-label="文件上传处理进度"
              aria-valuemax={importProgress?.total ?? 1}
              aria-valuemin={0}
              aria-valuenow={importProgress?.current ?? 0}
              className="h-2 overflow-hidden rounded-full bg-slate-100 shadow-inner"
              role="progressbar"
            >
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{
                  width: `${
                    importProgress && importProgress.total > 0
                      ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
                      : 8
                  }%`
                }}
              />
            </div>
          </div>
        ) : null}
        {statusMessage ? <p className="mt-4 text-sm text-slate-500">{statusMessage}</p> : null}
        {errorMessage ? <p className="mt-4 text-sm text-rose-600">{errorMessage}</p> : null}
      </div>
    </section>
  );
}
