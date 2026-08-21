import type {
  ExamDocumentEditSnapshot,
  ExamDocumentEditorState,
  ExamDocumentQuestionBlock,
  ExamLectureSpacingState,
  ExamLibraryDocumentEntity,
  QuestionDraftEntity
} from "@/lib/domain/entities";

const DEFAULT_LECTURE_GAP = 48;

type QuestionAnswerMeta = Pick<QuestionDraftEntity, "id" | "answerAttachments">;

type GroupDocumentKinds = {
  paper: ExamLibraryDocumentEntity | null;
  lecture: ExamLibraryDocumentEntity | null;
  answerSheet: ExamLibraryDocumentEntity | null;
  groupDocuments: ExamLibraryDocumentEntity[];
};

function cloneBlocks(blocks: ExamDocumentQuestionBlock[] | undefined) {
  return blocks?.map((block) => ({
    ...block,
    questionIds: block.questionIds.slice()
  }));
}

function cloneLectureSpacing(lectureSpacing: ExamLectureSpacingState): ExamLectureSpacingState {
  return {
    defaultGap: lectureSpacing.defaultGap,
    perQuestionGapOverrides: {
      ...lectureSpacing.perQuestionGapOverrides
    }
  };
}

function normalizeLectureSpacing(input: {
  questionIds: string[];
  lectureSpacing?: ExamLectureSpacingState;
}): ExamLectureSpacingState {
  const defaultGap = Math.max(0, Math.round(input.lectureSpacing?.defaultGap ?? DEFAULT_LECTURE_GAP));
  const questionIdSet = new Set(input.questionIds);

  return {
    defaultGap,
    perQuestionGapOverrides: Object.fromEntries(
      Object.entries(input.lectureSpacing?.perQuestionGapOverrides ?? {}).filter(
        ([questionId]) => questionIdSet.has(questionId)
      )
    )
  };
}

function resolveGroupDocumentKinds(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
}): GroupDocumentKinds | null {
  const target = input.documents.find((document) => document.id === input.documentId);

  if (!target) {
    return null;
  }

  const groupDocuments = target.groupId
    ? input.documents.filter((document) => document.groupId === target.groupId)
    : input.documents.filter((document) => document.id === target.id);

  return {
    paper: groupDocuments.find((document) => document.kind === "paper") ?? null,
    lecture: groupDocuments.find((document) => document.kind === "lecture") ?? null,
    answerSheet: groupDocuments.find((document) => document.kind === "answer_sheet") ?? null,
    groupDocuments
  };
}

function buildCurrentSnapshot(input: GroupDocumentKinds): ExamDocumentEditSnapshot {
  const anchor = input.paper ?? input.lecture ?? input.answerSheet;
  const questionIds = anchor?.questionIds.slice() ?? [];

  return {
    questionIds,
    questionBlocks: cloneBlocks(input.paper?.questionBlocks ?? input.lecture?.questionBlocks),
    numberingMode: input.paper?.numberingMode ?? input.lecture?.numberingMode ?? "resequence",
    answerPlaceholder: input.answerSheet?.placeholderAnswerPage ?? false,
    lectureSpacing: normalizeLectureSpacing({
      questionIds,
      lectureSpacing: input.lecture?.lectureSpacing
    })
  };
}

function snapshotsEqual(left: ExamDocumentEditSnapshot, right: ExamDocumentEditSnapshot) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildNextEditorState(input: {
  paper: ExamLibraryDocumentEntity | null;
  currentSnapshot: ExamDocumentEditSnapshot;
  nextSnapshot: ExamDocumentEditSnapshot;
  preserveUndoStack?: ExamDocumentEditorState["undoStack"];
}): ExamDocumentEditorState | undefined {
  const existingUndoStack =
    input.preserveUndoStack ?? input.paper?.editorState?.undoStack ?? [];

  if (input.preserveUndoStack) {
    return {
      undoStack: input.preserveUndoStack
    };
  }

  if (snapshotsEqual(input.currentSnapshot, input.nextSnapshot)) {
    return input.paper?.editorState;
  }

  const nextUndoStack = existingUndoStack.concat({
    ...input.currentSnapshot,
    questionBlocks: cloneBlocks(input.currentSnapshot.questionBlocks),
    lectureSpacing: cloneLectureSpacing(input.currentSnapshot.lectureSpacing)
  });

  return {
    undoStack: nextUndoStack
  };
}

