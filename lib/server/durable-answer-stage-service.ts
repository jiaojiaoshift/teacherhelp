import { createCanvas, loadImage } from "@napi-rs/canvas";

import type { BinaryAssetEntity, QuestionDraftEntity } from "@/lib/domain/entities";
import type { AnswerMatchDetection } from "@/lib/ai/teachhelper-codex-agent";
import { suggestAnswerMatchesWithCodex } from "@/lib/ai/teachhelper-codex-agent";
import {
  LocalLibraryFilesystemRepository,
  LocalLibraryRevisionConflictError
} from "@/lib/server/local-library-filesystem-repository";
import { createNodePdfCanvasFactory } from "@/lib/server/node-pdf-canvas-factory";
import {
  renderPdfArrayBufferToPagePreviews,
  type RenderedPdfPagePreview
} from "@/lib/pdf/pdf-renderer";
import {
  buildDurableAnswerAttachmentPlan,
  resolveDurableQuestionNumber,
  type DetectedAnswerCandidate
} from "@/lib/services/answer-match-service";
import { mapNormalizedBboxToPixels } from "@/lib/services/analysis-service";
import { buildNativeAnswerRegions } from "@/lib/services/durable-answer-layout-service";
import { readBlobAsDataUrl } from "@/lib/utils/blob-data-url";

type NormalizedBBox = DetectedAnswerCandidate["normalizedBBox"];

interface AnswerStageDependencies {
  renderPdf: (arrayBuffer: ArrayBuffer) => Promise<RenderedPdfPagePreview[]>;
  detectAnswersWithAi: (input: {
    questions: QuestionDraftEntity[];
    answerPages: Array<{
      pageId: string;
      pageNumber: number;
      imageDataUrl: string;
    }>;
  }) => Promise<AnswerMatchDetection[]>;
  cropRegion: (input: {
    page: RenderedPdfPagePreview;
    normalizedBBox: NormalizedBBox;
  }) => Promise<string>;
}

export interface DurableAnswerStageResult {
  revision: number;
  questionCount: number;
  answeredQuestionCount: number;
  attachmentCount: number;
  answerPageCount: number;
  source: "native_pdf_text" | "ai_fallback";
}

export class DurableAnswerStageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableAnswerStageValidationError";
  }
}

export class DurableAnswerStageIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableAnswerStageIncompleteError";
  }
}

function buildAnswerPageId(documentId: string, pageNumber: number) {
  return `durable-answer-page-${documentId}-${pageNumber}`;
}

