import type { BinaryAssetEntity, DocumentEntity, PageEntity } from "@/lib/domain/entities";
import type { SubjectScope } from "@/lib/domain/enums";

export function inferUploadKind(fileName: string): "pdf" | "image" | null {
  const lowered = fileName.toLowerCase();

  if (lowered.endsWith(".pdf")) {
    return "pdf";
  }

  if (lowered.endsWith(".png") || lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) {
    return "image";
  }

  return null;
}

export function sanitizeDocumentName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function createDocumentShell(input: {
  id: string;
  name: string;
  kind: "pdf" | "image";
  subjectScope?: SubjectScope;
}): DocumentEntity {
  return {
    id: input.id,
    name: sanitizeDocumentName(input.name),
    kind: input.kind,
    status: "uploaded_temp",
    pageIds: [],
    subjectScope: input.subjectScope,
    answerSection: input.kind === "pdf"
      ? {
          status: "suggested",
          hasAnswerSection: true,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      : undefined
  };
}

export function derivePageRecordFromImageUpload(input: {
  documentId: string;
  pageId: string;
  width: number;
  height: number;
  displayAssetId?: string;
}): PageEntity {
  return {
    id: input.pageId,
    documentId: input.documentId,
    pageNumber: 1,
    width: input.width,
    height: input.height,
    displayAssetId: input.displayAssetId,
    analysisStatus: "idle",
    reviewStatus: "unreviewed"
  };
}

export function deriveDisplayAssetFromImageUpload(input: {
  assetId: string;
  documentId: string;
  pageId: string;
  mimeType: string;
  byteLength: number;
}): BinaryAssetEntity {
  return {
    id: input.assetId,
    documentId: input.documentId,
    pageId: input.pageId,
    kind: "display",
    mimeType: input.mimeType,
    byteLength: input.byteLength
  };
}

export function deriveSourceAssetFromUpload(input: {
  assetId: string;
  documentId: string;
  pageId: string;
  mimeType: string;
  byteLength: number;
}): BinaryAssetEntity {
  return {
    id: input.assetId,
    documentId: input.documentId,
    pageId: input.pageId,
    kind: "source",
    mimeType: input.mimeType,
    byteLength: input.byteLength
  };
}