function applySnapshotToGroup(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
  snapshot: ExamDocumentEditSnapshot;
  editorState?: ExamDocumentEditorState;
}): ExamLibraryDocumentEntity[] {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds) {
    return input.documents;
  }

  const groupIds = new Set(groupKinds.groupDocuments.map((document) => document.id));

  return input.documents.map((document) => {
    if (!groupIds.has(document.id)) {
      return document;
    }

    if (document.kind === "answer_sheet") {
      return {
        ...document,
        questionIds: input.snapshot.questionIds.slice(),
        numberingMode: input.snapshot.numberingMode,
        placeholderAnswerPage: input.snapshot.answerPlaceholder
      };
    }

    if (document.kind === "lecture") {
      return {
        ...document,
        questionIds: input.snapshot.questionIds.slice(),
        questionBlocks: cloneBlocks(input.snapshot.questionBlocks),
        numberingMode: input.snapshot.numberingMode,
        lectureSpacing: cloneLectureSpacing(input.snapshot.lectureSpacing)
      };
    }

    return {
      ...document,
      questionIds: input.snapshot.questionIds.slice(),
      questionBlocks: cloneBlocks(input.snapshot.questionBlocks),
      numberingMode: input.snapshot.numberingMode,
      editorState: input.editorState
    };
  });
}

function buildAnswerPlaceholder(input: {
  questionIds: string[];
  questions: QuestionAnswerMeta[];
}) {
  const answerCountByQuestionId = new Map(
    input.questions.map((question) => [question.id, question.answerAttachments?.length ?? 0])
  );

  return !input.questionIds.some((questionId) => (answerCountByQuestionId.get(questionId) ?? 0) > 0);
}

function reorderLinearQuestionIds(input: {
  questionIds: string[];
  questionId: string;
  targetQuestionId: string;
  position: "before" | "after";
}) {
  const remainingQuestionIds = input.questionIds.filter((questionId) => questionId !== input.questionId);
  const targetIndex = remainingQuestionIds.findIndex((questionId) => questionId === input.targetQuestionId);

  if (targetIndex < 0) {
    return remainingQuestionIds.concat(input.questionId);
  }

  const insertionIndex = input.position === "before" ? targetIndex : targetIndex + 1;
  const nextQuestionIds = remainingQuestionIds.slice();

  nextQuestionIds.splice(insertionIndex, 0, input.questionId);
  return nextQuestionIds;
}

function flattenBlocks(blocks: ExamDocumentQuestionBlock[] | undefined) {
  return (blocks ?? []).flatMap((block) => block.questionIds);
}

function moveQuestionAcrossBlocks(input: {
  blocks: ExamDocumentQuestionBlock[];
  questionId: string;
  targetQuestionId?: string;
  targetBlockKey?: string;
  position: "before" | "after";
}) {
  const nextBlocks = cloneBlocks(input.blocks) ?? [];
  const targetQuestionId = input.targetQuestionId;
  const targetBlockKey = input.targetBlockKey;
  const sourceBlock = nextBlocks.find((block) => block.questionIds.includes(input.questionId));

  if (!sourceBlock) {
    return nextBlocks;
  }

  sourceBlock.questionIds = sourceBlock.questionIds.filter((questionId) => questionId !== input.questionId);

  const targetBlock =
    (targetQuestionId
      ? nextBlocks.find((block) => block.questionIds.includes(targetQuestionId))
      : null) ??
    (targetBlockKey
      ? nextBlocks.find((block) => block.key === targetBlockKey)
      : null) ??
    sourceBlock;

  if (!targetBlock) {
    return nextBlocks;
  }

  if (!targetQuestionId) {
    targetBlock.questionIds = targetBlock.questionIds.concat(input.questionId);
    return nextBlocks;
  }

  const targetIndex = targetBlock.questionIds.findIndex(
    (questionId) => questionId === targetQuestionId
  );
  const insertionIndex = targetIndex < 0 ? targetBlock.questionIds.length : input.position === "before" ? targetIndex : targetIndex + 1;

  targetBlock.questionIds.splice(insertionIndex, 0, input.questionId);
  return nextBlocks;
}

