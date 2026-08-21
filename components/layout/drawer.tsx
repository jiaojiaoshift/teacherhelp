"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { ManualAnswerCropPreview } from "@/components/page-canvas/manual-answer-crop-preview";
import { QUESTION_TYPES, type QuestionType } from "@/lib/domain/enums";
import { createCroppedManualAnswerAssetRecord } from "@/lib/services/binary-asset-service";
import { collectSimilarQuestionIdsForBatchApply } from "@/lib/services/classification-service";
import { findPendingBucketForSubject } from "@/lib/services/folder-service";
import { confirmQuestionDirectoryMove } from "@/lib/services/question-directory-confirmation-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

function parseTagInput(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTagInput(values?: string[]): string {
  return (values ?? []).join(", ");
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function readBlobAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read image data"));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Failed to read image data"));
    };

    reader.readAsDataURL(file);
  });
}

async function loadImageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth || 1000,
        height: image.naturalHeight || 1000
      });
    };

    image.onerror = () => {
      reject(new Error("Failed to inspect answer image"));
    };

    image.src = dataUrl;
  });
}

function createInitialNormalizedAnswerCrop() {
  return {
    x1: 50,
    y1: 50,
    x2: 950,
    y2: 950
  };
}

interface PendingManualAnswerCrop {
  id: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sourceDataUrl: string;
  pageSize: {
    width: number;
    height: number;
  };
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export function QuestionDrawer() {
  const [isPending, startTransition] = useTransition();
  const [pendingAnswerCrops, setPendingAnswerCrops] = useState<PendingManualAnswerCrop[]>([]);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const selectedQuestionId = useQuestionStore((state) => state.selectedQuestionId);
  const selectQuestion = useQuestionStore((state) => state.selectQuestion);
  const appendBinaryAssets = useQuestionStore((state) => state.appendBinaryAssets);
  const updateQuestionAnalysis = useQuestionStore((state) => state.updateQuestionAnalysis);
  const appendManualAnswerToQuestion = useQuestionStore(
    (state) => state.appendManualAnswerToQuestion
  );
  const updateQuestionOcrText = useQuestionStore((state) => state.updateQuestionOcrText);
  const updateQuestionNumberLabel = useQuestionStore((state) => state.updateQuestionNumberLabel);
  const updateQuestionType = useQuestionStore((state) => state.updateQuestionType);
  const updateQuestionTags = useQuestionStore((state) => state.updateQuestionTags);
  const moveQuestionToPendingBucket = useQuestionStore((state) => state.moveQuestionToPendingBucket);
  const assignQuestionToDirectory = useQuestionStore((state) => state.assignQuestionToDirectory);
  const confirmQuestionsInBulk = useQuestionStore((state) => state.confirmQuestionsInBulk);
  const pushToast = useToastStore((state) => state.pushToast);
  const documents = useFileStore((state) => state.documents);
  const pages = useFileStore((state) => state.pages);
  const selectedPageId = useFileStore((state) => state.selectedPageId);
  const folders = useFolderStore((state) => state.folders);
  const createFolder = useFolderStore((state) => state.createFolder);
  const pendingBatchApply = useWorkbenchStore(
    (state) => state.pendingClassificationBatchApply
  );
  const setPendingBatchApply = useWorkbenchStore(
    (state) => state.setPendingClassificationBatchApply
  );
  const togglePendingBatchApplyQuestion = useWorkbenchStore(
    (state) => state.togglePendingClassificationBatchApplyQuestion
  );

  const storedSelectedQuestion = useMemo(
    () => questionDrafts.find((question) => question.id === selectedQuestionId) ?? null,
    [questionDrafts, selectedQuestionId]
  );
  const fallbackDocument = useMemo(() => {
    const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
    const selectedPageDocument = selectedPage
      ? documents.find((document) => document.id === selectedPage.documentId) ?? null
      : null;

    return selectedPageDocument ?? documents[0] ?? null;
  }, [documents, pages, selectedPageId]);
  const reviewQuestions = useMemo(() => {
    const documentId = storedSelectedQuestion?.documentId ?? fallbackDocument?.id;

    return documentId
      ? questionDrafts
          .filter((question) => question.documentId === documentId)
          .filter(
            (question) =>
              question.classificationStatus && question.classificationStatus !== "unclassified"
          )
          .filter((question) => question.classificationStatus !== "confirmed")
          .slice()
          .sort((left, right) => left.globalOrder - right.globalOrder)
      : [];
  }, [fallbackDocument, questionDrafts, storedSelectedQuestion]);
  const selectedQuestion = storedSelectedQuestion ?? reviewQuestions[0] ?? null;
  const selectedReviewQuestionIndex = selectedQuestion
    ? reviewQuestions.findIndex((question) => question.id === selectedQuestion.id)
    : -1;
  const selectedDocument = useMemo(
    () =>
      selectedQuestion
        ? documents.find((document) => document.id === selectedQuestion.documentId) ?? null
        : fallbackDocument,
    [documents, fallbackDocument, selectedQuestion]
  );
  const selectedDocumentQuestions = useMemo(
    () =>
      selectedDocument
        ? questionDrafts.filter((question) => question.documentId === selectedDocument.id)
        : [],
    [questionDrafts, selectedDocument]
  );
  const directoryOptions = useMemo(() => {
    const subjectScope = selectedDocument?.subjectScope ?? null;

    return folders
      .filter((folder) => folder.kind === "custom" || folder.kind === "pending_bucket")
      .filter((folder) => !subjectScope || folder.subjectScope === subjectScope)
      .sort((left, right) => left.path.join(" / ").localeCompare(right.path.join(" / "), "zh-CN"));
  }, [folders, selectedDocument]);
  const answerAssetMap = useMemo(
    () => new Map(binaryAssets.map((asset) => [asset.id, asset])),
    [binaryAssets]
  );
  const answerAttachmentPreviews = useMemo(
    () =>
      (selectedQuestion?.answerAttachments ?? []).map((attachment) => ({
        attachment,
        asset: answerAssetMap.get(attachment.assetId) ?? null
      })),
    [answerAssetMap, selectedQuestion]
  );

  useEffect(() => {
    setPendingAnswerCrops([]);
  }, [selectedQuestionId]);

  const handleRunQuestionAnalysis = () => {
    if (!selectedQuestion) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/ai/analyze-question", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            questionId: selectedQuestion.id,
            ocrText: selectedQuestion.ocrText,
            subjectScope: selectedDocument?.subjectScope ?? null
          })
        });

        if (!response.ok) {
          pushToast({
            title: "AI 解析失败",
            tone: "error"
          });
          return;
        }

        const payload = (await response.json()) as {
          questionId: string;
          analysis: {
            status: "idle" | "running" | "done" | "failed";
            updatedAt: string;
            solution: string | null;
            answer: string | null;
          };
        };

        updateQuestionAnalysis(selectedQuestion.id, payload.analysis);
      })();
    });
  };

  const handleAnswerUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedQuestion) {
      return;
    }

    const files = Array.from(event.currentTarget.files ?? []);
    const input = event.currentTarget;

    if (files.length === 0) {
      return;
    }

    void (async () => {
      try {
        const crops = await Promise.all(
          files.map(async (file) => {
            const sourceDataUrl = await readBlobAsDataUrl(file);
            const pageSize = await loadImageSizeFromDataUrl(sourceDataUrl);

            return {
              id: createId("pending-answer-crop"),
              fileName: file.name || "answer",
              mimeType: file.type || "image/png",
              byteLength: file.size,
              sourceDataUrl,
              pageSize,
              normalizedBBox: createInitialNormalizedAnswerCrop()
            } satisfies PendingManualAnswerCrop;
          })
        );

        setPendingAnswerCrops((current) => current.concat(crops));
      } catch {
        pushToast({
          title: "Answer image upload failed",
          tone: "error"
        });
      } finally {
        input.value = "";
      }
    })();
  };

  const handleConfirmPendingAnswerCrop = (cropId: string) => {
    if (!selectedQuestion) {
      return;
    }

    const pendingCrop = pendingAnswerCrops.find((item) => item.id === cropId);

    if (!pendingCrop) {
      return;
    }

    void (async () => {
      try {
        const asset = await createCroppedManualAnswerAssetRecord({
          id: createId("answer-asset"),
          documentId: selectedQuestion.documentId,
          pageId: selectedQuestion.primaryPageId,
          mimeType: pendingCrop.mimeType,
          sourceDataUrl: pendingCrop.sourceDataUrl,
          pageSize: pendingCrop.pageSize,
          normalizedBBox: pendingCrop.normalizedBBox
        });

        appendBinaryAssets([asset]);
        appendManualAnswerToQuestion(selectedQuestion.id, [
          {
            id: createId("answer-attachment"),
            assetId: asset.id,
            kind: "manual"
          }
        ]);
        setPendingAnswerCrops((current) => current.filter((item) => item.id !== cropId));
      } catch {
        pushToast({
          title: "Answer crop save failed",
          tone: "error"
        });
      }
    })();
  };

  const handleRemovePendingAnswerCrop = (cropId: string) => {
    setPendingAnswerCrops((current) => current.filter((item) => item.id !== cropId));
  };

  const handleNavigateReviewQuestion = (direction: "previous" | "next") => {
    if (selectedReviewQuestionIndex < 0) {
      return;
    }

    const nextIndex =
      direction === "previous" ? selectedReviewQuestionIndex - 1 : selectedReviewQuestionIndex + 1;
    const nextQuestion = reviewQuestions[nextIndex];

    if (nextQuestion) {
      selectQuestion(nextQuestion.id);
    }
  };

  const handleConfirmCurrentQuestion = () => {
    if (!selectedQuestion || !selectedDocument || !selectedQuestion.directoryPath?.length) {
      return;
    }

    const nextReviewQuestion =
      reviewQuestions[selectedReviewQuestionIndex + 1] ??
      reviewQuestions[selectedReviewQuestionIndex - 1] ??
      reviewQuestions.find((question) => question.id !== selectedQuestion.id) ??
      null;
    const confirmedCount = confirmQuestionsInBulk(selectedDocument.id, [selectedQuestion.id]);

    if (confirmedCount > 0) {
      selectQuestion(nextReviewQuestion?.id ?? null);
      pushToast({
        title: "当前题目已确认",
        tone: "success"
      });
    }
  };

  const handleAssignQuestionToCandidate = (path: string[]) => {
    if (!selectedQuestion) {
      return;
    }

    const confirmed = confirmQuestionDirectoryMove({
      currentPath: selectedQuestion.directoryPath,
      nextPath: path,
      confirm: (message) => window.confirm(message)
    });

    if (!confirmed) {
      return;
    }

    assignQuestionToDirectory(selectedQuestion.id, path, "confirmed");
  };

  const handleMoveQuestionToPendingBucket = () => {
    if (!selectedQuestion || !selectedDocument?.subjectScope) {
      return;
    }

    const pendingBucket = findPendingBucketForSubject(folders, selectedDocument.subjectScope);

    if (!pendingBucket) {
      return;
    }

    const confirmed = confirmQuestionDirectoryMove({
      currentPath: selectedQuestion.directoryPath,
      nextPath: pendingBucket.path,
      confirm: (message) => window.confirm(message)
    });

    if (!confirmed) {
      return;
    }

    moveQuestionToPendingBucket(selectedQuestion.id, pendingBucket.path);
  };

  const handleCreateFolderAndAssign = () => {
    if (!selectedQuestion || !selectedDocument?.subjectScope) {
      return;
    }

    const folderName = window.prompt("输入新目录名称");
    if (!folderName) {
      return;
    }

    const parent = folders.find(
      (folder) => folder.depth === 1 && folder.subjectScope === selectedDocument.subjectScope
    );
    if (!parent) {
      return;
    }

    const nextPath = parent.path.concat(folderName.trim());
    const confirmed = confirmQuestionDirectoryMove({
      currentPath: selectedQuestion.directoryPath,
      nextPath,
      confirm: (message) => window.confirm(message)
    });

    if (!confirmed) {
      return;
    }

    const created = createFolder(parent.id, folderName);
    if (!created) {
      return;
    }

    assignQuestionToDirectory(selectedQuestion.id, created.path, "confirmed");

    const similarQuestionIds = collectSimilarQuestionIdsForBatchApply(selectedDocumentQuestions, {
      documentId: selectedQuestion.documentId,
      anchorQuestionId: selectedQuestion.id
    });

    setPendingBatchApply({
      directoryPath: created.path,
      anchorQuestionId: selectedQuestion.id,
      candidateQuestionIds: similarQuestionIds,
      selectedQuestionIds: []
    });
  };

  const handleApplyBatchDirectory = () => {
    if (!pendingBatchApply) {
      return;
    }

    const firstImpactedQuestion = pendingBatchApply.selectedQuestionIds
      .map(
        (questionId) =>
          selectedDocumentQuestions.find((question) => question.id === questionId) ?? null
      )
      .find((question) => Boolean(question));

    if (firstImpactedQuestion) {
      const confirmed = confirmQuestionDirectoryMove({
        currentPath: firstImpactedQuestion.directoryPath,
        nextPath: pendingBatchApply.directoryPath,
        confirm: (message) => window.confirm(message)
      });

      if (!confirmed) {
        return;
      }
    }

    pendingBatchApply.selectedQuestionIds.forEach((questionId) => {
      assignQuestionToDirectory(questionId, pendingBatchApply.directoryPath, "confirmed");
    });

    setPendingBatchApply(null);
  };

  if (!selectedQuestion) {
    return (
      <div className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-700">题目详情</div>
          <div className="mt-1 text-sm text-slate-500">
            选择题目后，在这里完成 OCR、标签、目录与 AI 解析复核。
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
          当前尚未选中题目。
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">题目详情</div>
            <div className="mt-1 text-xs text-slate-500">
              Q{selectedQuestion.globalOrder} / {selectedQuestion.status}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {selectedQuestion.pageLayoutMode === "double_column" ? "双栏题" : "单栏题"}
            </div>
            <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {selectedQuestion.questionType ?? selectedQuestion.classificationStatus ?? "unclassified"}
            </div>
          </div>
        </div>

        {reviewQuestions.length ? (
          <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/70 p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-sky-800">
              <span>分类复核</span>
              <span>
                {Math.max(selectedReviewQuestionIndex + 1, 1)}/{reviewQuestions.length}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedReviewQuestionIndex <= 0}
                onClick={() => handleNavigateReviewQuestion("previous")}
                type="button"
              >
                上一道
              </button>
              <button
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedQuestion.directoryPath?.length}
                onClick={handleConfirmCurrentQuestion}
                type="button"
              >
                确认当前题目
              </button>
              <button
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  selectedReviewQuestionIndex < 0 ||
                  selectedReviewQuestionIndex >= reviewQuestions.length - 1
                }
                onClick={() => handleNavigateReviewQuestion("next")}
                type="button"
              >
                下一道
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            题号
            <input
              aria-label="drawer-question-number-input"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) =>
                updateQuestionNumberLabel(
                  selectedQuestion.id,
                  event.target.value.trim() ? event.target.value.trim() : null
                )
              }
              type="text"
              value={selectedQuestion.questionNumberLabel ?? ""}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            题型
            <select
              aria-label="drawer-question-type-select"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) =>
                updateQuestionType(
                  selectedQuestion.id,
                  event.target.value ? (event.target.value as QuestionType) : null
                )
              }
              value={selectedQuestion.questionType ?? ""}
            >
              <option value="">未确定</option>
              {QUESTION_TYPES.map((questionType) => (
                <option key={questionType} value={questionType}>
                  {questionType}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            OCR 文本
            <textarea
              aria-label="drawer-ocr-input"
              className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) => updateQuestionOcrText(selectedQuestion.id, event.target.value)}
              value={selectedQuestion.ocrText ?? ""}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            章节标签
            <input
              aria-label="drawer-chapter-input"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) =>
                updateQuestionTags(selectedQuestion.id, {
                  chapterTag: event.target.value.trim() ? event.target.value : null
                })
              }
              type="text"
              value={selectedQuestion.chapterTag ?? ""}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            考点标签
            <textarea
              aria-label="drawer-knowledge-input"
              className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) =>
                updateQuestionTags(selectedQuestion.id, {
                  knowledgeTags: parseTagInput(event.target.value)
                })
              }
              value={formatTagInput(selectedQuestion.knowledgeTags)}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            自定义标签
            <textarea
              aria-label="drawer-custom-input"
              className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) =>
                updateQuestionTags(selectedQuestion.id, {
                  customTags: parseTagInput(event.target.value)
                })
              }
              value={formatTagInput(selectedQuestion.customTags)}
            />
          </label>

          <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">AI 解析</div>
                <div className="mt-1 text-xs text-slate-500">仅生成解题步骤与最终答案。</div>
              </div>
              <button
                aria-label="运行AI解析"
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={handleRunQuestionAnalysis}
                type="button"
              >
                {isPending ? "解析中..." : "运行AI解析"}
              </button>
            </div>

            {selectedQuestion.analysisData ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-700">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    解题步骤
                  </div>
                  <div className="whitespace-pre-wrap">
                    {selectedQuestion.analysisData.solution ?? "暂无解题步骤"}
                  </div>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-800">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-500">
                    最终答案
                  </div>
                  <div>{selectedQuestion.analysisData.answer ?? "暂无答案"}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">Answer Attachments</div>
                <div className="mt-1 text-xs text-slate-500">
                  Upload answer screenshots, review the auto crop, then save the cropped result.
                </div>
              </div>
              <input
                accept="image/*"
                aria-label="drawer-answer-upload-input"
                className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-amber-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-amber-900"
                multiple
                onChange={handleAnswerUpload}
                type="file"
              />
            </div>

            {pendingAnswerCrops.length ? (
              <div className="mt-4 space-y-3">
                {pendingAnswerCrops.map((pendingCrop, index) => (
                  <div
                    key={pendingCrop.id}
                    className="rounded-lg border border-amber-200 bg-white p-3"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">
                          Pending crop {index + 1}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Auto-selected one initial crop box. Drag, resize, or redraw it before
                          saving.
                        </div>
                        <div className="mt-1 text-xs text-slate-400">{pendingCrop.fileName}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          aria-label={`remove-answer-crop-${index + 1}`}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                          onClick={() => handleRemovePendingAnswerCrop(pendingCrop.id)}
                          type="button"
                        >
                          Remove
                        </button>
                        <button
                          aria-label={`confirm-answer-crop-${index + 1}`}
                          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
                          onClick={() => handleConfirmPendingAnswerCrop(pendingCrop.id)}
                          type="button"
                        >
                          Save crop
                        </button>
                      </div>
                    </div>

                    <ManualAnswerCropPreview
                      imageAlt={`pending-answer-crop-preview-${index + 1}`}
                      imageUrl={pendingCrop.sourceDataUrl}
                      normalizedBBox={pendingCrop.normalizedBBox}
                      onChangeBBox={(bbox) =>
                        setPendingAnswerCrops((current) =>
                          current.map((item) =>
                            item.id === pendingCrop.id
                              ? {
                                  ...item,
                                  normalizedBBox: bbox
                                }
                              : item
                          )
                        )
                      }
                      pageSize={pendingCrop.pageSize}
                      previewId={`${index + 1}`}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {answerAttachmentPreviews.length ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {answerAttachmentPreviews.map(({ attachment, asset }, index) => (
                  <div
                    key={attachment.id}
                    className="overflow-hidden rounded-lg border border-amber-100 bg-white"
                  >
                    {asset?.dataUrl ? (
                      <img
                        alt={`answer attachment ${index + 1}`}
                        className="h-36 w-full object-cover"
                        src={asset.dataUrl}
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-slate-50 text-sm text-slate-400">
                        No preview
                      </div>
                    )}
                    <div className="px-3 py-2 text-xs text-slate-500">
                      {attachment.kind} / {asset?.mimeType ?? "unknown"}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-100 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            当前归类
          </div>
          {selectedQuestion.directoryMatchConfidence !== null &&
          selectedQuestion.directoryMatchConfidence !== undefined ? (
            <div className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {Math.round(selectedQuestion.directoryMatchConfidence * 100)}%
            </div>
          ) : null}
        </div>
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
          {selectedQuestion.directoryPath?.length
            ? selectedQuestion.directoryPath.join(" / ")
            : "尚未确认目录"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-50 px-3 py-1 text-slate-600">
            {selectedQuestion.classificationStatus === "needs_choice"
              ? "待用户决策"
              : selectedQuestion.classificationStatus === "pending_bucket"
                ? "已放入待定区"
                : selectedQuestion.status === "auto_classified"
                  ? "已自动归类"
                  : selectedQuestion.classificationStatus === "confirmed"
                    ? "已确认"
                    : "待复核"}
          </span>
          {selectedQuestion.directoryCandidatePaths?.slice(0, 3).map((path) => (
            <button
              key={path.join("/")}
              aria-label={`候选目录-Q${selectedQuestion.globalOrder}-${path.join(" / ")}`}
              className="rounded-full bg-slate-50 px-3 py-1 text-slate-500 transition hover:bg-sky-50 hover:text-sky-700"
              onClick={() => handleAssignQuestionToCandidate(path)}
              type="button"
            >
              {path.join(" / ")}
            </button>
          ))}
        </div>
        {selectedQuestion.classificationStatus === "needs_choice" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              aria-label={`放入待定区-Q${selectedQuestion.globalOrder}`}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700"
              onClick={handleMoveQuestionToPendingBucket}
              type="button"
            >
              放入待定区
            </button>
            <button
              aria-label={`新建目录并归类-Q${selectedQuestion.globalOrder}`}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700"
              onClick={handleCreateFolderAndAssign}
              type="button"
            >
              新建目录并归类
            </button>
          </div>
        ) : null}
        <label className="mt-3 block text-sm font-medium text-slate-700">
          移动到目录
          <select
            aria-label="drawer-directory-select"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            onChange={(event) => {
              const folder = directoryOptions.find((item) => item.id === event.target.value);

              if (!folder) {
                return;
              }

              const confirmed = confirmQuestionDirectoryMove({
                currentPath: selectedQuestion.directoryPath,
                nextPath: folder.path,
                confirm: (message) => window.confirm(message)
              });

              if (!confirmed) {
                return;
              }

              assignQuestionToDirectory(selectedQuestion.id, folder.path, "confirmed");
              pushToast({
                title: `题目已移至 ${folder.name}`,
                tone: "success"
              });
            }}
            value={
              directoryOptions.find(
                (folder) => folder.path.join(" / ") === selectedQuestion.directoryPath?.join(" / ")
              )?.id ?? ""
            }
          >
            <option value="">选择目标目录</option>
            {directoryOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path.join(" / ")}
              </option>
            ))}
          </select>
        </label>
        {pendingBatchApply ? (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-800">
            <div className="font-medium">将新目录批量应用到当前文件相似题目</div>
            <div className="mt-2 text-sky-700">
              {pendingBatchApply.directoryPath.join(" / ")}
            </div>
            <div className="mt-3 space-y-2">
              {pendingBatchApply.candidateQuestionIds.length ? (
                pendingBatchApply.candidateQuestionIds.map((questionId) => {
                  const question = selectedDocumentQuestions.find((item) => item.id === questionId);

                  if (!question) {
                    return null;
                  }

                  return (
                    <label
                      key={questionId}
                      className="flex items-center gap-3 rounded-lg border border-sky-100 bg-white px-3 py-2"
                    >
                      <input
                        aria-label={`批量应用-Q${question.globalOrder}`}
                        checked={pendingBatchApply.selectedQuestionIds.includes(questionId)}
                        onChange={() => togglePendingBatchApplyQuestion(questionId)}
                        type="checkbox"
                      />
                      <span>{`Q${question.globalOrder}`}</span>
                    </label>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-sky-200 bg-white/70 px-3 py-3 text-sky-700">
                  当前没有可批量应用的相似题目
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pendingBatchApply.selectedQuestionIds.length === 0}
                onClick={handleApplyBatchDirectory}
                type="button"
              >
                应用到已勾选题目
              </button>
              <button
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700"
                onClick={() => setPendingBatchApply(null)}
                type="button"
              >
                稍后处理
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DrawerPlaceholder() {
  return <QuestionDrawer />;
}
