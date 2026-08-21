#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createRequire, register } from "node:module";
import path from "node:path";
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
  getClassificationCheckpointKey,
  buildFixturePageEntity,
  buildQuestionClassificationRequest,
  buildClassificationAggregate,
  mapFixtureQuestionBBoxToRenderedPixels
} from "./lib/blind-pdf-library-workflow-service.mjs";
import {
  postJsonWithModelRetry
} from "./lib/blind-pdf-fixture-run-service.mjs";
import { postJsonWithNodeHttp } from "./lib/json-http-client.mjs";

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

function parseArguments(args) {
  const values = new Map();
  const flags = new Set(["--resume", "--dry-run"]);

  for (let index = 0; index < args.length;) {
    const name = args[index];

    if (flags.has(name)) {
      values.set(name, true);
      index += 1;
      continue;
    }

    const value = args[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Invalid argument near ${name ?? "<missing>"}`);
    }

    values.set(name, value);
    index += 2;
  }

  const required = (name) => {
    const value = values.get(name);
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Missing required argument: ${name}`);
    }
    return value.trim();
  };
  const concurrency = Number.parseInt(values.get("--concurrency") ?? "4", 10);

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 25) {
    throw new Error("Concurrency must be an integer between 1 and 25");
  }

  return {
    analysisPath: path.resolve(required("--analysis")),
    pdfPath: path.resolve(required("--pdf")),
    serverUrl: new URL(required("--server")).toString().replace(/\/$/, ""),
    targetRoot: path.resolve(values.get("--target-root") ?? "data/library"),
    runRoot: path.resolve(values.get("--run-root") ?? path.join(
      path.dirname(required("--analysis")),
      "library-workflow"
    )),
    concurrency,
    resume: values.has("--resume"),
    dryRun: values.has("--dry-run")
  };
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function verifySealedAnalysis(analysisPath, pdfPath) {
  const directory = path.dirname(analysisPath);
  const seal = JSON.parse(await readFile(path.join(directory, "seal.json"), "utf8"));
  const resultContent = await readFile(path.join(directory, seal.resultFile), "utf8");

  if (sha256Text(resultContent) !== seal.resultSha256) {
    throw new Error("Sealed analysis checksum is invalid");
  }

  const result = JSON.parse(resultContent);
  if (result.status !== "completed") {
    throw new Error("Only a completed sealed analysis can enter the library");
  }

  const pdfBytes = await readFile(pdfPath);
  const pdfSha256 = sha256Bytes(pdfBytes);
  if (pdfSha256 !== result.input.sha256) {
    throw new Error("The source PDF does not match the sealed analysis");
  }

  return { result, pdfBytes, pdfSha256 };
}

async function loadProjectModules() {
  const require = createRequire(import.meta.url);
  const jiti = require("jiti")(import.meta.url, {
    alias: { "@": process.cwd() },
    interopDefault: true
  });

  return {
    LocalLibraryFilesystemRepository:
      jiti("../lib/server/local-library-filesystem-repository.ts").LocalLibraryFilesystemRepository,
    importDocumentIntoLocalLibrary:
      jiti("../lib/services/local-library-document-import-service.ts").importDocumentIntoLocalLibrary,
    applyClassificationResults:
      jiti("../lib/services/classification-service.ts").applyClassificationResults,
    bulkConfirmQuestions:
      jiti("../lib/services/classification-service.ts").bulkConfirmQuestions,
    collectAiMatchableDirectoryPaths:
      jiti("../lib/services/folder-service.ts").collectAiMatchableDirectoryPaths,
    renderPdfArrayBufferToPagePreviews:
      jiti("../lib/pdf/pdf-renderer.ts").renderPdfArrayBufferToPagePreviews,
    createNodePdfCanvasFactory:
      jiti("../lib/server/node-pdf-canvas-factory.ts").createNodePdfCanvasFactory,
    buildSpecializedPaperPdf:
      jiti("../lib/server/specialized-paper-pdf-service.ts").buildSpecializedPaperPdf
  };
}

async function runWithConcurrency(items, concurrency, worker, onSettled) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), Math.max(1, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      } finally {
        await onSettled?.(items[index], index, results[index]);
      }
    }
  }));

  return results;
}

function buildDirectoryPaths(snapshot, subjectScope) {
  return snapshot.folders
    ? snapshot.folders
        .filter((folder) => folder.kind === "custom")
        .map((folder) => folder.path[0] === "我的题库" ? folder.path.slice(1, 4) : folder.path.slice(0, 3))
        .filter((folderPath) => folderPath.length >= 2 && folderPath[0] === subjectScope)
        .filter((folderPath, index, paths) =>
          paths.findIndex((candidate) => candidate.join("/") === folderPath.join("/")) === index
        )
    : [];
}

