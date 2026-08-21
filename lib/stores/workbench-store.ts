import { create } from "zustand";

import type {
  DocumentProcessingStage,
  DocumentProcessingSummary
} from "@/lib/services/document-processing-workflow";
import {
  normalizeRestoredDocumentTasks,
  type DocumentProcessingTask
} from "@/lib/services/document-task-service";

export interface ClassificationRunProgress {
  status: "idle" | "running" | "done" | "failed";
  ocrCurrent: number;
  ocrTotal: number;
  classificationCurrent: number;
  classificationTotal: number;
  message: string | null;
}

export interface DocumentAutoDetectProgress {
  status: "idle" | "running" | "done" | "failed";
  phase: "question_boxes" | "cross_page";
  current: number;
  total: number;
  pageNumber: number | null;
  message: string | null;
}

export interface DocumentProcessingProgress {
  status: "idle" | "running" | "done" | "failed";
  stage: DocumentProcessingStage;
  current: number;
  total: number;
  message: string | null;
  summary: DocumentProcessingSummary | null;
}

export interface PendingClassificationBatchApply {
  directoryPath: string[];
  anchorQuestionId: string;
  candidateQuestionIds: string[];
  selectedQuestionIds: string[];
}

export interface CrossPageReviewSession {
  documentId: string;
  candidateIds: string[];
  currentIndex: number;
  acceptedCount: number;
  recoveryMode: "live" | "resume_ocr" | "review_only";
  resolve?: (acceptedCount: number) => void;
}

export interface CrossPageReviewResumeRequest {
  id: string;
  documentId: string;
  startStage: "cross_page" | "ocr";
  acceptedCount: number;
}

export const INITIAL_CLASSIFICATION_RUN_PROGRESS: ClassificationRunProgress = {
  status: "idle",
  ocrCurrent: 0,
  ocrTotal: 0,
  classificationCurrent: 0,
  classificationTotal: 0,
  message: null
};

export const INITIAL_DOCUMENT_AUTO_DETECT_PROGRESS: DocumentAutoDetectProgress = {
  status: "idle",
  phase: "question_boxes",
  current: 0,
  total: 0,
  pageNumber: null,
  message: null
};

export const INITIAL_DOCUMENT_PROCESSING_PROGRESS: DocumentProcessingProgress = {
  status: "idle",
  stage: "question_boxes",
  current: 0,
  total: 0,
  message: null,
  summary: null
};

interface WorkbenchStoreState {
  activeDocumentTaskId: string | null;
  classificationRunMessage: string | null;
  classificationRunProgress: ClassificationRunProgress;
  crossPageReviewResumeRequest: CrossPageReviewResumeRequest | null;
  crossPageReviewSession: CrossPageReviewSession | null;
  documentAutoDetectProgress: DocumentAutoDetectProgress;
  documentProcessingProgress: DocumentProcessingProgress;
  documentProcessingRetry: (() => void) | null;
  documentTasks: DocumentProcessingTask[];
  pendingClassificationBatchApply: PendingClassificationBatchApply | null;
  setClassificationRunMessage: (message: string | null) => void;
  setClassificationRunProgress: (progress: ClassificationRunProgress) => void;
  setCrossPageReviewResumeRequest: (request: CrossPageReviewResumeRequest | null) => void;
  setCrossPageReviewSession: (session: CrossPageReviewSession | null) => void;
  consumeCrossPageReviewResumeRequest: (
    requestId: string
  ) => CrossPageReviewResumeRequest | null;
  setDocumentAutoDetectProgress: (progress: DocumentAutoDetectProgress) => void;
  setDocumentProcessingProgress: (progress: DocumentProcessingProgress) => void;
  setDocumentProcessingRetry: (retry: (() => void) | null) => void;
  hydrateDocumentTasks: (tasks: DocumentProcessingTask[]) => void;
  enqueueDocumentTask: (task: DocumentProcessingTask) => void;
  updateDocumentTaskProgress: (
    taskId: string,
    runId: string,
    progress: DocumentProcessingTask["progress"]
  ) => void;
  recordDocumentTaskPageResult: (
    taskId: string,
    runId: string,
    pageId: string,
    result: "completed" | "failed"
  ) => void;
  resumeDocumentTask: (taskId: string, runId: string) => void;
  selectDocumentTask: (taskId: string) => void;
  updateDocumentTaskStatus: (
    taskId: string,
    runId: string,
    status: DocumentProcessingTask["status"],
    errorMessage?: string | null
  ) => void;
  updateDocumentTaskCheckpoint: (
    taskId: string,
    runId: string,
    checkpoint: DocumentProcessingTask["checkpoint"]
  ) => void;
  setPendingClassificationBatchApply: (pending: PendingClassificationBatchApply | null) => void;
  togglePendingClassificationBatchApplyQuestion: (questionId: string) => void;
  resetTransientProgress: () => void;
}

