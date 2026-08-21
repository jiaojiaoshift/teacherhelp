import { describe, expect, it } from "vitest";

import {
  assignPendingQuestionToBlock,
  createPendingBlockForQuestion,
  movePendingQuestionBlock
} from "@/lib/services/specialized-sync-draft-service";

describe("specialized-sync-draft-service", () => {
  const questions = [
    {
      id: "q-1",
      globalOrder: 1,
      questionType: "选择题" as const,
      chapterTag: "力学",
      knowledgeTags: ["牛顿定律"]
    },
    {
      id: "q-2",
      globalOrder: 2,
      questionType: "证明题" as const,
      chapterTag: "力学",
      knowledgeTags: ["牛顿定律"]
    },
    {
      id: "q-3",
      globalOrder: 3,
      questionType: "计算题" as const,
      chapterTag: "电学",
      knowledgeTags: ["电场"]
    }
  ];

  it("assigns one pending question into an existing block and removes it from manual placement", () => {
    const result = assignPendingQuestionToBlock({
      questionId: "q-2",
      blockIndex: 0,
      blocks: [
        {
          key: "newton",
          label: "牛顿定律",
          questionIds: ["q-1"]
        }
      ],
      manualPlacementQuestionIds: ["q-2"],
      questions
    });

    expect(result.blocks).toEqual([
      {
        key: "newton",
        label: "牛顿定律",
        questionIds: ["q-1", "q-2"]
      }
    ]);
    expect(result.manualPlacementQuestionIds).toEqual([]);
    expect(result.orderedQuestionIds).toEqual(["q-1", "q-2"]);
  });

  it("creates a new block for one pending question with a derived label", () => {
    const result = createPendingBlockForQuestion({
      questionId: "q-3",
      blocks: [
        {
          key: "newton",
          label: "牛顿定律",
          questionIds: ["q-1"]
        }
      ],
      manualPlacementQuestionIds: ["q-3"],
      questions
    });

    expect(result.blocks).toEqual([
      {
        key: "newton",
        label: "牛顿定律",
        questionIds: ["q-1"]
      },
      {
        key: "电场",
        label: "电场",
        questionIds: ["q-3"]
      }
    ]);
    expect(result.manualPlacementQuestionIds).toEqual([]);
    expect(result.orderedQuestionIds).toEqual(["q-1", "q-3"]);
  });

  it("moves one block up and recomputes the flattened question order", () => {
    const result = movePendingQuestionBlock({
      blocks: [
        {
          key: "newton",
          label: "牛顿定律",
          questionIds: ["q-1"]
        },
        {
          key: "electric",
          label: "电场",
          questionIds: ["q-3"]
        }
      ],
      fromIndex: 1,
      direction: "up"
    });

    expect(result.blocks.map((block) => block.label)).toEqual(["电场", "牛顿定律"]);
    expect(result.orderedQuestionIds).toEqual(["q-3", "q-1"]);
  });
});
