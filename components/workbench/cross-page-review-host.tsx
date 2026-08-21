"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { CrossPageReviewDialog } from "@/components/workbench/cross-page-review-dialog";
import type { CrossPageCandidateEntity, PageEntity } from "@/lib/domain/entities";
import {
  buildCrossPageRequestCandidates,
  buildEdgeContinuationCrossPageArtifacts
} from "@/lib/services/review-service";
import { runWithCrossPageRecoveryLock } from "@/lib/services/cross-page-recovery-lock";
import {
  createWorkflowRunId,
  recordWorkflowEvent
} from "@/lib/services/workflow-event-service";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";
import { readBlobAsDataUrl } from "@/lib/utils/blob-data-url";

function getCandidateSourceKey(candidate: CrossPageCandidateEntity): string {
  return [
    candidate.documentId,
    candidate.leftPageId,
    candidate.rightPageId,
    ...candidate.sourceQuestionIds.slice().sort()
  ].join("::");
}

function normalizeRecoveredCandidate(
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
  const sourceQuestionIds = Array.isArray(candidate.sourceQuestionIds)
    ? candidate.sourceQuestionIds.filter(
        (questionId): questionId is string => typeof questionId === "string"
      )
    : [];

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.confidence !== "number" ||
    sourceQuestionIds.length < 2
  ) {
    return null;
  }

  return {
    id: candidate.id,
    documentId: fallback.documentId,
    leftPageId:
      typeof candidate.leftPageId === "string"
        ? candidate.leftPageId
        : fallback.leftPageId,
    rightPageId:
      typeof candidate.rightPageId === "string"
        ? candidate.rightPageId
        : fallback.rightPageId,
    sourceQuestionIds,
    confidence: candidate.confidence,
    status: "suggested"
  };
}

function mergeRecoveredCandidates(
  existing: CrossPageCandidateEntity[],
  incoming: CrossPageCandidateEntity[]
): CrossPageCandidateEntity[] {
  const merged = existing.slice();
  const sourceIndex = new Map(
    merged.map((candidate, index) => [getCandidateSourceKey(candidate), index])
  );
  const usedIds = new Set(merged.map((candidate) => candidate.id));

  for (const candidate of incoming) {
    const sourceKey = getCandidateSourceKey(candidate);
    const existingIndex = sourceIndex.get(sourceKey);

    if (existingIndex !== undefined) {
      if (merged[existingIndex].status !== "suggested") {
        continue;
      }

      usedIds.delete(merged[existingIndex].id);
      merged.splice(existingIndex, 1);
      sourceIndex.clear();
      merged.forEach((item, index) => sourceIndex.set(getCandidateSourceKey(item), index));
    }

    let id = candidate.id;

    if (usedIds.has(id)) {
      id = `${candidate.leftPageId}-${candidate.rightPageId}-${id}`;
    }

    let suffix = 2;
    const baseId = id;

    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const candidateWithUniqueId = id === candidate.id ? candidate : { ...candidate, id };
    sourceIndex.set(sourceKey, merged.length);
    usedIds.add(id);
    merged.push(candidateWithUniqueId);
  }

  return merged;
}

