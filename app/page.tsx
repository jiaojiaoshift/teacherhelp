"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { QuestionDrawer } from "@/components/layout/drawer";
import { AppShell } from "@/components/layout/shell";
import { SidebarPanel } from "@/components/layout/sidebar";
import { PendingAnswerPagePreview } from "@/components/page-canvas/pending-answer-page-preview";
import { PagePreview } from "@/components/page-canvas/page-preview";
import { UploadWorkbench } from "@/components/upload/upload-workbench";
import type {
  CrossPageCandidateEntity,
  DocumentAnswerSectionState,
  DocumentPendingAnswerMatchEntry,
  PageEntity,
  QuestionPageLayoutMode
} from "@/lib/domain/entities";
import type { QuestionType } from "@/lib/domain/enums";
import { buildQuestionDraftsFromDetection } from "@/lib/services/analysis-service";
import {
  buildPendingAnswerMatches,
  normalizeQuestionNumberLabel,
  partitionAnswerMatchesForAutoAttach
} from "@/lib/services/answer-match-service";
import {
  buildNativeAutomaticAnswerDetections,
  collectUncoveredAnswerQuestionIds,
  ensureUniqueAnswerDetectionIds
} from "@/lib/services/automatic-answer-matching-service";
import { createMatchedAnswerAssetRecord } from "@/lib/services/binary-asset-service";
import {
  collectQuestionIdsNeedingClassification,
  collectHighConfidenceQuestionIds,
  buildDocumentClassificationTasks,
  groupQuestionIdsByReviewReadiness,
  prioritizeQuestionsForReview
} from "@/lib/services/classification-service";
import {
  ensureDefaultSpecializedDocuments,
  ensureExamLibraryFolders
} from "@/lib/services/exam-library-service";
import {
  collectAiMatchableDirectoryPaths
} from "@/lib/services/folder-service";
import { ensureDurablePagePreviewAssets } from "@/lib/services/library-preview-retention-service";
import {
  dataUrlToArrayBuffer,
  hasCompleteDurableQuestionImages,
  materializeDurableQuestionImages
} from "@/lib/services/durable-question-image-service";
import {
  buildCrossPageCandidateReviewDisplay,
  buildCrossPageRequestCandidates,
  buildEdgeContinuationCrossPageArtifacts,
  canTriggerDocumentClassification,
  hasUnreviewedPagesInDocument,
  reconcileQuestionsAfterCrossPageReview
} from "@/lib/services/review-service";
import {
  canMarkDocumentImportReady,
  canPurgeSourceAsset
} from "@/lib/services/source-retention-service";
import { prepareAiPreviewDataUrl } from "@/lib/services/ai-image-preview-service";
import { normalizeQuestionPageLayout } from "@/lib/services/question-layout-normalization-service";
import {
  runDocumentProcessingWorkflow,
  type DocumentProcessingCheckpoint,
  type DocumentProcessingExecutableStage,
  type DocumentProcessingSummary
} from "@/lib/services/document-processing-workflow";
import {
  isDocumentTaskRunWritable,
  registerDocumentTaskJob,
  resumeDocumentTaskExecution
} from "@/lib/services/document-task-controller";
import {
  createDocumentProcessingTask,
  type DocumentProcessingTask
} from "@/lib/services/document-task-service";
import { runDocumentPageTasks } from "@/lib/services/document-page-task-service";
import {
  resolveAiRequestConcurrency,
  resolveQuestionBoxConcurrency
} from "@/lib/services/workflow-concurrency";
import {
  createWorkflowRunId,
  recordWorkflowEvent
} from "@/lib/services/workflow-event-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import {
  type DocumentAutoDetectProgress,
  type DocumentProcessingProgress,
  useWorkbenchStore
} from "@/lib/stores/workbench-store";
import { readBlobAsDataUrl } from "@/lib/utils/blob-data-url";

type ClassificationResponseSource =
  | {
      provider: "openai_compatible" | "codex";
    }
  | {
      provider: "local_fallback";
      reason?: string;
      diagnosticId?: string;
      diagnostic?: {
        kind: string;
        status?: number;
        code?: string;
      };
    };

type WorkbenchView = "geometry" | "processing" | "answers" | "classification" | "complete";

type AutomaticDocumentWorkflowResume = {
  workflowRunId: string;
  startStage: DocumentProcessingExecutableStage;
  initialSummary: DocumentProcessingSummary;
};

type AutomaticDocumentWorkflowInput = {
  documentId: string;
  subjectScope: string | null;
  questionPageLayoutMode: QuestionPageLayoutMode;
  questionPages: PageEntity[];
  answerPages: Array<{
    pageId: string;
    pageNumber: number;
    imageDataUrl: string;
    textLines?: PageEntity["textLines"];
  }>;
  hasAnswerSection: boolean;
};

type AutomaticDocumentTaskContext = {
  taskId: string;
  runId: string;
  signal: AbortSignal;
};

async function resolvePagePreviewDataUrl(page: PageEntity): Promise<string | null> {
  const questionState = useQuestionStore.getState();
  const inMemoryDataUrl = questionState.pagePreviewDataUrls[page.id];

  if (inMemoryDataUrl?.startsWith("data:image/")) {
    return inMemoryDataUrl;
  }

  const displayAsset = questionState.binaryAssets.find(
    (asset) =>
      asset.id === page.displayAssetId ||
      (asset.pageId === page.id && asset.kind === "display")
  );
  const assetUrl =
    displayAsset?.dataUrl ||
    (page.displayAssetId
      ? `/api/local-library/asset?id=${encodeURIComponent(page.displayAssetId)}`
      : null);

  if (!assetUrl) {
    return null;
  }

  if (assetUrl.startsWith("data:image/")) {
    questionState.setPagePreviewDataUrl(page.id, assetUrl);
    return assetUrl;
  }

  const response = await fetch(assetUrl).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const dataUrl = await readBlobAsDataUrl(await response.blob()).catch(() => null);

  if (!dataUrl?.startsWith("data:image/")) {
    return null;
  }

  useQuestionStore.getState().setPagePreviewDataUrl(page.id, dataUrl);
  return dataUrl;
}

const DOCUMENT_PROCESSING_STAGES = [
  { id: "question_boxes", label: "自动框题", detail: "逐页识别完整题目边界" },
  { id: "cross_page", label: "跨页检测", detail: "检查并合并相邻页续题" },
  { id: "ocr", label: "OCR 与分类", detail: "提取全文、原题号与目录候选" },
  { id: "answer_matching", label: "答案匹配", detail: "按原 PDF 题号连接答案" },
  { id: "specialized_sync", label: "专题卷同步", detail: "生成并更新专题卷文档" }
] as const;

type DocumentProcessingVisibleStage = (typeof DOCUMENT_PROCESSING_STAGES)[number]["id"];
type DocumentProcessingVisibleStatus = "waiting" | "running" | "done" | "failed";

function getDocumentProcessingStageStatus(
  progress: DocumentProcessingProgress,
  stage: DocumentProcessingVisibleStage
): DocumentProcessingVisibleStatus {
  if (progress.status === "idle") {
    return "waiting";
  }

  if (progress.stage === "done" || progress.status === "done") {
    return "done";
  }

  const activeIndex = DOCUMENT_PROCESSING_STAGES.findIndex(
    (item) => item.id === progress.stage
  );
  const stageIndex = DOCUMENT_PROCESSING_STAGES.findIndex((item) => item.id === stage);

  if (stageIndex < activeIndex) {
    return "done";
  }

  if (stageIndex > activeIndex) {
    return "waiting";
  }

  if (progress.status === "failed") {
    return "failed";
  }

  return progress.status === "running" ? "running" : "done";
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function formatDocumentAutoDetectProgress(progress: DocumentAutoDetectProgress) {
  if (progress.message) {
    return progress.message;
  }

  if (progress.status === "done") {
    return "整卷自动框题完成";
  }

  if (progress.status === "failed") {
    return "整卷自动框题失败";
  }

  if (progress.phase === "cross_page") {
    return `正在检测跨页题 ${progress.current}/${progress.total}`;
  }

  return `正在等待 AI 框题：第 ${progress.pageNumber ?? "-"} 页，${progress.current}/${progress.total}`;
}

function getClassificationFallbackNotice(source?: ClassificationResponseSource): string | null {
  if (source?.provider !== "local_fallback") {
    return null;
  }

  if (source.reason === "api_request_failed" || source.reason === "codex_request_failed") {
    return "当前使用本地示例 OCR/分类结果，不是真实模型结果；模型 API 请求失败，请检查 ccSwitch、本机 API 配置或供应商状态。";
  }

  if (source.reason === "api_reviewed_images_missing" || source.reason === "codex_reviewed_images_missing") {
    return "当前使用本地示例 OCR/分类结果，不是真实模型结果；没有可发送给模型的已复核页面图片。";
  }

  return "当前使用本地示例 OCR/分类结果，不是真实模型结果；请通过 teacherhelp 启动并确认 ccSwitch/API 配置可用后再判断分类准确性。";
}

function getAutomaticWorkflowFallbackError(
  stage: "框题" | "跨页检测" | "OCR 与分类" | "答案匹配",
  source?: ClassificationResponseSource
): string | null {
  if (source?.provider !== "local_fallback") {
    return null;
  }

  const diagnosticSuffix = source.diagnosticId
    ? ` 诊断编号 ${source.diagnosticId}。`
    : "";

  if (source.reason === "api_provider_not_selected") {
    return `AI 服务未连接，${stage}已停止；请通过 teacherhelp 启动并确认 ccSwitch 可用。未写入占位结果。${diagnosticSuffix}`;
  }

  if (source.reason?.includes("missing")) {
    return `${stage}缺少可发送给 AI 的页面图片，流程已停止。未写入占位结果。${diagnosticSuffix}`;
  }

  return `${stage}的 AI 请求失败，流程已停止；请检查 ccSwitch 路由后重试。未写入占位结果。${diagnosticSuffix}`;
}

function normalizeCrossPageCandidate(
  value: unknown,
  fallback: {
    documentId: string;
    leftPageId: string;
    rightPageId: string;
  }
): CrossPageCandidateEntity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CrossPageCandidateEntity>;

  if (
    typeof candidate.id !== "string" ||
    !Array.isArray(candidate.sourceQuestionIds) ||
    typeof candidate.confidence !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    documentId: fallback.documentId,
    leftPageId:
      typeof candidate.leftPageId === "string" ? candidate.leftPageId : fallback.leftPageId,
    rightPageId:
      typeof candidate.rightPageId === "string" ? candidate.rightPageId : fallback.rightPageId,
    sourceQuestionIds: candidate.sourceQuestionIds.filter(
      (questionId): questionId is string => typeof questionId === "string"
    ),
    confidence: candidate.confidence,
    status: "suggested"
  };
}

function mergeCrossPageCandidates(
  existing: CrossPageCandidateEntity[],
  incoming: CrossPageCandidateEntity[]
): CrossPageCandidateEntity[] {
  const merged: CrossPageCandidateEntity[] = [];
  const indexById = new Map<string, number>();
  const indexBySource = new Map<string, number>();

  for (const candidate of existing.concat(incoming)) {
    const candidateSourceKey = getCrossPageCandidateSourceKey(candidate);
    const existingIndex = indexBySource.get(candidateSourceKey);

    if (existingIndex === undefined) {
      const candidateWithUniqueId = ensureUniqueCrossPageCandidateId(candidate, indexById);
      const nextIndex = merged.length;
      merged.push(candidateWithUniqueId);
      indexById.set(candidateWithUniqueId.id, nextIndex);
      indexBySource.set(candidateSourceKey, nextIndex);
      continue;
    }

    const current = merged[existingIndex];

    if (current.status !== "suggested" && candidate.status === "suggested") {
      continue;
    }

    indexById.delete(current.id);
    indexBySource.delete(getCrossPageCandidateSourceKey(current));
    const candidateWithUniqueId = ensureUniqueCrossPageCandidateId(candidate, indexById);
    merged[existingIndex] = candidateWithUniqueId;
    indexById.set(candidateWithUniqueId.id, existingIndex);
    indexBySource.set(candidateSourceKey, existingIndex);
  }

  return merged;
}

function getCrossPageCandidateSourceKey(candidate: CrossPageCandidateEntity): string {
  return [
    candidate.documentId,
    candidate.leftPageId,
    candidate.rightPageId,
    ...candidate.sourceQuestionIds.slice().sort()
  ].join("::");
}

function ensureUniqueCrossPageCandidateId(
  candidate: CrossPageCandidateEntity,
  indexById: Map<string, number>
): CrossPageCandidateEntity {
  if (!indexById.has(candidate.id)) {
    return candidate;
  }

  const pagePairId = `${candidate.leftPageId}-${candidate.rightPageId}-${candidate.id}`;

  if (!indexById.has(pagePairId)) {
    return {
      ...candidate,
      id: pagePairId
    };
  }

  const sourceId = `${pagePairId}-${candidate.sourceQuestionIds.slice().sort().join("-")}`;
  let uniqueId = sourceId;
  let suffix = 2;

  while (indexById.has(uniqueId)) {
    uniqueId = `${sourceId}-${suffix}`;
    suffix += 1;
  }

  return {
    ...candidate,
    id: uniqueId
  };
}

type QuestionBoxDetection = {
  id: string;
  localOrder: number;
  confidence: number;
  normalizedBBox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
};

type ClassificationResultPayload = {
  questionId: string;
  classificationStatus: "matched" | "needs_choice" | "pending_bucket" | "confirmed";
  directoryMatchConfidence: number | null;
  directoryPath: string[] | null;
  directoryCandidatePaths: string[][];
  questionType?: QuestionType | null;
  questionNumberLabel?: string | null;
  ocrText: string | null;
};

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);

  return results;
}