function buildBasePages(result) {
  return result.pages.map((page) => buildFixturePageEntity({
    id: page.id,
    documentId: page.documentId,
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    textLines: page.textLines ?? []
  }));
}

function buildBaseQuestions(result) {
  return result.finalQuestions.map((question) => ({
    ...question,
    status: "geometry_reviewed",
    source: question.source === "merged" ? "merged" : "ai",
    confidence: typeof question.confidence === "number" ? question.confidence : null,
    crossPageGroupId: question.crossPageGroupId ?? null,
    pageLayoutMode: result.input.questionPageLayoutMode,
    classificationStatus: "unclassified",
    directoryMatchConfidence: null,
    directoryPath: null,
    directoryCandidatePaths: [],
    questionNumberLabel: null,
    questionType: null,
    ocrText: null,
    chapterTag: null,
    knowledgeTags: [],
    questionImageAttachments: []
  }));
}

function buildImagePathMap(result, analysisDirectory) {
  const pagesDirectory = path.join(analysisDirectory, "pages");
  return new Map(result.pages.map((page) => {
    const stem = `page-${String(page.pageNumber).padStart(4, "0")}`;
    return [page.id, ["png", "jpg", "jpeg"].map((extension) =>
      path.join(pagesDirectory, `${stem}.${extension}`)
    )];
  }));
}

async function readPageDataUrl(pageId, imagePathMap, cache) {
  if (cache.has(pageId)) {
    return cache.get(pageId);
  }

  const candidates = imagePathMap.get(pageId) ?? [];
  let selectedPath = null;
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      selectedPath = candidate;
      break;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (!selectedPath) {
    throw new Error(`Rendered page asset is missing for ${pageId}`);
  }

  const bytes = await readFile(selectedPath);
  const extension = path.extname(selectedPath).toLowerCase();
  const mimeType = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
  cache.set(pageId, dataUrl);
  return dataUrl;
}

function sanitizeError(error) {
  return {
    errorName: error instanceof Error ? error.name : "UnknownError",
    diagnosticId: error && typeof error === "object" && typeof error.diagnosticId === "string"
      ? error.diagnosticId
      : null
  };
}

