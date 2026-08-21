import type {
  ExamDocumentQuestionBlock,
  ExamLectureSyncMetadata,
  ExamLectureSyncMetadataBlock
} from "@/lib/domain/entities";

export interface PrimaryLectureSyncNextBlock {
  blockId: string;
  questionIds: string[];
}

export interface PrimaryLectureSyncAddedBlock extends PrimaryLectureSyncNextBlock {
  insertAfterBlockId: string | null;
  insertBeforeBlockId: string | null;
}

export interface PrimaryLectureSyncPlan {
  status: "matched" | "delta" | "conflict";
  conflictReason: "existing_block_changed" | "preserved_blocks_reordered" | null;
  preservedBlockIds: string[];
  addedBlocks: PrimaryLectureSyncAddedBlock[];
  removedBlockIds: string[];
}

function buildMetadataBlocks(input: {
  questionIds: string[];
  questionBlocks?: ExamDocumentQuestionBlock[];
}) {
  const blocks =
    input.questionBlocks?.length
      ? input.questionBlocks.map((block) => ({
          blockId: block.key,
          questionIds: block.questionIds
        }))
      : input.questionIds.map((questionId) => ({
          blockId: questionId,
          questionIds: [questionId]
        }));

  return blocks.map<ExamLectureSyncMetadataBlock>((block, index) => ({
    blockId: block.blockId,
    questionIds: block.questionIds,
    exportOrder: index,
    pageRange: {
      start: index + 1,
      end: index + 1
    },
    anchorBBox: {
      page: index + 1,
      x: 40,
      y: 40,
      width: 515,
      height: Math.max(120, block.questionIds.length * 80)
    }
  }));
}

export function buildPrimaryLectureSyncMetadata(input: {
  sourceDocumentId: string;
  questionIds: string[];
  questionBlocks?: ExamDocumentQuestionBlock[];
  generatedAt?: string;
}): ExamLectureSyncMetadata {
  return {
    version: 1,
    sourceDocumentId: input.sourceDocumentId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    questionIds: input.questionIds,
    blocks: buildMetadataBlocks({
      questionIds: input.questionIds,
      questionBlocks: input.questionBlocks
    })
  };
}

function areQuestionIdsEqual(
  left: Pick<ExamLectureSyncMetadataBlock, "questionIds">,
  right: PrimaryLectureSyncNextBlock
) {
  return (
    left.questionIds.length === right.questionIds.length &&
    left.questionIds.every((questionId, index) => questionId === right.questionIds[index])
  );
}

function buildAddedBlocks(nextBlocks: PrimaryLectureSyncNextBlock[], preservedBlockIds: string[]) {
  const preservedBlockIdSet = new Set(preservedBlockIds);

  return nextBlocks.flatMap((block, index) => {
    if (preservedBlockIdSet.has(block.blockId)) {
      return [];
    }

    const previousPreserved = nextBlocks
      .slice(0, index)
      .reverse()
      .find((candidate) => preservedBlockIdSet.has(candidate.blockId));
    const nextPreserved = nextBlocks
      .slice(index + 1)
      .find((candidate) => preservedBlockIdSet.has(candidate.blockId));

    return [
      {
        blockId: block.blockId,
        questionIds: block.questionIds,
        insertAfterBlockId: previousPreserved?.blockId ?? null,
        insertBeforeBlockId: nextPreserved?.blockId ?? null
      }
    ];
  });
}

export function planPrimaryLectureSyncUpdate(input: {
  currentMetadata: ExamLectureSyncMetadata;
  nextBlocks: PrimaryLectureSyncNextBlock[];
}): PrimaryLectureSyncPlan {
  const currentBlocks = input.currentMetadata.blocks;
  const currentBlockById = new Map(currentBlocks.map((block) => [block.blockId, block]));
  const currentBlockIds = currentBlocks.map((block) => block.blockId);
  const nextBlockIds = input.nextBlocks.map((block) => block.blockId);
  const preservedBlockIds = nextBlockIds.filter((blockId) => currentBlockById.has(blockId));
  const reorderedCurrentPreservedBlockIds = currentBlockIds.filter((blockId) =>
    preservedBlockIds.includes(blockId)
  );

  if (
    preservedBlockIds.length !== reorderedCurrentPreservedBlockIds.length ||
    preservedBlockIds.some((blockId, index) => blockId !== reorderedCurrentPreservedBlockIds[index])
  ) {
    return {
      status: "conflict",
      conflictReason: "preserved_blocks_reordered",
      preservedBlockIds: [],
      addedBlocks: [],
      removedBlockIds: []
    };
  }

  const changedExistingBlock = input.nextBlocks.find((block) => {
    const currentBlock = currentBlockById.get(block.blockId);

    return currentBlock ? !areQuestionIdsEqual(currentBlock, block) : false;
  });

  if (changedExistingBlock) {
    return {
      status: "conflict",
      conflictReason: "existing_block_changed",
      preservedBlockIds: [],
      addedBlocks: [],
      removedBlockIds: []
    };
  }

  const addedBlocks = buildAddedBlocks(input.nextBlocks, preservedBlockIds);
  const nextBlockIdSet = new Set(nextBlockIds);
  const removedBlockIds = currentBlockIds.filter((blockId) => !nextBlockIdSet.has(blockId));

  if (addedBlocks.length === 0 && removedBlockIds.length === 0) {
    return {
      status: "matched",
      conflictReason: null,
      preservedBlockIds,
      addedBlocks: [],
      removedBlockIds: []
    };
  }

  return {
    status: "delta",
    conflictReason: null,
    preservedBlockIds,
    addedBlocks,
    removedBlockIds
  };
}
