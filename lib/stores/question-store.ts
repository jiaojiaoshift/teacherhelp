import { create } from "zustand";

import type {
  BinaryAssetEntity,
  CrossPageCandidateEntity,
  QuestionAnalysisData,
  QuestionAnswerAttachment,
  QuestionBulkConfirmationSnapshot,
  QuestionClassificationResult,
  QuestionDraftEntity,
  QuestionPageLayoutMode
} from "@/lib/domain/entities";
import type { QuestionType } from "@/lib/domain/enums";
import {
  applyClassificationResults,
  bulkConfirmQuestions,
  normalizeQuestionLibraryCandidatePaths,
  normalizeQuestionLibraryDirectoryPath,
  restoreQuestionConfirmations
} from "@/lib/services/classification-service";
import { purgeBinaryAssetsForDocument } from "@/lib/services/binary-asset-service";
import {
  doesFolderPathMatchPrefix,
  replaceFolderPathPrefix
} from "@/lib/services/folder-service";
import {
  mergeTagInQuestions,
  removeTagFromQuestions,
  renameTagInQuestions
} from "@/lib/services/tag-service";
import {
  acceptCrossPageCandidate as acceptCrossPageCandidateState,
  createManualQuestionDraft,
  dismissCrossPageCandidate as dismissCrossPageCandidateState,
  hasProcessedQuestionSemantics,
  mergeQuestionsAcrossPages,
  reconcileQuestionAfterGeometryChange,
  removeQuestionDraftById,
  shouldInvalidateQuestionSemantics
} from "@/lib/services/review-service";

interface BulkConfirmationState {
  confirmationId: string;
  documentId: string;
  confirmedCount: number;
  undoSnapshots: QuestionBulkConfirmationSnapshot[];
}

type QuestionBBox = QuestionDraftEntity["bboxByPage"][string];

function resolveUniqueMergedQuestionId(
  candidate: CrossPageCandidateEntity,
  questions: QuestionDraftEntity[]
): string {
  const sourceQuestionIds = new Set(candidate.sourceQuestionIds);
  const usedQuestionIds = new Set(
    questions
      .filter((question) => !sourceQuestionIds.has(question.id))
      .map((question) => question.id)
  );

  if (!usedQuestionIds.has(candidate.id)) {
    return candidate.id;
  }

  const pagePairId = `${candidate.leftPageId}-${candidate.rightPageId}-${candidate.id}`;

  if (!usedQuestionIds.has(pagePairId)) {
    return pagePairId;
  }

  const sourceId = `${pagePairId}-${candidate.sourceQuestionIds.slice().sort().join("-")}`;
  let uniqueId = sourceId;
  let suffix = 2;

  while (usedQuestionIds.has(uniqueId)) {
    uniqueId = `${sourceId}-${suffix}`;
    suffix += 1;
  }

  return uniqueId;
}

function normalizeQuestionDraftDirectoryPaths(question: QuestionDraftEntity): QuestionDraftEntity {
  return {
    ...question,
    directoryPath: normalizeQuestionLibraryDirectoryPath(question.directoryPath ?? null),
    directoryCandidatePaths: normalizeQuestionLibraryCandidatePaths(question.directoryCandidatePaths ?? [])
  };
}