async function runClassification(input) {
  const classificationDirectory = path.join(input.runRoot, "classification-results");
  const questionDirectory = path.join(classificationDirectory, "questions");
  await mkdir(questionDirectory, { recursive: true });
  const manifestPath = path.join(classificationDirectory, "manifest.json");
  const expectedManifest = {
    schemaVersion: 1,
    documentId: input.documentId,
    documentSha256: input.documentSha256,
    questionCount: input.questions.length,
    subjectScope: input.subjectScope,
    directoryFingerprint: sha256Text(JSON.stringify(input.directoryPaths))
  };
  const previousManifest = await readJsonIfPresent(manifestPath);
  if (input.resume && previousManifest && JSON.stringify(previousManifest) !== JSON.stringify(expectedManifest)) {
    throw new Error("Classification checkpoint belongs to a different document or directory tree");
  }
  await writeJsonAtomic(manifestPath, expectedManifest);

  const imageDataCache = new Map();
  const resultsByQuestionId = new Map();
  const pendingQuestions = [];

  for (const question of input.questions) {
    const key = getClassificationCheckpointKey(input.documentSha256, question.id);
    const checkpointPath = path.join(questionDirectory, `${key}.json`);
    const cached = input.resume ? await readJsonIfPresent(checkpointPath) : null;
    if (
      cached?.status === "completed" &&
      cached.documentId === input.documentId &&
      cached.questionId === question.id &&
      cached.result?.questionId === question.id
    ) {
      resultsByQuestionId.set(question.id, cached.result);
    } else {
      pendingQuestions.push({ question, checkpointPath });
    }
  }

  let completed = resultsByQuestionId.size;
  process.stdout.write(`[library] classification ${completed}/${input.questions.length} cached\n`);
  const postJson = (url, body) => postJsonWithNodeHttp(url, body, { timeoutMs: 15 * 60 * 1000 });
  const settled = await runWithConcurrency(
    pendingQuestions,
    input.concurrency,
    async ({ question, checkpointPath }) => {
      const imageDataUrls = {};
      for (const pageId of question.pageIds) {
        imageDataUrls[pageId] = await readPageDataUrl(pageId, input.imagePathMap, imageDataCache);
      }
      const body = buildQuestionClassificationRequest({
        documentId: input.documentId,
        subjectScope: input.subjectScope,
        directoryPaths: input.directoryPaths,
        question,
        pages: input.pages,
        imageDataUrls
      });
      if (body.pages.length === 0) {
        throw new Error(`No reviewed page image for ${question.id}`);
      }
      const payload = await postJsonWithModelRetry(
        postJson,
        `${input.serverUrl}/api/ai/classify-document-questions`,
        body,
        `Classification for question ${question.id}`,
        { maxAttempts: 3, delayMs: 2000 }
      );
      const result = (payload.results ?? []).find((item) => item?.questionId === question.id);
      if (!result) {
        throw new Error(`Classification returned no result for ${question.id}`);
      }
      await writeJsonAtomic(checkpointPath, {
        schemaVersion: 1,
        status: "completed",
        documentId: input.documentId,
        questionId: question.id,
        source: payload.source,
        result,
        completedAt: new Date().toISOString()
      });
      return result;
    },
    async (entry, _index, value) => {
      completed += 1;
      if (value?.error) {
        await writeJsonAtomic(entry.checkpointPath, {
          schemaVersion: 1,
          status: "failed",
          documentId: input.documentId,
          questionId: entry.question.id,
          ...sanitizeError(value.error),
          failedAt: new Date().toISOString()
        });
      } else if (value) {
        resultsByQuestionId.set(entry.question.id, value);
      }
      if (completed % 10 === 0 || completed === input.questions.length) {
        process.stdout.write(`[library] classification ${completed}/${input.questions.length}\n`);
      }
    }
  );

  const settledWithQuestionIds = settled.map((value, index) => ({
    ...value,
    questionId: value?.error ? pendingQuestions[index]?.question.id : undefined
  }));
  const aggregate = buildClassificationAggregate({
    documentId: input.documentId,
    documentSha256: input.documentSha256,
    questions: input.questions,
    resultsByQuestionId,
    settled: settledWithQuestionIds
  });
  await writeJsonAtomic(path.join(classificationDirectory, "classification-results.json"), aggregate);

  if (aggregate.status !== "completed") {
    throw new Error(
      `Classification incomplete: ${resultsByQuestionId.size}/${input.questions.length} questions completed`
    );
  }

  return Array.from(resultsByQuestionId.values());
}

function buildAssetRecord({ id, documentId, pageId, kind, mimeType, byteLength }) {
  return { id, documentId, pageId, kind, mimeType, byteLength };
}

