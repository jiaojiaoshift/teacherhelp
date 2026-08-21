export type DocumentProcessingStage =
  | "question_boxes"
  | "cross_page"
  | "ocr"
  | "answer_matching"
  | "specialized_sync"
  | "done";

export interface DocumentProcessingStageEvent {
  stage: DocumentProcessingStage;
  status: "running" | "done" | "failed";
}

export interface DocumentProcessingSummary {
  questionCount: number;
  crossPageMergeCount: number;
  classifiedQuestionCount: number;
  autoMatchedAnswerCount: number;
  pendingAnswerCount: number;
  specializedDocumentCount: number;
}

export type DocumentProcessingExecutableStage = Exclude<DocumentProcessingStage, "done">;

export interface DocumentProcessingCheckpoint {
  nextStage: DocumentProcessingStage;
  summary: DocumentProcessingSummary;
}

const EMPTY_DOCUMENT_PROCESSING_SUMMARY: DocumentProcessingSummary = {
  questionCount: 0,
  crossPageMergeCount: 0,
  classifiedQuestionCount: 0,
  autoMatchedAnswerCount: 0,
  pendingAnswerCount: 0,
  specializedDocumentCount: 0
};

const DOCUMENT_PROCESSING_STAGE_ORDER: DocumentProcessingExecutableStage[] = [
  "question_boxes",
  "cross_page",
  "ocr",
  "answer_matching",
  "specialized_sync"
];

export async function runDocumentProcessingWorkflow(input: {
  hasAnswerSection: boolean;
  detectQuestionBoxes: () => Promise<number>;
  detectCrossPage: () => Promise<number>;
  getQuestionCount?: () => number;
  classifyQuestions: () => Promise<number>;
  matchAnswers: () => Promise<{
    autoMatchedCount: number;
    pendingCount: number;
  }>;
  syncSpecialized: () => Promise<number>;
  onStage?: (event: DocumentProcessingStageEvent) => void;
  startStage?: DocumentProcessingExecutableStage;
  initialSummary?: Partial<DocumentProcessingSummary>;
  onCheckpoint?: (checkpoint: DocumentProcessingCheckpoint) => void;
}): Promise<DocumentProcessingSummary> {
  const runStage = async <T>(stage: DocumentProcessingExecutableStage, work: () => Promise<T>) => {
    input.onStage?.({ stage, status: "running" });

    try {
      const result = await work();
      input.onStage?.({ stage, status: "done" });
      return result;
    } catch (error) {
      input.onStage?.({ stage, status: "failed" });
      throw error;
    }
  };
  const startStage = input.startStage ?? "question_boxes";
  const startIndex = DOCUMENT_PROCESSING_STAGE_ORDER.indexOf(startStage);
  const shouldRun = (stage: DocumentProcessingExecutableStage) =>
    DOCUMENT_PROCESSING_STAGE_ORDER.indexOf(stage) >= startIndex;
  const summary: DocumentProcessingSummary = {
    ...EMPTY_DOCUMENT_PROCESSING_SUMMARY,
    ...input.initialSummary
  };
  const saveCheckpoint = (nextStage: DocumentProcessingStage) => {
    input.onCheckpoint?.({
      nextStage,
      summary: { ...summary }
    });
  };

  if (shouldRun("question_boxes")) {
    summary.questionCount = await runStage("question_boxes", input.detectQuestionBoxes);
    saveCheckpoint("cross_page");
  }

  if (shouldRun("cross_page")) {
    summary.crossPageMergeCount = await runStage("cross_page", input.detectCrossPage);
    summary.questionCount = input.getQuestionCount?.() ?? summary.questionCount;
    saveCheckpoint("ocr");
  }

  if (shouldRun("ocr")) {
    summary.classifiedQuestionCount = await runStage("ocr", input.classifyQuestions);
    saveCheckpoint(input.hasAnswerSection ? "answer_matching" : "specialized_sync");
  }

  if (input.hasAnswerSection && shouldRun("answer_matching")) {
    const answerSummary = await runStage("answer_matching", input.matchAnswers);
    summary.autoMatchedAnswerCount = answerSummary.autoMatchedCount;
    summary.pendingAnswerCount = answerSummary.pendingCount;
    saveCheckpoint("specialized_sync");
  }

  if (shouldRun("specialized_sync")) {
    summary.specializedDocumentCount = await runStage(
      "specialized_sync",
      input.syncSpecialized
    );
    saveCheckpoint("done");
  }

  input.onStage?.({ stage: "done", status: "done" });

  return summary;
}