async function resolveRecoveryPageImage(page: PageEntity): Promise<string | null> {
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

async function rebuildOrphanedCrossPageCandidates(documentId: string) {
  const workflowRunId = createWorkflowRunId();
  const pages = useFileStore
    .getState()
    .pages.filter((page) => page.documentId === documentId)
    .sort((left, right) => left.pageNumber - right.pageNumber);
  const questions = useQuestionStore
    .getState()
    .questionDrafts.filter((question) => question.documentId === documentId);
  const adjacentPairs = pages.slice(0, -1).map((leftPage, index) => ({
    leftPage,
    rightPage: pages[index + 1]
  }));
  const imageEntries = await Promise.all(
    pages.map(async (page) => [page.id, await resolveRecoveryPageImage(page)] as const)
  );
  const imageByPageId = new Map(imageEntries);

  if (imageEntries.some(([, imageDataUrl]) => !imageDataUrl)) {
    throw new Error("跨页候选恢复失败：本机页图不完整");
  }

  const edgeArtifacts = buildEdgeContinuationCrossPageArtifacts({
    documentId,
    pages,
    questions
  });

  if (edgeArtifacts.questionDrafts.length) {
    useQuestionStore.getState().upsertQuestionDrafts(edgeArtifacts.questionDrafts);
  }

  const incomingCandidates = edgeArtifacts.candidates.slice();

  for (const [index, pair] of adjacentPairs.entries()) {
    const response = await fetch("/api/ai/detect-cross-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowRunId,
        sequence: index + 1,
        total: adjacentPairs.length,
        documentId,
        leftPage: pair.leftPage.id,
        rightPage: pair.rightPage.id,
        leftImageDataUrl: imageByPageId.get(pair.leftPage.id),
        rightImageDataUrl: imageByPageId.get(pair.rightPage.id),
        leftTextLines: pair.leftPage.textLines ?? [],
        rightTextLines: pair.rightPage.textLines ?? [],
        candidates: buildCrossPageRequestCandidates({
          pages: [pair.leftPage, pair.rightPage],
          questions: useQuestionStore
            .getState()
            .questionDrafts.filter((question) => question.documentId === documentId)
        })
      })
    }).catch(() => null);

    if (!response?.ok) {
      throw new Error("跨页候选恢复请求失败");
    }

    const payload = (await response.json().catch(() => null)) as {
      source?: { provider?: string; diagnosticId?: string };
      mergeCandidates?: unknown[];
    } | null;

    if (payload?.source?.provider === "local_fallback") {
      const diagnostic = payload.source.diagnosticId
        ? `，诊断编号 ${payload.source.diagnosticId}`
        : "";
      throw new Error(`跨页候选恢复请求失败${diagnostic}`);
    }

    for (const rawCandidate of payload?.mergeCandidates ?? []) {
      const candidate = normalizeRecoveredCandidate(rawCandidate, {
        documentId,
        leftPageId: pair.leftPage.id,
        rightPageId: pair.rightPage.id
      });
      const questionIds = new Set(
        useQuestionStore
          .getState()
          .questionDrafts.filter((question) => question.documentId === documentId)
          .map((question) => question.id)
      );

      if (candidate?.sourceQuestionIds.every((questionId) => questionIds.has(questionId))) {
        incomingCandidates.push(candidate);
      }
    }

    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "running",
      stage: "cross_page",
      current: index + 1,
      total: adjacentPairs.length,
      message: "正在恢复跨页候选",
      summary: null
    });
  }

  const incomingSourceKeys = new Set(incomingCandidates.map(getCandidateSourceKey));
  const mergedCandidates = mergeRecoveredCandidates(
    useQuestionStore.getState().crossPageCandidates,
    incomingCandidates
  );
  const candidateIds = mergedCandidates
    .filter(
      (candidate) =>
        candidate.documentId === documentId &&
        candidate.status === "suggested" &&
        incomingSourceKeys.has(getCandidateSourceKey(candidate))
    )
    .map((candidate) => candidate.id);

  useQuestionStore.getState().setCrossPageCandidates(mergedCandidates);
  void recordWorkflowEvent({
    runId: workflowRunId,
    event: "cross_page_summary",
    stage: "cross_page",
    status: "done",
    total: adjacentPairs.length,
    candidateCount: candidateIds.length,
    filteredCount: Math.max(incomingCandidates.length - candidateIds.length, 0)
  });

  return candidateIds;
}

function findRecoverableCandidateSession() {
  const questionState = useQuestionStore.getState();
  const questionById = new Map(questionState.questionDrafts.map((question) => [question.id, question]));
  const candidatesByDocument = new Map<string, string[]>();

  for (const candidate of questionState.crossPageCandidates) {
    if (
      candidate.status !== "suggested" ||
      !candidate.sourceQuestionIds.every((questionId) => {
        const question = questionById.get(questionId);
        return question?.documentId === candidate.documentId && !question.ocrText;
      })
    ) {
      continue;
    }

    const candidateIds = candidatesByDocument.get(candidate.documentId) ?? [];
    candidateIds.push(candidate.id);
    candidatesByDocument.set(candidate.documentId, candidateIds);
  }

  if (candidatesByDocument.size !== 1) {
    return null;
  }

  const [documentId, candidateIds] = Array.from(candidatesByDocument.entries())[0];
  const hasSourceDocument = useFileStore
    .getState()
    .documents.some((document) => document.id === documentId);

  return {
    documentId,
    candidateIds,
    currentIndex: 0,
    acceptedCount: 0,
    recoveryMode: hasSourceDocument ? ("resume_ocr" as const) : ("review_only" as const)
  };
}

