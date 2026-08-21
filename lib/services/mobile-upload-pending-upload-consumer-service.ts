import type {
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadTaskEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";
import type { SubjectScope } from "@/lib/domain/enums";
import {
  type PdfCanvasFactory,
  type PdfRenderBatch,
  renderPdfArrayBufferToPagePreviews
} from "@/lib/pdf/pdf-renderer";
import { prepareAiPreviewDataUrl } from "@/lib/services/ai-image-preview-service";
import { importFilesIntoWorkspace } from "@/lib/services/workspace-import-service";
import {
  DEFAULT_PDF_RENDER_BATCH_SIZE,
  selectRepresentativePageNumbers
} from "@/lib/services/upload-capacity";
import { dataUrlToBlob, readBlobAsDataUrl } from "@/lib/utils/blob-data-url";

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function decodeBase64ToUint8Array(base64Data: string) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function resolvePendingUploadFile(input: {
  pendingUpload: {
    normalizedFileName: string;
    mimeType: "application/pdf";
    base64Data?: string;
    fileUrl?: string;
  };
  fetchImpl: typeof fetch;
  file?: File;
}) {
  if (input.file) {
    return input.file;
  }

  if (input.pendingUpload.base64Data) {
    const bytes = decodeBase64ToUint8Array(input.pendingUpload.base64Data);
    return new File([bytes], input.pendingUpload.normalizedFileName, {
      type: input.pendingUpload.mimeType
    });
  }

  if (input.pendingUpload.fileUrl) {
    const response = await input.fetchImpl(input.pendingUpload.fileUrl);

    if (!response.ok) {
      throw new Error("移动上传临时文件读取失败");
    }

    return new File([await response.blob()], input.pendingUpload.normalizedFileName, {
      type: input.pendingUpload.mimeType
    });
  }

  throw new Error("移动上传文件内容不可用");
}

function resolveQuestionFolderSubjectScope(input: {
  questionFolders: FolderEntity[];
  targetNodeId: string;
}) {
  return (
    input.questionFolders.find((folder) => folder.id === input.targetNodeId)?.subjectScope ?? null
  );
}

async function readPreviewBlobAsDataUrl(
  blob: Blob,
  preparePreviewBlob?: (blob: Blob) => Promise<Blob>
) {
  if (preparePreviewBlob) {
    const preparedBlob = await preparePreviewBlob(blob);
    return await readBlobAsDataUrl(preparedBlob);
  }

  const dataUrl = await readBlobAsDataUrl(blob);

  try {
    return await prepareAiPreviewDataUrl(dataUrl);
  } catch {
    return dataUrl;
  }
}

async function buildPendingUploadedFullPaperDraft(input: {
  file: File;
  targetFolder: ExamLibraryFolderEntity;
  fetchImpl: typeof fetch;
  createId?: (prefix: string) => string;
  pdfCanvasFactory?: PdfCanvasFactory;
  preparePreviewBlob?: (blob: Blob) => Promise<Blob>;
}) {
  const nextCreateId = input.createId ?? createId;
  let sourceFileBuffer = await input.file.arrayBuffer();
  const renderedPageMetas = new Map<
    number,
    {
      pageNumber: number;
      width: number;
      height: number;
      byteLength: number;
      textLines?: PdfRenderBatch["pages"][number]["textLines"];
    }
  >();
  const pagePreviewAssetsByNumber = new Map<number, {
    id: string;
    documentId: string;
    pageId: string;
    kind: "display";
    mimeType: string;
    byteLength: number;
    dataUrl: string;
  }>();
  const answerSampleDataUrlsByNumber = new Map<number, string>();

  const processRenderedPages = async (
    renderedPages: PdfRenderBatch["pages"],
    pageCount: number
  ) => {
    const samplePageNumbers = new Set(selectRepresentativePageNumbers(pageCount));

    for (const renderedPage of renderedPages) {
      let dataUrl: string;
      let previewBlob: Blob | null = null;

      if (input.preparePreviewBlob && renderedPage.blob.size > 300_000) {
        const boundedBlob = await input.preparePreviewBlob(renderedPage.blob);

        if (boundedBlob !== renderedPage.blob || boundedBlob.size < renderedPage.blob.size) {
          previewBlob = boundedBlob;
          dataUrl = await readBlobAsDataUrl(boundedBlob);
        } else {
          dataUrl = await readPreviewBlobAsDataUrl(
            renderedPage.blob,
            input.preparePreviewBlob
          );
          previewBlob = dataUrlToBlob(dataUrl);
        }
      } else {
        dataUrl = await readPreviewBlobAsDataUrl(
          renderedPage.blob,
          input.preparePreviewBlob
        );
        previewBlob = dataUrlToBlob(dataUrl);
      }
      renderedPageMetas.set(renderedPage.pageNumber, {
        pageNumber: renderedPage.pageNumber,
        width: renderedPage.width,
        height: renderedPage.height,
        byteLength: renderedPage.blob.size,
        textLines: renderedPage.textLines
      });
      pagePreviewAssetsByNumber.set(renderedPage.pageNumber, {
        id: nextCreateId("asset-page-preview"),
        documentId: "",
        pageId: `uploaded-page-${renderedPage.pageNumber}`,
        kind: "display",
        mimeType: previewBlob?.type || renderedPage.blob.type || "image/png",
        byteLength: previewBlob?.size ?? (renderedPage.blob.size || dataUrl.length),
        dataUrl
      });

      if (samplePageNumbers.has(renderedPage.pageNumber)) {
        answerSampleDataUrlsByNumber.set(renderedPage.pageNumber, dataUrl);
      }
    }
  };

  const renderedResult = await renderPdfArrayBufferToPagePreviews(sourceFileBuffer, {
    createCanvas: input.pdfCanvasFactory,
    batchSize: DEFAULT_PDF_RENDER_BATCH_SIZE,
    onBatch: async ({ pages, pageCount }) => {
      await processRenderedPages(pages, pageCount);
    }
  });
  sourceFileBuffer = new ArrayBuffer(0);

  // Test adapters and older renderers may return pages without invoking onBatch.
  if (renderedResult.length > 0) {
    await processRenderedPages(renderedResult, renderedResult.length);
  }

  const renderedPages = Array.from(renderedPageMetas.values()).sort(
    (left, right) => left.pageNumber - right.pageNumber
  );
  const pageImageDataUrls = Array.from(answerSampleDataUrlsByNumber.entries())
    .sort(([left], [right]) => left - right)
    .map(([, dataUrl]) => dataUrl);
  const sampledPageNumbers = Array.from(answerSampleDataUrlsByNumber.keys()).sort(
    (left, right) => left - right
  );
  const answerSectionResponse = await input.fetchImpl("/api/ai/suggest-answer-section", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId: null,
      pageCount: renderedPages.length,
      pageImageDataUrls,
      sampledPageNumbers
    })
  });
  const answerSectionPayload = answerSectionResponse.ok
    ? ((await answerSectionResponse.json()) as {
        answerSection?: {
          hasAnswerSection?: boolean;
          suggestedSplitPage?: number;
        };
      })
    : null;
  const documentId = nextCreateId("exam-doc");
  const sourceAssetId = nextCreateId("asset-source");
  const sourceAsset = {
    id: sourceAssetId,
    documentId,
    pageId: documentId,
    kind: "source" as const,
    mimeType: input.file.type || "application/pdf",
    byteLength: input.file.size,
    blob: input.file
  };
  const pagePreviewAssets = renderedPages.map((renderedPage) => {
    const asset = pagePreviewAssetsByNumber.get(renderedPage.pageNumber);

    if (!asset) {
      throw new Error(`Failed to prepare preview for PDF page ${renderedPage.pageNumber}`);
    }

    return {
      ...asset,
      documentId
    };
  });

  return {
    sourceAsset,
    pagePreviewAssets,
    pendingDraft: {
      id: documentId,
      folderId: input.targetFolder.id,
      fileName: input.file.name,
      sourceAssetId,
      sourceDocumentId: documentId,
      pageCount: renderedPages.length,
      answerSection: {
        status: "suggested" as const,
        hasAnswerSection: answerSectionPayload?.answerSection?.hasAnswerSection ?? true,
        suggestedSplitPage:
          answerSectionPayload?.answerSection?.suggestedSplitPage ?? renderedPages.length,
        confirmedSplitPage: null
      },
      uploadedPdfPages: renderedPages.map((page, index) => ({
        pageId: `uploaded-page-${index + 1}`,
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      reviewStatus: "unreviewed" as const,
      previewAssetId: pagePreviewAssets[index].id,
      ...(page.textLines?.length ? { textLines: page.textLines } : {})
      }))
    } satisfies UploadedFullPaperDraftEntity
  };
}

