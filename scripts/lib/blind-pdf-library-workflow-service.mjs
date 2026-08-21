import { createHash } from "node:crypto";

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function buildFixturePageEntity(input) {
  return {
    id: input.id,
    documentId: input.documentId,
    pageNumber: input.pageNumber,
    width: input.width,
    height: input.height,
    analysisStatus: "done",
    reviewStatus: "reviewed",
    ...(input.textLines ? { textLines: input.textLines } : {})
  };
}

function mapBBoxToNormalized(bbox, page) {
  return {
    x1: Math.round(clamp((bbox.x / page.width) * 1000, 0, 1000)),
    y1: Math.round(clamp((bbox.y / page.height) * 1000, 0, 1000)),
    x2: Math.round(clamp(((bbox.x + bbox.width) / page.width) * 1000, 0, 1000)),
    y2: Math.round(clamp(((bbox.y + bbox.height) / page.height) * 1000, 0, 1000))
  };
}

export function buildQuestionClassificationRequest(input) {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const pages = input.question.pageIds.flatMap((pageId) => {
    const page = pageById.get(pageId);
    const bbox = input.question.bboxByPage[pageId];
    const imageDataUrl = input.imageDataUrls[pageId];

    if (!page || !bbox || !imageDataUrl || page.width <= 0 || page.height <= 0) {
      return [];
    }

    return [{
      id: page.id,
      reviewStatus: "reviewed",
      imageDataUrl,
      questionIds: [input.question.id],
      questionRegions: [{
        questionId: input.question.id,
        isPrimary: page.id === input.question.primaryPageId,
        normalizedBBox: mapBBoxToNormalized(bbox, page)
      }]
    }];
  });

  return {
    documentId: input.documentId,
    subjectScope: input.subjectScope,
    directoryPaths: input.directoryPaths,
    pages
  };
}

export function mapFixtureQuestionBBoxToRenderedPixels(input) {
  const pageWidth = Math.max(1, input.page.width);
  const pageHeight = Math.max(1, input.page.height);
  const left = clamp(
    Math.floor((input.bbox.x / pageWidth) * input.rendered.width),
    0,
    Math.max(0, input.rendered.width - 1)
  );
  const top = clamp(
    Math.floor((input.bbox.y / pageHeight) * input.rendered.height),
    0,
    Math.max(0, input.rendered.height - 1)
  );
  const right = clamp(
    Math.ceil(((input.bbox.x + input.bbox.width) / pageWidth) * input.rendered.width),
    left + 1,
    input.rendered.width
  );
  const bottom = clamp(
    Math.ceil(((input.bbox.y + input.bbox.height) / pageHeight) * input.rendered.height),
    top + 1,
    input.rendered.height
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

export function getClassificationCheckpointKey(documentFingerprint, questionId) {
  return createHash("sha256")
    .update(`${documentFingerprint}\0${questionId}`)
    .digest("hex")
    .slice(0, 32);
}

export function buildClassificationAggregate(input) {
  const questionIds = new Set(input.questions.map((question) => question.id));
  const failedQuestionIds = input.settled
    .map((value) => value?.error ? value.questionId : null)
    .filter((questionId) => questionIds.has(questionId));

  return {
    schemaVersion: 1,
    status: failedQuestionIds.length === 0 && input.resultsByQuestionId.size === input.questions.length
      ? "completed"
      : "failed",
    documentId: input.documentId,
    documentSha256: input.documentSha256,
    questionCount: input.questions.length,
    completedCount: input.resultsByQuestionId.size,
    failedQuestionIds,
    results: input.questions
      .map((question) => input.resultsByQuestionId.get(question.id))
      .filter(Boolean),
    completedAt: new Date().toISOString()
  };
}
