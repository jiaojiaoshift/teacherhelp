import { describe, expect, it } from "vitest";

import {
  applyExamPaperDeletion,
  applyExamPaperLectureSpacing,
  applyExamPaperQuestionMove,
  applyExamPaperQuestionReplacement,
  undoExamPaperEdit
} from "@/lib/services/exam-paper-editing-service";

function buildFullQuestionBankGroup() {
  return [
    {
      id: "paper-1",
      folderId: "full-root",
      library: "full" as const,
      kind: "paper" as const,
      title: "suite",
      subjectScope: null,
      groupId: "group-1",
      isDefault: false,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "custom_numeric" as const,
      questionIds: ["q-1", "q-2", "q-3"],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true,
      editorState: {
        undoStack: []
      }
    },
    {
      id: "lecture-1",
      folderId: "full-root",
      library: "full" as const,
      kind: "lecture" as const,
      title: "suite lecture",
      subjectScope: null,
      groupId: "group-1",
      isDefault: false,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "custom_numeric" as const,
      questionIds: ["q-1", "q-2", "q-3"],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      lectureSpacing: {
        defaultGap: 48,
        perQuestionGapOverrides: {
          "q-2": 84
        }
      },
      allowsQuestionMutations: true
    },
    {
      id: "answer-1",
      folderId: "full-root",
      library: "full" as const,
      kind: "answer_sheet" as const,
      title: "suite answer",
      subjectScope: null,
      groupId: "group-1",
      isDefault: false,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "custom_numeric" as const,
      questionIds: ["q-1", "q-2", "q-3"],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    }
  ];
}

function buildSpecializedGroup() {
  return [
    {
      id: "paper-specialized",
      folderId: "specialized-folder",
      library: "specialized" as const,
      kind: "paper" as const,
      title: "topic paper",
      subjectScope: null,
      groupId: "group-specialized",
      isDefault: true,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "resequence" as const,
      questionIds: ["q-1", "q-2"],
      questionBlocks: [
        {
          key: "block-a",
          label: "Mechanics",
          questionIds: ["q-1"]
        },
        {
          key: "block-b",
          label: "Optics",
          questionIds: ["q-2"]
        }
      ],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true,
      editorState: {
        undoStack: []
      }
    },
    {
      id: "lecture-specialized",
      folderId: "specialized-folder",
      library: "specialized" as const,
      kind: "lecture" as const,
      title: "topic lecture",
      subjectScope: null,
      groupId: "group-specialized",
      isDefault: true,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "resequence" as const,
      questionIds: ["q-1", "q-2"],
      questionBlocks: [
        {
          key: "block-a",
          label: "Mechanics",
          questionIds: ["q-1"]
        },
        {
          key: "block-b",
          label: "Optics",
          questionIds: ["q-2"]
        }
      ],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      lectureSpacing: {
        defaultGap: 48,
        perQuestionGapOverrides: {}
      },
      allowsQuestionMutations: true
    },
    {
      id: "answer-specialized",
      folderId: "specialized-folder",
      library: "specialized" as const,
      kind: "answer_sheet" as const,
      title: "topic answer",
      subjectScope: null,
      groupId: "group-specialized",
      isDefault: true,
      sourceMode: "question_bank" as const,
      syncBinding: "strong" as const,
      syncStatus: "idle" as const,
      numberingMode: "resequence" as const,
      questionIds: ["q-1", "q-2"],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    }
  ];
}

const questionMeta = [
  {
    id: "q-1",
    answerAttachments: []
  },
  {
    id: "q-2",
    answerAttachments: [
      {
        id: "answer-2",
        assetId: "asset-answer-2",
        kind: "matched" as const
      }
    ]
  },
  {
    id: "q-3",
    answerAttachments: [
      {
        id: "answer-3",
        assetId: "asset-answer-3",
        kind: "matched" as const
      }
    ]
  },
  {
    id: "q-4",
    answerAttachments: [
      {
        id: "answer-4",
        assetId: "asset-answer-4",
        kind: "matched" as const
      }
    ]
  }
];

describe("exam-paper-editing-service", () => {
  it("moves one full-paper question across the group and keeps lecture spacing bound to the question", () => {
    const result = applyExamPaperQuestionMove({
      documents: buildFullQuestionBankGroup(),
      documentId: "paper-1",
      questionId: "q-3",
      targetQuestionId: "q-1",
      position: "before",
      questions: questionMeta
    });

    expect(result.map((document) => document.questionIds.join(","))).toEqual([
      "q-3,q-1,q-2",
      "q-3,q-1,q-2",
      "q-3,q-1,q-2"
    ]);
    expect(result.find((document) => document.kind === "lecture")?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {
        "q-2": 84
      }
    });
    expect(result.find((document) => document.kind === "paper")?.editorState?.undoStack).toHaveLength(1);
  });

  it("deletes specialized questions, lets the caller preserve one empty block, and recomputes the answer placeholder", () => {
    const result = applyExamPaperDeletion({
      documents: buildSpecializedGroup(),
      documentId: "paper-specialized",
      deletedQuestionIds: ["q-2"],
      keepEmptyBlocks: true,
      questions: questionMeta
    });

    expect(result.find((document) => document.kind === "paper")?.questionBlocks).toEqual([
      {
        key: "block-a",
        label: "Mechanics",
        questionIds: ["q-1"]
      },
      {
        key: "block-b",
        label: "Optics",
        questionIds: []
      }
    ]);
    expect(result.find((document) => document.kind === "answer_sheet")?.placeholderAnswerPage).toBe(true);
    expect(result.find((document) => document.kind === "paper")?.editorState?.undoStack).toHaveLength(1);
  });

  it("replaces one question, resets the replacement gap to the lecture default, and keeps the group synced", () => {
    const result = applyExamPaperQuestionReplacement({
      documents: buildFullQuestionBankGroup(),
      documentId: "paper-1",
      questionId: "q-2",
      replacementQuestionId: "q-4",
      questions: questionMeta
    });

    expect(result.map((document) => document.questionIds.join(","))).toEqual([
      "q-1,q-4,q-3",
      "q-1,q-4,q-3",
      "q-1,q-4,q-3"
    ]);
    expect(result.find((document) => document.kind === "lecture")?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {}
    });
  });

  it("updates lecture spacing and lets one undo restore the previous full-paper state", () => {
    const afterSpacingChange = applyExamPaperLectureSpacing({
      documents: buildFullQuestionBankGroup(),
      documentId: "paper-1",
      questionId: "q-1",
      gap: 120
    });

    expect(afterSpacingChange.find((document) => document.kind === "lecture")?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {
        "q-1": 120,
        "q-2": 84
      }
    });

    const undone = undoExamPaperEdit({
      documents: afterSpacingChange,
      documentId: "paper-1"
    });

    expect(undone?.find((document) => document.kind === "lecture")?.lectureSpacing).toEqual({
      defaultGap: 48,
      perQuestionGapOverrides: {
        "q-2": 84
      }
    });
    expect(undone?.find((document) => document.kind === "paper")?.editorState?.undoStack).toEqual([]);
  });
});