export async function consumeMobileUploadHelperPendingUpload(input: {
  pendingUpload: {
    taskId?: string;
    deviceId?: string;
    uploadKind: "question_bank_pdf" | "full_paper_pdf";
    targetNodeId: string;
    targetNodePath?: string[];
    originalFileName?: string;
    normalizedFileName: string;
    mimeType: "application/pdf";
    createdAt?: string;
    base64Data?: string;
    fileUrl?: string;
  };
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  pendingUploadedFullPaperDraft: UploadedFullPaperDraftEntity | null;
  fileStore: Parameters<typeof importFilesIntoWorkspace>[0]["fileStore"];
  questionStore: Parameters<typeof importFilesIntoWorkspace>[0]["questionStore"];
  examStore: {
    setPendingUploadedFullPaperDraft: (draft: UploadedFullPaperDraftEntity | null) => void;
    setExamWorkspaceDraft: (draft: {
      selectedLibrary?: "specialized" | "full";
      selectedFolderId?: string | null;
      selectedDocumentId?: string | null;
    }) => void;
    upsertMobileUploadTask?: (task: MobileUploadTaskEntity) => void;
  };
  fetchImpl?: typeof fetch;
  file?: File;
  createId?: (prefix: string) => string;
  pdfCanvasFactory?: PdfCanvasFactory;
  renderPdf?: Parameters<typeof importFilesIntoWorkspace>[0]["renderPdf"];
  preparePreviewBlob?: (blob: Blob) => Promise<Blob>;
}): Promise<
  | { status: "consumed"; nextTaskStatus: "completed" | "processing" }
  | { status: "blocked" }
  | { status: "failed"; errorMessage: string }
> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const file = await resolvePendingUploadFile({
    pendingUpload: input.pendingUpload,
    fetchImpl,
    file: input.file
  });
  const renderPdf =
    input.renderPdf ??
    (async (sourceFile, options) =>
      renderPdfArrayBufferToPagePreviews(await sourceFile.arrayBuffer(), options));

  if (input.pendingUpload.uploadKind === "question_bank_pdf") {
    const subjectScope = resolveQuestionFolderSubjectScope({
      questionFolders: input.questionFolders,
      targetNodeId: input.pendingUpload.targetNodeId
    });

    if (!subjectScope) {
      return {
        status: "failed",
        errorMessage: "题库上传目标目录缺少学科范围"
      };
    }

    const result = await importFilesIntoWorkspace({
      files: [file],
      subjectScope: subjectScope as SubjectScope,
      fileStore: input.fileStore,
      questionStore: input.questionStore,
      fetchImpl,
      pdfCanvasFactory: input.pdfCanvasFactory,
      renderPdf,
      preparePreviewBlob: input.preparePreviewBlob
    });

    if (result.importedDocumentIds.length === 0) {
      return {
        status: "failed",
        errorMessage: "题库 PDF 导入失败"
      };
    }

    return {
      status: "consumed",
      nextTaskStatus: "completed"
    };
  }

  if (input.pendingUploadedFullPaperDraft) {
    return {
      status: "blocked"
    };
  }

  const targetFolder =
    input.examLibraryFolders.find((folder) => folder.id === input.pendingUpload.targetNodeId) ??
    null;

  if (!targetFolder || targetFolder.library !== "full" || targetFolder.role === "lecture_archive") {
    return {
      status: "failed",
      errorMessage: "套卷上传目标目录无效"
    };
  }

  const fullPaperDraft = await buildPendingUploadedFullPaperDraft({
    file,
    targetFolder,
    fetchImpl,
    createId: input.createId,
    pdfCanvasFactory: input.pdfCanvasFactory,
    preparePreviewBlob: input.preparePreviewBlob
  });

  input.questionStore.appendBinaryAssets([
    fullPaperDraft.sourceAsset,
    ...fullPaperDraft.pagePreviewAssets
  ]);
  const nextPendingDraft = input.pendingUpload.taskId
    ? {
        ...fullPaperDraft.pendingDraft,
        sourceUploadTaskId: input.pendingUpload.taskId
      }
    : fullPaperDraft.pendingDraft;
  input.examStore.setPendingUploadedFullPaperDraft(nextPendingDraft);
  input.examStore.setExamWorkspaceDraft({
    selectedLibrary: "full",
    selectedFolderId: targetFolder.id,
    selectedDocumentId: null
  });
  if (input.pendingUpload.taskId && input.examStore.upsertMobileUploadTask) {
    input.examStore.upsertMobileUploadTask({
      id: input.pendingUpload.taskId,
      deviceId: input.pendingUpload.deviceId ?? "pc-helper",
      uploadKind: "full_paper_pdf",
      targetNodeId: targetFolder.id,
      targetNodePath: targetFolder.path,
      originalFileName: input.pendingUpload.originalFileName ?? input.pendingUpload.normalizedFileName,
      normalizedFileName: input.pendingUpload.normalizedFileName,
      mimeType: "application/pdf",
      status: "processing",
      createdAt: input.pendingUpload.createdAt ?? new Date().toISOString(),
      errorMessage: null
    });
  }

  return {
    status: "consumed",
    nextTaskStatus: "processing"
  };
}