interface QuestionStoreState {
  pagePreviewUrls: Record<string, string>;
  pagePreviewDataUrls: Record<string, string>;
  binaryAssets: BinaryAssetEntity[];
  questionDrafts: QuestionDraftEntity[];
  crossPageCandidates: CrossPageCandidateEntity[];
  manualMergeQuestionIds: string[];
  selectedQuestionId: string | null;
  lastBulkConfirmation: BulkConfirmationState | null;
  hydrateWorkspaceState: (snapshot: {
    binaryAssets: BinaryAssetEntity[];
    questionDrafts: QuestionDraftEntity[];
    crossPageCandidates: CrossPageCandidateEntity[];
    manualMergeQuestionIds: string[];
    selectedQuestionId: string | null;
    lastBulkConfirmation: BulkConfirmationState | null;
  }) => void;
  setPagePreviewUrl: (pageId: string, url: string) => void;
  setPagePreviewDataUrl: (pageId: string, dataUrl: string) => void;
  setBinaryAssets: (assets: BinaryAssetEntity[]) => void;
  appendBinaryAssets: (assets: BinaryAssetEntity[]) => void;
  purgeSourceAssetsForDocument: (documentId: string, pageIds: string[]) => void;
  removeDocumentWorkspaceArtifacts: (
    documentId: string,
    pageIds: string[],
    options?: {
      preserveQuestionIds?: string[];
      preservePageIds?: string[];
      preserveAssetIds?: string[];
    }
  ) => void;
  upsertQuestionDrafts: (questions: QuestionDraftEntity[]) => void;
  replaceQuestionsForPage: (pageId: string, questions: QuestionDraftEntity[]) => void;
  replaceQuestionsForDocument: (
    documentId: string,
    questions: QuestionDraftEntity[]
  ) => void;
  clearQuestionLibrary: () => void;
  markPageQuestionsGeometryReviewed: (pageId: string) => void;
  addManualQuestionDraft: (input: {
    questionId: string;
    documentId: string;
    pageId: string;
    pageNumber: number;
    width: number;
    height: number;
    globalOrder: number;
    pageLayoutMode?: QuestionPageLayoutMode;
  }) => void;
  removeQuestionDraft: (questionId: string) => void;
  updateQuestionBBox: (
    questionId: string,
    pageId: string,
    bbox: QuestionBBox,
    semanticDecision?: { userChoseRerun: boolean }
  ) => void;
  updateQuestionAnalysis: (questionId: string, analysisData: QuestionAnalysisData) => void;
  attachAnswerToQuestion: (
    questionId: string,
    attachments: QuestionAnswerAttachment[]
  ) => void;
  appendManualAnswerToQuestion: (
    questionId: string,
    attachments: QuestionAnswerAttachment[]
  ) => void;
  updateQuestionOcrText: (questionId: string, ocrText: string) => void;
  updateQuestionNumberLabel: (questionId: string, questionNumberLabel: string | null) => void;
  updateQuestionType: (questionId: string, questionType: QuestionType | null) => void;
  updateQuestionTags: (
    questionId: string,
    patch: {
      chapterTag?: string | null;
      knowledgeTags?: string[];
      customTags?: string[];
    }
  ) => void;
  applyClassificationResults: (
    documentId: string,
    results: QuestionClassificationResult[]
  ) => void;
  moveQuestionToPendingBucket: (questionId: string, folderPath: string[]) => void;
  assignQuestionToDirectory: (
    questionId: string,
    directoryPath: string[],
    classificationStatus?: "matched" | "confirmed"
  ) => void;
  rewriteDirectoryPaths: (previousPath: string[], nextPath: string[]) => void;
  reassignQuestionsFromDeletedFolder: (deletedPath: string[], fallbackPath: string[]) => void;
  renameTagEverywhere: (
    type: "chapter" | "knowledge" | "custom",
    from: string,
    to: string
  ) => void;
  mergeTagEverywhere: (
    type: "chapter" | "knowledge" | "custom",
    from: string,
    to: string
  ) => void;
  removeTagEverywhere: (type: "chapter" | "knowledge" | "custom", name: string) => void;
  confirmQuestionsInBulk: (documentId: string, questionIds: string[]) => number;
  undoLastBulkConfirmation: () => void;
  setCrossPageCandidates: (candidates: CrossPageCandidateEntity[]) => void;
  acceptCrossPageCandidate: (candidateId: string) => void;
  dismissCrossPageCandidate: (candidateId: string) => void;
  queueQuestionForManualMerge: (questionId: string) => void;
  clearManualMergeQueue: () => void;
  executeManualMerge: (mergedQuestionId?: string) => void;
  clearCrossPageCandidatesForDocument: (documentId: string) => void;
  selectQuestion: (questionId: string | null) => void;
}

