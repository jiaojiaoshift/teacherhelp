#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire, register } from "node:module";
import { pathToFileURL } from "node:url";

import {
  createCanvas,
  DOMMatrix,
  ImageData,
  loadImage,
  Path2D
} from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  getBlindFixtureAiPreviewMaxDimension,
  parseBlindFixtureArguments,
  runBlindFixtureAnalysis
} from "./lib/blind-pdf-fixture-run-service.mjs";
import { postJsonWithNodeHttp } from "./lib/json-http-client.mjs";
import { isRenderedPageBlank } from "./lib/rendered-page-blank-service.mjs";

register(new URL("./lib/teachhelper-typescript-loader.mjs", import.meta.url), import.meta.url);

globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;
globalThis.Path2D ??= Path2D;

function createPdfjsAdapter() {
  const require = createRequire(import.meta.url);
  const localWorkerUrl = pathToFileURL(
    require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;
  const workerOptions = {};

  Object.defineProperty(workerOptions, "workerSrc", {
    get: () => localWorkerUrl,
    set: () => undefined
  });

  return {
    GlobalWorkerOptions: workerOptions,
    getDocument: (input) => pdfjs.getDocument(input)
  };
}

async function buildAiImageDataUrl(imageBuffer, options = {}) {
  const image = await loadImage(imageBuffer);
  const maxDimension = options.maxDimension ?? 600;
  const quality = options.quality ?? 0.82;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = createCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale))
  );
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

  return `data:image/jpeg;base64,${canvas
    .toBuffer("image/jpeg", quality)
    .toString("base64")}`;
}

async function postJson(url, body) {
  const routeName = new URL(url).pathname.split("/").at(-1);
  process.stdout.write(`[blind] ${routeName}\n`);
  return postJsonWithNodeHttp(url, body, { timeoutMs: 15 * 60 * 1000 });
}

async function main() {
  const options = parseBlindFixtureArguments(process.argv.slice(2));
  const [pdfRenderer, analysisService, reviewService, questionLayoutService] = await Promise.all([
    import("../lib/pdf/pdf-renderer.ts"),
    import("../lib/services/analysis-service.ts"),
    import("../lib/services/review-service.ts"),
    import("../lib/services/question-layout-normalization-service.ts")
  ]);

  const renderPdf = async (pdfPath) => {
    const bytes = await readFile(pdfPath);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const previews = await pdfRenderer.renderPdfArrayBufferToPagePreviews(arrayBuffer, {
      createCanvas: () => createCanvas(1, 1),
      pdfjsModule: createPdfjsAdapter()
    });

    return {
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byteLength: bytes.byteLength,
      pages: await Promise.all(
        previews.map(async (preview) => {
          const imageBuffer = Buffer.from(await preview.blob.arrayBuffer());
          const image = await loadImage(imageBuffer);
          const inspectionCanvas = createCanvas(image.width, image.height);
          const context = inspectionCanvas.getContext("2d");

          context.drawImage(image, 0, 0);
          const rgba = context.getImageData(0, 0, image.width, image.height).data;
          const textLines = preview.textLines ?? [];

          return {
            pageNumber: preview.pageNumber,
            width: preview.width,
            height: preview.height,
            imageDataUrl: `data:${preview.blob.type || "image/png"};base64,${imageBuffer.toString("base64")}`,
            aiImageDataUrl: await buildAiImageDataUrl(imageBuffer, {
              maxDimension: getBlindFixtureAiPreviewMaxDimension(options.questionPageLayoutMode)
            }),
            textLines,
            isBlank: isRenderedPageBlank({
              rgba,
              textLineCount: textLines.length
            })
          };
        })
      )
    };
  };
  const mergeQuestions = (questions, candidates) =>
    candidates.reduce(
      (currentQuestions, candidate) =>
        reviewService.mergeQuestionsAcrossPages(currentQuestions, {
          mergedQuestionId: candidate.id,
          sourceQuestionIds: candidate.sourceQuestionIds,
          crossPageGroupId: candidate.id
        }),
      questions
    );
  const result = await runBlindFixtureAnalysis(options, {
    renderPdf,
    postJson,
    buildQuestions: analysisService.buildQuestionDraftsFromDetection,
    normalizeQuestionLayout: questionLayoutService.normalizeQuestionPageLayout,
    buildRequestCandidates: reviewService.buildCrossPageRequestCandidates,
    buildEdgeArtifacts: reviewService.buildEdgeContinuationCrossPageArtifacts,
    mergeQuestions,
    reconcileQuestions: reviewService.reconcileQuestionsAfterCrossPageReview
  });

  process.stdout.write(`${JSON.stringify({
    status: result.status,
    outputDirectory: options.outputDirectory,
    inputSha256: result.input.sha256,
    summary: result.summary,
    crossPageBoundaries: result.crossPageBoundaries
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `[blind] failed: ${error instanceof Error ? error.message : "unknown error"}\n`
  );
  process.exitCode = 1;
});