function replaceQuestionInsideBlocks(input: {
  blocks: ExamDocumentQuestionBlock[] | undefined;
  questionId: string;
  replacementQuestionId: string;
}) {
  return cloneBlocks(input.blocks)?.map((block) => ({
    ...block,
    questionIds: block.questionIds.map((questionId) =>
      questionId === input.questionId ? input.replacementQuestionId : questionId
    )
  }));
}

function deleteQuestionsInsideBlocks(input: {
  blocks: ExamDocumentQuestionBlock[] | undefined;
  deletedQuestionIds: string[];
  keepEmptyBlocks: boolean;
}) {
  const deletedQuestionIdSet = new Set(input.deletedQuestionIds);
  const nextBlocks = cloneBlocks(input.blocks)?.map((block) => ({
    ...block,
    questionIds: block.questionIds.filter((questionId) => !deletedQuestionIdSet.has(questionId))
  }));

  if (!nextBlocks) {
    return undefined;
  }

  return input.keepEmptyBlocks ? nextBlocks : nextBlocks.filter((block) => block.questionIds.length > 0);
}

function updateLectureSpacingForReplacement(input: {
  lectureSpacing: ExamLectureSpacingState;
  questionIds: string[];
  removedQuestionIds?: string[];
}) {
  const removedQuestionIdSet = new Set(input.removedQuestionIds ?? []);

  return normalizeLectureSpacing({
    questionIds: input.questionIds,
    lectureSpacing: {
      defaultGap: input.lectureSpacing.defaultGap,
      perQuestionGapOverrides: Object.fromEntries(
        Object.entries(input.lectureSpacing.perQuestionGapOverrides).filter(
          ([questionId]) => !removedQuestionIdSet.has(questionId)
        )
      )
    }
  });
}

function applySnapshotWithHistory(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
  nextSnapshot: ExamDocumentEditSnapshot;
}) {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds) {
    return input.documents;
  }

  const currentSnapshot = buildCurrentSnapshot(groupKinds);
  const editorState = buildNextEditorState({
    paper: groupKinds.paper,
    currentSnapshot,
    nextSnapshot: input.nextSnapshot
  });

  return applySnapshotToGroup({
    documents: input.documents,
    documentId: input.documentId,
    snapshot: input.nextSnapshot,
    editorState
  });
}

export function applyExamPaperQuestionMove(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
  questionId: string;
  targetQuestionId?: string;
  targetBlockKey?: string;
  position: "before" | "after";
  questions: QuestionAnswerMeta[];
}) {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds) {
    return input.documents;
  }

  const currentSnapshot = buildCurrentSnapshot(groupKinds);
  const nextQuestionIds = input.targetQuestionId
    ? reorderLinearQuestionIds({
        questionIds: currentSnapshot.questionIds,
        questionId: input.questionId,
        targetQuestionId: input.targetQuestionId,
        position: input.position
      })
    : currentSnapshot.questionIds;
  const nextQuestionBlocks = currentSnapshot.questionBlocks?.length
    ? moveQuestionAcrossBlocks({
        blocks: currentSnapshot.questionBlocks,
        questionId: input.questionId,
        targetQuestionId: input.targetQuestionId,
        targetBlockKey: input.targetBlockKey,
        position: input.position
      })
    : undefined;

  return applySnapshotWithHistory({
    documents: input.documents,
    documentId: input.documentId,
    nextSnapshot: {
      ...currentSnapshot,
      questionIds: nextQuestionBlocks?.length ? flattenBlocks(nextQuestionBlocks) : nextQuestionIds,
      questionBlocks: nextQuestionBlocks
    }
  });
}

export function applyExamPaperDeletion(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
  deletedQuestionIds: string[];
  keepEmptyBlocks: boolean;
  questions: QuestionAnswerMeta[];
}) {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds) {
    return input.documents;
  }

  const currentSnapshot = buildCurrentSnapshot(groupKinds);
  const deletedQuestionIdSet = new Set(input.deletedQuestionIds);
  const nextQuestionBlocks = deleteQuestionsInsideBlocks({
    blocks: currentSnapshot.questionBlocks,
    deletedQuestionIds: input.deletedQuestionIds,
    keepEmptyBlocks: input.keepEmptyBlocks
  });
  const nextQuestionIds = nextQuestionBlocks
    ? flattenBlocks(nextQuestionBlocks)
    : currentSnapshot.questionIds.filter((questionId) => !deletedQuestionIdSet.has(questionId));
  const nextLectureSpacing = updateLectureSpacingForReplacement({
    lectureSpacing: currentSnapshot.lectureSpacing,
    questionIds: nextQuestionIds,
    removedQuestionIds: input.deletedQuestionIds
  });

  return applySnapshotWithHistory({
    documents: input.documents,
    documentId: input.documentId,
    nextSnapshot: {
      questionIds: nextQuestionIds,
      questionBlocks: nextQuestionBlocks,
      numberingMode: "resequence",
      answerPlaceholder: buildAnswerPlaceholder({
        questionIds: nextQuestionIds,
        questions: input.questions
      }),
      lectureSpacing: nextLectureSpacing
    }
  });
}