function findDocumentNeedingCrossPageRecovery(): string | null {
  const fileState = useFileStore.getState();
  const questionState = useQuestionStore.getState();
  const pagesById = new Map(fileState.pages.map((page) => [page.id, page]));
  const questionById = new Map(questionState.questionDrafts.map((question) => [question.id, question]));
  const candidatesByDocument = new Set(
    questionState.crossPageCandidates.flatMap((candidate) =>
      candidate.sourceQuestionIds.every((questionId) => {
        const question = questionById.get(questionId);
        return question?.documentId === candidate.documentId;
      })
        ? [candidate.documentId]
        : []
    )
  );
  const documentById = new Map(fileState.documents.map((document) => [document.id, document]));
  const recoverableDocumentIds = Array.from(
    new Set(questionState.questionDrafts.map((question) => question.documentId))
  ).flatMap((documentId) => {
    const document = documentById.get(documentId);

    if (
      (document && document.answerSection?.status !== "confirmed") ||
      candidatesByDocument.has(documentId)
    ) {
      return [];
    }

    const questions = questionState.questionDrafts.filter(
      (question) => question.documentId === documentId
    );
    const questionPageIds = new Set(questions.flatMap((question) => question.pageIds));
    const hasOnlyReviewedAiGeometry =
      questions.length > 0 &&
      questions.every(
        (question) =>
          question.source === "ai" &&
          question.status === "geometry_reviewed" &&
          question.classificationStatus === "unclassified" &&
          !question.ocrText &&
          !question.crossPageGroupId
      );
    const allQuestionPagesReviewed = Array.from(questionPageIds).every((pageId) => {
      const page = pagesById.get(pageId);
      return page?.analysisStatus === "done" && page.reviewStatus === "reviewed";
    });

    return questionPageIds.size > 1 && hasOnlyReviewedAiGeometry && allQuestionPagesReviewed
      ? [documentId]
      : [];
  });

  return recoverableDocumentIds.length === 1 ? recoverableDocumentIds[0] : null;
}