async function createBackup(targetRoot) {
  const catalogPath = path.join(targetRoot, "catalog.json");
  try {
    await readFile(catalogPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const backupRoot = path.join(
    path.dirname(targetRoot),
    "library-backups",
    `before-large-fixture-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  await mkdir(path.dirname(backupRoot), { recursive: true });
  await cp(targetRoot, backupRoot, { recursive: true, errorOnExist: true });
  return backupRoot;
}

async function generateDisplayAssets(input) {
  const batchSize = 8;
  for (let start = 0; start < input.pages.length; start += batchSize) {
    const batch = input.pages.slice(start, start + batchSize);
    const newAssets = [];
    const assetBlobs = new Map();
    const assetIdByPageId = new Map();

    for (const page of batch) {
      const bytes = await readPageDataUrl(page.id, input.imagePathMap, new Map())
        .then((dataUrl) => Buffer.from(dataUrl.split(",", 2)[1], "base64"));
      const extension = "png";
      const assetId = `fixture-display-${page.id}`;
      assetIdByPageId.set(page.id, assetId);
      newAssets.push(buildAssetRecord({
        id: assetId,
        documentId: input.documentId,
        pageId: page.id,
        kind: "display",
        mimeType: "image/png",
        byteLength: bytes.byteLength
      }));
      assetBlobs.set(assetId, bytes);
    }

    const pages = input.state.snapshot.pages.map((page) =>
      assetIdByPageId.has(page.id)
        ? { ...page, displayAssetId: assetIdByPageId.get(page.id) }
        : page
    );
    const replacedIds = new Set(batch.map((page) => page.id));
    const binaryAssets = input.state.snapshot.binaryAssets
      .filter((asset) => !(asset.documentId === input.documentId && replacedIds.has(asset.pageId) && asset.kind === "display"))
      .concat(newAssets);
    input.state = await input.save({ ...input.state.snapshot, pages, binaryAssets }, assetBlobs);
    process.stdout.write(`[library] display assets ${Math.min(start + batch.length, input.pages.length)}/${input.pages.length}\n`);
  }
}

async function generateQuestionCrops(input, modules, pdfBytes) {
  const pageById = new Map(input.pages.map((page) => [page.id, page]));
  const questionsByPageId = new Map();
  for (const question of input.questions) {
    for (const pageId of question.pageIds) {
      const list = questionsByPageId.get(pageId) ?? [];
      list.push(question);
      questionsByPageId.set(pageId, list);
    }
  }

  const pageNumbers = input.pages
    .filter((page) => questionsByPageId.has(page.id))
    .map((page) => page.pageNumber);
  const rendered = await modules.renderPdfArrayBufferToPagePreviews(pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
  ), {
    scale: 300 / 72,
    pageNumbers,
    batchSize: 1,
    createCanvas: modules.createNodePdfCanvasFactory(),
    pdfjsModule: createPdfjsAdapter(),
    onBatch: async ({ pages: renderedPages }) => {
      for (const renderedPage of renderedPages) {
        const page = input.pages.find((candidate) => candidate.pageNumber === renderedPage.pageNumber);
        if (!page) {
          continue;
        }
        const pageQuestions = questionsByPageId.get(page.id) ?? [];
        const sourceImage = await loadImage(Buffer.from(await renderedPage.blob.arrayBuffer()));
        const newAssets = [];
        const assetBlobs = new Map();
        const attachmentByQuestionId = new Map();

        for (const question of pageQuestions) {
          const bbox = question.bboxByPage[page.id];
          if (!bbox) {
            throw new Error(`Question ${question.id} has no bbox on page ${page.pageNumber}`);
          }
          const crop = mapFixtureQuestionBBoxToRenderedPixels({
            bbox,
            page,
            rendered: { width: renderedPage.width, height: renderedPage.height }
          });
          const canvas = createCanvas(crop.width, crop.height);
          canvas.getContext("2d").drawImage(
            sourceImage,
            crop.x,
            crop.y,
            crop.width,
            crop.height,
            0,
            0,
            crop.width,
            crop.height
          );
          const bytes = canvas.toBuffer("image/png");
          const assetId = `question-crop-v1-${question.id}-${page.id}`;
          newAssets.push(buildAssetRecord({
            id: assetId,
            documentId: input.documentId,
            pageId: page.id,
            kind: "question_crop",
            mimeType: "image/png",
            byteLength: bytes.byteLength
          }));
          assetBlobs.set(assetId, bytes);
          attachmentByQuestionId.set(question.id, {
            id: `question-image-v1-${question.id}-${page.id}`,
            assetId,
            pageId: page.id,
            pixelWidth: crop.width,
            pixelHeight: crop.height,
            renderDpi: 300,
            version: 1
          });
        }

        const questions = input.state.snapshot.questionDrafts.map((question) => {
          const attachment = attachmentByQuestionId.get(question.id);
          if (!attachment) {
            return question;
          }
          const existing = (question.questionImageAttachments ?? [])
            .filter((item) => item.pageId !== page.id);
          return { ...question, questionImageAttachments: existing.concat(attachment) };
        });
        const existingAssetIds = new Set(newAssets.map((asset) => asset.id));
        const binaryAssets = input.state.snapshot.binaryAssets
          .filter((asset) => !existingAssetIds.has(asset.id))
          .concat(newAssets);
        input.state = await input.save({ ...input.state.snapshot, questionDrafts: questions, binaryAssets }, assetBlobs);
        process.stdout.write(`[library] crops page ${page.pageNumber}/${pageNumbers.length}\n`);
      }
    }
  });

  if (rendered.length > 0) {
    throw new Error("Unexpected buffered PDF pages during durable crop rendering");
  }
}

async function exportSpecializedPapers(input, modules) {
  const questionIds = new Set(input.questions.map((question) => question.id));
  const documents = input.state.snapshot.examLibraryDocuments.filter((document) =>
    document.library === "specialized" &&
    document.kind === "paper" &&
    document.questionIds.some((questionId) => questionIds.has(questionId))
  );
  const exportDirectory = path.join(input.runRoot, "exports");
  await mkdir(exportDirectory, { recursive: true });
  const pageById = new Map(input.state.snapshot.pages.map((page) => [page.id, page]));
  const questionList = input.state.snapshot.questionDrafts.filter((question) => questionIds.has(question.id));

  for (const document of documents) {
    const result = await modules.buildSpecializedPaperPdf({
      document,
      questions: questionList,
      pages: Array.from(pageById.values()),
      readAsset: (assetId) => input.repository.readAsset(assetId)
    });
    await writeFile(path.join(exportDirectory, result.fileName), result.data);
  }

  return documents.length;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const modules = await loadProjectModules();
  const analysisDirectory = path.dirname(options.analysisPath);
  const { result, pdfBytes, pdfSha256 } = await verifySealedAnalysis(options.analysisPath, options.pdfPath);
  const repository = new modules.LocalLibraryFilesystemRepository({ rootDirectory: options.targetRoot });
  const existing = await repository.load();
  const pages = buildBasePages(result);
  const questions = buildBaseQuestions(result);
  const documentId = result.input.documentId;
  const directoryPaths = buildDirectoryPaths(existing.snapshot, "高中物理");
  const imagePathMap = buildImagePathMap(result, analysisDirectory);

  const summary = {
    documentId,
    pdfSha256,
    pageCount: pages.length,
    questionCount: questions.length,
    crossPageQuestionCount: questions.filter((question) => question.pageIds.length > 1).length,
    directoryCount: directoryPaths.length,
    targetRevision: existing.revision,
    dryRun: options.dryRun
  };
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  await mkdir(options.runRoot, { recursive: true });
  const backupRoot = await createBackup(options.targetRoot);
  await writeJsonAtomic(path.join(options.runRoot, "workflow-input.json"), {
    schemaVersion: 1,
    ...summary,
    backupRoot,
    targetRoot: options.targetRoot
  });

  const classificationResults = await runClassification({
    runRoot: options.runRoot,
    resume: options.resume,
    documentId,
    documentSha256: pdfSha256,
    subjectScope: "高中物理",
    directoryPaths,
    pages,
    questions,
    imagePathMap,
    serverUrl: options.serverUrl,
    concurrency: options.concurrency
  });
  const classified = modules.applyClassificationResults(questions, documentId, classificationResults);
  const confirmableIds = classified
    .filter((question) =>
      question.classificationStatus === "matched" &&
      Array.isArray(question.directoryPath) &&
      question.directoryPath.length >= 3 &&
      (question.directoryMatchConfidence ?? 0) >= 0.8
    )
    .map((question) => question.id);
  const confirmed = modules.bulkConfirmQuestions(
    classified,
    confirmableIds,
    `large-fixture-${documentId}`
  ).nextQuestions;

  let state = existing;
  const save = async (snapshot, assetBlobs = new Map()) => {
    const saved = await repository.save({
      expectedRevision: state.revision,
      snapshot,
      assetBlobs
    });
    state = { revision: saved.revision, snapshot };
    return state;
  };
  const sourceSnapshot = {
    ...state.snapshot,
    pages,
    binaryAssets: [],
    questionDrafts: confirmed,
    examLibraryDocuments: []
  };
  state = await save(modules.importDocumentIntoLocalLibrary({
    existing: state.snapshot,
    source: sourceSnapshot,
    documentId
  }));

  const workflowInput = {
    documentId,
    documentSha256: pdfSha256,
    pages,
    questions: confirmed,
    imagePathMap,
    state,
    repository,
    documentId,
    runRoot: options.runRoot,
    save,
    ...summary
  };
  await generateDisplayAssets(workflowInput);
  await generateQuestionCrops(workflowInput, modules, pdfBytes);

  const finalQuestions = workflowInput.state.snapshot.questionDrafts.filter((question) => question.documentId === documentId);
  const assetIds = new Set(workflowInput.state.snapshot.binaryAssets.map((asset) => asset.id));
  const incomplete = finalQuestions.filter((question) =>
    question.pageIds.some((pageId) =>
      !(question.questionImageAttachments ?? []).some((attachment) =>
        attachment.pageId === pageId && assetIds.has(attachment.assetId)
      )
    )
  );
  if (incomplete.length > 0) {
    throw new Error(`Durable question crops incomplete: ${incomplete.length} questions`);
  }

  const exportedPaperCount = await exportSpecializedPapers(workflowInput, modules);
  const finalSummary = {
    ...summary,
    revision: workflowInput.state.revision,
    classifiedQuestionCount: classificationResults.length,
    confirmedQuestionCount: confirmableIds.length,
    durableQuestionImageCount: finalQuestions.reduce(
      (count, question) => count + (question.questionImageAttachments?.length ?? 0),
      0
    ),
    specializedPaperExportCount: exportedPaperCount,
    completedAt: new Date().toISOString()
  };
  await writeJsonAtomic(path.join(options.runRoot, "workflow-result.json"), finalSummary);
  process.stdout.write(`${JSON.stringify(finalSummary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[library] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
