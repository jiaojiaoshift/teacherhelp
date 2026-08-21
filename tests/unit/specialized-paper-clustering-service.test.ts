import { describe, expect, it } from "vitest";

import {
  buildInitialSpecializedQuestionBlocks,
  reconcileSpecializedQuestionBlocks
} from "@/lib/services/specialized-paper-clustering-service";

describe("specialized-paper-clustering-service", () => {
  it("groups questions by primary knowledge tag and sorts one block from easy to hard", () => {
    const result = buildInitialSpecializedQuestionBlocks([
      {
        id: "q-2",
        globalOrder: 2,
        questionType: "证明题",
        chapterTag: "力学",
        knowledgeTags: ["牛顿定律"]
      },
      {
        id: "q-1",
        globalOrder: 1,
        questionType: "选择题",
        chapterTag: "力学",
        knowledgeTags: ["牛顿定律"]
      },
      {
        id: "q-3",
        globalOrder: 3,
        questionType: "填空题",
        chapterTag: "电学",
        knowledgeTags: ["欧姆定律"]
      }
    ]);

    expect(result.blocks).toEqual([
      {
        key: "牛顿定律".toLowerCase(),
        label: "牛顿定律",
        questionIds: ["q-1", "q-2"]
      },
      {
        key: "欧姆定律".toLowerCase(),
        label: "欧姆定律",
        questionIds: ["q-3"]
      }
    ]);
    expect(result.orderedQuestionIds).toEqual(["q-1", "q-2", "q-3"]);
  });

  it("inserts a same-tag new question into the existing stable block without reordering blocks", () => {
    const result = reconcileSpecializedQuestionBlocks({
      currentQuestionIds: ["q-1", "q-2", "q-4"],
      currentBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1", "q-2"]
        },
        {
          key: "欧姆定律".toLowerCase(),
          label: "欧姆定律",
          questionIds: ["q-4"]
        }
      ],
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionType: "选择题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionType: "证明题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-3",
          globalOrder: 3,
          questionType: "简答题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-4",
          globalOrder: 4,
          questionType: "填空题",
          chapterTag: "电学",
          knowledgeTags: ["欧姆定律"]
        }
      ]
    });

    expect(result.blocks).toEqual([
      {
        key: "牛顿定律".toLowerCase(),
        label: "牛顿定律",
        questionIds: ["q-1", "q-3", "q-2"]
      },
      {
        key: "欧姆定律".toLowerCase(),
        label: "欧姆定律",
        questionIds: ["q-4"]
      }
    ]);
    expect(result.manualPlacementQuestionIds).toEqual([]);
  });

  it("keeps stable blocks unchanged and routes low-confidence questions to manual placement", () => {
    const result = reconcileSpecializedQuestionBlocks({
      currentQuestionIds: ["q-1"],
      currentBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1"]
        }
      ],
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionType: "选择题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionType: "选择题",
          chapterTag: "光学",
          knowledgeTags: ["凸透镜成像"]
        }
      ]
    });

    expect(result.blocks).toEqual([
      {
        key: "牛顿定律".toLowerCase(),
        label: "牛顿定律",
        questionIds: ["q-1"]
      }
    ]);
    expect(result.orderedQuestionIds).toEqual(["q-1"]);
    expect(result.manualPlacementQuestionIds).toEqual(["q-2"]);
  });

  it("preserves one explicitly empty block after manual editing so later sync can still target it", () => {
    const result = reconcileSpecializedQuestionBlocks({
      currentQuestionIds: ["q-1"],
      currentBlocks: [
        {
          key: "mechanics",
          label: "Mechanics",
          questionIds: ["q-1"]
        },
        {
          key: "optics",
          label: "Optics",
          questionIds: []
        }
      ],
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionType: null,
          chapterTag: "Mechanics",
          knowledgeTags: ["Mechanics"]
        }
      ]
    });

    expect(result.blocks).toEqual([
      {
        key: "mechanics",
        label: "Mechanics",
        questionIds: ["q-1"]
      },
      {
        key: "optics",
        label: "Optics",
        questionIds: []
      }
    ]);
  });

  it("inserts one same-tag new question back into the preserved empty block", () => {
    const result = reconcileSpecializedQuestionBlocks({
      currentQuestionIds: ["q-1"],
      currentBlocks: [
        {
          key: "mechanics",
          label: "Mechanics",
          questionIds: ["q-1"]
        },
        {
          key: "optics",
          label: "Optics",
          questionIds: []
        }
      ],
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionType: null,
          chapterTag: "Mechanics",
          knowledgeTags: ["Mechanics"]
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionType: null,
          chapterTag: "Optics",
          knowledgeTags: ["Optics"]
        }
      ]
    });

    expect(result.blocks).toEqual([
      {
        key: "mechanics",
        label: "Mechanics",
        questionIds: ["q-1"]
      },
      {
        key: "optics",
        label: "Optics",
        questionIds: ["q-2"]
      }
    ]);
    expect(result.manualPlacementQuestionIds).toEqual([]);
  });
});
