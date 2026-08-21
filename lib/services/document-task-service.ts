import type {
  DocumentProcessingCheckpoint,
  DocumentProcessingStage,
  DocumentProcessingSummary
} from "@/lib/services/document-processing-workflow";
import type { QuestionPageLayoutMode } from "@/lib/domain/entities";

export type DocumentTaskStatus =
  | "queued"
  | "running"
  | "pausing"
  | "paused"
  | "cancelling"
  | "cancelled"
  | "failed"
  | "done";

export type DocumentTaskPriority = "restored" | "new";

export interface DocumentTaskWorkflowInput {
  subjectScope: string | null;
  questionPageLayoutMode: QuestionPageLayoutMode;
  hasAnswerSection: boolean;
  questionPageIds: string[];
  answerPageIds: string[];
}

export interface DocumentProcessingTask {
  id: string;
  runId: string;
  documentId: string;
  documentName: string;
  status: DocumentTaskStatus;
  priority: DocumentTaskPriority;
  createdAt: string;
  updatedAt: string;
  progress: {
    stage: DocumentProcessingStage;
    current: number;
    total: number;
    message: string | null;
    summary: DocumentProcessingSummary | null;
  };
  checkpoint: DocumentProcessingCheckpoint;
  completedPageIds: string[];
  failedPageIds: string[];
  errorMessage: string | null;
  workflowInput: DocumentTaskWorkflowInput;
}

const EMPTY_SUMMARY: DocumentProcessingSummary = {
  questionCount: 0,
  crossPageMergeCount: 0,
  classifiedQuestionCount: 0,
  autoMatchedAnswerCount: 0,
  pendingAnswerCount: 0,
  specializedDocumentCount: 0
};

export function createDocumentProcessingTask(input: {
  id: string;
  runId: string;
  documentId: string;
  documentName: string;
  createdAt?: string;
  priority?: DocumentTaskPriority;
  workflowInput?: DocumentTaskWorkflowInput;
}): DocumentProcessingTask {
  const createdAt = input.createdAt ?? new Date().toISOString();

  return {
    id: input.id,
    runId: input.runId,
    documentId: input.documentId,
    documentName: input.documentName,
    status: "queued",
    priority: input.priority ?? "new",
    createdAt,
    updatedAt: createdAt,
    progress: {
      stage: "question_boxes",
      current: 0,
      total: 0,
      message: "等待处理",
      summary: null
    },
    checkpoint: {
      nextStage: "question_boxes",
      summary: { ...EMPTY_SUMMARY }
    },
    completedPageIds: [],
    failedPageIds: [],
    errorMessage: null,
    workflowInput: input.workflowInput
      ? {
          ...input.workflowInput,
          questionPageIds: input.workflowInput.questionPageIds.slice(),
          answerPageIds: input.workflowInput.answerPageIds.slice()
        }
      : {
          subjectScope: null,
          questionPageLayoutMode: "single_column",
          hasAnswerSection: false,
          questionPageIds: [],
          answerPageIds: []
        }
  };
}

export function normalizeRestoredDocumentTasks(
  tasks: DocumentProcessingTask[]
): DocumentProcessingTask[] {
  return tasks.map((task) => {
    const normalizedTask = {
      ...task,
      workflowInput: task.workflowInput ?? {
        subjectScope: null,
        questionPageLayoutMode: "single_column" as const,
        hasAnswerSection: false,
        questionPageIds: [],
        answerPageIds: []
      }
    };

    if (task.status === "done" || task.status === "cancelled") {
      return normalizedTask;
    }

    if (task.status === "cancelling") {
      return {
        ...normalizedTask,
        status: "cancelled",
        priority: "restored"
      };
    }

    return {
      ...normalizedTask,
      status:
        task.status === "running" || task.status === "pausing" ? "queued" : task.status,
      priority: "restored"
    };
  });
}

export function reconcileDocumentTaskQuestionCounts(
  tasks: DocumentProcessingTask[],
  questionDocumentIds: string[]
): DocumentProcessingTask[] {
  const questionCountByDocumentId = questionDocumentIds.reduce((counts, documentId) => {
    counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return tasks.map((task) => {
    const questionCount = questionCountByDocumentId.get(task.documentId) ?? 0;
    const progressSummary = task.progress.summary;

    if (
      task.checkpoint.summary.questionCount === questionCount &&
      (!progressSummary || progressSummary.questionCount === questionCount)
    ) {
      return task;
    }

    return {
      ...task,
      progress: progressSummary
        ? {
            ...task.progress,
            summary: { ...progressSummary, questionCount }
          }
        : task.progress,
      checkpoint: {
        ...task.checkpoint,
        summary: { ...task.checkpoint.summary, questionCount }
      }
    };
  });
}

export function selectNextRunnableDocumentTask(
  tasks: DocumentProcessingTask[]
): DocumentProcessingTask | null {
  return (
    tasks
      .filter((task) => task.status === "queued")
      .slice()
      .sort(
        (left, right) =>
          (left.priority === right.priority
            ? 0
            : left.priority === "restored"
              ? -1
              : 1) ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id)
      )[0] ?? null
  );
}