function estimateDataUrlByteLength(dataUrl: string) {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

async function cropRenderedAnswerRegion(input: {
  page: RenderedPdfPagePreview;
  normalizedBBox: NormalizedBBox;
}): Promise<string> {
  const sourceBuffer = Buffer.from(await input.page.blob.arrayBuffer());
  const image = await loadImage(sourceBuffer);
  const crop = mapNormalizedBboxToPixels(input.normalizedBBox, {
    width: input.page.width,
    height: input.page.height
  });
  const width = Math.max(1, crop.width);
  const height = Math.max(1, crop.height);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.drawImage(image, crop.x, crop.y, width, height, 0, 0, width, height);

  return `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`;
}

async function renderPdfForAnswerStage(arrayBuffer: ArrayBuffer) {
  return renderPdfArrayBufferToPagePreviews(arrayBuffer, {
    createCanvas: createNodePdfCanvasFactory()
  });
}

async function detectAnswersWithAi(input: {
  questions: QuestionDraftEntity[];
  answerPages: Array<{
    pageId: string;
    pageNumber: number;
    imageDataUrl: string;
  }>;
}) {
  const questionLabels = input.questions.map(resolveDurableQuestionNumber);
  const detections: AnswerMatchDetection[] = [];

  for (const answerPage of input.answerPages) {
    detections.push(
      ...(await suggestAnswerMatchesWithCodex({
        answerPages: [answerPage],
        questionLabels
      }))
    );
  }

  return detections;
}

const defaultDependencies: AnswerStageDependencies = {
  renderPdf: renderPdfForAnswerStage,
  detectAnswersWithAi,
  cropRegion: cropRenderedAnswerRegion
};

export async function resumeDurableAnswerStage(
  input: {
    repository?: LocalLibraryFilesystemRepository;
    expectedRevision: number;
    documentId: string;
    answerStartPage: number;
    pdfArrayBuffer: ArrayBuffer;
  },
  dependencies: Partial<AnswerStageDependencies> = {}
): Promise<DurableAnswerStageResult> {
  const repository = input.repository ?? new LocalLibraryFilesystemRepository();
  const activeDependencies = { ...defaultDependencies, ...dependencies };

  if (!Number.isInteger(input.answerStartPage) || input.answerStartPage < 1) {
    throw new DurableAnswerStageValidationError("answerStartPage must be a positive integer");
  }

  const currentLibrary = await repository.load();

  if (currentLibrary.revision !== input.expectedRevision) {
    throw new LocalLibraryRevisionConflictError(currentLibrary.revision);
  }

  const questions = currentLibrary.snapshot.questionDrafts
    .filter((question) => question.documentId === input.documentId)
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder);

  if (questions.length === 0) {
    throw new DurableAnswerStageValidationError("target document has no durable questions");
  }

  const unansweredQuestions = questions.filter(
    (question) => (question.answerAttachments?.length ?? 0) === 0
  );

  if (unansweredQuestions.length === 0) {
    throw new DurableAnswerStageValidationError("target document already has answer attachments");
  }

  const expectedLabels = questions.map(resolveDurableQuestionNumber);

  if (new Set(expectedLabels).size !== expectedLabels.length) {
    throw new DurableAnswerStageValidationError("target question numbers are not unique");
  }

  const renderedPages = await activeDependencies.renderPdf(input.pdfArrayBuffer);
  const answerPages = renderedPages.filter((page) => page.pageNumber >= input.answerStartPage);

  if (answerPages.length === 0) {
    throw new DurableAnswerStageValidationError("PDF has no pages at or after answerStartPage");
  }

  const nativeLayout = buildNativeAnswerRegions({
    expectedAnswerLabels: expectedLabels,
    pages: answerPages.map((page) => ({
      pageNumber: page.pageNumber,
      textLines: page.textLines ?? []
    }))
  });
  let source: DurableAnswerStageResult["source"];
  let detectedAnswers: DetectedAnswerCandidate[];

  if (nativeLayout.complete) {
    source = "native_pdf_text";
    detectedAnswers = nativeLayout.regions.map((region) => ({
      id: region.id,
      pageId: buildAnswerPageId(input.documentId, region.pageNumber),
      pageNumber: region.pageNumber,
      answerLabel: region.answerLabel,
      confidence: 1,
      ocrText: region.ocrText,
      normalizedBBox: region.normalizedBBox
    }));
  } else {
    source = "ai_fallback";
    const answerPageInputs = await Promise.all(
      answerPages.map(async (page) => ({
        pageId: buildAnswerPageId(input.documentId, page.pageNumber),
        pageNumber: page.pageNumber,
        imageDataUrl: await readBlobAsDataUrl(page.blob)
      }))
    );
    detectedAnswers = await activeDependencies.detectAnswersWithAi({
      questions,
      answerPages: answerPageInputs
    });
  }

  const attachmentPlan = buildDurableAnswerAttachmentPlan({
    questions,
    detectedAnswers
  });

  const unansweredQuestionIdSet = new Set(unansweredQuestions.map((question) => question.id));
  const missingRequiredQuestionIds = attachmentPlan.unansweredQuestionIds.filter((questionId) =>
    unansweredQuestionIdSet.has(questionId)
  );

  if (attachmentPlan.unresolvedAnswers.length > 0 || missingRequiredQuestionIds.length > 0) {
    throw new DurableAnswerStageIncompleteError(
      `Answer detection incomplete: ${missingRequiredQuestionIds.length} questions unanswered and ${attachmentPlan.unresolvedAnswers.length} answers unresolved`
    );
  }

  const renderedPageByNumber = new Map(answerPages.map((page) => [page.pageNumber, page]));
  const nextAssets: BinaryAssetEntity[] = [];
  const attachmentsByQuestionId = new Map<
    string,
    NonNullable<QuestionDraftEntity["answerAttachments"]>
  >();

  for (const question of questions) {
    const existingAttachments = question.answerAttachments ?? [];

    if (existingAttachments.length > 0) {
      attachmentsByQuestionId.set(question.id, existingAttachments);
      continue;
    }

    const answers = attachmentPlan.attachmentsByQuestionId.get(question.id) ?? [];
    const attachments: NonNullable<QuestionDraftEntity["answerAttachments"]> = [];

    for (let index = 0; index < answers.length; index += 1) {
      const answer = answers[index];
      const page = renderedPageByNumber.get(answer.pageNumber);

      if (!page) {
        throw new DurableAnswerStageIncompleteError(
          `Answer detection references unavailable page ${answer.pageNumber}`
        );
      }

      const assetId = `durable-answer-asset-${input.documentId}-${question.globalOrder}-${answer.pageNumber}-${index + 1}`;
      const dataUrl = await activeDependencies.cropRegion({
        page,
        normalizedBBox: answer.normalizedBBox
      });

      nextAssets.push({
        id: assetId,
        documentId: input.documentId,
        pageId: buildAnswerPageId(input.documentId, answer.pageNumber),
        kind: "display",
        mimeType: "image/png",
        byteLength: estimateDataUrlByteLength(dataUrl),
        dataUrl
      });
      attachments.push({
        id: `durable-answer-attachment-${input.documentId}-${question.globalOrder}-${answer.pageNumber}-${index + 1}`,
        assetId,
        kind: "matched"
      });
    }

    attachmentsByQuestionId.set(question.id, attachments);
  }

  const targetQuestionIds = new Set(questions.map((question) => question.id));
  const questionLabelById = new Map(
    questions.map((question) => [question.id, resolveDurableQuestionNumber(question)])
  );
  const nextSnapshot = {
    ...currentLibrary.snapshot,
    binaryAssets: currentLibrary.snapshot.binaryAssets.concat(nextAssets),
    questionDrafts: currentLibrary.snapshot.questionDrafts.map((question) =>
      targetQuestionIds.has(question.id)
        ? {
            ...question,
            questionNumberLabel: questionLabelById.get(question.id) ?? question.questionNumberLabel,
            answerAttachments: attachmentsByQuestionId.get(question.id) ?? []
          }
        : question
    ),
    examLibraryDocuments: currentLibrary.snapshot.examLibraryDocuments.map((document) =>
      document.kind === "answer_sheet" &&
      document.questionIds.some((questionId) => targetQuestionIds.has(questionId))
        ? {
            ...document,
            syncStatus: "idle" as const,
            placeholderAnswerPage: false,
            pendingPlaceholderAnswerPage: undefined
          }
        : document
    )
  };
  const saved = await repository.save({
    expectedRevision: input.expectedRevision,
    snapshot: nextSnapshot
  });

  return {
    revision: saved.revision,
    questionCount: questions.length,
    answeredQuestionCount: attachmentsByQuestionId.size,
    attachmentCount: nextAssets.length,
    answerPageCount: answerPages.length,
    source
  };
}
