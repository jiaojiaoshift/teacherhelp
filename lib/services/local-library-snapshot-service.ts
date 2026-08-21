import type {
  BinaryAssetEntity,
  ExamDocumentEditSnapshot,
  ExamDocumentQuestionBlock,
  ExamLibraryDocumentEntity,
  ExamLectureSyncMetadata,
  PageEntity
} from "@/lib/domain/entities";
import type { WorkspaceSnapshot } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";

function parseDataUrlMimeType(dataUrl: string): string {
  return /^data:([^;,]+)[;,]/.exec(dataUrl)?.[1] || "image/png";
}

function estimateDataUrlByteLength(dataUrl: string): number {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

function filterQuestionIds(questionIds: string[] | undefined, retainedIds: Set<string>) {
  return questionIds?.filter((questionId) => retainedIds.has(questionId));
}

function filterQuestionBlocks(
  blocks: ExamDocumentQuestionBlock[] | undefined,
  retainedIds: Set<string>
) {
  return blocks
    ?.map((block) => ({
      ...block,
      questionIds: filterQuestionIds(block.questionIds, retainedIds) ?? []
    }))
    .filter((block) => block.questionIds.length > 0);
}

function filterEditSnapshot(
  snapshot: ExamDocumentEditSnapshot,
  retainedIds: Set<string>
): ExamDocumentEditSnapshot {
  return {
    ...snapshot,
    questionIds: filterQuestionIds(snapshot.questionIds, retainedIds) ?? [],
    questionBlocks: filterQuestionBlocks(snapshot.questionBlocks, retainedIds)
  };
}

function filterSyncMetadata(
  metadata: ExamLectureSyncMetadata | null | undefined,
  retainedIds: Set<string>
) {
  if (!metadata) {
    return metadata;
  }

  return {
    ...metadata,
    questionIds: filterQuestionIds(metadata.questionIds, retainedIds) ?? [],
    blocks: metadata.blocks
      .map((block) => ({
        ...block,
        questionIds: filterQuestionIds(block.questionIds, retainedIds) ?? []
      }))
      .filter((block) => block.questionIds.length > 0)
  };
}

function normalizeExamDocument(
  document: ExamLibraryDocumentEntity,
  retainedQuestionIds: Set<string>,
  availableAssetIds: Set<string>
): ExamLibraryDocumentEntity {
  const uploadedPdfPages = document.uploadedPdfPages?.filter((page) =>
    availableAssetIds.has(page.previewAssetId)
  );

  return {
    ...document,
    questionIds: filterQuestionIds(document.questionIds, retainedQuestionIds) ?? [],
    questionBlocks: filterQuestionBlocks(document.questionBlocks, retainedQuestionIds),
    pendingQuestionIds: filterQuestionIds(document.pendingQuestionIds, retainedQuestionIds),
    pendingQuestionBlocks: filterQuestionBlocks(
      document.pendingQuestionBlocks,
      retainedQuestionIds
    ),
    pendingManualPlacementQuestionIds: filterQuestionIds(
      document.pendingManualPlacementQuestionIds,
      retainedQuestionIds
    ),
    rawPageAssetIds: document.rawPageAssetIds.filter((assetId) =>
      availableAssetIds.has(assetId)
    ),
    pendingRawPageAssetIds: document.pendingRawPageAssetIds?.filter((assetId) =>
      availableAssetIds.has(assetId)
    ),
    uploadedPdfPages,
    editorState: document.editorState
      ? {
          ...document.editorState,
          undoStack: document.editorState.undoStack.map((snapshot) =>
            filterEditSnapshot(snapshot, retainedQuestionIds)
          )
        }
      : undefined,
    syncMetadata: filterSyncMetadata(document.syncMetadata, retainedQuestionIds),
    lastExportedSyncMetadata: filterSyncMetadata(
      document.lastExportedSyncMetadata,
      retainedQuestionIds
    )
  };
}

function buildDisplayAsset(input: {
  page: PageEntity;
  currentAsset: BinaryAssetEntity | undefined;
  previewDataUrl: string;
}): BinaryAssetEntity {
  const assetId = input.currentAsset?.id ?? input.page.displayAssetId ?? `asset-display-${input.page.id}`;

  return {
    id: assetId,
    documentId: input.page.documentId,
    pageId: input.page.id,
    kind: "display",
    mimeType: parseDataUrlMimeType(input.previewDataUrl),
    byteLength: estimateDataUrlByteLength(input.previewDataUrl),
    ...(input.currentAsset?.blob ? { blob: input.currentAsset.blob } : {}),
    dataUrl: input.previewDataUrl
  };
}

export function buildLocalLibrarySnapshot(input: {
  workspaceSnapshot: WorkspaceSnapshot;
  pagePreviewDataUrls: Record<string, string>;
}): LocalLibrarySnapshot {
  const retainedQuestionIds = new Set(
    input.workspaceSnapshot.questionDrafts.map((question) => question.id)
  );
  const pageById = new Map(input.workspaceSnapshot.pages.map((page) => [page.id, page]));
  const assetById = new Map(
    input.workspaceSnapshot.binaryAssets.map((asset) => [asset.id, asset])
  );
  const displayAssetByPageId = new Map(
    input.workspaceSnapshot.binaryAssets
      .filter((asset) => asset.kind === "display")
      .map((asset) => [asset.pageId, asset])
  );
  const retainedPageIds = new Set<string>();
  const retainedAssetIds = new Set<string>();

  for (const question of input.workspaceSnapshot.questionDrafts) {
    for (const pageId of new Set(question.pageIds.concat(question.primaryPageId))) {
      if (!pageById.has(pageId)) {
        throw new Error(`Question ${question.id} references unavailable page ${pageId}`);
      }
      retainedPageIds.add(pageId);
    }

    for (const attachment of question.answerAttachments ?? []) {
      if (!assetById.has(attachment.assetId)) {
        throw new Error(
          `Question ${question.id} references unavailable answer asset ${attachment.assetId}`
        );
      }
      retainedAssetIds.add(attachment.assetId);
    }

    for (const attachment of question.questionImageAttachments ?? []) {
      if (!assetById.has(attachment.assetId)) {
        throw new Error(
          `Question ${question.id} references unavailable question image asset ${attachment.assetId}`
        );
      }
      retainedAssetIds.add(attachment.assetId);
    }
  }

  const retainedPages = Array.from(retainedPageIds, (pageId) => pageById.get(pageId)!).map(
    (page) => {
      const currentDisplayAsset =
        (page.displayAssetId ? assetById.get(page.displayAssetId) : undefined) ??
        displayAssetByPageId.get(page.id);
      const previewDataUrl = input.pagePreviewDataUrls[page.id];
      const displayAsset = previewDataUrl
        ? buildDisplayAsset({ page, currentAsset: currentDisplayAsset, previewDataUrl })
        : currentDisplayAsset;

      if (!displayAsset) {
        return page;
      }

      assetById.set(displayAsset.id, displayAsset);
      retainedAssetIds.add(displayAsset.id);

      return page.displayAssetId === displayAsset.id
        ? page
        : { ...page, displayAssetId: displayAsset.id };
    }
  );

  for (const document of input.workspaceSnapshot.examLibraryDocuments) {
    document.rawPageAssetIds.forEach((assetId) => retainedAssetIds.add(assetId));
    document.pendingRawPageAssetIds?.forEach((assetId) => retainedAssetIds.add(assetId));
    document.uploadedPdfPages?.forEach((page) => retainedAssetIds.add(page.previewAssetId));
  }

  const binaryAssets = Array.from(retainedAssetIds, (assetId) => assetById.get(assetId)).filter(
    (asset): asset is BinaryAssetEntity => Boolean(asset)
  );
  const availableAssetIds = new Set(binaryAssets.map((asset) => asset.id));

  return {
    folders: input.workspaceSnapshot.folders,
    pages: retainedPages,
    binaryAssets,
    questionDrafts: input.workspaceSnapshot.questionDrafts,
    examLibraryFolders: input.workspaceSnapshot.examLibraryFolders,
    examLibraryDocuments: input.workspaceSnapshot.examLibraryDocuments.map((document) =>
      normalizeExamDocument(document, retainedQuestionIds, availableAssetIds)
    ),
    examWorkspaceDraft: input.workspaceSnapshot.examWorkspaceDraft
  };
}