export const useWorkbenchStore = create<WorkbenchStoreState>((set, get) => ({
  activeDocumentTaskId: null,
  classificationRunMessage: null,
  classificationRunProgress: INITIAL_CLASSIFICATION_RUN_PROGRESS,
  crossPageReviewResumeRequest: null,
  crossPageReviewSession: null,
  documentAutoDetectProgress: INITIAL_DOCUMENT_AUTO_DETECT_PROGRESS,
  documentProcessingProgress: INITIAL_DOCUMENT_PROCESSING_PROGRESS,
  documentProcessingRetry: null,
  documentTasks: [],
  pendingClassificationBatchApply: null,
  setClassificationRunMessage: (classificationRunMessage) =>
    set({
      classificationRunMessage
    }),
  setClassificationRunProgress: (classificationRunProgress) =>
    set({
      classificationRunProgress
    }),
  setCrossPageReviewResumeRequest: (crossPageReviewResumeRequest) =>
    set({
      crossPageReviewResumeRequest
    }),
  setCrossPageReviewSession: (crossPageReviewSession) =>
    set({
      crossPageReviewSession
    }),
  consumeCrossPageReviewResumeRequest: (requestId) => {
    const request = get().crossPageReviewResumeRequest;

    if (!request || request.id !== requestId) {
      return null;
    }

    set({ crossPageReviewResumeRequest: null });
    return request;
  },
  setDocumentAutoDetectProgress: (documentAutoDetectProgress) =>
    set({
      documentAutoDetectProgress
    }),
  setDocumentProcessingProgress: (documentProcessingProgress) =>
    set({
      documentProcessingProgress
    }),
  setDocumentProcessingRetry: (documentProcessingRetry) =>
    set({
      documentProcessingRetry
    }),
  hydrateDocumentTasks: (documentTasks) =>
    set({
      documentTasks: normalizeRestoredDocumentTasks(documentTasks),
      activeDocumentTaskId: null
    }),
  enqueueDocumentTask: (task) =>
    set((state) => ({
      documentTasks: state.documentTasks.some((item) => item.id === task.id)
        ? state.documentTasks.map((item) => (item.id === task.id ? task : item))
        : state.documentTasks.concat(task)
    })),
  updateDocumentTaskProgress: (taskId, runId, progress) =>
    set((state) => ({
      documentTasks: state.documentTasks.map((task) =>
        task.id === taskId && task.runId === runId
          ? {
              ...task,
              progress,
              updatedAt: new Date().toISOString()
            }
          : task
      )
    })),
  recordDocumentTaskPageResult: (taskId, runId, pageId, result) =>
    set((state) => ({
      documentTasks: state.documentTasks.map((task) => {
        if (task.id !== taskId || task.runId !== runId) {
          return task;
        }

        const completedPageIds = task.completedPageIds.filter((id) => id !== pageId);
        const failedPageIds = task.failedPageIds.filter((id) => id !== pageId);

        if (result === "completed") {
          completedPageIds.push(pageId);
        } else {
          failedPageIds.push(pageId);
        }

        return {
          ...task,
          completedPageIds,
          failedPageIds,
          updatedAt: new Date().toISOString()
        };
      })
    })),
  resumeDocumentTask: (taskId, runId) =>
    set((state) => ({
      documentTasks: state.documentTasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              runId,
              status: "queued",
              priority: "restored",
              errorMessage: null,
              updatedAt: new Date().toISOString()
            }
          : task
      )
    })),
  selectDocumentTask: (taskId) =>
    set((state) =>
      state.documentTasks.some(
        (task) => task.id === taskId && task.status !== "cancelled"
      )
        ? { activeDocumentTaskId: taskId }
        : state
    ),
  updateDocumentTaskStatus: (taskId, runId, status, errorMessage) =>
    set((state) => {
      const hasCurrentTask = state.documentTasks.some(
        (task) => task.id === taskId && task.runId === runId
      );

      if (!hasCurrentTask) {
        return state;
      }

      return {
        documentTasks: state.documentTasks.map((task) =>
          task.id === taskId && task.runId === runId
            ? {
                ...task,
                status,
                errorMessage:
                  errorMessage !== undefined
                    ? errorMessage
                    : status === "failed"
                      ? task.errorMessage
                      : null,
                updatedAt: new Date().toISOString()
              }
            : task
        ),
        activeDocumentTaskId:
          status === "running" || status === "pausing" || status === "cancelling"
            ? taskId
            : state.activeDocumentTaskId
      };
    }),
  updateDocumentTaskCheckpoint: (taskId, runId, checkpoint) =>
    set((state) => ({
      documentTasks: state.documentTasks.map((task) =>
        task.id === taskId && task.runId === runId
          ? {
              ...task,
              checkpoint,
              updatedAt: new Date().toISOString()
            }
          : task
      )
    })),
  setPendingClassificationBatchApply: (pendingClassificationBatchApply) =>
    set({
      pendingClassificationBatchApply
    }),
  togglePendingClassificationBatchApplyQuestion: (questionId) =>
    set((state) => {
      if (!state.pendingClassificationBatchApply) {
        return state;
      }

      return {
        pendingClassificationBatchApply: {
          ...state.pendingClassificationBatchApply,
          selectedQuestionIds: state.pendingClassificationBatchApply.selectedQuestionIds.includes(
            questionId
          )
            ? state.pendingClassificationBatchApply.selectedQuestionIds.filter(
                (id) => id !== questionId
              )
            : state.pendingClassificationBatchApply.selectedQuestionIds.concat(questionId)
        }
      };
    }),
  resetTransientProgress: () =>
    set({
      classificationRunMessage: null,
      classificationRunProgress: INITIAL_CLASSIFICATION_RUN_PROGRESS,
      crossPageReviewResumeRequest: null,
      crossPageReviewSession: null,
      documentAutoDetectProgress: INITIAL_DOCUMENT_AUTO_DETECT_PROGRESS,
      documentProcessingProgress: INITIAL_DOCUMENT_PROCESSING_PROGRESS,
      documentProcessingRetry: null,
      pendingClassificationBatchApply: null
    })
}));