export const useQuestionStore = create<QuestionStoreState>((set) => ({
  pagePreviewUrls: {},
  pagePreviewDataUrls: {},
  binaryAssets: [],
  questionDrafts: [],
  crossPageCandidates: [],
  manualMergeQuestionIds: [],
  selectedQuestionId: null,
  lastBulkConfirmation: null,
  hydrateWorkspaceState: (snapshot) => {
    const displayAssets = snapshot.binaryAssets.filter(
      (asset) => asset.kind === "display" && typeof asset.dataUrl === "string"
    );

    set({
      pagePreviewUrls: Object.fromEntries(
        displayAssets.map((asset) => [asset.pageId, asset.dataUrl as string])
      ),
      pagePreviewDataUrls: Object.fromEntries(
        displayAssets
          .filter((asset) => asset.dataUrl?.startsWith("data:image/"))
          .map((asset) => [asset.pageId, asset.dataUrl as string])
      ),
      binaryAssets: snapshot.binaryAssets,
      questionDrafts: snapshot.questionDrafts.map(normalizeQuestionDraftDirectoryPaths),
      crossPageCandidates: snapshot.crossPageCandidates,
      manualMergeQuestionIds: snapshot.manualMergeQuestionIds,
      selectedQuestionId: snapshot.selectedQuestionId,
      lastBulkConfirmation: snapshot.lastBulkConfirmation
    });
  },
  setPagePreviewUrl: (pageId, url) =>
    set((state) => ({
      pagePreviewUrls: {
        ...state.pagePreviewUrls,
        [pageId]: url
      }
    })),
  setPagePreviewDataUrl: (pageId, dataUrl) =>
    set((state) => ({
      pagePreviewDataUrls: {
        ...state.pagePreviewDataUrls,
        [pageId]: dataUrl
      }
    })),
  setBinaryAssets: (binaryAssets) =>
    set({
      binaryAssets
    }),
  appendBinaryAssets: (assets) =>
    set((state) => ({
      binaryAssets: state.binaryAssets.concat(assets)
    })),
  purgeSourceAssetsForDocument: (documentId, pageIds) =>
    set((state) => {
      const purgedPageIds = new Set(pageIds);
      const nextPreviewUrls = { ...state.pagePreviewUrls };
      const nextPreviewDataUrls = { ...state.pagePreviewDataUrls };

      purgedPageIds.forEach((pageId) => {
        delete nextPreviewUrls[pageId];
        delete nextPreviewDataUrls[pageId];
      });

      return {
        binaryAssets: purgeBinaryAssetsForDocument(state.binaryAssets, documentId, ["source"]),
        pagePreviewUrls: nextPreviewUrls,
        pagePreviewDataUrls: nextPreviewDataUrls
      };
    }),
  removeDocumentWorkspaceArtifacts: (documentId, pageIds, options) =>
    set((state) => {
      const removedPageIds = new Set(pageIds);
      const preservedQuestionIds = new Set(options?.preserveQuestionIds ?? []);
      const preservedPageIds = new Set(options?.preservePageIds ?? []);
      const preservedAssetIds = new Set(options?.preserveAssetIds ?? []);
      const removedQuestionIds = new Set(
        state.questionDrafts
          .filter(
            (question) =>
              question.documentId === documentId && !preservedQuestionIds.has(question.id)
          )
          .map((question) => question.id)
      );
      const nextPreviewUrls = { ...state.pagePreviewUrls };
      const nextPreviewDataUrls = { ...state.pagePreviewDataUrls };

      removedPageIds.forEach((pageId) => {
        delete nextPreviewUrls[pageId];
        delete nextPreviewDataUrls[pageId];
      });

      return {
        pagePreviewUrls: nextPreviewUrls,
        pagePreviewDataUrls: nextPreviewDataUrls,
        binaryAssets: state.binaryAssets.filter(
          (asset) =>
            asset.documentId !== documentId ||
            preservedAssetIds.has(asset.id) ||
            (asset.kind === "display" &&
              preservedPageIds.has(asset.pageId))
        ),
        questionDrafts: state.questionDrafts.filter(
          (question) =>
            question.documentId !== documentId || preservedQuestionIds.has(question.id)
        ),
        crossPageCandidates: state.crossPageCandidates.filter(
          (candidate) => candidate.documentId !== documentId
        ),
        manualMergeQuestionIds: state.manualMergeQuestionIds.filter(
          (questionId) => !removedQuestionIds.has(questionId)
        ),
        selectedQuestionId: removedQuestionIds.has(state.selectedQuestionId ?? "")
          ? null
          : state.selectedQuestionId,
        lastBulkConfirmation:
          state.lastBulkConfirmation?.documentId === documentId ? null : state.lastBulkConfirmation
      };
    }),
  upsertQuestionDrafts: (questions) =>
    set((state) => {
      const incoming = new Map(questions.map((question) => [question.id, question]));
      const next = state.questionDrafts
        .filter((question) => !incoming.has(question.id))
        .concat(questions);

      return {
        questionDrafts: next
      };
    }),
  replaceQuestionsForPage: (pageId, questions) =>
    set((state) => ({
      questionDrafts: state.questionDrafts
        .filter((question) => !question.pageIds.includes(pageId))
        .concat(questions)
    })),
  replaceQuestionsForDocument: (documentId, questions) =>
    set((state) => {
      const incomingIds = new Set(questions.map((question) => question.id));
      const removedIds = new Set(
        state.questionDrafts
          .filter(
            (question) =>
              question.documentId === documentId && !incomingIds.has(question.id)
          )
          .map((question) => question.id)
      );

      return {
        questionDrafts: state.questionDrafts
          .filter((question) => question.documentId !== documentId)
          .concat(questions),
        manualMergeQuestionIds: state.manualMergeQuestionIds.filter(
          (questionId) => !removedIds.has(questionId)
        ),
        selectedQuestionId: removedIds.has(state.selectedQuestionId ?? "")
          ? null
          : state.selectedQuestionId,
        lastBulkConfirmation:
          state.lastBulkConfirmation?.documentId === documentId
            ? null
            : state.lastBulkConfirmation
      };
    }),
  clearQuestionLibrary: () =>
    set({
      questionDrafts: [],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null
    }),
  markPageQuestionsGeometryReviewed: (pageId) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) => {
        if (!question.pageIds.includes(pageId) || question.status !== "geometry_draft") {
          return question;
        }

        return {
          ...question,
          status: "geometry_reviewed",
          classificationStatus: "unclassified",
          directoryMatchConfidence: null,
          directoryPath: null,
          directoryCandidatePaths: [],
          ocrText: null,
          lastBulkConfirmationId: null
        };
      })
    })),
  addManualQuestionDraft: (input) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.concat(createManualQuestionDraft(input)),
      selectedQuestionId: input.questionId
    })),
  removeQuestionDraft: (questionId) =>
    set((state) => ({
      questionDrafts: removeQuestionDraftById(state.questionDrafts, questionId),
      selectedQuestionId:
        state.selectedQuestionId === questionId ? null : state.selectedQuestionId
    })),
  updateQuestionBBox: (questionId, pageId, bbox, semanticDecision) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) => {
        if (question.id !== questionId || !question.pageIds.includes(pageId)) {
          return question;
        }

        const nextQuestion = {
          ...question,
          bboxByPage: {
            ...question.bboxByPage,
            [pageId]: bbox
          }
        };

        if (!semanticDecision) {
          return nextQuestion;
        }

        const hasProcessedSemantics = hasProcessedQuestionSemantics(question);
        const newlyAddedQuestion = question.source === "manual" && question.status === "manual_only";

        if (!hasProcessedSemantics || newlyAddedQuestion) {
          return nextQuestion;
        }

        return reconcileQuestionAfterGeometryChange(question, {
          selectedPageId: pageId,
          nextBBox: bbox,
          userChoseRerun: shouldInvalidateQuestionSemantics({
            hasProcessedSemantics,
            geometryChanged: true,
            userChoseRerun: semanticDecision.userChoseRerun,
            newlyAddedQuestion
          })
        });
      })
    })),
  updateQuestionAnalysis: (questionId, analysisData) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              analysisData
            }
          : question
      )
    })),
  attachAnswerToQuestion: (questionId, attachments) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              answerAttachments: attachments
            }
          : question
      )
    })),
  appendManualAnswerToQuestion: (questionId, attachments) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              answerAttachments: (question.answerAttachments ?? []).concat(attachments)
            }
          : question
      )
    })),
  updateQuestionOcrText: (questionId, ocrText) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              ocrText
            }
          : question
      )
    })),
  updateQuestionNumberLabel: (questionId, questionNumberLabel) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              questionNumberLabel
            }
          : question
      )
    })),
  updateQuestionType: (questionId, questionType) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              questionType
            }
          : question
      )
    })),
  updateQuestionTags: (questionId, patch) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              chapterTag:
                patch.chapterTag !== undefined ? patch.chapterTag : question.chapterTag,
              knowledgeTags:
                patch.knowledgeTags !== undefined ? patch.knowledgeTags : question.knowledgeTags,
              customTags: patch.customTags !== undefined ? patch.customTags : question.customTags
            }
          : question
      )
    })),
  applyClassificationResults: (documentId, results) =>
    set((state) => ({
      questionDrafts: applyClassificationResults(state.questionDrafts, documentId, results)
    })),
  moveQuestionToPendingBucket: (questionId, folderPath) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              status: "pending_bucket",
              classificationStatus: "pending_bucket",
              directoryPath: folderPath,
              lastBulkConfirmationId: null
            }
          : question
      )
    })),
  assignQuestionToDirectory: (questionId, directoryPath, classificationStatus = "confirmed") =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        question.id === questionId
          ? {
              ...question,
              status: classificationStatus === "confirmed" ? "reviewed" : "semantic_draft",
              classificationStatus,
              directoryPath,
              lastBulkConfirmationId: null
            }
          : question
      )
    })),
  rewriteDirectoryPaths: (previousPath, nextPath) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) => ({
        ...question,
        directoryPath:
          replaceFolderPathPrefix(question.directoryPath, previousPath, nextPath) ?? question.directoryPath,
        directoryCandidatePaths:
          question.directoryCandidatePaths?.map(
            (path) => replaceFolderPathPrefix(path, previousPath, nextPath) ?? path
          ) ?? question.directoryCandidatePaths
      }))
    })),
  reassignQuestionsFromDeletedFolder: (deletedPath, fallbackPath) =>
    set((state) => ({
      questionDrafts: state.questionDrafts.map((question) =>
        doesFolderPathMatchPrefix(question.directoryPath, deletedPath)
          ? {
              ...question,
              directoryPath: fallbackPath,
              lastBulkConfirmationId: null
            }
          : {
              ...question,
              directoryCandidatePaths:
                question.directoryCandidatePaths?.filter(
                  (path) => !doesFolderPathMatchPrefix(path, deletedPath)
                ) ?? question.directoryCandidatePaths
          }
      )
    })),
  renameTagEverywhere: (type, from, to) =>
    set((state) => ({
      questionDrafts: renameTagInQuestions(state.questionDrafts, { type, from, to })
    })),
  mergeTagEverywhere: (type, from, to) =>
    set((state) => ({
      questionDrafts: mergeTagInQuestions(state.questionDrafts, { type, from, to })
    })),
  removeTagEverywhere: (type, name) =>
    set((state) => ({
      questionDrafts: removeTagFromQuestions(state.questionDrafts, { type, name })
    })),
  confirmQuestionsInBulk: (documentId, questionIds) => {
    let confirmedCount = 0;

    set((state) => {
      const confirmationId = `bulk-${Date.now()}`;
      const result = bulkConfirmQuestions(state.questionDrafts, questionIds, confirmationId);
      confirmedCount = result.undoSnapshots.length;

      return {
        questionDrafts: result.nextQuestions,
        lastBulkConfirmation: confirmedCount
          ? {
              confirmationId,
              documentId,
              confirmedCount,
              undoSnapshots: result.undoSnapshots
            }
          : null
      };
    });

    return confirmedCount;
  },
  undoLastBulkConfirmation: () =>
    set((state) => {
      if (!state.lastBulkConfirmation) {
        return state;
      }

      return {
        questionDrafts: restoreQuestionConfirmations(
          state.questionDrafts,
          state.lastBulkConfirmation.undoSnapshots
        ),
        lastBulkConfirmation: null
      };
    }),
  setCrossPageCandidates: (crossPageCandidates) =>
    set({
      crossPageCandidates
    }),
  acceptCrossPageCandidate: (candidateId) =>
    set((state) => {
      const candidate = state.crossPageCandidates.find((item) => item.id === candidateId);

      if (!candidate) {
        return state;
      }

      const mergedQuestionId = resolveUniqueMergedQuestionId(
        candidate,
        state.questionDrafts
      );

      return {
        crossPageCandidates: acceptCrossPageCandidateState(state.crossPageCandidates, candidateId),
        questionDrafts: mergeQuestionsAcrossPages(state.questionDrafts, {
          mergedQuestionId,
          sourceQuestionIds: candidate.sourceQuestionIds,
          crossPageGroupId: mergedQuestionId
        })
      };
    }),
  dismissCrossPageCandidate: (candidateId) =>
    set((state) => {
      const candidate = state.crossPageCandidates.find((item) => item.id === candidateId);
      const synthesizedFragmentIds = new Set(
        candidate?.sourceQuestionIds.filter((questionId) =>
          questionId.includes("-continuation-from-")
        ) ?? []
      );

      return {
        crossPageCandidates: dismissCrossPageCandidateState(state.crossPageCandidates, candidateId),
        questionDrafts: synthesizedFragmentIds.size
          ? state.questionDrafts.filter((question) => !synthesizedFragmentIds.has(question.id))
          : state.questionDrafts
      };
    }),
  queueQuestionForManualMerge: (questionId) =>
    set((state) => ({
      manualMergeQuestionIds: state.manualMergeQuestionIds.includes(questionId)
        ? state.manualMergeQuestionIds
        : state.manualMergeQuestionIds.concat(questionId)
    })),
  clearManualMergeQueue: () =>
    set({
      manualMergeQuestionIds: []
    }),
  executeManualMerge: (mergedQuestionId) =>
    set((state) => {
      if (state.manualMergeQuestionIds.length < 2) {
        return state;
      }

      const nextMergedQuestionId = mergedQuestionId ?? `manual-merge-${Date.now()}`;

      return {
        questionDrafts: mergeQuestionsAcrossPages(state.questionDrafts, {
          mergedQuestionId: nextMergedQuestionId,
          sourceQuestionIds: state.manualMergeQuestionIds,
          crossPageGroupId: nextMergedQuestionId
        }),
        manualMergeQuestionIds: [],
        selectedQuestionId: nextMergedQuestionId
      };
    }),
  clearCrossPageCandidatesForDocument: (documentId) =>
    set((state) => ({
      crossPageCandidates: state.crossPageCandidates.filter(
        (candidate) => candidate.documentId !== documentId
      )
    })),
  selectQuestion: (selectedQuestionId) =>
    set({
      selectedQuestionId
    })
}));