export function CrossPageReviewHost() {
  const router = useRouter();
  const orphanRecoveryDocumentIdRef = useRef<string | null>(null);
  const session = useWorkbenchStore((state) => state.crossPageReviewSession);
  const processingProgress = useWorkbenchStore((state) => state.documentProcessingProgress);
  const setSession = useWorkbenchStore((state) => state.setCrossPageReviewSession);
  const setResumeRequest = useWorkbenchStore((state) => state.setCrossPageReviewResumeRequest);
  const setProgress = useWorkbenchStore((state) => state.setDocumentProcessingProgress);
  const pages = useFileStore((state) => state.pages);
  const candidates = useQuestionStore((state) => state.crossPageCandidates);
  const questions = useQuestionStore((state) => state.questionDrafts);
  const previewDataUrls = useQuestionStore((state) => state.pagePreviewDataUrls);
  const acceptCandidate = useQuestionStore((state) => state.acceptCrossPageCandidate);
  const dismissCandidate = useQuestionStore((state) => state.dismissCrossPageCandidate);

  useEffect(() => {
    if (session) {
      return;
    }

    const canRecover =
      processingProgress.status === "idle" ||
      (processingProgress.status === "running" &&
        processingProgress.stage === "cross_page" &&
        (processingProgress.message === "等待人工复核跨页候选" ||
          (processingProgress.total > 0 &&
            processingProgress.current >= processingProgress.total)));

    if (!canRecover) {
      return;
    }

    const recoverableSession = findRecoverableCandidateSession();

    if (recoverableSession) {
      setProgress({
        status: "running",
        stage: "cross_page",
        current: 0,
        total: recoverableSession.candidateIds.length,
        message: "等待人工复核跨页候选",
        summary: null
      });
      setSession(recoverableSession);
      return;
    }

    if (
      processingProgress.status !== "idle" ||
      useWorkbenchStore.getState().crossPageReviewResumeRequest
    ) {
      return;
    }

    const documentId = findDocumentNeedingCrossPageRecovery();

    if (!documentId) {
      return;
    }

    const questionPageCount = new Set(
      useQuestionStore
        .getState()
        .questionDrafts.filter((question) => question.documentId === documentId)
        .flatMap((question) => question.pageIds)
    ).size;

    const hasSourceDocument = useFileStore
      .getState()
      .documents.some((document) => document.id === documentId);

    if (!hasSourceDocument && orphanRecoveryDocumentIdRef.current === documentId) {
      return;
    }

    setProgress({
      status: "running",
      stage: "cross_page",
      current: 0,
      total: Math.max(questionPageCount - 1, 0),
      message: "正在恢复跨页候选",
      summary: null
    });

    if (!hasSourceDocument) {
      orphanRecoveryDocumentIdRef.current = documentId;
      let keepRecoveryGuard = false;
      void runWithCrossPageRecoveryLock(documentId, () =>
        rebuildOrphanedCrossPageCandidates(documentId)
      )
        .then((lockResult) => {
          if (!lockResult.acquired) {
            keepRecoveryGuard = true;
            setProgress({
              status: "idle",
              stage: "cross_page",
              current: 0,
              total: 0,
              message: null,
              summary: null
            });
            return;
          }

          const candidateIds = lockResult.value;

          if (!candidateIds.length) {
            setProgress({
              status: "done",
              stage: "cross_page",
              current: Math.max(questionPageCount - 1, 0),
              total: Math.max(questionPageCount - 1, 0),
              message: "未检测到需人工复核的跨页候选",
              summary: null
            });
            return;
          }

          setProgress({
            status: "running",
            stage: "cross_page",
            current: 0,
            total: candidateIds.length,
            message: "等待人工复核跨页候选",
            summary: null
          });
          setSession({
            documentId,
            candidateIds,
            currentIndex: 0,
            acceptedCount: 0,
            recoveryMode: "review_only"
          });
        })
        .catch((error) => {
          setProgress({
            status: "failed",
            stage: "cross_page",
            current: 0,
            total: Math.max(questionPageCount - 1, 0),
            message: error instanceof Error ? error.message : "跨页候选恢复失败",
            summary: null
          });
        })
        .finally(() => {
          if (!keepRecoveryGuard) {
            orphanRecoveryDocumentIdRef.current = null;
          }
        });
      return;
    }

    setResumeRequest({
      id: `cross-page-recovery-${Date.now()}`,
      documentId,
      startStage: "cross_page",
      acceptedCount: 0
    });
    router.push("/");
  }, [
    candidates,
    processingProgress,
    questions,
    router,
    session,
    setProgress,
    setResumeRequest,
    setSession
  ]);

  const candidate = session
    ? candidates.find(
        (item) =>
          item.documentId === session.documentId &&
          item.id === session.candidateIds[session.currentIndex]
      ) ?? null
    : null;

  useEffect(() => {
    if (!candidate) {
      return;
    }

    const questionById = new Map(questions.map((question) => [question.id, question]));
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const candidatePageIds = new Set(
      candidate.sourceQuestionIds.map((questionId, index) => {
        const question = questionById.get(questionId);
        return question?.primaryPageId ??
          (index === 0 ? candidate.leftPageId : candidate.rightPageId);
      })
    );
    const missingPreviewPages = Array.from(candidatePageIds)
      .filter((pageId) => !previewDataUrls[pageId])
      .map((pageId) => pageById.get(pageId))
      .filter((page): page is PageEntity => Boolean(page));

    if (!missingPreviewPages.length) {
      return;
    }

    void Promise.all(missingPreviewPages.map(resolveRecoveryPageImage));
  }, [candidate, pages, previewDataUrls, questions]);

  const decide = (decision: "accept" | "dismiss") => {
    const currentSession = useWorkbenchStore.getState().crossPageReviewSession;

    if (!currentSession) {
      return;
    }

    const candidateId = currentSession.candidateIds[currentSession.currentIndex];

    if (decision === "accept") {
      acceptCandidate(candidateId);
    } else {
      dismissCandidate(candidateId);
    }

    const acceptedCount = currentSession.acceptedCount + (decision === "accept" ? 1 : 0);
    const nextIndex = currentSession.currentIndex + 1;
    const isComplete = nextIndex >= currentSession.candidateIds.length;

    setProgress({
      status: "running",
      stage: "cross_page",
      current: nextIndex,
      total: currentSession.candidateIds.length,
      message: isComplete ? "跨页候选复核完成" : "等待人工复核跨页候选",
      summary: null
    });

    if (!isComplete) {
      setSession({
        ...currentSession,
        currentIndex: nextIndex,
        acceptedCount
      });
      return;
    }

    setSession(null);

    if (currentSession.recoveryMode === "live" && currentSession.resolve) {
      currentSession.resolve(acceptedCount);
      return;
    }

    if (currentSession.recoveryMode === "review_only") {
      setProgress({
        status: "done",
        stage: "cross_page",
        current: currentSession.candidateIds.length,
        total: currentSession.candidateIds.length,
        message: "跨页候选复核完成",
        summary: null
      });
      return;
    }

    setResumeRequest({
      id: `cross-page-resume-${Date.now()}`,
      documentId: currentSession.documentId,
      startStage: "ocr",
      acceptedCount
    });
    router.push("/");
  };

  return (
    <CrossPageReviewDialog
      candidate={candidate}
      current={(session?.currentIndex ?? 0) + 1}
      onAccept={() => decide("accept")}
      onDismiss={() => decide("dismiss")}
      pages={pages}
      previewDataUrls={previewDataUrls}
      questions={questions}
      total={session?.candidateIds.length ?? 0}
    />
  );
}