export default function HomePage() {
  const [isPending, startTransition] = useTransition();
  const [answerSplitPageDraft, setAnswerSplitPageDraft] = useState("");
  const [questionPageLayoutModeDraft, setQuestionPageLayoutModeDraft] =
    useState<QuestionPageLayoutMode | null>(null);
  const [selectedPendingAnswerMatchId, setSelectedPendingAnswerMatchId] = useState<string | null>(
    null
  );
  const [geometryReviewMode, setGeometryReviewMode] = useState<"question_stream" | "page">(
    "question_stream"
  );
  const [activeWorkbenchView, setActiveWorkbenchView] = useState<WorkbenchView>("geometry");
  const classificationRunMessage = useWorkbenchStore((state) => state.classificationRunMessage);
  const classificationRunProgress = useWorkbenchStore((state) => state.classificationRunProgress);
  const documentAutoDetectProgress = useWorkbenchStore((state) => state.documentAutoDetectProgress);
  const documentProcessingProgress = useWorkbenchStore(
    (state) => state.documentProcessingProgress
  );
  const documentTasks = useWorkbenchStore((state) => state.documentTasks);
  const crossPageReviewResumeRequest = useWorkbenchStore(
    (state) => state.crossPageReviewResumeRequest
  );
  const setClassificationRunMessage = useWorkbenchStore(
    (state) => state.setClassificationRunMessage
  );
  const setClassificationRunProgress = useWorkbenchStore(
    (state) => state.setClassificationRunProgress
  );
  const setDocumentAutoDetectProgress = useWorkbenchStore(
    (state) => state.setDocumentAutoDetectProgress
  );
  const setDocumentProcessingProgress = useWorkbenchStore(
    (state) => state.setDocumentProcessingProgress
  );
  const setDocumentProcessingRetry = useWorkbenchStore(
    (state) => state.setDocumentProcessingRetry
  );
  const setCrossPageReviewSession = useWorkbenchStore(
    (state) => state.setCrossPageReviewSession
  );
  const consumeCrossPageReviewResumeRequest = useWorkbenchStore(
    (state) => state.consumeCrossPageReviewResumeRequest
  );
  const documentProcessingRetry = useWorkbenchStore(
    (state) => state.documentProcessingRetry
  );
  const selectedPageId = useFileStore((state) => state.selectedPageId);
  const selectPage = useFileStore((state) => state.selectPage);
  const pages = useFileStore((state) => state.pages);
  const documents = useFileStore((state) => state.documents);
  const updatePageStatus = useFileStore((state) => state.updatePageStatus);
  const updateDocumentStatus = useFileStore((state) => state.updateDocumentStatus);
  const confirmDocumentAnswerSection = useFileStore(
    (state) => state.confirmDocumentAnswerSection
  );
  const setDocumentPendingAnswerMatches = useFileStore(
    (state) => state.setDocumentPendingAnswerMatches
  );
  const updateDocumentPendingAnswerMatchSuggestion = useFileStore(
    (state) => state.updateDocumentPendingAnswerMatchSuggestion
  );
  const updateDocumentPendingAnswerMatchLabel = useFileStore(
    (state) => state.updateDocumentPendingAnswerMatchLabel
  );
  const updateDocumentPendingAnswerMatchNormalizedBBox = useFileStore(
    (state) => state.updateDocumentPendingAnswerMatchNormalizedBBox
  );
  const resolveDocumentPendingAnswerMatch = useFileStore(
    (state) => state.resolveDocumentPendingAnswerMatch
  );
  const replaceQuestionsForPage = useQuestionStore((state) => state.replaceQuestionsForPage);
  const upsertQuestionDrafts = useQuestionStore((state) => state.upsertQuestionDrafts);
  const markPageQuestionsGeometryReviewed = useQuestionStore(
    (state) => state.markPageQuestionsGeometryReviewed
  );
  const addManualQuestionDraft = useQuestionStore((state) => state.addManualQuestionDraft);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const pagePreviewDataUrls = useQuestionStore((state) => state.pagePreviewDataUrls);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const setBinaryAssets = useQuestionStore((state) => state.setBinaryAssets);
  const appendBinaryAssets = useQuestionStore((state) => state.appendBinaryAssets);
  const attachAnswerToQuestion = useQuestionStore((state) => state.attachAnswerToQuestion);
  const crossPageCandidates = useQuestionStore((state) => state.crossPageCandidates);
  const selectedQuestionId = useQuestionStore((state) => state.selectedQuestionId);
  const selectQuestion = useQuestionStore((state) => state.selectQuestion);
  const purgeSourceAssetsForDocument = useQuestionStore(
    (state) => state.purgeSourceAssetsForDocument
  );
  const setCrossPageCandidates = useQuestionStore((state) => state.setCrossPageCandidates);
  const clearCrossPageCandidatesForDocumentState = useQuestionStore(
    (state) => state.clearCrossPageCandidatesForDocument
  );
  const acceptCrossPageCandidate = useQuestionStore((state) => state.acceptCrossPageCandidate);
  const dismissCrossPageCandidate = useQuestionStore((state) => state.dismissCrossPageCandidate);
  const applyClassificationResults = useQuestionStore((state) => state.applyClassificationResults);
  const confirmQuestionsInBulk = useQuestionStore((state) => state.confirmQuestionsInBulk);
  const undoLastBulkConfirmation = useQuestionStore((state) => state.undoLastBulkConfirmation);
  const lastBulkConfirmation = useQuestionStore((state) => state.lastBulkConfirmation);
  const folders = useFolderStore((state) => state.folders);
  const pushToast = useToastStore((state) => state.pushToast);
  const allAiMatchableDirectoryPaths = collectAiMatchableDirectoryPaths(folders);

  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const selectedDocument = selectedPage
    ? documents.find((document) => document.id === selectedPage.documentId) ?? null
    : null;
  const selectedSubjectScope = selectedDocument?.subjectScope ?? null;
  const aiMatchableDirectoryPaths = selectedSubjectScope
    ? allAiMatchableDirectoryPaths.filter((path) => path[0] === selectedSubjectScope)
    : allAiMatchableDirectoryPaths;

  const selectedDocumentPages = selectedDocument
    ? pages.filter((page) => page.documentId === selectedDocument.id)
    : [];
  const readyToClassify = selectedDocument
    ? canTriggerDocumentClassification(selectedDocumentPages)
    : false;
  const selectedDocumentQuestions = selectedDocument
    ? questionDrafts.filter((question) => question.documentId === selectedDocument.id)
    : [];
  const selectedDocumentCrossPageCandidates = selectedDocument
    ? crossPageCandidates.filter((candidate) => candidate.documentId === selectedDocument.id)
    : [];
  const resolveSuggestedQuestionIdForAnswerLabel = (answerLabel: string) => {
    const normalizedAnswerLabel = normalizeQuestionNumberLabel(answerLabel);

    if (!normalizedAnswerLabel) {
      return null;
    }

    const matchedQuestions = selectedDocumentQuestions.filter(
      (question) =>
        normalizeQuestionNumberLabel(question.questionNumberLabel) === normalizedAnswerLabel
    );

    return matchedQuestions.length === 1 ? matchedQuestions[0].id : null;
  };
  const selectedDocumentPageRankById = new Map(
    selectedDocumentPages.map((page, index) => [page.id, index])
  );
  const geometryReviewStreamQuestions = selectedDocumentQuestions
    .slice()
    .sort((left, right) => {
      const leftPageRank =
        selectedDocumentPageRankById.get(left.primaryPageId) ?? Number.MAX_SAFE_INTEGER;
      const rightPageRank =
        selectedDocumentPageRankById.get(right.primaryPageId) ?? Number.MAX_SAFE_INTEGER;

      if (leftPageRank !== rightPageRank) {
        return leftPageRank - rightPageRank;
      }

      if (left.localOrder !== right.localOrder) {
        return left.localOrder - right.localOrder;
      }

      return left.globalOrder - right.globalOrder;
    });
  const pendingAnswerReviewPages = selectedDocument?.pendingAnswerMatches?.length
    ? Array.from(
        selectedDocument.pendingAnswerMatches.reduce<
          Map<
            string,
            {
              page: (typeof pages)[number];
              previewUrl: string;
              matches: DocumentPendingAnswerMatchEntry[];
            }
          >
        >((groups, match) => {
          if (!match.pageId || !match.normalizedBBox) {
            return groups;
          }

          const page = pages.find((item) => item.id === match.pageId);
          const previewUrl = pagePreviewDataUrls[match.pageId];

          if (!page || !previewUrl) {
            return groups;
          }

          const existingGroup = groups.get(match.pageId);

          if (existingGroup) {
            existingGroup.matches.push(match);
            return groups;
          }

          groups.set(match.pageId, {
            page,
            previewUrl,
            matches: [match]
          });

          return groups;
        }, new Map()).values()
      )
        .map((group) => ({
          ...group,
          matches: group.matches
            .slice()
            .sort(
              (left, right) =>
                (left.normalizedBBox?.y1 ?? Number.MAX_SAFE_INTEGER) -
                (right.normalizedBBox?.y1 ?? Number.MAX_SAFE_INTEGER)
            )
        }))
        .sort((left, right) => left.page.pageNumber - right.page.pageNumber)
    : [];
  const activePendingAnswerMatchIndex = selectedDocument?.pendingAnswerMatches?.length
    ? Math.max(
        0,
        selectedDocument.pendingAnswerMatches.findIndex(
          (match) => match.id === selectedPendingAnswerMatchId
        )
      )
    : -1;
  const activePendingAnswerMatch =
    activePendingAnswerMatchIndex >= 0
      ? selectedDocument?.pendingAnswerMatches?.[activePendingAnswerMatchIndex] ?? null
      : null;
  const activePendingAnswerPageGroup = activePendingAnswerMatch
    ? pendingAnswerReviewPages.find((group) => group.page.id === activePendingAnswerMatch.pageId) ?? null
    : null;
  const classificationReviewQuestionCount = selectedDocument
    ? selectedDocumentQuestions.filter(
        (question) =>
          question.classificationStatus && question.classificationStatus !== "unclassified"
      ).length
    : 0;
  const remainingClassificationReviewQuestions = selectedDocument
    ? prioritizeQuestionsForReview(questionDrafts, selectedDocument.id)
    : [];
  const remainingClassificationReviewQuestionCount = remainingClassificationReviewQuestions.length;
  const highConfidenceQuestionIds = selectedDocument
    ? collectHighConfidenceQuestionIds(selectedDocumentQuestions, selectedDocument.id)
    : [];
  const questionIdsNeedingClassification = selectedDocument
    ? collectQuestionIdsNeedingClassification(selectedDocumentQuestions, selectedDocument.id)
    : [];
  const readinessGroups = selectedDocument
    ? groupQuestionIdsByReviewReadiness({
        pages: selectedDocumentPages.map((page) => ({
          id: page.id,
          reviewStatus: page.reviewStatus,
          questionIds: selectedDocumentQuestions
            .filter((question) => question.pageIds.includes(page.id))
            .map((question) => question.id)
        }))
      })
    : {
        readyQuestionIds: [],
        blockedQuestionIds: []
      };
  const isDocumentImportReady = selectedDocument
    ? canMarkDocumentImportReady({
        pages: selectedDocumentPages.map((page) => ({
          id: page.id,
          reviewStatus: page.reviewStatus
        })),
        questions: selectedDocumentQuestions.map((question) => ({
          id: question.id,
          classificationStatus: question.classificationStatus
        }))
      })
    : false;
  const selectedDocumentHasDurableQuestionImages = selectedDocument
    ? hasCompleteDurableQuestionImages({
        questions: selectedDocumentQuestions,
        binaryAssets
      })
    : false;
  const sourceRetentionLabel = selectedDocument?.status === "source_purged"
    ? "已删除"
    : isDocumentImportReady && !selectedDocumentHasDurableQuestionImages
      ? "等待高清题目文件"
    : isDocumentImportReady
      ? "待显式删除"
      : "临时保留";

  const selectedDocumentAnswerSection = selectedDocument?.answerSection;

  useEffect(() => {
    setQuestionPageLayoutModeDraft(selectedDocument?.questionPageLayoutMode ?? null);
  }, [selectedDocument?.id, selectedDocument?.questionPageLayoutMode]);

  const resolveAnswerSplitDraft = (answerSection?: DocumentAnswerSectionState) => {
    if (!answerSection) {
      return "";
    }

    if (answerSection.confirmedSplitPage !== null) {
      return String(answerSection.confirmedSplitPage);
    }

    if (answerSection.suggestedSplitPage !== null) {
      return String(answerSection.suggestedSplitPage);
    }

    return "";
  };

  const analyzeQuestionPages = async (
    targetPages: Array<{
      id: string;
      documentId: string;
      pageNumber: number;
      width: number;
      height: number;
      textLines?: import("@/lib/domain/entities").PageTextLine[];
    }>,
    options: {
      markReviewed?: boolean;
      questionPageLayoutMode?: QuestionPageLayoutMode;
      signal?: AbortSignal;
      completedPageIds?: string[];
      workflowRunId?: string;
      taskId?: string;
      onPageResult?: (pageId: string, result: "completed" | "failed") => void;
      onProgress?: (progress: {
        current: number;
        total: number;
        pageNumber: number | null;
      }) => void;
    } = {}
  ) => {
    const signal = options.signal ?? new AbortController().signal;
    const completedPageIdSet = new Set(options.completedPageIds ?? []);
    const globalOrderOffset = useQuestionStore
      .getState()
      .questionDrafts.filter((question) => question.documentId === targetPages[0]?.documentId)
      .reduce((maxOrder, question) => Math.max(maxOrder, question.globalOrder), 0);
    const pageOrderOffset = new Map(
      targetPages.map((page, index) => [page.id, globalOrderOffset + index * 1000])
    );
    const failureByPageId = new Map<string, unknown>();

    options.onProgress?.({
      current: targetPages.filter((page) => completedPageIdSet.has(page.id)).length,
      total: targetPages.length,
      pageNumber: targetPages[0]?.pageNumber ?? null
    });
    targetPages.filter((page) => !completedPageIdSet.has(page.id)).forEach((page) => {
      updatePageStatus(page.id, { analysisStatus: "running" });
    });

    const pageTaskResult = await runDocumentPageTasks({
      pages: targetPages,
      completedPageIds: options.completedPageIds,
      concurrency: resolveQuestionBoxConcurrency(
        process.env.NEXT_PUBLIC_TEACHHELPER_AI_REQUEST_CONCURRENCY,
        process.env.NEXT_PUBLIC_TEACHHELPER_QUESTION_BOX_CONCURRENCY
      ),
      signal,
      execute: async (page, _index, pageSignal) => {
        const response = await fetch("/api/ai/detect-question-boxes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: pageSignal,
          body: JSON.stringify({
            pageId: page.id,
            imageDataUrl: pagePreviewDataUrls[page.id] ?? null,
            subjectScope: selectedSubjectScope,
            questionPageLayoutMode: options.questionPageLayoutMode,
            textLines: page.textLines ?? []
          })
        });

        if (!response.ok) {
          throw new Error(`第 ${page.pageNumber} 页框题请求失败`);
        }

        const payload = (await response.json()) as {
          pageId: string;
          detections?: QuestionBoxDetection[];
          textLines?: import("@/lib/domain/entities").PageTextLine[];
          source?: ClassificationResponseSource;
        };
        const fallbackError = getAutomaticWorkflowFallbackError("框题", payload.source);

        if (fallbackError) {
          throw new Error(fallbackError);
        }
        if (!Array.isArray(payload.detections)) {
          throw new Error(`第 ${page.pageNumber} 页框题未返回有效结果`);
        }

        return {
          detections: payload.detections,
          textLines: Array.isArray(payload.textLines) ? payload.textLines : page.textLines
        };
      },
      onSuccess: async (page, result) => {
        const questions = buildQuestionDraftsFromDetection({
          documentId: page.documentId,
          pageId: page.id,
          pageLayoutMode: options.questionPageLayoutMode ?? "single_column",
          detections: result.detections,
          textLines: result.textLines,
          size: {
            width: page.width,
            height: page.height
          },
          globalOrderOffset: pageOrderOffset.get(page.id) ?? globalOrderOffset
        });
        const latestPage = useFileStore.getState().pages.find((item) => item.id === page.id);

        if (latestPage && result.textLines) {
          useFileStore.getState().upsertPage({
            ...latestPage,
            textLines: result.textLines
          });
        }

        replaceQuestionsForPage(page.id, questions);
        updatePageStatus(
          page.id,
          options.markReviewed
            ? {
                analysisStatus: "done",
                reviewStatus: "reviewed"
              }
            : {
                analysisStatus: "done"
              }
        );

        if (options.markReviewed) {
          markPageQuestionsGeometryReviewed(page.id);
        }
        if (options.workflowRunId) {
          void recordWorkflowEvent({
            runId: options.workflowRunId,
            taskId: options.taskId,
            documentId: page.documentId,
            pageId: page.id,
            pageNumber: page.pageNumber,
            event: "question_box_page",
            stage: "question_boxes",
            status: "done"
          });
        }
        options.onPageResult?.(page.id, "completed");
      },
      onFailure: async (page, error) => {
        failureByPageId.set(page.id, error);
        updatePageStatus(page.id, { analysisStatus: "failed" });
        if (options.workflowRunId) {
          const diagnosticId = error instanceof Error
            ? /\baierr-[A-Za-z0-9-]{3,100}\b/.exec(error.message)?.[0]
            : undefined;
          void recordWorkflowEvent({
            runId: options.workflowRunId,
            taskId: options.taskId,
            documentId: page.documentId,
            pageId: page.id,
            pageNumber: page.pageNumber,
            diagnosticId,
            event: "question_box_page",
            stage: "question_boxes",
            status: "failed"
          });
        }
        options.onPageResult?.(page.id, "failed");
      },
      onProgress: (progress) => {
        const page = targetPages.find((item) => item.id === progress.pageId);
        options.onProgress?.({
          current: progress.current,
          total: targetPages.length,
          pageNumber: page?.pageNumber ?? null
        });
      }
    });

    if (targetPages.length > 0) {
      const targetDocumentIds = Array.from(
        new Set(targetPages.map((page) => page.documentId))
      );

      for (const documentId of targetDocumentIds) {
        const latestPages = useFileStore
          .getState()
          .pages.filter((page) => page.documentId === documentId);
        const latestQuestions = useQuestionStore
          .getState()
          .questionDrafts.filter((question) => question.documentId === documentId);
        const normalizedQuestions = options.questionPageLayoutMode === "double_column"
          ? normalizeQuestionPageLayout({
              questionPageLayoutMode: options.questionPageLayoutMode,
              pages: latestPages,
              questions: latestQuestions
            })
          : latestQuestions;
        const pageNumberById = new Map(latestPages.map((page) => [page.id, page.pageNumber]));
        const resequencedQuestions = normalizedQuestions
          .slice()
          .sort((left, right) =>
            options.questionPageLayoutMode === "double_column"
              ? left.globalOrder - right.globalOrder
              : (pageNumberById.get(left.primaryPageId) ?? Number.MAX_SAFE_INTEGER) -
                  (pageNumberById.get(right.primaryPageId) ?? Number.MAX_SAFE_INTEGER) ||
                left.localOrder - right.localOrder ||
                left.id.localeCompare(right.id)
          )
          .map((question, index) => ({
            ...question,
            globalOrder: index + 1
          }));

        useQuestionStore
          .getState()
          .replaceQuestionsForDocument(documentId, resequencedQuestions);
      }
    }

    if (pageTaskResult.failedPageIds.length > 0) {
      const firstFailure = failureByPageId.get(pageTaskResult.failedPageIds[0]);
      throw firstFailure instanceof Error
        ? firstFailure
        : new Error(`${pageTaskResult.failedPageIds.length} 页框题失败`);
    }
  };

  const handleAnalyzeCurrentPage = () => {
    if (!selectedPage) {
      return;
    }

    startTransition(() => {
      void analyzeQuestionPages([selectedPage]);
    });
  };

  const handleMarkPageReviewed = () => {
    if (!selectedPage) {
      return;
    }

    updatePageStatus(selectedPage.id, {
      reviewStatus: "reviewed"
    });
    markPageQuestionsGeometryReviewed(selectedPage.id);
  };

  const handleAddManualQuestion = () => {
    if (!selectedPage) {
      return;
    }

    addManualQuestionDraft({
      questionId: `manual-${Date.now()}`,
      documentId: selectedPage.documentId,
      pageId: selectedPage.id,
      pageNumber: 1,
      width: selectedPage.width,
      height: selectedPage.height,
      globalOrder: questionDrafts.length + 1,
      pageLayoutMode: selectedDocument?.questionPageLayoutMode ?? "single_column"
    });
  };

  const handleSelectQuestionFromStream = (questionId: string, pageId: string) => {
    selectPage(pageId);
    selectQuestion(questionId);
  };

  const handleContinueClassificationReview = () => {
    const nextQuestion = remainingClassificationReviewQuestions[0];

    if (!nextQuestion) {
      return;
    }

    selectPage(nextQuestion.primaryPageId);
    selectQuestion(nextQuestion.id);
  };

  const handleDetectCrossPageCandidates = () => {
    if (!selectedDocument || selectedDocument.pageIds.length < 2) {
      return;
    }

    startTransition(() => {
      void (async () => {
        const sortedPages = selectedDocumentPages
          .slice()
          .sort((left, right) => left.pageNumber - right.pageNumber);
        const nextCandidates: CrossPageCandidateEntity[] = [];

        for (const [index, leftPage] of sortedPages.slice(0, -1).entries()) {
          const rightPage = sortedPages[index + 1];
          const response = await fetch("/api/ai/detect-cross-page", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              documentId: selectedDocument.id,
              leftPage: leftPage.id,
              rightPage: rightPage.id,
              leftImageDataUrl: pagePreviewDataUrls[leftPage.id] ?? null,
              rightImageDataUrl: pagePreviewDataUrls[rightPage.id] ?? null,
              leftTextLines: leftPage.textLines ?? [],
              rightTextLines: rightPage.textLines ?? [],
              candidates: buildCrossPageRequestCandidates({
                pages: [leftPage, rightPage],
                questions: useQuestionStore
                  .getState()
                  .questionDrafts.filter(
                    (question) => question.documentId === selectedDocument.id
                  )
              })
            })
          }).catch(() => null);

          if (!response?.ok) {
            continue;
          }

          const payload = (await response.json().catch(() => null)) as {
            mergeCandidates?: unknown[];
          } | null;
          const rawCandidates = Array.isArray(payload?.mergeCandidates)
            ? payload.mergeCandidates
            : [];
          const currentQuestionIds = new Set(
            useQuestionStore
              .getState()
              .questionDrafts.filter((question) => question.documentId === selectedDocument.id)
              .map((question) => question.id)
          );

          rawCandidates.forEach((rawCandidate) => {
            const candidate = normalizeCrossPageCandidate(rawCandidate, {
              documentId: selectedDocument.id,
              leftPageId: leftPage.id,
              rightPageId: rightPage.id
            });

            if (
              candidate &&
              candidate.sourceQuestionIds.length >= 2 &&
              candidate.sourceQuestionIds.every((questionId) => currentQuestionIds.has(questionId))
            ) {
              nextCandidates.push(candidate);
            }
          });
        }

        const edgeArtifacts = buildEdgeContinuationCrossPageArtifacts({
          documentId: selectedDocument.id,
          pages: sortedPages,
          questions: useQuestionStore
            .getState()
            .questionDrafts.filter((question) => question.documentId === selectedDocument.id)
        });

        if (edgeArtifacts.questionDrafts.length) {
          upsertQuestionDrafts(edgeArtifacts.questionDrafts);
        }

        setCrossPageCandidates(
          mergeCrossPageCandidates(
            crossPageCandidates.filter((candidate) => candidate.documentId !== selectedDocument.id),
            nextCandidates.concat(edgeArtifacts.candidates)
          )
        );
      })();
    });
  };

  const handleClearCrossPageCandidates = () => {
    if (!selectedDocument) {
      return;
    }

    clearCrossPageCandidatesForDocumentState(selectedDocument.id);
  };

  const handleAcceptCrossPageCandidate = (candidateId: string) => {
    acceptCrossPageCandidate(candidateId);
  };

  const handleDismissCrossPageCandidate = (candidateId: string) => {
    dismissCrossPageCandidate(candidateId);
  };

  const reviewDetectedCrossPageCandidates = (
    documentId: string,
    candidateIds: string[],
    signal?: AbortSignal,
    onProgress?: (progress: { current: number; total: number; message: string }) => void
  ): Promise<number> => {
    const uniqueCandidateIds = Array.from(new Set(candidateIds)).filter((candidateId) =>
      useQuestionStore
        .getState()
        .crossPageCandidates.some(
          (candidate) =>
            candidate.id === candidateId &&
            candidate.documentId === documentId &&
            candidate.status === "suggested"
        )
    );

    if (!uniqueCandidateIds.length) {
      return Promise.resolve(0);
    }

    if (onProgress) {
      onProgress({
        current: 0,
        total: uniqueCandidateIds.length,
        message: "等待人工复核跨页候选"
      });
    } else {
      setDocumentProcessingProgress({
        status: "running",
        stage: "cross_page",
        current: 0,
        total: uniqueCandidateIds.length,
        message: "等待人工复核跨页候选",
        summary: null
      });
    }

    return new Promise<number>((resolve, reject) => {
      const handleAbort = () => {
        setCrossPageReviewSession(null);
        reject(signal?.reason ?? new Error("Document task interrupted"));
      };
      const resolveReview = (acceptedCount: number) => {
        signal?.removeEventListener("abort", handleAbort);
        resolve(acceptedCount);
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }
      signal?.addEventListener("abort", handleAbort, { once: true });
      setCrossPageReviewSession({
        documentId,
        candidateIds: uniqueCandidateIds,
        currentIndex: 0,
        acceptedCount: 0,
        recoveryMode: "live",
        resolve: resolveReview
      });
    });
  };

  const detectAndApplyDocumentCrossPageMerges = async (input: {
    documentId: string;
    workflowRunId?: string;
    taskId?: string;
    signal?: AbortSignal;
    onProgress?: (progress: { current: number; total: number; message: string }) => void;
    questionPages: Array<{
      id: string;
      pageNumber: number;
      width: number;
      height: number;
      textLines?: import("@/lib/domain/entities").PageTextLine[];
    }>;
  }) => {
    const detectionStartedAt = Date.now();
    const latestPageById = new Map(
      useFileStore.getState().pages.map((page) => [page.id, page])
    );
    const questionPages = input.questionPages.map(
      (page) => latestPageById.get(page.id) ?? page
    );
    const adjacentPairs = questionPages.slice(0, -1).map((page, index) => ({
      leftPage: page,
      rightPage: questionPages[index + 1]
    }));
    const detectedCandidateIds: string[] = [];
    const throwIfInterrupted = () => {
      if (input.signal?.aborted) {
        throw input.signal.reason ?? new Error("Document task interrupted");
      }
    };

    throwIfInterrupted();

    setDocumentAutoDetectProgress({
      status: "running",
      phase: "cross_page",
      current: 0,
      total: adjacentPairs.length,
      pageNumber: null,
      message: null
    });

    const edgeArtifacts = buildEdgeContinuationCrossPageArtifacts({
      documentId: input.documentId,
      pages: questionPages,
      questions: useQuestionStore
        .getState()
        .questionDrafts.filter((question) => question.documentId === input.documentId)
    });

    if (edgeArtifacts.questionDrafts.length) {
      useQuestionStore.getState().upsertQuestionDrafts(edgeArtifacts.questionDrafts);
    }

    for (const candidate of edgeArtifacts.candidates) {
      throwIfInterrupted();
      const currentQuestionIdSet = new Set(
        useQuestionStore
          .getState()
          .questionDrafts.filter((question) => question.documentId === input.documentId)
          .map((question) => question.id)
      );

      if (!candidate.sourceQuestionIds.every((questionId) => currentQuestionIdSet.has(questionId))) {
        continue;
      }

      const nextCandidates = mergeCrossPageCandidates(
        useQuestionStore.getState().crossPageCandidates,
        [candidate]
      );
      const storedCandidate = nextCandidates.find(
        (item) =>
          getCrossPageCandidateSourceKey(item) === getCrossPageCandidateSourceKey(candidate)
      );

      useQuestionStore.getState().setCrossPageCandidates(nextCandidates);
      if (storedCandidate?.status === "suggested") {
        detectedCandidateIds.push(storedCandidate.id);
      }
    }

    for (const [index, pair] of adjacentPairs.entries()) {
      setDocumentAutoDetectProgress({
        status: "running",
        phase: "cross_page",
        current: index,
        total: adjacentPairs.length,
        pageNumber: null,
        message: null
      });

      const response = await fetch("/api/ai/detect-cross-page", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: input.signal,
        body: JSON.stringify({
          workflowRunId: input.workflowRunId,
          taskId: input.taskId,
          sequence: index + 1,
          total: adjacentPairs.length,
          documentId: input.documentId,
          leftPage: pair.leftPage.id,
          rightPage: pair.rightPage.id,
          leftImageDataUrl: pagePreviewDataUrls[pair.leftPage.id] ?? null,
          rightImageDataUrl: pagePreviewDataUrls[pair.rightPage.id] ?? null,
          leftTextLines: pair.leftPage.textLines ?? [],
          rightTextLines: pair.rightPage.textLines ?? [],
          candidates: buildCrossPageRequestCandidates({
            pages: [pair.leftPage, pair.rightPage],
            questions: useQuestionStore
              .getState()
              .questionDrafts.filter((question) => question.documentId === input.documentId)
          })
        })
      }).catch(() => null);

      throwIfInterrupted();
      if (!response?.ok) {
        throw new Error("跨页检测请求失败，流程已停止。未写入占位结果。");
      }

      const payload = (await response.json().catch(() => null)) as {
        mergeCandidates?: unknown[];
        source?: ClassificationResponseSource;
      } | null;
      const fallbackError = getAutomaticWorkflowFallbackError("跨页检测", payload?.source);

      if (fallbackError) {
        throw new Error(fallbackError);
      }

      const mergeCandidates = Array.isArray(payload?.mergeCandidates)
        ? payload.mergeCandidates
        : [];

      for (const rawCandidate of mergeCandidates) {
        throwIfInterrupted();
        const candidate = normalizeCrossPageCandidate(rawCandidate, {
          documentId: input.documentId,
          leftPageId: pair.leftPage.id,
          rightPageId: pair.rightPage.id
        });

        if (!candidate || candidate.sourceQuestionIds.length < 2) {
          continue;
        }

        const currentQuestions = useQuestionStore
          .getState()
          .questionDrafts.filter((question) => question.documentId === input.documentId);
        const currentQuestionIdSet = new Set(currentQuestions.map((question) => question.id));

        if (!candidate.sourceQuestionIds.every((questionId) => currentQuestionIdSet.has(questionId))) {
          continue;
        }

        const nextCandidates = mergeCrossPageCandidates(
          useQuestionStore.getState().crossPageCandidates,
          [candidate]
        );
        const storedCandidate = nextCandidates.find(
          (item) =>
            getCrossPageCandidateSourceKey(item) === getCrossPageCandidateSourceKey(candidate)
        );

        useQuestionStore.getState().setCrossPageCandidates(nextCandidates);
        if (storedCandidate?.status === "suggested") {
          detectedCandidateIds.push(storedCandidate.id);
        }
      }

      setDocumentAutoDetectProgress({
        status: "running",
        phase: "cross_page",
        current: index + 1,
        total: adjacentPairs.length,
        pageNumber: null,
        message: null
      });
      if (input.onProgress) {
        input.onProgress({
          current: index + 1,
          total: adjacentPairs.length,
          message: "正在自动检测并合并跨页题"
        });
      } else {
        setDocumentProcessingProgress({
          status: "running",
          stage: "cross_page",
          current: index + 1,
          total: adjacentPairs.length,
          message: "正在自动检测并合并跨页题",
          summary: null
        });
      }
    }

    const reviewCandidateCount = Array.from(new Set(detectedCandidateIds)).filter((candidateId) =>
      useQuestionStore
        .getState()
        .crossPageCandidates.some(
          (candidate) =>
            candidate.id === candidateId &&
            candidate.documentId === input.documentId &&
            candidate.status === "suggested"
        )
    ).length;

    if (input.workflowRunId) {
      void recordWorkflowEvent({
        runId: input.workflowRunId,
        event: "cross_page_summary",
        stage: "cross_page",
        status: "done",
        total: adjacentPairs.length,
        candidateCount: detectedCandidateIds.length,
        filteredCount: Math.max(detectedCandidateIds.length - reviewCandidateCount, 0),
        elapsedMs: Date.now() - detectionStartedAt
      });
    }

    const reviewStartedAt = Date.now();
    const acceptedCount = await reviewDetectedCrossPageCandidates(
      input.documentId,
      detectedCandidateIds,
      input.signal,
      input.onProgress
    );
    throwIfInterrupted();
    const questionPageIds = new Set(questionPages.map((page) => page.id));
    const questionPageLayoutMode = useFileStore
      .getState()
      .documents.find((document) => document.id === input.documentId)
      ?.questionPageLayoutMode;
    const reconciledQuestions = reconcileQuestionsAfterCrossPageReview({
      pages: useFileStore
        .getState()
        .pages.filter(
          (page) => page.documentId === input.documentId && questionPageIds.has(page.id)
        ),
      questions: useQuestionStore
        .getState()
        .questionDrafts.filter((question) => question.documentId === input.documentId),
      questionPageLayoutMode
    });

    if (reconciledQuestions.length) {
      useQuestionStore
        .getState()
        .replaceQuestionsForDocument(input.documentId, reconciledQuestions);
    }

    if (input.workflowRunId) {
      void recordWorkflowEvent({
        runId: input.workflowRunId,
        event: "cross_page_review",
        stage: "cross_page",
        status: "done",
        candidateCount: reviewCandidateCount,
        acceptedCount,
        elapsedMs: Date.now() - reviewStartedAt
      });
    }

    return acceptedCount;
  };

  const runDocumentAutoDetect = async (input: {
    documentId: string;
    questionPages: typeof selectedDocumentPages;
    autoDetectCrossPage: boolean;
  }) => {
    try {
      setDocumentAutoDetectProgress({
        status: "running",
        phase: "question_boxes",
        current: 0,
        total: input.questionPages.length,
        pageNumber: input.questionPages[0]?.pageNumber ?? null,
        message: null
      });

      await analyzeQuestionPages(input.questionPages, {
        markReviewed: true,
        onProgress: (progress) =>
          setDocumentAutoDetectProgress({
            status: "running",
            phase: "question_boxes",
            current: progress.current,
            total: progress.total,
            pageNumber: progress.pageNumber,
            message: null
          })
      });

      if (input.autoDetectCrossPage && input.questionPages.length > 1) {
        await detectAndApplyDocumentCrossPageMerges({
          documentId: input.documentId,
          questionPages: input.questionPages
        });
      }

      setDocumentAutoDetectProgress({
        status: "done",
        phase: input.autoDetectCrossPage ? "cross_page" : "question_boxes",
        current: input.autoDetectCrossPage
          ? Math.max(input.questionPages.length - 1, 0)
          : input.questionPages.length,
        total: input.autoDetectCrossPage
          ? Math.max(input.questionPages.length - 1, 0)
          : input.questionPages.length,
        pageNumber: null,
        message: "整卷自动框题完成"
      });
    } catch {
      setDocumentAutoDetectProgress({
        status: "failed",
        phase: "question_boxes",
        current: 0,
        total: input.questionPages.length,
        pageNumber: null,
        message: "整卷自动框题失败"
      });
    }
  };

  const attachDetectedAnswerMatch = async (
    documentId: string,
    match: DocumentPendingAnswerMatchEntry
  ): Promise<{
    questionId: string;
    attachment: {
      id: string;
      assetId: string;
      kind: "matched";
    };
  } | null> => {
    if (
      !match.suggestedQuestionId ||
      !match.pageId ||
      !match.normalizedBBox
    ) {
      return null;
    }

    const currentQuestions = useQuestionStore.getState().questionDrafts;
    const targetQuestion = currentQuestions.find(
      (question) =>
        question.documentId === documentId && question.id === match.suggestedQuestionId
    );
    const answerPage = useFileStore
      .getState()
      .pages.find((page) => page.id === match.pageId && page.documentId === documentId);
    const sourceDataUrl = useQuestionStore.getState().pagePreviewDataUrls[match.pageId];

    if (!targetQuestion || !answerPage || !sourceDataUrl) {
      return null;
    }

    const assetId = `matched-answer-${match.id}`;

    try {
      const asset = await createMatchedAnswerAssetRecord({
        id: assetId,
        documentId,
        pageId: answerPage.id,
        mimeType: "image/png",
        sourceDataUrl,
        pageSize: {
          width: answerPage.width,
          height: answerPage.height
        },
        normalizedBBox: match.normalizedBBox
      });

      if (!useQuestionStore.getState().binaryAssets.some((item) => item.id === asset.id)) {
        appendBinaryAssets([asset]);
      }
      return {
        questionId: targetQuestion.id,
        attachment: {
          id: `answer-${match.id}`,
          assetId: asset.id,
          kind: "matched"
        }
      };
    } catch {
      return null;
    }
  };

  const classifyDocumentForAutomaticWorkflow = async (input: {
    documentId: string;
    subjectScope: string | null;
    questionPageIds: string[];
    signal?: AbortSignal;
    onProgress?: (progress: { current: number; total: number; message: string }) => void;
  }): Promise<number> => {
    const throwIfInterrupted = () => {
      if (input.signal?.aborted) {
        throw input.signal.reason ?? new Error("Document task interrupted");
      }
    };

    throwIfInterrupted();
    const currentPages = useFileStore
      .getState()
      .pages.filter(
        (page) => page.documentId === input.documentId && input.questionPageIds.includes(page.id)
      )
      .sort((left, right) => left.pageNumber - right.pageNumber);
    const currentQuestions = useQuestionStore
      .getState()
      .questionDrafts.filter((question) => question.documentId === input.documentId);
    const targetQuestionIds = collectQuestionIdsNeedingClassification(
      currentQuestions,
      input.documentId
    );

    if (targetQuestionIds.length === 0) {
      setClassificationRunProgress({
        status: "done",
        ocrCurrent: 0,
        ocrTotal: 0,
        classificationCurrent: 0,
        classificationTotal: 0,
        message: "没有需要重新 OCR 的题目"
      });
      return 0;
    }

    setClassificationRunMessage("正在 OCR 全文并提取原题号...");
    setClassificationRunProgress({
      status: "running",
      ocrCurrent: 0,
      ocrTotal: currentPages.length,
      classificationCurrent: 0,
      classificationTotal: targetQuestionIds.length,
      message: "Preparing OCR images"
    });

    let preparedPageCount = 0;
    const preparedPages = await runWithConcurrency(currentPages, 4, async (page) => {
      throwIfInterrupted();
      const sourceDataUrl = await resolvePagePreviewDataUrl(page);
      const imageDataUrl = sourceDataUrl
        ? await prepareAiPreviewDataUrl(sourceDataUrl)
        : null;

      throwIfInterrupted();
      preparedPageCount += 1;
      setClassificationRunProgress({
        status: "running",
        ocrCurrent: preparedPageCount,
        ocrTotal: currentPages.length,
        classificationCurrent: 0,
        classificationTotal: targetQuestionIds.length,
        message: "Preparing OCR images"
      });
      input.onProgress?.({
        current: preparedPageCount,
        total: currentPages.length,
        message: "正在准备 OCR 页面"
      });

      return {
        ...page,
        imageDataUrl
      };
    });
    const questionTasks = buildDocumentClassificationTasks({
      questionIds: targetQuestionIds,
      pages: preparedPages,
      questions: currentQuestions
    });

    if (questionTasks.length === 0) {
      throw new Error("没有可发送给 OCR 的题目图片");
    }

    let completedCount = 0;
    const responses = await runWithConcurrency(
      questionTasks,
      resolveAiRequestConcurrency(
        process.env.NEXT_PUBLIC_TEACHHELPER_AI_REQUEST_CONCURRENCY ??
          process.env.NEXT_PUBLIC_TEACHHELPER_QUESTION_BOX_CONCURRENCY
      ),
      async (task) => {
      try {
        const response = await fetch("/api/ai/classify-document-questions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: input.signal,
          body: JSON.stringify({
            documentId: input.documentId,
            subjectScope: input.subjectScope,
            directoryPaths: aiMatchableDirectoryPaths,
            pages: task.pages
          })
        });

        if (!response.ok) {
          return {
            source: undefined,
            results: [] as ClassificationResultPayload[],
            failed: true
          };
        }

        const payload = (await response.json()) as {
          source?: ClassificationResponseSource;
          results?: ClassificationResultPayload[];
        };

        throwIfInterrupted();
        return {
          source: payload.source,
          results: payload.results ?? [],
          failed: false
        };
      } finally {
        if (!input.signal?.aborted) {
          completedCount += 1;
          setClassificationRunProgress({
            status: "running",
            ocrCurrent: currentPages.length,
            ocrTotal: currentPages.length,
            classificationCurrent: completedCount,
            classificationTotal: questionTasks.length,
            message: "Running OCR and classification"
          });
          if (input.onProgress) {
            input.onProgress({
              current: completedCount,
              total: questionTasks.length,
              message: "正在 OCR 全文并提取原题号"
            });
          } else {
            setDocumentProcessingProgress({
              status: "running",
              stage: "ocr",
              current: completedCount,
              total: questionTasks.length,
              message: "正在 OCR 全文并提取原题号",
              summary: null
            });
          }
        }
      }
      }
    );
    const results = responses.flatMap((response) => response.results);
    throwIfInterrupted();
    const failedCount = responses.filter((response) => response.failed).length;
    const fallbackError = getAutomaticWorkflowFallbackError(
      "OCR 与分类",
      responses.find((response) => response.source?.provider === "local_fallback")?.source
    );

    if (fallbackError) {
      throw new Error(fallbackError);
    }

    if (results.length === 0) {
      throw new Error(
        failedCount > 0 ? "OCR + 分类请求失败" : "OCR 没有返回当前文件的题目结果"
      );
    }

    const currentQuestionIds = new Set(
      useQuestionStore
        .getState()
        .questionDrafts.filter((question) => question.documentId === input.documentId)
        .map((question) => question.id)
    );
    const applicableResults = results.filter((result) => currentQuestionIds.has(result.questionId));

    if (applicableResults.length === 0) {
      throw new Error(`生成 ${results.length} 条 OCR 结果，但 0 条匹配当前文件题目`);
    }

    throwIfInterrupted();
    applyClassificationResults(input.documentId, applicableResults);
    const appliedQuestionIds = new Set(applicableResults.map((result) => result.questionId));
    const missingQuestionIds = targetQuestionIds.filter(
      (questionId) => !appliedQuestionIds.has(questionId)
    );

    if (missingQuestionIds.length > 0) {
      const message = `OCR 与分类缺少 ${missingQuestionIds.length}/${targetQuestionIds.length} 道题结果，请从当前阶段重试`;

      setClassificationRunMessage(message);
      setClassificationRunProgress({
        status: "failed",
        ocrCurrent: currentPages.length,
        ocrTotal: currentPages.length,
        classificationCurrent: appliedQuestionIds.size,
        classificationTotal: targetQuestionIds.length,
        message
      });
      throw new Error(message);
    }

    const firstReviewQuestion = prioritizeQuestionsForReview(
      useQuestionStore.getState().questionDrafts,
      input.documentId
    )[0];

    if (firstReviewQuestion) {
      selectPage(firstReviewQuestion.primaryPageId);
      selectQuestion(firstReviewQuestion.id);
    }

    const fallbackNotice = getClassificationFallbackNotice(
      responses.find((response) => response.source)?.source
    );
    const message = fallbackNotice ?? `已完成 ${applicableResults.length} 道题 OCR 与分类`;

    setClassificationRunMessage(message);
    setClassificationRunProgress({
      status: "done",
      ocrCurrent: currentPages.length,
      ocrTotal: currentPages.length,
      classificationCurrent: applicableResults.length,
      classificationTotal: questionTasks.length,
      message
    });

    return applicableResults.length;
  };

  const matchAnswersForAutomaticWorkflow = async (input: {
    documentId: string;
    answerPages: Array<{
      pageId: string;
      pageNumber: number;
      imageDataUrl: string;
      textLines?: PageEntity["textLines"];
    }>;
    signal?: AbortSignal;
    onProgress?: (progress: { current: number; total: number; message: string }) => void;
  }) => {
    const throwIfInterrupted = () => {
      if (input.signal?.aborted) {
        throw input.signal.reason ?? new Error("Document task interrupted");
      }
    };

    const currentQuestions = useQuestionStore
      .getState()
      .questionDrafts.filter((question) => question.documentId === input.documentId)
      .sort((left, right) => left.globalOrder - right.globalOrder);
    const nativeDetection = buildNativeAutomaticAnswerDetections({
      questions: currentQuestions,
      answerPages: input.answerPages
    });
    let detectedAnswers = nativeDetection.detections;

    if (nativeDetection.complete) {
      input.onProgress?.({
        current: input.answerPages.length,
        total: input.answerPages.length,
        message: "已按 PDF 原题号完成答案匹配"
      });
    } else {
      const preparedAnswerPages = await runWithConcurrency(input.answerPages, 4, async (page) => {
        throwIfInterrupted();
        const preparedPage = {
          pageId: page.pageId,
          pageNumber: page.pageNumber,
          imageDataUrl: await prepareAiPreviewDataUrl(page.imageDataUrl)
        };

        throwIfInterrupted();

        if (input.onProgress) {
          input.onProgress({
            current: 0,
            total: input.answerPages.length,
            message: "正在准备答案页"
          });
        } else {
          setDocumentProcessingProgress({
            status: "running",
            stage: "answer_matching",
            current: 0,
            total: input.answerPages.length,
            message: "正在准备答案页",
            summary: null
          });
        }
        return preparedPage;
      });
      let completedAnswerPageCount = 0;
      const detectedAnswersByPage = await runWithConcurrency(
        preparedAnswerPages,
        resolveAiRequestConcurrency(
          process.env.NEXT_PUBLIC_TEACHHELPER_AI_REQUEST_CONCURRENCY ??
            process.env.NEXT_PUBLIC_TEACHHELPER_QUESTION_BOX_CONCURRENCY
        ),
        async (answerPage) => {
          throwIfInterrupted();
          const response = await fetch("/api/ai/suggest-answer-matches", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            signal: input.signal,
            body: JSON.stringify({
              documentId: input.documentId,
              questions: currentQuestions.map((question) => ({
                id: question.id,
                globalOrder: question.globalOrder,
                questionNumberLabel: question.questionNumberLabel ?? null
              })),
              answerPages: [answerPage]
            })
          });

          if (!response.ok) {
            throw new Error(`第 ${answerPage.pageNumber} 页答案 OCR 与匹配请求失败`);
          }

          const payload = (await response.json()) as {
            source?: ClassificationResponseSource;
            detectedAnswers?: Array<{
              id: string;
              pageId: string;
              pageNumber: number;
              answerLabel: string;
              ocrText?: string | null;
              confidence: number;
              normalizedBBox: {
                x1: number;
                y1: number;
                x2: number;
                y2: number;
              };
            }>;
          };
          throwIfInterrupted();
          const fallbackError = getAutomaticWorkflowFallbackError("答案匹配", payload.source);

          if (fallbackError) {
            throw new Error(fallbackError);
          }

          completedAnswerPageCount += 1;
          const progress = {
            current: completedAnswerPageCount,
            total: preparedAnswerPages.length,
            message: `已完成 ${completedAnswerPageCount}/${preparedAnswerPages.length} 页答案 OCR`
          };

          if (input.onProgress) {
            input.onProgress(progress);
          } else {
            setDocumentProcessingProgress({
              status: "running",
              stage: "answer_matching",
              ...progress,
              summary: null
            });
          }

          return (payload.detectedAnswers ?? []).filter(
            (answer) =>
              answer.pageId === answerPage.pageId &&
              answer.pageNumber === answerPage.pageNumber
          );
        }
      );

      detectedAnswers = ensureUniqueAnswerDetectionIds(detectedAnswersByPage.flat());
    }

    const matches = buildPendingAnswerMatches({
      questions: currentQuestions.map((question) => ({
        id: question.id,
        globalOrder: question.globalOrder,
        questionNumberLabel: question.questionNumberLabel ?? null
      })),
      detectedAnswers
    });
    const partition = nativeDetection.complete
      ? {
          autoAttachMatches: matches.filter((match) => Boolean(match.suggestedQuestionId)),
          pendingMatches: matches.filter((match) => !match.suggestedQuestionId)
        }
      : partitionAnswerMatchesForAutoAttach(matches);
    const attachResults = await runWithConcurrency(
      partition.autoAttachMatches,
      4,
      (match) => attachDetectedAnswerMatch(input.documentId, match)
    );
    throwIfInterrupted();
    const failedAutoMatches = partition.autoAttachMatches.filter(
      (_, index) => !attachResults[index]
    );
    const attachmentsByQuestionId = new Map<
      string,
      Array<{
        id: string;
        assetId: string;
        kind: "matched";
      }>
    >();

    attachResults.forEach((result) => {
      if (!result) {
        return;
      }

      const attachments = attachmentsByQuestionId.get(result.questionId) ?? [];
      attachments.push(result.attachment);
      attachmentsByQuestionId.set(result.questionId, attachments);
    });
    attachmentsByQuestionId.forEach((attachments, questionId) => {
      const question = useQuestionStore
        .getState()
        .questionDrafts.find((item) => item.id === questionId);

      if (!question) {
        return;
      }

      const existingAttachments = question.answerAttachments ?? [];
      const existingAttachmentIds = new Set(
        existingAttachments.map((attachment) => attachment.id)
      );
      attachAnswerToQuestion(
        questionId,
        existingAttachments.concat(
          attachments.filter((attachment) => !existingAttachmentIds.has(attachment.id))
        )
      );
    });
    const pendingMatches = partition.pendingMatches.concat(failedAutoMatches);
    const autoMatchedCount = partition.autoAttachMatches.length - failedAutoMatches.length;

    setDocumentPendingAnswerMatches(input.documentId, pendingMatches);

    const uncoveredQuestionIds = collectUncoveredAnswerQuestionIds({
      questions: useQuestionStore
        .getState()
        .questionDrafts.filter((question) => question.documentId === input.documentId),
      matches: pendingMatches
    });

    if (uncoveredQuestionIds.length > 0) {
      throw new Error(
        `答案匹配缺少 ${uncoveredQuestionIds.length}/${currentQuestions.length} 道题，请从当前阶段重试`
      );
    }

    return {
      autoMatchedCount,
      pendingCount: pendingMatches.length
    };
  };

  const archiveDocumentPagePreviews = (documentId: string) => {
    const questionState = useQuestionStore.getState();
    const nextAssets = ensureDurablePagePreviewAssets({
      pages: useFileStore
        .getState()
        .pages.filter((page) => page.documentId === documentId),
      pagePreviewDataUrls: questionState.pagePreviewDataUrls,
      binaryAssets: questionState.binaryAssets
    });

    if (nextAssets !== questionState.binaryAssets) {
      setBinaryAssets(nextAssets);
    }
  };

  const materializeDurableQuestionImagesForDocument = async (documentId: string) => {
    const questionState = useQuestionStore.getState();
    const documentQuestions = questionState.questionDrafts.filter(
      (question) => question.documentId === documentId
    );

    if (
      hasCompleteDurableQuestionImages({
        questions: documentQuestions,
        binaryAssets: questionState.binaryAssets
      })
    ) {
      return documentQuestions.length;
    }

    const sourcePdfAsset = questionState.binaryAssets.find(
      (asset) =>
        asset.documentId === documentId &&
        asset.kind === "source" &&
        asset.mimeType === "application/pdf" &&
        ((typeof Blob !== "undefined" && asset.blob instanceof Blob) ||
          asset.dataUrl?.startsWith("data:application/pdf"))
    );

    // Legacy libraries did not retain source PDF bytes. They remain readable through page crops
    // and can be upgraded later by the migration tool when their original PDF is available.
    if (!sourcePdfAsset) {
      return 0;
    }

    const sourcePdfBlob =
      typeof Blob !== "undefined" && sourcePdfAsset.blob instanceof Blob
        ? sourcePdfAsset.blob
        : null;
    const sourcePdfArrayBuffer = !sourcePdfBlob && sourcePdfAsset.dataUrl
      ? dataUrlToArrayBuffer(sourcePdfAsset.dataUrl)
      : null;

    if (!sourcePdfBlob && !sourcePdfArrayBuffer) {
      return 0;
    }

    setDocumentProcessingProgress({
      status: "running",
      stage: "specialized_sync",
      current: 0,
      total: Math.max(documentQuestions.length, 1),
      message: "正在生成 300 DPI 题目文件",
      summary: null
    });
    const result = await materializeDurableQuestionImages({
      documentId,
      sourcePdfBlob: sourcePdfBlob ?? undefined,
      sourcePdfArrayBuffer: sourcePdfArrayBuffer ?? undefined,
      pages: useFileStore.getState().pages,
      questions: questionState.questionDrafts
    });
    const replacementAssetIds = new Set(result.assets.map((asset) => asset.id));
    const nextAssets = useQuestionStore
      .getState()
      .binaryAssets.filter((asset) => !replacementAssetIds.has(asset.id))
      .concat(result.assets);

    setBinaryAssets(nextAssets);
    upsertQuestionDrafts(result.questions);

    if (
      !hasCompleteDurableQuestionImages({
        questions: result.questions,
        binaryAssets: nextAssets
      })
    ) {
      throw new Error("高清题目文件生成不完整，已保留原 PDF，请从当前阶段重试");
    }

    return result.assets.length;
  };

  const syncSpecializedDocumentsForWorkflow = async (documentId: string): Promise<number> => {
    await materializeDurableQuestionImagesForDocument(documentId);
    archiveDocumentPagePreviews(documentId);
    const questionFolders = useFolderStore.getState().folders;
    const examState = useExamStore.getState();
    const nextExamFolders = ensureExamLibraryFolders({
      questionFolders,
      existingExamLibraryFolders: examState.examLibraryFolders
    });

    if (nextExamFolders !== examState.examLibraryFolders) {
      examState.setExamLibraryFolders(nextExamFolders);
    }

    const currentExamDocuments = useExamStore.getState().examLibraryDocuments;
    const questionDrafts = useQuestionStore.getState().questionDrafts;
    const nextExamDocuments = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: nextExamFolders,
      questionDrafts,
      existingDocuments: currentExamDocuments
    });

    if (nextExamDocuments !== currentExamDocuments) {
      useExamStore.getState().setExamLibraryDocuments(nextExamDocuments);
    }

    const documentQuestionIds = new Set(
      questionDrafts
        .filter((question) => question.documentId === documentId)
        .map((question) => question.id)
    );

    return nextExamDocuments.filter(
      (document) =>
        document.library === "specialized" &&
        document.isDefault &&
        (document.pendingQuestionIds ?? document.questionIds).some((questionId) =>
          documentQuestionIds.has(questionId)
        )
    ).length;
  };

  const runAutomaticDocumentWorkflow = async (
    input: AutomaticDocumentWorkflowInput,
    resume?: AutomaticDocumentWorkflowResume,
    taskContext?: AutomaticDocumentTaskContext
  ) => {
    const workflowRunId = taskContext?.runId ?? resume?.workflowRunId ?? createWorkflowRunId();
    let failedStage: DocumentProcessingExecutableStage = resume?.startStage ?? "question_boxes";
    let latestCheckpoint: DocumentProcessingCheckpoint = {
      nextStage: resume?.startStage ?? "question_boxes",
      summary: resume?.initialSummary ?? {
        questionCount: 0,
        crossPageMergeCount: 0,
        classifiedQuestionCount: 0,
        autoMatchedAnswerCount: 0,
        pendingAnswerCount: 0,
        specializedDocumentCount: 0
      }
    };
    const stageMessages = {
      question_boxes: "正在按页并发框题",
      cross_page: "正在自动检测并合并跨页题",
      ocr: "正在 OCR 全文并提取原题号",
      answer_matching: "正在 OCR 答案全文并按原题号匹配",
      specialized_sync: "正在生成并同步专题卷",
      done: "整卷处理完成"
    } as const;
    const assertTaskRunWritable = () => {
      if (!taskContext) {
        return;
      }

      if (taskContext.signal.aborted) {
        throw taskContext.signal.reason ?? new Error("Document task interrupted");
      }

      if (!isDocumentTaskRunWritable(taskContext.taskId, taskContext.runId)) {
        throw new Error("Document task run is no longer active");
      }
    };
    const publishProcessingProgress = (progress: DocumentProcessingProgress) => {
      if (taskContext) {
        if (!isDocumentTaskRunWritable(taskContext.taskId, taskContext.runId)) {
          return;
        }
        useWorkbenchStore.getState().updateDocumentTaskProgress(
          taskContext.taskId,
          taskContext.runId,
          {
            stage: progress.stage,
            current: progress.current,
            total: progress.total,
            message: progress.message,
            summary: progress.summary
          }
        );
      }

      setDocumentProcessingProgress(progress);
    };

    setDocumentProcessingRetry(null);

    try {
      const summary = await runDocumentProcessingWorkflow({
        hasAnswerSection: input.hasAnswerSection,
        startStage: resume?.startStage,
        initialSummary: resume?.initialSummary,
        onCheckpoint: (checkpoint) => {
          latestCheckpoint = checkpoint;
          if (taskContext) {
            useWorkbenchStore
              .getState()
              .updateDocumentTaskCheckpoint(taskContext.taskId, taskContext.runId, checkpoint);
          }
        },
        onStage: ({ stage, status }) => {
          assertTaskRunWritable();
          if (stage !== "done" && (status === "running" || status === "failed")) {
            failedStage = stage;
          }
          const currentProgress = useWorkbenchStore.getState().documentProcessingProgress;
          if (status === "failed") {
            void recordWorkflowEvent({
              runId: workflowRunId,
              taskId: taskContext?.taskId,
              documentId: input.documentId,
              event: "workflow_stage",
              stage,
              status
            });
          }
          const defaultTotal = stage === "question_boxes"
            ? input.questionPages.length
            : stage === "cross_page"
              ? Math.max(input.questionPages.length - 1, 0)
              : stage === "answer_matching"
                ? input.answerPages.length
                : 1;

          publishProcessingProgress({
            status,
            stage,
            current:
              status === "done"
                ? currentProgress.stage === stage
                  ? currentProgress.total
                  : defaultTotal
                : 0,
            total:
              currentProgress.stage === stage && currentProgress.total > 0
                ? currentProgress.total
                : defaultTotal,
            message: stageMessages[stage],
            summary: null
          });
        },
        detectQuestionBoxes: async () => {
          assertTaskRunWritable();
          await analyzeQuestionPages(input.questionPages, {
            markReviewed: true,
            questionPageLayoutMode: input.questionPageLayoutMode,
            signal: taskContext?.signal,
            workflowRunId,
            taskId: taskContext?.taskId,
            completedPageIds: taskContext
              ? useWorkbenchStore
                  .getState()
                  .documentTasks.find(
                    (task) =>
                      task.id === taskContext.taskId && task.runId === taskContext.runId
                  )?.completedPageIds
              : undefined,
            onPageResult: taskContext
              ? (pageId, result) => {
                  useWorkbenchStore
                    .getState()
                    .recordDocumentTaskPageResult(
                      taskContext.taskId,
                      taskContext.runId,
                      pageId,
                      result
                    );
                }
              : undefined,
            onProgress: (progress) => {
              setDocumentAutoDetectProgress({
                status: "running",
                phase: "question_boxes",
                current: progress.current,
                total: progress.total,
                pageNumber: progress.pageNumber,
                message: null
              });
              publishProcessingProgress({
                status: "running",
                stage: "question_boxes",
                current: progress.current,
                total: progress.total,
                message: stageMessages.question_boxes,
                summary: null
              });
            }
          });
          assertTaskRunWritable();
          const failedPages = useFileStore
            .getState()
            .pages.filter(
              (page) =>
                input.questionPages.some((item) => item.id === page.id) &&
                page.analysisStatus === "failed"
            );

          if (failedPages.length > 0) {
            throw new Error(`${failedPages.length} 页框题失败`);
          }

          return useQuestionStore
            .getState()
            .questionDrafts.filter((question) => question.documentId === input.documentId).length;
        },
        detectCrossPage: async () => {
          assertTaskRunWritable();
          if (input.questionPages.length < 2) {
            return 0;
          }

          return detectAndApplyDocumentCrossPageMerges({
            documentId: input.documentId,
            workflowRunId,
            taskId: taskContext?.taskId,
            signal: taskContext?.signal,
            onProgress: (progress) =>
              publishProcessingProgress({
                status: "running",
                stage: "cross_page",
                current: progress.current,
                total: progress.total,
                message: progress.message,
                summary: null
              }),
            questionPages: input.questionPages
          });
        },
        getQuestionCount: () =>
          useQuestionStore
            .getState()
            .questionDrafts.filter((question) => question.documentId === input.documentId).length,
        classifyQuestions: async () => {
          assertTaskRunWritable();
          const result = await classifyDocumentForAutomaticWorkflow({
            documentId: input.documentId,
            subjectScope: input.subjectScope,
            questionPageIds: input.questionPages.map((page) => page.id),
            signal: taskContext?.signal,
            onProgress: (progress) =>
              publishProcessingProgress({
                status: "running",
                stage: "ocr",
                current: progress.current,
                total: progress.total,
                message: progress.message,
                summary: null
              })
          });
          assertTaskRunWritable();
          return result;
        },
        matchAnswers: async () => {
          assertTaskRunWritable();
          const result = await matchAnswersForAutomaticWorkflow({
            documentId: input.documentId,
            answerPages: input.answerPages,
            signal: taskContext?.signal,
            onProgress: (progress) =>
              publishProcessingProgress({
                status: "running",
                stage: "answer_matching",
                current: progress.current,
                total: progress.total,
                message: progress.message,
                summary: null
              })
          });
          assertTaskRunWritable();
          return result;
        },
        syncSpecialized: async () => {
          assertTaskRunWritable();
          const startedAt = Date.now();
          const specializedDocumentCount = await syncSpecializedDocumentsForWorkflow(
            input.documentId
          );
          assertTaskRunWritable();

          void recordWorkflowEvent({
            runId: workflowRunId,
            event: "specialized_sync",
            stage: "specialized_sync",
            status: "done",
            total: specializedDocumentCount,
            elapsedMs: Date.now() - startedAt
          });
          pushToast({
            title: specializedDocumentCount > 0
              ? `专题卷同步完成：已更新 ${specializedDocumentCount} 份专题资料。`
              : "专题卷同步完成：本次未生成专题资料，请先完成分类复核。",
            tone: specializedDocumentCount > 0 ? "success" : "info"
          });

          return specializedDocumentCount;
        }
      });

      publishProcessingProgress({
        status: "done",
        stage: "done",
        current: 1,
        total: 1,
        message: stageMessages.done,
        summary
      });
      setDocumentProcessingRetry(null);
      setActiveWorkbenchView(summary.pendingAnswerCount > 0 ? "answers" : "classification");
    } catch (error) {
      if (
        taskContext &&
        (taskContext.signal.aborted ||
          !isDocumentTaskRunWritable(taskContext.taskId, taskContext.runId))
      ) {
        throw error;
      }

      const message = error instanceof Error ? error.message : "整卷处理失败";
      const currentProgress = useWorkbenchStore.getState().documentProcessingProgress;
      const retrySummary = { ...latestCheckpoint.summary };

      setDocumentProcessingRetry(
        taskContext
          ? () => resumeDocumentTaskExecution(taskContext.taskId)
          : () => {
              void runAutomaticDocumentWorkflow(input, {
                workflowRunId,
                startStage: failedStage,
                initialSummary: retrySummary
              });
            }
      );

      publishProcessingProgress({
        ...currentProgress,
        status: "failed",
        message,
        summary: null
      });
      setClassificationRunMessage(message);
      pushToast({
        title: message,
        tone: "error"
      });

      if (taskContext) {
        throw error;
      }
    }
  };

  const buildAutomaticDocumentWorkflowInput = async (
    task: DocumentProcessingTask,
    signal: AbortSignal
  ): Promise<AutomaticDocumentWorkflowInput> => {
    const fileState = useFileStore.getState();
    const document = fileState.documents.find((item) => item.id === task.documentId);

    if (!document) {
      throw new Error(`找不到任务对应的文件：${task.documentName}`);
    }

    const documentPages = fileState.pages
      .filter((page) => page.documentId === document.id)
      .sort((left, right) => left.pageNumber - right.pageNumber);
    const configuredQuestionPageIds = task.workflowInput.questionPageIds;
    const configuredAnswerPageIds = task.workflowInput.answerPageIds;
    const answerSection = document.answerSection;
    const splitPage = answerSection?.hasAnswerSection
      ? answerSection.confirmedSplitPage ?? Number.MAX_SAFE_INTEGER
      : Number.MAX_SAFE_INTEGER;
    const questionPageIdSet = new Set(
      configuredQuestionPageIds.length > 0
        ? configuredQuestionPageIds
        : documentPages
            .filter((page) => page.pageNumber < splitPage)
            .map((page) => page.id)
    );
    const answerPageIdSet = new Set(
      configuredAnswerPageIds.length > 0
        ? configuredAnswerPageIds
        : documentPages
            .filter((page) => page.pageNumber >= splitPage)
            .map((page) => page.id)
    );
    const questionPages = documentPages.filter((page) => questionPageIdSet.has(page.id));
    const answerPages = (
      await Promise.all(
        documentPages
          .filter((page) => answerPageIdSet.has(page.id))
          .map(async (page) => ({
            pageId: page.id,
            pageNumber: page.pageNumber,
            imageDataUrl: await resolvePagePreviewDataUrl(page),
            textLines: page.textLines
          }))
      )
    ).filter(
      (page): page is {
        pageId: string;
        pageNumber: number;
        imageDataUrl: string;
        textLines: PageEntity["textLines"];
      } =>
        Boolean(page.imageDataUrl)
    );

    if (signal.aborted) {
      throw signal.reason ?? new Error("Document task interrupted");
    }

    if (task.workflowInput.hasAnswerSection && answerPages.length !== answerPageIdSet.size) {
      throw new Error("答案页预览不完整，无法从检查点继续");
    }

    return {
      documentId: document.id,
      subjectScope: task.workflowInput.subjectScope ?? document.subjectScope ?? null,
      questionPageLayoutMode:
        task.workflowInput.questionPageLayoutMode ??
        document.questionPageLayoutMode ??
        "single_column",
      questionPages,
      answerPages,
      hasAnswerSection: task.workflowInput.hasAnswerSection
    };
  };

  const registerAutomaticDocumentTask = (task: DocumentProcessingTask) => {
    registerDocumentTaskJob({
      taskId: task.id,
      runId: task.runId,
      priority: task.priority,
      createdAt: task.createdAt,
      run: async ({ signal }) => {
        const initialProgress: DocumentProcessingProgress = {
          status: "running",
          stage: task.checkpoint.nextStage === "done"
            ? "done"
            : task.checkpoint.nextStage,
          current: task.checkpoint.nextStage === "question_boxes"
            ? task.completedPageIds.length
            : 0,
          total: task.checkpoint.nextStage === "question_boxes"
            ? task.workflowInput.questionPageIds.length
            : 1,
          message: task.progress.message,
          summary: null
        };
        useWorkbenchStore.getState().updateDocumentTaskProgress(
          task.id,
          task.runId,
          {
            stage: initialProgress.stage,
            current: initialProgress.current,
            total: initialProgress.total,
            message: initialProgress.message,
            summary: null
          }
        );
        setDocumentProcessingProgress(initialProgress);
        if (task.checkpoint.nextStage === "question_boxes") {
          setDocumentAutoDetectProgress({
            status: "running",
            phase: "question_boxes",
            current: task.completedPageIds.length,
            total: task.workflowInput.questionPageIds.length,
            pageNumber: null,
            message: null
          });
        }

        const currentTask = useWorkbenchStore
          .getState()
          .documentTasks.find(
            (item) => item.id === task.id && item.runId === task.runId
          );

        if (!currentTask || currentTask.checkpoint.nextStage === "done") {
          return;
        }

        const workflowInput = await buildAutomaticDocumentWorkflowInput(currentTask, signal);
        await runAutomaticDocumentWorkflow(
          workflowInput,
          {
            workflowRunId: currentTask.runId,
            startStage: currentTask.checkpoint.nextStage,
            initialSummary: currentTask.checkpoint.summary
          },
          {
            taskId: currentTask.id,
            runId: currentTask.runId,
            signal
          }
        );
      }
    });
  };

  const enqueueAutomaticDocumentWorkflow = (
    input: AutomaticDocumentWorkflowInput,
    resume?: Pick<AutomaticDocumentWorkflowResume, "startStage" | "initialSummary">
  ) => {
    const document = useFileStore
      .getState()
      .documents.find((item) => item.id === input.documentId);

    if (!document) {
      return;
    }

    const runId = createWorkflowRunId();
    const task = createDocumentProcessingTask({
      id: `document-task-${runId}`,
      runId,
      documentId: input.documentId,
      documentName: document.name,
      workflowInput: {
        subjectScope: input.subjectScope,
        questionPageLayoutMode: input.questionPageLayoutMode,
        hasAnswerSection: input.hasAnswerSection,
        questionPageIds: input.questionPages.map((page) => page.id),
        answerPageIds: input.answerPages.map((page) => page.pageId)
      }
    });
    const queuedTask: DocumentProcessingTask = resume
      ? {
          ...task,
          checkpoint: {
            nextStage: resume.startStage,
            summary: { ...resume.initialSummary }
          }
        }
      : task;

    useWorkbenchStore.getState().enqueueDocumentTask(queuedTask);
    registerAutomaticDocumentTask(queuedTask);
  };

  useEffect(() => {
    documentTasks
      .filter((task) => task.status === "queued")
      .forEach((task) => registerAutomaticDocumentTask(task));
  }, [documentTasks]);

  useEffect(() => {
    if (!crossPageReviewResumeRequest) {
      return;
    }

    const request = consumeCrossPageReviewResumeRequest(crossPageReviewResumeRequest.id);

    if (!request) {
      return;
    }

    const document = useFileStore
      .getState()
      .documents.find((item) => item.id === request.documentId);

    if (!document) {
      return;
    }

    const documentPages = useFileStore
      .getState()
      .pages.filter((page) => page.documentId === document.id)
      .sort((left, right) => left.pageNumber - right.pageNumber);
    const answerSection = document.answerSection;
    const hasAnswerSection = answerSection?.hasAnswerSection === true;
    const splitPage = hasAnswerSection
      ? answerSection?.confirmedSplitPage ?? Number.MAX_SAFE_INTEGER
      : Number.MAX_SAFE_INTEGER;
    const questionPages = documentPages.filter((page) => page.pageNumber < splitPage);
    const answerPages = hasAnswerSection
      ? documentPages
          .filter((page) => page.pageNumber >= splitPage)
          .map((page) => ({
            pageId: page.id,
            pageNumber: page.pageNumber,
            imageDataUrl: useQuestionStore.getState().pagePreviewDataUrls[page.id] ?? "",
            textLines: page.textLines
          }))
          .filter((page) => Boolean(page.imageDataUrl))
      : [];
    const questionCount = useQuestionStore
      .getState()
      .questionDrafts.filter((question) => question.documentId === document.id).length;

    setActiveWorkbenchView("processing");
    enqueueAutomaticDocumentWorkflow(
      {
        documentId: document.id,
        subjectScope: document.subjectScope ?? null,
        questionPageLayoutMode: document.questionPageLayoutMode ?? "single_column",
        questionPages,
        answerPages,
        hasAnswerSection
      },
      {
        startStage: request.startStage,
        initialSummary: {
          questionCount,
          crossPageMergeCount: request.startStage === "ocr" ? request.acceptedCount : 0,
          classifiedQuestionCount: 0,
          autoMatchedAnswerCount: 0,
          pendingAnswerCount: 0,
          specializedDocumentCount: 0
        }
      }
    );
  }, [crossPageReviewResumeRequest]);

  const handleResumeIncompleteDocumentOcr = () => {
    if (!selectedDocument || questionIdsNeedingClassification.length === 0) {
      return;
    }

    const answerSection = selectedDocument.answerSection;
    const hasAnswerSection = answerSection?.hasAnswerSection === true;
    const splitPage = hasAnswerSection
      ? answerSection?.confirmedSplitPage ?? Number.MAX_SAFE_INTEGER
      : Number.MAX_SAFE_INTEGER;
    const questionPages = selectedDocumentPages.filter((page) => page.pageNumber < splitPage);
    const answerPages = hasAnswerSection
      ? selectedDocumentPages
          .filter((page) => page.pageNumber >= splitPage)
          .map((page) => ({
            pageId: page.id,
            pageNumber: page.pageNumber,
            imageDataUrl: useQuestionStore.getState().pagePreviewDataUrls[page.id] ?? "",
            textLines: page.textLines
          }))
          .filter((page) => Boolean(page.imageDataUrl))
      : [];

    setActiveWorkbenchView("processing");
    enqueueAutomaticDocumentWorkflow(
      {
        documentId: selectedDocument.id,
        subjectScope: selectedDocument.subjectScope ?? null,
        questionPageLayoutMode:
          selectedDocument.questionPageLayoutMode ?? "single_column",
        questionPages,
        answerPages,
        hasAnswerSection
      },
      {
        startStage: "ocr",
        initialSummary: {
          questionCount: selectedDocumentQuestions.length,
          crossPageMergeCount: selectedDocumentCrossPageCandidates.filter(
            (candidate) => candidate.status === "accepted"
          ).length,
          classifiedQuestionCount:
            selectedDocumentQuestions.length - questionIdsNeedingClassification.length,
          autoMatchedAnswerCount: 0,
          pendingAnswerCount: selectedDocument.pendingAnswerMatchCount ?? 0,
          specializedDocumentCount: 0
        }
      }
    );
  };

  const handleClassifyCurrentDocument = () => {
    if (!selectedDocument || !readyToClassify) {
      return;
    }

    const pagePayload = selectedDocumentPages.map((page) => ({
      id: page.id,
      reviewStatus: page.reviewStatus,
      imageDataUrl: pagePreviewDataUrls[page.id] ?? null,
      questionIds: selectedDocumentQuestions
        .filter((question) => question.pageIds.includes(page.id))
        .filter((question) => questionIdsNeedingClassification.includes(question.id))
        .map((question) => question.id)
    }));
    const runnableQuestionCount = pagePayload
      .filter((page) => page.reviewStatus === "reviewed")
      .reduce(
      (count, page) => count + page.questionIds.length,
      0
    );

    if (runnableQuestionCount === 0) {
      const message = "没有可 OCR/分类的题目，请先完成题框复核";
      setClassificationRunMessage(message);
      setClassificationRunProgress({
        status: "done",
        ocrCurrent: 0,
        ocrTotal: 0,
        classificationCurrent: 0,
        classificationTotal: 0,
        message
      });
      pushToast({
        title: message,
        tone: "info"
      });
      return;
    }

    if (hasUnreviewedPagesInDocument(selectedDocumentPages, selectedDocument.id)) {
      const accepted = window.confirm("当前文件没有全部框选完成，是否继续？");
      if (!accepted) {
        return;
      }
    }

    startTransition(() => {
      void (async () => {
        setClassificationRunMessage("正在 OCR + 分类...");

        const noDirectoryHint =
          aiMatchableDirectoryPaths.length === 0
            ? "No matchable directories are configured; results will need manual directory review."
            : null;

        if (noDirectoryHint) {
          setClassificationRunMessage(noDirectoryHint);
        }
        setClassificationRunProgress({
          status: "running",
          ocrCurrent: 0,
          ocrTotal: pagePayload.length,
          classificationCurrent: 0,
          classificationTotal: runnableQuestionCount,
          message: "Preparing OCR images"
        });

        try {
          let preparedPageCount = 0;
          const preparedPages = await runWithConcurrency(pagePayload, 4, async (page) => {
            const preparedPage = {
              ...page,
              imageDataUrl: page.imageDataUrl
                ? await prepareAiPreviewDataUrl(page.imageDataUrl)
                : page.imageDataUrl
            };

            preparedPageCount += 1;
            setClassificationRunProgress({
              status: "running",
              ocrCurrent: preparedPageCount,
              ocrTotal: pagePayload.length,
              classificationCurrent: 0,
              classificationTotal: runnableQuestionCount,
              message: "Preparing OCR images"
            });

            return preparedPage;
          });
          const preparedPageById = new Map(preparedPages.map((page) => [page.id, page]));
          const questionTasks = preparedPages
            .filter((page) => page.reviewStatus === "reviewed")
            .flatMap((page) =>
              page.questionIds.map((questionId) => ({
                questionId,
                page
              }))
            );

          setClassificationRunProgress({
            status: "running",
            ocrCurrent: pagePayload.length,
            ocrTotal: pagePayload.length,
            classificationCurrent: 0,
            classificationTotal: runnableQuestionCount,
            message: "Running OCR and classification"
          });
          let completedClassificationCount = 0;
          const classificationResponses = await runWithConcurrency(
            questionTasks,
            resolveAiRequestConcurrency(
              process.env.NEXT_PUBLIC_TEACHHELPER_AI_REQUEST_CONCURRENCY ??
                process.env.NEXT_PUBLIC_TEACHHELPER_QUESTION_BOX_CONCURRENCY
            ),
            async (task) => {
              try {
                const preparedPage = preparedPageById.get(task.page.id) ?? task.page;
                const response = await fetch("/api/ai/classify-document-questions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    documentId: selectedDocument.id,
                    subjectScope: selectedSubjectScope,
                    directoryPaths: aiMatchableDirectoryPaths,
                    pages: [
                      {
                        ...preparedPage,
                        questionIds: [task.questionId]
                      }
                    ]
                  })
                });

                if (!response.ok) {
                  return {
                    source: undefined,
                    results: [] as ClassificationResultPayload[],
                    failed: true
                  };
                }

                const payload = (await response.json()) as {
                  documentId: string;
                  source?: ClassificationResponseSource;
                  results?: ClassificationResultPayload[];
                };

                return {
                  source: payload.source,
                  results: payload.results ?? [],
                  failed: false
                };
              } finally {
                completedClassificationCount += 1;
                setClassificationRunProgress({
                  status: "running",
                  ocrCurrent: pagePayload.length,
                  ocrTotal: pagePayload.length,
                  classificationCurrent: completedClassificationCount,
                  classificationTotal: runnableQuestionCount,
                  message: "Running OCR and classification"
                });
              }
            }
          );
          const results = classificationResponses.flatMap((response) => response.results);
          const fallbackNotice = getClassificationFallbackNotice(
            classificationResponses.find((response) => response.source)?.source
          );
          const failedCount = classificationResponses.filter((response) => response.failed).length;

          if (failedCount > 0 && results.length === 0) {
            const message = "OCR + 分类请求失败，请稍后重试";
            setClassificationRunMessage(message);
            setClassificationRunProgress({
              status: "failed",
              ocrCurrent: pagePayload.length,
              ocrTotal: pagePayload.length,
              classificationCurrent: completedClassificationCount,
              classificationTotal: runnableQuestionCount,
              message
            });
            pushToast({
              title: message,
              tone: "error"
            });
            return;
          }

          setClassificationRunProgress({
            status: "running",
            ocrCurrent: pagePayload.length,
            ocrTotal: pagePayload.length,
            classificationCurrent: completedClassificationCount,
            classificationTotal: runnableQuestionCount,
            message: "Applying classification results"
          });
          const currentQuestionIds = new Set(
            useQuestionStore
              .getState()
              .questionDrafts.filter((question) => question.documentId === selectedDocument.id)
              .map((question) => question.id)
          );
          const appliedResultCount = results.filter((result) =>
            currentQuestionIds.has(result.questionId)
          ).length;
          applyClassificationResults(selectedDocument.id, results);
          const firstReviewQuestion = prioritizeQuestionsForReview(
            useQuestionStore.getState().questionDrafts,
            selectedDocument.id
          )[0];

          if (firstReviewQuestion) {
            selectPage(firstReviewQuestion.primaryPageId);
            selectQuestion(firstReviewQuestion.id);
          }

          if (results.length === 0) {
            const message = "本次没有生成分类结果";
            setClassificationRunMessage(message);
            setClassificationRunProgress({
              status: "done",
              ocrCurrent: pagePayload.length,
              ocrTotal: pagePayload.length,
              classificationCurrent: 0,
              classificationTotal: runnableQuestionCount,
              message
            });
            pushToast({
              title: message,
              tone: "info"
            });
            return;
          }

          if (appliedResultCount === 0) {
            const message = `生成 ${results.length} 条分类结果，但 0 条匹配当前文件题目`;
            setClassificationRunMessage(message);
            setClassificationRunProgress({
              status: "failed",
              ocrCurrent: pagePayload.length,
              ocrTotal: pagePayload.length,
              classificationCurrent: completedClassificationCount,
              classificationTotal: runnableQuestionCount,
              message
            });
            pushToast({
              title: message,
              tone: "error"
            });
            return;
          }

          const appliedSummaryMessage =
            results.length === appliedResultCount
              ? `已生成 ${appliedResultCount} 条分类结果`
              : `生成 ${results.length} 条分类结果，已应用 ${appliedResultCount} 条到当前文件`;

          setClassificationRunMessage(fallbackNotice ?? appliedSummaryMessage);
          setClassificationRunProgress({
            status: "done",
            ocrCurrent: pagePayload.length,
            ocrTotal: pagePayload.length,
            classificationCurrent: Math.min(appliedResultCount, runnableQuestionCount),
            classificationTotal: runnableQuestionCount,
            message: fallbackNotice ?? noDirectoryHint ?? appliedSummaryMessage
          });
          if (fallbackNotice) {
            pushToast({
              title: fallbackNotice,
              tone: "info"
            });
          }
        } catch {
          const message = "OCR + 分类异常，请检查网络或模型配置";
          setClassificationRunMessage(message);
          setClassificationRunProgress({
            status: "failed",
            ocrCurrent: 0,
            ocrTotal: pagePayload.length,
            classificationCurrent: 0,
            classificationTotal: runnableQuestionCount,
            message
          });
          pushToast({
            title: message,
            tone: "error"
          });
        }
      })();
    });
  };

  const handleConfirmHighConfidenceQuestions = () => {
    if (!selectedDocument || highConfidenceQuestionIds.length === 0) {
      return;
    }

    const accepted = window.confirm("确认将当前文件内所有高置信度题目直接标记为已复核吗？");
    if (!accepted) {
      return;
    }

    const confirmedCount = confirmQuestionsInBulk(selectedDocument.id, highConfidenceQuestionIds);

    if (confirmedCount > 0) {
      const nextQuestion = remainingClassificationReviewQuestions.find(
        (question) => !highConfidenceQuestionIds.includes(question.id)
      );

      if (nextQuestion) {
        selectPage(nextQuestion.primaryPageId);
        selectQuestion(nextQuestion.id);
      } else {
        selectQuestion(null);
      }

      pushToast({
        title: `已确认 ${confirmedCount} 道高置信度题目`,
        tone: "success",
        actionLabel: "撤销本次确认",
        onAction: () => {
          undoLastBulkConfirmation();
        }
      });
    }
  };

  const handlePurgeCurrentDocumentSource = () => {
    if (!selectedDocument || !isDocumentImportReady) {
      return;
    }

    if (!selectedDocumentHasDurableQuestionImages) {
      pushToast({
        title: "高清题目文件尚未完整保存，原文件不会删除；请从专题卷同步阶段重试。",
        tone: "error"
      });
      return;
    }

    const userConfirmedPurge = window.confirm("当前文件已完全入库，是否确认删除原文件？");
    if (!userConfirmedPurge) {
      return;
    }

    const canPurge = canPurgeSourceAsset({
      documentStatus: "import_ready",
      hasUnsavedChanges: false,
      hasDurableQuestionImages: selectedDocumentHasDurableQuestionImages,
      userConfirmedPurge
    });

    if (!canPurge) {
      return;
    }

    archiveDocumentPagePreviews(selectedDocument.id);
    purgeSourceAssetsForDocument(selectedDocument.id, selectedDocument.pageIds);
    updateDocumentStatus(selectedDocument.id, "import_ready");
    updateDocumentStatus(selectedDocument.id, "source_purged");
  };

  const handleConfirmAnswerSplit = () => {
    if (!selectedDocument || !questionPageLayoutModeDraft) {
      return;
    }

    const fallbackSplitPage =
      selectedDocumentAnswerSection?.suggestedSplitPage ?? selectedDocument.pageIds.length;
    const nextSplitPage = Number(answerSplitPageDraft || fallbackSplitPage);

    if (!Number.isFinite(nextSplitPage) || nextSplitPage < 1) {
      return;
    }

    confirmDocumentAnswerSection(selectedDocument.id, {
      hasAnswerSection: true,
      splitPage: nextSplitPage,
      questionPageLayoutMode: questionPageLayoutModeDraft
    });
    setAnswerSplitPageDraft(String(nextSplitPage));

    const answerPages = selectedDocumentPages
      .filter((page) => page.pageNumber >= nextSplitPage)
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((page) => ({
        pageId: page.id,
        pageNumber: page.pageNumber,
        imageDataUrl: pagePreviewDataUrls[page.id] ?? null,
        textLines: page.textLines
      }))
      .filter(
        (page): page is {
          pageId: string;
          pageNumber: number;
          imageDataUrl: string;
          textLines: PageEntity["textLines"];
        } => Boolean(page.imageDataUrl)
      );
    const questionPages = selectedDocumentPages
      .filter((page) => page.pageNumber < nextSplitPage)
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber);

    setDocumentPendingAnswerMatches(selectedDocument.id, []);
    setActiveWorkbenchView("processing");
    startTransition(() => {
      enqueueAutomaticDocumentWorkflow({
        documentId: selectedDocument.id,
        subjectScope: selectedSubjectScope,
        questionPageLayoutMode: questionPageLayoutModeDraft,
        questionPages,
        answerPages,
        hasAnswerSection: true
      });
    });
  };

  const handleMarkNoAnswerSection = () => {
    if (!selectedDocument || !questionPageLayoutModeDraft) {
      return;
    }

    confirmDocumentAnswerSection(selectedDocument.id, {
      hasAnswerSection: false,
      questionPageLayoutMode: questionPageLayoutModeDraft
    });
    setAnswerSplitPageDraft("");
    setDocumentPendingAnswerMatches(selectedDocument.id, []);
    setActiveWorkbenchView("processing");
    startTransition(() => {
      enqueueAutomaticDocumentWorkflow({
        documentId: selectedDocument.id,
        subjectScope: selectedSubjectScope,
        questionPageLayoutMode: questionPageLayoutModeDraft,
        questionPages: selectedDocumentPages
          .slice()
          .sort((left, right) => left.pageNumber - right.pageNumber),
        answerPages: [],
        hasAnswerSection: false
      });
    });
  };

  const handleResolvePendingAnswerMatch = (matchId: string) => {
    if (!selectedDocument) {
      return;
    }

    const match = selectedDocument.pendingAnswerMatches?.find((entry) => entry.id === matchId);

    if (
      !match ||
      !match.suggestedQuestionId ||
      !match.pageId ||
      !match.normalizedBBox
    ) {
      resolveDocumentPendingAnswerMatch(selectedDocument.id, matchId);
      return;
    }

    const targetQuestion = questionDrafts.find(
      (question) => question.id === match.suggestedQuestionId
    );
    const answerPage = pages.find((page) => page.id === match.pageId);
    const sourceDataUrl = pagePreviewDataUrls[match.pageId];
    const normalizedBBox = match.normalizedBBox;

    if (!targetQuestion || !answerPage || !sourceDataUrl || !normalizedBBox) {
      resolveDocumentPendingAnswerMatch(selectedDocument.id, matchId);
      return;
    }

    void (async () => {
      try {
        const asset = await createMatchedAnswerAssetRecord({
          id: createId("answer-asset"),
          documentId: selectedDocument.id,
          pageId: match.pageId as string,
          mimeType: "image/png",
          sourceDataUrl,
          pageSize: {
            width: answerPage.width,
            height: answerPage.height
          },
          normalizedBBox
        });

        appendBinaryAssets([asset]);
        attachAnswerToQuestion(targetQuestion.id, [
          ...(targetQuestion.answerAttachments ?? []),
          {
            id: createId("answer-attachment"),
            assetId: asset.id,
            kind: "matched"
          }
        ]);
      } finally {
        resolveDocumentPendingAnswerMatch(selectedDocument.id, matchId);
      }
    })();
  };

  return (
      <AppShell aside={<QuestionDrawer />} sidebar={<SidebarPanel />}>
        <div className="h-full min-h-0 space-y-4">
        {!selectedDocument ? <UploadWorkbench /> : null}

        {selectedDocument ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-950">
                {selectedDocument.name}
              </h1>
              <p className="mt-1 text-xs text-slate-500">
                {selectedDocumentPages.length} 页 · {selectedDocumentQuestions.length} 题
              </p>
            </div>
            <nav
              aria-label="document-workflow-navigation"
              className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1"
            >
              {[
                ["geometry", "页面与题框"],
                ["processing", "自动处理"],
                ["answers", `答案复核 ${selectedDocument.pendingAnswerMatchCount ?? 0}`],
                ["classification", `分类复核 ${remainingClassificationReviewQuestionCount}`],
                ["complete", "完成"]
              ].map(([view, label]) => (
                <button
                  key={view}
                  aria-pressed={activeWorkbenchView === view}
                  className={[
                    "rounded-md px-3 py-2 text-xs font-medium transition",
                    activeWorkbenchView === view
                      ? "bg-white text-sky-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  ].join(" ")}
                  onClick={() => setActiveWorkbenchView(view as WorkbenchView)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        ) : null}

        {activeWorkbenchView === "processing" ? (
          <section
            aria-label="automatic-document-processing-view"
            className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
          >
            <div className="min-h-0 overflow-auto border border-slate-200 bg-white p-4">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-900">整卷自动处理</h2>
                <p className="mt-1 text-xs text-slate-500">
                  框题、跨页、全文 OCR、答案匹配和专题卷同步按顺序执行。
                </p>
              </div>
              <PagePreview />
            </div>
            <aside className="min-h-0 overflow-auto border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <div className="text-xs font-semibold text-slate-500">整卷处理进度</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {documentProcessingProgress.message ?? "等待确认答案分页"}
                  </div>
                </div>
                <span
                  className={[
                    "shrink-0 border px-2 py-1 text-xs font-medium",
                    documentProcessingProgress.status === "failed"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : documentProcessingProgress.status === "done"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : documentProcessingProgress.status === "running"
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-white text-slate-500"
                  ].join(" ")}
                >
                  {documentProcessingProgress.status === "failed"
                    ? "需要处理"
                    : documentProcessingProgress.status === "done"
                      ? "已完成"
                      : documentProcessingProgress.status === "running"
                        ? "处理中"
                        : "未开始"}
                </span>
              </div>

              <ol aria-label="document-processing-stage-list" className="divide-y divide-slate-200">
                {DOCUMENT_PROCESSING_STAGES.map((stage, index) => {
                  const status = getDocumentProcessingStageStatus(
                    documentProcessingProgress,
                    stage.id
                  );
                  const statusLabel =
                    status === "failed"
                      ? "失败"
                      : status === "done"
                        ? "完成"
                        : status === "running"
                          ? "进行中"
                          : "等待";

                  return (
                    <li
                      key={stage.id}
                      aria-label={`处理阶段-${stage.label}-${statusLabel}`}
                      className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 py-3"
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "flex h-6 w-6 items-center justify-center border text-[11px] font-semibold",
                          status === "failed"
                            ? "border-rose-300 bg-rose-50 text-rose-700"
                            : status === "done"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : status === "running"
                                ? "border-sky-300 bg-sky-50 text-sky-700"
                                : "border-slate-200 bg-white text-slate-400"
                        ].join(" ")}
                      >
                        {status === "done" ? "✓" : index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-800">{stage.label}</div>
                        <div className="mt-1 text-xs leading-4 text-slate-500">{stage.detail}</div>
                      </div>
                      <span
                        className={[
                          "pt-1 text-[11px] font-medium",
                          status === "failed"
                            ? "text-rose-600"
                            : status === "done"
                              ? "text-emerald-600"
                              : status === "running"
                                ? "text-sky-700"
                                : "text-slate-400"
                        ].join(" ")}
                      >
                        {statusLabel}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 pt-3 text-xs text-slate-600">
                <span>题目 {selectedDocumentQuestions.length}</span>
                <span>跨页 {selectedDocumentCrossPageCandidates.filter((candidate) => candidate.status === "accepted").length}</span>
                <span>OCR {classificationRunProgress.classificationCurrent}/{classificationRunProgress.classificationTotal}</span>
                <span>答案待复核 {selectedDocument?.pendingAnswerMatchCount ?? 0}</span>
              </div>

              {documentProcessingProgress.status === "failed" ? (
                <div
                  aria-label="inline-document-processing-error"
                  className="mt-4 border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800"
                >
                  {documentProcessingProgress.message}
                </div>
              ) : null}

              {documentProcessingProgress.status === "failed" && documentProcessingRetry ? (
                <button
                  aria-label="inline-document-processing-retry"
                  className="mt-3 w-full bg-sky-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-sky-700"
                  onClick={documentProcessingRetry}
                  type="button"
                >
                  重试整卷处理
                </button>
              ) : null}
              {questionIdsNeedingClassification.length > 0 &&
              documentProcessingProgress.status !== "running" &&
              !(documentProcessingProgress.status === "failed" && documentProcessingRetry) ? (
                <button
                  className="mt-3 w-full border border-sky-200 bg-white px-3 py-2.5 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
                  onClick={handleResumeIncompleteDocumentOcr}
                  type="button"
                >
                  继续处理剩余 {questionIdsNeedingClassification.length} 道题
                </button>
              ) : null}
            </aside>
          </section>
        ) : null}

        {activeWorkbenchView === "answers" ? (
          <section
            aria-label="answer-review-view"
            className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"
          >
            <div className="min-h-0 overflow-auto border border-slate-200 bg-white p-4">
              {activePendingAnswerMatch && activePendingAnswerPageGroup ? (
                <PendingAnswerPagePreview
                  matches={[activePendingAnswerMatch]}
                  onSelectMatch={setSelectedPendingAnswerMatchId}
                  onUpdateMatchBBox={(matchId, normalizedBBox) =>
                    updateDocumentPendingAnswerMatchNormalizedBBox(
                      selectedDocument!.id,
                      matchId,
                      normalizedBBox
                    )
                  }
                  page={activePendingAnswerPageGroup.page}
                  previewUrl={activePendingAnswerPageGroup.previewUrl}
                  selectedMatchId={activePendingAnswerMatch.id}
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                  答案已自动匹配，没有待复核项。
                </div>
              )}
            </div>
            <aside className="min-h-0 overflow-auto border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">答案匹配复核</h2>
                <span className="text-xs text-slate-500">
                  {activePendingAnswerMatchIndex >= 0 ? activePendingAnswerMatchIndex + 1 : 0}/
                  {selectedDocument?.pendingAnswerMatches?.length ?? 0}
                </span>
              </div>
              {activePendingAnswerMatch ? (
                <div className="mt-4 space-y-4">
                  <label className="block text-xs font-medium text-slate-700">
                    原答案题号
                    <input
                      aria-label={`pending-answer-label-input-${activePendingAnswerMatch.id}`}
                      className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                      onChange={(event) => {
                        const nextLabel = event.target.value;
                        updateDocumentPendingAnswerMatchLabel(
                          selectedDocument!.id,
                          activePendingAnswerMatch.id,
                          nextLabel
                        );
                        updateDocumentPendingAnswerMatchSuggestion(
                          selectedDocument!.id,
                          activePendingAnswerMatch.id,
                          resolveSuggestedQuestionIdForAnswerLabel(nextLabel)
                        );
                      }}
                      value={activePendingAnswerMatch.answerLabel}
                    />
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    对应题目
                    <select
                      aria-label={`pending-answer-question-select-${activePendingAnswerMatch.id}`}
                      className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                      onChange={(event) =>
                        updateDocumentPendingAnswerMatchSuggestion(
                          selectedDocument!.id,
                          activePendingAnswerMatch.id,
                          event.target.value || null
                        )
                      }
                      value={activePendingAnswerMatch.suggestedQuestionId ?? ""}
                    >
                      <option value="">未匹配</option>
                      {selectedDocumentQuestions.map((question) => (
                        <option key={question.id} value={question.id}>
                          第 {pages.find((page) => page.id === question.primaryPageId)?.pageNumber ?? "-"} 页 · Q{question.questionNumberLabel ?? question.localOrder}
                        </option>
                      ))}
                    </select>
                  </label>
                  {activePendingAnswerMatch.ocrText ? (
                    <div className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
                      {activePendingAnswerMatch.ocrText}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button
                      aria-label="上一个待复核答案"
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-40"
                      disabled={activePendingAnswerMatchIndex <= 0}
                      onClick={() =>
                        setSelectedPendingAnswerMatchId(
                          selectedDocument?.pendingAnswerMatches?.[activePendingAnswerMatchIndex - 1]?.id ?? null
                        )
                      }
                      type="button"
                    >
                      上一个
                    </button>
                    <button
                      aria-label="下一个待复核答案"
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 disabled:opacity-40"
                      disabled={
                        activePendingAnswerMatchIndex >=
                        (selectedDocument?.pendingAnswerMatches?.length ?? 0) - 1
                      }
                      onClick={() =>
                        setSelectedPendingAnswerMatchId(
                          selectedDocument?.pendingAnswerMatches?.[activePendingAnswerMatchIndex + 1]?.id ?? null
                        )
                      }
                      type="button"
                    >
                      下一个
                    </button>
                  </div>
                  <button
                    className="w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    disabled={!activePendingAnswerMatch.suggestedQuestionId}
                    onClick={() => handleResolvePendingAnswerMatch(activePendingAnswerMatch.id)}
                    type="button"
                  >
                    确认当前答案匹配
                  </button>
                </div>
              ) : (
                <button
                  className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white"
                  onClick={() => setActiveWorkbenchView("classification")}
                  type="button"
                >
                  进入分类复核
                </button>
              )}
            </aside>
          </section>
        ) : null}

        {activeWorkbenchView === "classification" ? (
          <section aria-label="classification-review-view" className="min-h-0 overflow-auto border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">分类复核</h2>
                <p className="mt-1 text-xs text-slate-500">
                  当前题目的 OCR、目录与确认操作位于右侧详情栏。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:opacity-50"
                  disabled={highConfidenceQuestionIds.length === 0}
                  onClick={handleConfirmHighConfidenceQuestions}
                  type="button"
                >
                  确认高置信度题目
                </button>
                <button
                  className="rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 disabled:opacity-50"
                  disabled={remainingClassificationReviewQuestionCount === 0}
                  onClick={handleContinueClassificationReview}
                  type="button"
                >
                  定位下一道待复核题
                </button>
              </div>
            </div>
            <PagePreview />
          </section>
        ) : null}

        {activeWorkbenchView === "complete" ? (
          <section aria-label="document-workflow-complete-view" className="border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">当前文件处理结果</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="border border-slate-200 bg-slate-50 p-4 text-sm">题目 {selectedDocumentQuestions.length}</div>
              <div className="border border-slate-200 bg-slate-50 p-4 text-sm">跨页 {selectedDocumentCrossPageCandidates.filter((candidate) => candidate.status === "accepted").length}</div>
              <div className="border border-slate-200 bg-slate-50 p-4 text-sm">待复核答案 {selectedDocument?.pendingAnswerMatchCount ?? 0}</div>
              <div className="border border-slate-200 bg-slate-50 p-4 text-sm">待复核分类 {remainingClassificationReviewQuestionCount}</div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white" href="/library/questions">打开题库</Link>
              <Link className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700" href="/library/specialized">打开专题卷库</Link>
              <Link className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700" href="/library/full">打开套卷库</Link>
            </div>
          </section>
        ) : null}

        <section className={`${activeWorkbenchView === "geometry" ? "grid" : "hidden"} min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]`}>
          <div className="rounded-lg border border-slate-100 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">框选复核工作区</h2>
                <p className="mt-1 text-sm text-slate-500">默认采用整文件题目流复核，支持切回按页复核。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  aria-pressed={geometryReviewMode === "question_stream"}
                  className={[
                    "rounded-md px-3 py-2 text-xs font-medium",
                    geometryReviewMode === "question_stream"
                      ? "bg-ink text-white"
                      : "border border-slate-200 text-slate-600"
                  ].join(" ")}
                  onClick={() => setGeometryReviewMode("question_stream")}
                  type="button"
                >
                  题目流复核
                </button>
                <button
                  aria-pressed={geometryReviewMode === "page"}
                  className={[
                    "rounded-md px-3 py-2 text-xs font-medium",
                    geometryReviewMode === "page"
                      ? "bg-ink text-white"
                      : "border border-slate-200 text-slate-600"
                  ].join(" ")}
                  onClick={() => setGeometryReviewMode("page")}
                  type="button"
                >
                  按页复核
                </button>
                <button
                  className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!selectedPage}
                  onClick={handleMarkPageReviewed}
                  type="button"
                >
                  标记当前页已复核
                </button>
                <button
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!selectedPage}
                  onClick={handleAddManualQuestion}
                  type="button"
                >
                  手动新增框选
                </button>
              </div>
            </div>

            {geometryReviewMode === "question_stream" ? (
              <div
                aria-label="整文件题目流复核"
                className="mb-4 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-slate-50/70 p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">整文件题目流</div>
                    <div className="mt-1 text-xs text-slate-500">
                      按题目顺序跨页复核，点击题目会自动切换到所在页。
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">
                    {geometryReviewStreamQuestions.length} 题
                  </span>
                </div>
                {geometryReviewStreamQuestions.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {geometryReviewStreamQuestions.map((question) => {
                      const questionPage = pages.find((page) => page.id === question.primaryPageId);
                      const isSelected = question.id === selectedQuestionId;

                      return (
                        <button
                          key={question.id}
                          aria-label={`题目流-P${questionPage?.pageNumber ?? "-"}-Q${question.localOrder}`}
                          className={[
                            "rounded-lg border px-3 py-3 text-left text-sm transition",
                            isSelected
                              ? "border-sky-300 bg-sky-50 text-sky-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/70"
                          ].join(" ")}
                          onClick={() =>
                            handleSelectQuestionFromStream(question.id, question.primaryPageId)
                          }
                          type="button"
                        >
                          <div className="font-semibold text-slate-800">
                            第 {questionPage?.pageNumber ?? "-"} 页
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Q{question.questionNumberLabel?.trim() || question.localOrder} · {question.status}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
                    当前文件还没有题目框，先分析页面或手动新增框选。
                  </div>
                )}
              </div>
            ) : null}

            {documentAutoDetectProgress.status !== "idle" ? (
              <div className="mb-4 rounded-lg border border-sky-100 bg-sky-50 px-4 py-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-sky-800">
                  <span>{formatDocumentAutoDetectProgress(documentAutoDetectProgress)}</span>
                  <span>{documentAutoDetectProgress.status}</span>
                </div>
                <div
                  aria-label="current-document-auto-detect-progress"
                  aria-valuemax={documentAutoDetectProgress.total}
                  aria-valuemin={0}
                  aria-valuenow={documentAutoDetectProgress.current}
                  className="h-2 overflow-hidden rounded-full bg-white"
                  role="progressbar"
                >
                  <div
                    className={[
                      "h-full rounded-full transition-all",
                      documentAutoDetectProgress.status === "failed"
                        ? "bg-rose-500"
                        : documentAutoDetectProgress.phase === "cross_page"
                          ? "bg-violet-500"
                          : "bg-sky-500"
                    ].join(" ")}
                    style={{
                      width: `${
                        documentAutoDetectProgress.total > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (documentAutoDetectProgress.current /
                                  documentAutoDetectProgress.total) *
                                  100
                              )
                            )
                          : 100
                      }%`
                    }}
                  />
                </div>
              </div>
            ) : null}

            <PagePreview />
          </div>

          <div className="space-y-4">
            <section className="rounded-lg border border-slate-100 bg-white p-5">
              <h2 className="text-base font-semibold">当前文件状态</h2>
              <div className="mt-4 grid gap-3">
                {selectedDocument?.kind === "pdf" &&
                selectedDocumentAnswerSection &&
                selectedDocumentAnswerSection.status !== "confirmed" ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                    <div className="font-medium">Answer section review pending</div>
                    <p className="mt-2 text-sm text-sky-800">
                      Confirm where answer pages start, or mark this PDF as having no answer section.
                    </p>
                    <div aria-label="题目页面版式" className="mt-3" role="group">
                      <div className="mb-2 text-xs font-medium text-sky-800">题目页面版式</div>
                      <div className="inline-flex rounded-md border border-sky-200 bg-white p-1">
                        {([
                          ["single_column", "单栏"],
                          ["double_column", "双栏"]
                        ] as const).map(([mode, label]) => (
                          <button
                            key={mode}
                            aria-pressed={questionPageLayoutModeDraft === mode}
                            className={[
                              "min-w-16 rounded px-3 py-1.5 text-xs font-medium transition",
                              questionPageLayoutModeDraft === mode
                                ? "bg-sky-600 text-white"
                                : "text-sky-800 hover:bg-sky-50"
                            ].join(" ")}
                            onClick={() => setQuestionPageLayoutModeDraft(mode)}
                            type="button"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-2 text-xs font-medium text-sky-800">
                        Split page
                        <input
                          aria-label="answer-split-page-input"
                          className="w-28 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none"
                          min={1}
                          onChange={(event) => setAnswerSplitPageDraft(event.target.value)}
                          onFocus={() => {
                            if (!answerSplitPageDraft) {
                              setAnswerSplitPageDraft(
                                resolveAnswerSplitDraft(selectedDocumentAnswerSection)
                              );
                            }
                          }}
                          type="number"
                          value={answerSplitPageDraft || resolveAnswerSplitDraft(selectedDocumentAnswerSection)}
                        />
                      </label>
                      <button
                        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white"
                        disabled={!questionPageLayoutModeDraft}
                        onClick={handleConfirmAnswerSplit}
                        type="button"
                      >
                        Confirm answer split
                      </button>
                      <button
                        className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-800"
                        disabled={!questionPageLayoutModeDraft}
                        onClick={handleMarkNoAnswerSection}
                        type="button"
                      >
                        No answer section
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  几何复核：
                  <span className="font-medium text-slate-800">
                    {selectedPage?.reviewStatus === "reviewed" ? "已复核" : "待开始"}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  OCR + 分类：
                  <span className="font-medium text-slate-800">
                    {classificationReviewQuestionCount ? "已进入分类复核" : "尚未触发"}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  已可处理题目：
                  <span className="font-medium text-slate-800">{readinessGroups.readyQuestionIds.length}</span>
                </div>
                {selectedDocument && hasUnreviewedPagesInDocument(selectedDocumentPages, selectedDocument.id) ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    将仅处理已完成几何复核的页面
                  </div>
                ) : null}
                {selectedDocumentCrossPageCandidates.length ? (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700">
                    当前文件已检测到 {selectedDocumentCrossPageCandidates.length} 个跨页候选
                  </div>
                ) : null}
                <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  原文件：<span className="font-medium text-slate-800">{sourceRetentionLabel}</span>
                </div>
                {selectedDocument && isDocumentImportReady && selectedDocument.status !== "source_purged" ? (
                  <button
                    className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"
                    disabled={!selectedDocumentHasDurableQuestionImages}
                    onClick={handlePurgeCurrentDocumentSource}
                    type="button"
                  >
                    {selectedDocumentHasDurableQuestionImages
                      ? "确认入库并删除原文件"
                      : "等待高清题目文件"}
                  </button>
                ) : null}
              </div>
            </section>

            <section className="hidden rounded-lg border border-slate-100 bg-white p-5">
              <h2 className="text-base font-semibold">跨页候选复核</h2>
              <div className="mt-4 space-y-3">
                {selectedDocumentCrossPageCandidates.length ? (
                  selectedDocumentCrossPageCandidates.map((candidate) => {
                    const candidateDisplay = buildCrossPageCandidateReviewDisplay({
                      candidate,
                      pages,
                      questions: selectedDocumentQuestions
                    });

                    return (
                      <article
                        key={candidate.id}
                        className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-800">
                              {candidateDisplay.title}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              {candidateDisplay.pageRange}
                            </div>
                          </div>
                          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                            {Math.round(candidate.confidence * 100)}%
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-white px-3 py-1 text-slate-600">
                            {candidate.status === "accepted"
                              ? "已接受"
                              : candidate.status === "dismissed"
                                ? "已忽略"
                                : "待处理"}
                          </span>
                          {candidateDisplay.sourceLabels.map((label) => (
                            <span key={label} className="rounded-full bg-white px-3 py-1 text-slate-500">
                              {label}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            aria-label={`接受跨页候选-${candidateDisplay.title}`}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={candidate.status === "accepted"}
                            onClick={() => handleAcceptCrossPageCandidate(candidate.id)}
                            type="button"
                          >
                            接受并合并
                          </button>
                          <button
                            aria-label={`忽略跨页候选-${candidateDisplay.title}`}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={candidate.status === "dismissed"}
                            onClick={() => handleDismissCrossPageCandidate(candidate.id)}
                            type="button"
                          >
                            忽略
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                    当前文件尚未生成跨页候选。
                  </div>
                )}
              </div>
            </section>

            <section className="hidden rounded-lg border border-slate-100 bg-white p-5">
              <h2 className="text-base font-semibold">分类复核规则</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li>高置信度题目可在当前文件范围内一键确认。</li>
                <li>低置信度题目按目录组织复核。</li>
                <li>用户创建的新目录会立即加入目录库并可批量应用。</li>
              </ul>
              <button
                className="mt-4 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedDocument || !readyToClassify || isPending}
                onClick={handleClassifyCurrentDocument}
                type="button"
              >
                {isPending ? "OCR + 分类中..." : "当前文件 OCR + 分类"}
              </button>
              {classificationRunProgress.status !== "idle" ? (
                <div className="mt-3 space-y-3 rounded-lg border border-sky-100 bg-sky-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-sky-800">
                    <span>Matchable directories: {aiMatchableDirectoryPaths.length}</span>
                    <span>{classificationRunProgress.status}</span>
                  </div>
                  {classificationRunProgress.message ? (
                    <div className="text-sm text-sky-900">
                      {classificationRunProgress.message}
                    </div>
                  ) : null}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>OCR image preparation</span>
                      <span>
                        {classificationRunProgress.ocrCurrent}/{classificationRunProgress.ocrTotal}
                      </span>
                    </div>
                    <div
                      aria-label="current-document-ocr-progress"
                      aria-valuemax={classificationRunProgress.ocrTotal}
                      aria-valuemin={0}
                      aria-valuenow={classificationRunProgress.ocrCurrent}
                      className="h-2 overflow-hidden rounded-full bg-white"
                      role="progressbar"
                    >
                      <div
                        className="h-full rounded-full bg-sky-500 transition-all"
                        style={{
                          width: `${
                            classificationRunProgress.ocrTotal > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (classificationRunProgress.ocrCurrent /
                                      classificationRunProgress.ocrTotal) *
                                      100
                                  )
                                )
                              : 100
                          }%`
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                      <span>Classification results</span>
                      <span>
                        {classificationRunProgress.classificationCurrent}/
                        {classificationRunProgress.classificationTotal}
                      </span>
                    </div>
                    <div
                      aria-label="current-document-classification-progress"
                      aria-valuemax={classificationRunProgress.classificationTotal}
                      aria-valuemin={0}
                      aria-valuenow={classificationRunProgress.classificationCurrent}
                      className="h-2 overflow-hidden rounded-full bg-white"
                      role="progressbar"
                    >
                      <div
                        className={[
                          "h-full rounded-full transition-all",
                          classificationRunProgress.status === "failed"
                            ? "bg-rose-500"
                            : "bg-emerald-500"
                        ].join(" ")}
                        style={{
                          width: `${
                            classificationRunProgress.classificationTotal > 0
                              ? Math.min(
                                  100,
                                  Math.round(
                                    (classificationRunProgress.classificationCurrent /
                                      classificationRunProgress.classificationTotal) *
                                      100
                                  )
                                )
                              : 100
                          }%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
              {classificationRunMessage ? (
                <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  {classificationRunMessage}
                </div>
              ) : null}
            </section>

            <section className="hidden rounded-lg border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">当前文件分类复核</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    逐题 OCR、题型、目录候选和确认操作已移至右侧题目详情栏。
                  </p>
                </div>
                <button
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!selectedDocument || highConfidenceQuestionIds.length === 0}
                  onClick={handleConfirmHighConfidenceQuestions}
                  type="button"
                >
                  一键确认当前文件高置信度题目
                </button>
              </div>

              <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
                {remainingClassificationReviewQuestionCount ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-700">
                        剩余待复核 {remainingClassificationReviewQuestionCount} 道
                      </div>
                      <div className="mt-1">
                        请在右侧题目详情栏逐题处理 OCR、题型、目录候选和确认操作。
                      </div>
                    </div>
                    <button
                      className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm font-medium text-sky-700"
                      onClick={handleContinueClassificationReview}
                      type="button"
                    >
                      继续处理剩余题目
                    </button>
                  </div>
                ) : classificationReviewQuestionCount ? (
                  "当前文件分类复核已完成。"
                ) : (
                  "当前文件尚未生成分类复核结果。"
                )}
              </div>
            </section>
          </div>
        </section>
        </div>
      </AppShell>
  );
}