export function applyExamPaperQuestionReplacement(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
  questionId: string;
  replacementQuestionId: string;
  questions: QuestionAnswerMeta[];
}) {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds) {
    return input.documents;
  }

  const currentSnapshot = buildCurrentSnapshot(groupKinds);
  const nextQuestionIds = currentSnapshot.questionIds.map((questionId) =>
    questionId === input.questionId ? input.replacementQuestionId : questionId
  );
  const nextQuestionBlocks = replaceQuestionInsideBlocks({
    blocks: currentSnapshot.questionBlocks,
    questionId: input.questionId,
    replacementQuestionId: input.replacementQuestionId
  });
  const nextLectureSpacing = updateLectureSpacingForReplacement({
    lectureSpacing: currentSnapshot.lectureSpacing,
    questionIds: nextQuestionIds,
    removedQuestionIds: [input.questionId]
  });

  return applySnapshotWithHistory({
    documents: input.documents,
    documentId: input.documentId,
    nextSnapshot: {
      questionIds: nextQuestionIds,
      questionBlocks: nextQuestionBlocks,
      numberingMode: currentSnapshot.numberingMode,
      answerPlaceholder: buildAnswerPlaceholder({
        questionIds: nextQuestionIds,
        questions: input.questions
      }),
      lectureSpacing: nextLectureSpacing
    }
  });
}

export function applyExamPaperLectureSpacing(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
  defaultGap?: number;
  questionId?: string;
  gap?: number;
}) {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds) {
    return input.documents;
  }

  const currentSnapshot = buildCurrentSnapshot(groupKinds);
  const nextLectureSpacing = cloneLectureSpacing(currentSnapshot.lectureSpacing);

  if (input.defaultGap !== undefined) {
    nextLectureSpacing.defaultGap = Math.max(0, Math.round(input.defaultGap));
  }

  if (input.questionId && input.gap !== undefined) {
    const normalizedGap = Math.max(0, Math.round(input.gap));

    if (normalizedGap === nextLectureSpacing.defaultGap) {
      delete nextLectureSpacing.perQuestionGapOverrides[input.questionId];
    } else {
      nextLectureSpacing.perQuestionGapOverrides[input.questionId] = normalizedGap;
    }
  }

  return applySnapshotWithHistory({
    documents: input.documents,
    documentId: input.documentId,
    nextSnapshot: {
      ...currentSnapshot,
      lectureSpacing: normalizeLectureSpacing({
        questionIds: currentSnapshot.questionIds,
        lectureSpacing: nextLectureSpacing
      })
    }
  });
}

export function undoExamPaperEdit(input: {
  documents: ExamLibraryDocumentEntity[];
  documentId: string;
}) {
  const groupKinds = resolveGroupDocumentKinds({
    documents: input.documents,
    documentId: input.documentId
  });

  if (!groupKinds?.paper?.editorState?.undoStack.length) {
    return null;
  }

  const previousSnapshots = groupKinds.paper.editorState.undoStack.slice();
  const snapshot = previousSnapshots.pop();

  if (!snapshot) {
    return null;
  }

  return applySnapshotToGroup({
    documents: input.documents,
    documentId: input.documentId,
    snapshot: {
      ...snapshot,
      questionBlocks: cloneBlocks(snapshot.questionBlocks),
      lectureSpacing: cloneLectureSpacing(snapshot.lectureSpacing)
    },
    editorState: {
      undoStack: previousSnapshots
    }
  });
}

export function createDefaultLectureSpacingState(): ExamLectureSpacingState {
  return {
    defaultGap: DEFAULT_LECTURE_GAP,
    perQuestionGapOverrides: {}
  };
}
