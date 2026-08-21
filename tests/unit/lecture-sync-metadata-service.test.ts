import { describe, expect, it } from "vitest";

import {
  buildPrimaryLectureSyncMetadata,
  planPrimaryLectureSyncUpdate
} from "@/lib/services/lecture-sync-metadata-service";

const baseMetadata = {
  version: 1 as const,
  sourceDocumentId: "lecture-primary-1",
  generatedAt: "2026-06-03T10:00:00.000Z",
  questionIds: ["q-1", "q-2", "q-3", "q-4"],
  blocks: [
    {
      blockId: "block-a",
      questionIds: ["q-1", "q-2"],
      exportOrder: 0,
      pageRange: {
        start: 1,
        end: 1
      },
      anchorBBox: {
        page: 1,
        x: 100,
        y: 120,
        width: 720,
        height: 180
      }
    },
    {
      blockId: "block-b",
      questionIds: ["q-3", "q-4"],
      exportOrder: 1,
      pageRange: {
        start: 2,
        end: 2
      },
      anchorBBox: {
        page: 2,
        x: 110,
        y: 140,
        width: 700,
        height: 200
      }
    }
  ]
};

describe("lecture-sync-metadata-service", () => {
  it("builds one deterministic primary-lecture sync metadata snapshot from current question blocks", () => {
    expect(
      buildPrimaryLectureSyncMetadata({
        sourceDocumentId: "lecture-primary-1",
        generatedAt: "2026-06-03T10:00:00.000Z",
        questionIds: ["q-1", "q-2", "q-3"],
        questionBlocks: [
          {
            key: "力学",
            label: "力学",
            questionIds: ["q-1", "q-2"]
          },
          {
            key: "电学",
            label: "电学",
            questionIds: ["q-3"]
          }
        ]
      })
    ).toEqual({
      version: 1,
      sourceDocumentId: "lecture-primary-1",
      generatedAt: "2026-06-03T10:00:00.000Z",
      questionIds: ["q-1", "q-2", "q-3"],
      blocks: [
        {
          blockId: "力学",
          questionIds: ["q-1", "q-2"],
          exportOrder: 0,
          pageRange: {
            start: 1,
            end: 1
          },
          anchorBBox: {
            page: 1,
            x: 40,
            y: 40,
            width: 515,
            height: 160
          }
        },
        {
          blockId: "电学",
          questionIds: ["q-3"],
          exportOrder: 1,
          pageRange: {
            start: 2,
            end: 2
          },
          anchorBBox: {
            page: 2,
            x: 40,
            y: 40,
            width: 515,
            height: 120
          }
        }
      ]
    });
  });

  it("returns one matched plan when the next block structure is unchanged", () => {
    expect(
      planPrimaryLectureSyncUpdate({
        currentMetadata: baseMetadata,
        nextBlocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-2"]
          },
          {
            blockId: "block-b",
            questionIds: ["q-3", "q-4"]
          }
        ]
      })
    ).toEqual({
      status: "matched",
      conflictReason: null,
      preservedBlockIds: ["block-a", "block-b"],
      addedBlocks: [],
      removedBlockIds: []
    });
  });

  it("returns one delta plan when one whole block is added between preserved blocks", () => {
    expect(
      planPrimaryLectureSyncUpdate({
        currentMetadata: baseMetadata,
        nextBlocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-2"]
          },
          {
            blockId: "block-c",
            questionIds: ["q-5"]
          },
          {
            blockId: "block-b",
            questionIds: ["q-3", "q-4"]
          }
        ]
      })
    ).toEqual({
      status: "delta",
      conflictReason: null,
      preservedBlockIds: ["block-a", "block-b"],
      addedBlocks: [
        {
          blockId: "block-c",
          questionIds: ["q-5"],
          insertAfterBlockId: "block-a",
          insertBeforeBlockId: "block-b"
        }
      ],
      removedBlockIds: []
    });
  });

  it("returns one delta plan when one whole block is removed", () => {
    expect(
      planPrimaryLectureSyncUpdate({
        currentMetadata: baseMetadata,
        nextBlocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-2"]
          }
        ]
      })
    ).toEqual({
      status: "delta",
      conflictReason: null,
      preservedBlockIds: ["block-a"],
      addedBlocks: [],
      removedBlockIds: ["block-b"]
    });
  });

  it("returns one conflict plan when an existing block changes its internal question ids", () => {
    expect(
      planPrimaryLectureSyncUpdate({
        currentMetadata: baseMetadata,
        nextBlocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-5"]
          },
          {
            blockId: "block-b",
            questionIds: ["q-3", "q-4"]
          }
        ]
      })
    ).toEqual({
      status: "conflict",
      conflictReason: "existing_block_changed",
      preservedBlockIds: [],
      addedBlocks: [],
      removedBlockIds: []
    });
  });

  it("returns one conflict plan when preserved blocks are reordered", () => {
    expect(
      planPrimaryLectureSyncUpdate({
        currentMetadata: baseMetadata,
        nextBlocks: [
          {
            blockId: "block-b",
            questionIds: ["q-3", "q-4"]
          },
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-2"]
          }
        ]
      })
    ).toEqual({
      status: "conflict",
      conflictReason: "preserved_blocks_reordered",
      preservedBlockIds: [],
      addedBlocks: [],
      removedBlockIds: []
    });
  });
});
