import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_CONCURRENCY = 25;
const DEFAULT_CONCURRENCY = 12;
const BLIND_FIXTURE_ANALYSIS_STRATEGY_VERSION = 2;
const ALLOWED_ARGUMENTS = new Set([
  "--pdf",
  "--subject",
  "--server",
  "--output",
  "--concurrency",
  "--layout"
]);
const ALLOWED_FLAGS = new Set(["--resume"]);

export function getBlindFixtureAiPreviewMaxDimension(questionPageLayoutMode) {
  return questionPageLayoutMode === "double_column" ? 1200 : 600;
}

export function getBlindFixtureAnalysisVersion(questionPageLayoutMode) {
  return `v${BLIND_FIXTURE_ANALYSIS_STRATEGY_VERSION}-${questionPageLayoutMode}-preview-${getBlindFixtureAiPreviewMaxDimension(questionPageLayoutMode)}`;
}

function requireArgument(values, name) {
  const value = values.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }

  return value;
}

function normalizeServerUrl(value) {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use http or https");
  }

  return url.toString().replace(/\/$/, "");
}

export function parseBlindFixtureArguments(args) {
  const values = new Map();

  for (let index = 0; index < args.length;) {
    const name = args[index];

    if (ALLOWED_FLAGS.has(name)) {
      if (values.has(name)) {
        throw new Error(`Duplicate argument: ${name}`);
      }

      values.set(name, "true");
      index += 1;
      continue;
    }

    const value = args[index + 1];

    if (!ALLOWED_ARGUMENTS.has(name)) {
      throw new Error(`Unknown argument: ${name ?? "<missing>"}`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${name}`);
    }
    if (values.has(name)) {
      throw new Error(`Duplicate argument: ${name}`);
    }

    values.set(name, value);
    index += 2;
  }

  const concurrencyValue = values.get("--concurrency");
  const concurrency = concurrencyValue === undefined
    ? DEFAULT_CONCURRENCY
    : Number.parseInt(concurrencyValue, 10);

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`Concurrency must be an integer between 1 and ${MAX_CONCURRENCY}`);
  }
  const questionPageLayoutMode = values.get("--layout") ?? "single_column";

  if (!["single_column", "double_column"].includes(questionPageLayoutMode)) {
    throw new Error("Layout must be single_column or double_column");
  }

  return {
    pdfPath: path.resolve(requireArgument(values, "--pdf")),
    subject: requireArgument(values, "--subject"),
    serverUrl: normalizeServerUrl(requireArgument(values, "--server")),
    outputDirectory: path.resolve(requireArgument(values, "--output")),
    concurrency,
    questionPageLayoutMode,
    resume: values.has("--resume")
  };
}

export function buildBlindFixturePageId(documentId, pageNumber) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("Page number must be a positive integer");
  }

  return `${documentId}-page-${String(pageNumber).padStart(4, "0")}`;
}

export function buildBlindFixtureQuestionId(pageId, detectorId) {
  const rawDetectorId = String(detectorId || "draft");
  const normalizedDetectorId = rawDetectorId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "draft";

  return rawDetectorId.startsWith(`${pageId}-`)
    ? rawDetectorId
    : `${pageId}-${normalizedDetectorId}`;
}

function buildCandidateKey(candidate) {
  return [
    candidate.leftPageId,
    candidate.rightPageId,
    ...candidate.sourceQuestionIds
  ].join("--");
}

export function normalizeBlindFixtureCandidates(candidates) {
  const byKey = new Map();

  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !Array.isArray(candidate.sourceQuestionIds) ||
      candidate.sourceQuestionIds.length < 2 ||
      candidate.sourceQuestionIds.some((questionId) => typeof questionId !== "string")
    ) {
      continue;
    }

    const key = buildCandidateKey(candidate);
    const normalized = {
      ...candidate,
      id: key,
      sourceQuestionIds: Array.from(new Set(candidate.sourceQuestionIds)),
      confidence: Number.isFinite(candidate.confidence)
        ? Math.max(0, Math.min(1, candidate.confidence))
        : 0
    };
    const existing = byKey.get(key);

    if (!existing || normalized.confidence > existing.confidence) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values());
}

function mergeQuestionGroup(questions, candidate) {
  const sourceIds = new Set(candidate.sourceQuestionIds);
  const sources = questions.filter(
    (question) =>
      sourceIds.has(question.id) ||
      (question.sourceQuestionIds ?? []).some((questionId) => sourceIds.has(questionId))
  );

  if (sources.length < 2) {
    return questions;
  }

  const sortedSources = sources
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder);
  const first = sortedSources[0];
  const sourceQuestionIds = Array.from(
    new Set(sortedSources.flatMap((question) => question.sourceQuestionIds ?? [question.id]))
  );
  const pageIds = Array.from(new Set(sortedSources.flatMap((question) => question.pageIds)));
  const merged = {
    ...first,
    id: candidate.id,
    pageIds,
    primaryPageId: first.primaryPageId,
    globalOrder: Math.min(...sortedSources.map((question) => question.globalOrder)),
    bboxByPage: Object.assign({}, ...sortedSources.map((question) => question.bboxByPage)),
    sourceQuestionIds,
    crossPageGroupId: candidate.id,
    source: "merged"
  };
  const consumedIds = new Set(sources.map((question) => question.id));

  return questions
    .filter((question) => !consumedIds.has(question.id))
    .concat(merged)
    .sort((left, right) => left.globalOrder - right.globalOrder);
}

export function mergeBlindFixtureQuestions(questions, candidates) {
  return candidates.reduce(
    (currentQuestions, candidate) => mergeQuestionGroup(currentQuestions, candidate),
    questions.map((question) => ({
      ...question,
      pageIds: question.pageIds.slice(),
      bboxByPage: { ...question.bboxByPage },
      sourceQuestionIds: question.sourceQuestionIds?.slice() ?? [question.id]
    }))
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

export async function sealBlindFixtureResult(directory, result) {
  if (result?.status !== "completed") {
    throw new Error("Only a completed blind fixture result can be sealed");
  }

  await mkdir(directory, { recursive: true });
  const resultContent = `${JSON.stringify(result, null, 2)}\n`;
  const seal = {
    schemaVersion: 1,
    resultFile: "sealed-result.json",
    resultSha256: sha256(resultContent),
    sealedAt: new Date().toISOString()
  };

  await writeAtomically(path.join(directory, seal.resultFile), resultContent);
  await writeAtomically(
    path.join(directory, "seal.json"),
    `${JSON.stringify(seal, null, 2)}\n`
  );
  await rm(path.join(directory, "failure.json"), { force: true });

  return seal;
}

export async function verifyBlindFixtureSeal(directory) {
  try {
    const seal = JSON.parse(await readFile(path.join(directory, "seal.json"), "utf8"));
    const resultContent = await readFile(path.join(directory, seal.resultFile), "utf8");
    const actualSha256 = sha256(resultContent);

    return {
      valid: actualSha256 === seal.resultSha256,
      expectedSha256: seal.resultSha256,
      actualSha256
    };
  } catch {
    return {
      valid: false,
      expectedSha256: null,
      actualSha256: null
    };
  }
}

async function prepareOutputDirectory(directory, resume) {
  try {
    const entries = await readdir(directory);

    if (!resume && entries.length > 0) {
      throw new Error("Blind fixture output directory must be empty");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.join(directory, "pages"), { recursive: true });
  await mkdir(path.join(directory, "page-analysis"), { recursive: true });
  await mkdir(path.join(directory, "page-pairs"), { recursive: true });
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    return null;
  }
}

function isReusablePageAnalysis(value, page, analysisVersion) {
  return Boolean(
    value &&
      value.analysisVersion === analysisVersion &&
      value.pageId === page.id &&
      value.pageNumber === page.pageNumber &&
      value.source?.provider === "openai_compatible" &&
      Array.isArray(value.textLines) &&
      Array.isArray(value.detections)
  );
}

function isReusablePairResult(value, pair, analysisVersion) {
  return Boolean(
    value &&
      value.analysisVersion === analysisVersion &&
      value.leftPageId === pair.leftPage.id &&
      value.rightPageId === pair.rightPage.id &&
      value.source?.provider === "openai_compatible" &&
      Array.isArray(value.mergeCandidates)
  );
}

async function writeJson(filePath, value) {
  await writeAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function decodeImageDataUrl(dataUrl) {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error("Rendered page did not provide a base64 image data URL");
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) {
    return [];
  }

  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;

        if (index >= items.length) {
          return;
        }

        results[index] = await worker(items[index], index);
      }
    })
  );

  return results;
}

function assertModelResponse(payload, stage) {
  if (payload?.source?.provider !== "openai_compatible") {
    const error = new Error(`${stage} returned an AI fallback response`);
    error.diagnosticId = payload?.source?.diagnosticId ?? null;
    throw error;
  }
}

export async function postJsonWithModelRetry(
  postJson,
  url,
  body,
  stage,
  options = {}
) {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 1500));
  let lastPayload = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const payload = await postJson(url, body);
      lastPayload = payload;

      if (payload?.source?.provider === "openai_compatible") {
        return payload;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < maxAttempts && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (lastPayload) {
    assertModelResponse(lastPayload, stage);
  }

  throw lastError ?? new Error(`${stage} failed after ${maxAttempts} attempts`);
}

export async function postQuestionDetectionWithImageFallback(postJson, input) {
  const imageDataUrls = [input.body.imageDataUrl, input.fallbackImageDataUrl].filter(
    (value, index, values) =>
      typeof value === "string" && value.length > 0 && values.indexOf(value) === index
  );
  let lastPayload = null;

  for (const imageDataUrl of imageDataUrls) {
    lastPayload = await postJsonWithModelRetry(
      postJson,
      input.url,
      {
        ...input.body,
        imageDataUrl
      },
      input.stage
    );

    if (!Array.isArray(lastPayload?.detections) || lastPayload.detections.length > 0) {
      return lastPayload;
    }
  }

  return lastPayload;
}

function createFailureRecord(error, stage) {
  return {
    schemaVersion: 1,
    status: "failed",
    stage,
    errorName: error instanceof Error ? error.name : "UnknownError",
    diagnosticId:
      error && typeof error === "object" && typeof error.diagnosticId === "string"
        ? error.diagnosticId
        : null,
    occurredAt: new Date().toISOString()
  };
}

function stripPageImage(page) {
  const { imageDataUrl: _imageDataUrl, aiImageDataUrl: _aiImageDataUrl, ...metadata } = page;
  return metadata;
}

function getUniqueCrossPageBoundaries(candidates, pageNumberById) {
  const boundaries = new Map();

  for (const candidate of candidates) {
    const leftPageNumber = pageNumberById.get(candidate.leftPageId);
    const rightPageNumber = pageNumberById.get(candidate.rightPageId);

    if (!leftPageNumber || !rightPageNumber) {
      continue;
    }

    boundaries.set(`${leftPageNumber}-${rightPageNumber}`, {
      leftPageNumber,
      rightPageNumber
    });
  }

  return Array.from(boundaries.values()).sort(
    (left, right) => left.leftPageNumber - right.leftPageNumber
  );
}

export async function runBlindFixtureAnalysis(options, dependencies) {
  let stage = "prepare";
  const questionPageLayoutMode = options.questionPageLayoutMode ?? "single_column";
  const analysisVersion = getBlindFixtureAnalysisVersion(questionPageLayoutMode);

  await prepareOutputDirectory(options.outputDirectory, Boolean(options.resume));

  try {
    stage = "render_pdf";
    const rendered = await dependencies.renderPdf(options.pdfPath);

    if (!rendered?.sha256 || !Array.isArray(rendered.pages) || rendered.pages.length === 0) {
      throw new Error("PDF rendering returned no pages or fingerprint");
    }

    const documentId = `fixture-${rendered.sha256.slice(0, 16)}`;
    const physicalPages = rendered.pages
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((page) => ({
        ...page,
        id: buildBlindFixturePageId(documentId, page.pageNumber),
        documentId
      }));
    let effectivePageCount = physicalPages.length;

    while (
      effectivePageCount > 0 &&
      physicalPages[effectivePageCount - 1].isBlank === true &&
      (physicalPages[effectivePageCount - 1].textLines ?? []).length === 0
    ) {
      effectivePageCount -= 1;
    }

    if (effectivePageCount === 0) {
      throw new Error("PDF contains no non-blank pages");
    }

    const pages = physicalPages.slice(0, effectivePageCount);
    const ignoredTrailingBlankPages = physicalPages
      .slice(effectivePageCount)
      .map((page) => page.pageNumber);

    if (options.resume) {
      const previousInput = await readJsonIfPresent(
        path.join(options.outputDirectory, "input.json")
      );
      if (
        previousInput &&
        (previousInput.sha256 !== rendered.sha256 ||
          previousInput.pageCount !== pages.length ||
          previousInput.questionPageLayoutMode !== questionPageLayoutMode ||
          previousInput.subject !== options.subject)
      ) {
        throw new Error("Resume checkpoint does not match the current PDF or workflow options");
      }
    }

    await writeJson(path.join(options.outputDirectory, "input.json"), {
      schemaVersion: 1,
      analysisVersion,
      pdfPath: path.resolve(options.pdfPath),
      sha256: rendered.sha256,
      byteLength: rendered.byteLength,
      pageCount: pages.length,
      physicalPageCount: physicalPages.length,
      ignoredTrailingBlankPages,
      subject: options.subject,
      questionPageLayoutMode,
      documentId
    });

    await Promise.all(
      physicalPages.map(async (page) => {
        const image = decodeImageDataUrl(page.imageDataUrl);
        const extension = image.mimeType === "image/jpeg" ? "jpg" : "png";
        await writeFile(
          path.join(
            options.outputDirectory,
            "pages",
            `page-${String(page.pageNumber).padStart(4, "0")}.${extension}`
          ),
          image.bytes
        );
      })
    );

    stage = "question_boxes";
    const analysisByPageId = new Map();

    if (options.resume) {
      await Promise.all(
        pages.map(async (page) => {
          const cached = await readJsonIfPresent(
            path.join(
              options.outputDirectory,
              "page-analysis",
              `page-${String(page.pageNumber).padStart(4, "0")}.json`
            )
          );

          if (isReusablePageAnalysis(cached, page, analysisVersion)) {
            analysisByPageId.set(page.id, cached);
          }
        })
      );
    }

    const pendingPages = pages.filter((page) => !analysisByPageId.has(page.id));
    const freshPageAnalyses = await runWithConcurrency(
      pendingPages,
      options.concurrency,
      async (page) => {
        const requestBody = {
          pageId: page.id,
          imageDataUrl: page.aiImageDataUrl ?? page.imageDataUrl,
          subjectScope: options.subject,
          questionPageLayoutMode,
          textLines: page.textLines ?? []
        };
        const payload = questionPageLayoutMode === "double_column"
          ? await postQuestionDetectionWithImageFallback(
              dependencies.postJson,
              {
                url: `${options.serverUrl}/api/ai/detect-question-boxes`,
                body: requestBody,
                fallbackImageDataUrl: page.imageDataUrl,
                stage: `Question detection for page ${page.pageNumber}`
              }
            )
          : await postJsonWithModelRetry(
              dependencies.postJson,
              `${options.serverUrl}/api/ai/detect-question-boxes`,
              requestBody,
              `Question detection for page ${page.pageNumber}`
            );

        if (!Array.isArray(payload.detections) || !Array.isArray(payload.textLines)) {
          throw new Error(`Question detection for page ${page.pageNumber} returned invalid data`);
        }

        const result = {
          analysisVersion,
          pageId: page.id,
          pageNumber: page.pageNumber,
          source: payload.source,
          textLines: payload.textLines,
          detections: payload.detections
        };

        await writeJson(
          path.join(
            options.outputDirectory,
            "page-analysis",
            `page-${String(page.pageNumber).padStart(4, "0")}.json`
          ),
          result
        );
        return result;
      }
    );
    for (const analysis of freshPageAnalyses) {
      analysisByPageId.set(analysis.pageId, analysis);
    }
    const pageAnalyses = pages.map((page) => analysisByPageId.get(page.id)).filter(Boolean);
    if (pageAnalyses.length !== pages.length) {
      throw new Error("Question-page checkpoint set is incomplete");
    }
    const pagesWithSemanticText = pages.map((page) => ({
      ...page,
      textLines: analysisByPageId.get(page.id)?.textLines ?? page.textLines ?? []
    }));
    let globalOrderOffset = 0;
    const detectedQuestions = pagesWithSemanticText.flatMap((page) => {
      const analysis = analysisByPageId.get(page.id);
      const questions = dependencies.buildQuestions({
        documentId,
        pageId: page.id,
        pageLayoutMode: questionPageLayoutMode,
        detections: analysis?.detections ?? [],
        textLines: page.textLines,
        size: { width: page.width, height: page.height },
        globalOrderOffset
      });

      globalOrderOffset += questions.length;
      return questions;
    });
    const initialQuestions = dependencies.normalizeQuestionLayout
      ? dependencies.normalizeQuestionLayout({
          questionPageLayoutMode,
          pages: pagesWithSemanticText,
          questions: detectedQuestions
        })
      : detectedQuestions;

    stage = "cross_page";
    const edgeArtifacts = dependencies.buildEdgeArtifacts({
      documentId,
      pages: pagesWithSemanticText,
      questions: initialQuestions
    });
    const edgeQuestionIds = new Set(edgeArtifacts.questionDrafts.map((question) => question.id));
    const questionsWithEdgeFragments = initialQuestions
      .filter((question) => !edgeQuestionIds.has(question.id))
      .concat(edgeArtifacts.questionDrafts);
    const adjacentPairs = pagesWithSemanticText.slice(0, -1).map((leftPage, index) => ({
      leftPage,
      rightPage: pagesWithSemanticText[index + 1],
      sequence: index + 1
    }));
    const pairResultByKey = new Map();

    if (options.resume) {
      await Promise.all(
        adjacentPairs.map(async (pair) => {
          const cached = await readJsonIfPresent(
            path.join(
              options.outputDirectory,
              "page-pairs",
              `pair-${String(pair.leftPage.pageNumber).padStart(4, "0")}-${String(pair.rightPage.pageNumber).padStart(4, "0")}.json`
            )
          );

          if (isReusablePairResult(cached, pair, analysisVersion)) {
            pairResultByKey.set(`${pair.leftPage.id}--${pair.rightPage.id}`, cached);
          }
        })
      );
    }

    const pendingPairs = adjacentPairs.filter(
      (pair) => !pairResultByKey.has(`${pair.leftPage.id}--${pair.rightPage.id}`)
    );
    const freshPairResults = await runWithConcurrency(
      pendingPairs,
      options.concurrency,
      async (pair) => {
        const requestCandidates = dependencies.buildRequestCandidates({
          pages: [pair.leftPage, pair.rightPage],
          questions: questionsWithEdgeFragments
        });
        const payload = await postJsonWithModelRetry(
          dependencies.postJson,
          `${options.serverUrl}/api/ai/detect-cross-page`,
          {
            workflowRunId: `blind-${documentId}`,
            sequence: pair.sequence,
            total: adjacentPairs.length,
            documentId,
            questionPageLayoutMode,
            leftPage: pair.leftPage.id,
            rightPage: pair.rightPage.id,
            leftImageDataUrl: pair.leftPage.aiImageDataUrl ?? pair.leftPage.imageDataUrl,
            rightImageDataUrl: pair.rightPage.aiImageDataUrl ?? pair.rightPage.imageDataUrl,
            leftTextLines: pair.leftPage.textLines ?? [],
            rightTextLines: pair.rightPage.textLines ?? [],
            candidates: requestCandidates
          },
          `Cross-page detection for pages ${pair.leftPage.pageNumber}-${pair.rightPage.pageNumber}`
        );
        if (!Array.isArray(payload.mergeCandidates)) {
          throw new Error(
            `Cross-page detection for pages ${pair.leftPage.pageNumber}-${pair.rightPage.pageNumber} returned invalid data`
          );
        }

        const currentQuestionIds = new Set(
          questionsWithEdgeFragments.map((question) => question.id)
        );
        const candidates = payload.mergeCandidates.flatMap((candidate) => {
          if (
            !Array.isArray(candidate?.sourceQuestionIds) ||
            candidate.sourceQuestionIds.length < 2 ||
            candidate.sourceQuestionIds.some((questionId) => !currentQuestionIds.has(questionId))
          ) {
            return [];
          }

          return [{
            ...candidate,
            documentId,
            leftPageId: pair.leftPage.id,
            rightPageId: pair.rightPage.id,
            status: "suggested"
          }];
        });
        const result = {
          analysisVersion,
          sequence: pair.sequence,
          leftPageId: pair.leftPage.id,
          rightPageId: pair.rightPage.id,
          leftPageNumber: pair.leftPage.pageNumber,
          rightPageNumber: pair.rightPage.pageNumber,
          requestCandidateCount: requestCandidates.length,
          source: payload.source,
          mergeCandidates: candidates
        };

        await writeJson(
          path.join(
            options.outputDirectory,
            "page-pairs",
            `pair-${String(pair.leftPage.pageNumber).padStart(4, "0")}-${String(pair.rightPage.pageNumber).padStart(4, "0")}.json`
          ),
          result
        );
        return result;
      }
    );
    for (const pairResult of freshPairResults) {
      pairResultByKey.set(`${pairResult.leftPageId}--${pairResult.rightPageId}`, pairResult);
    }
    const pairResults = adjacentPairs
      .map((pair) => pairResultByKey.get(`${pair.leftPage.id}--${pair.rightPage.id}`))
      .filter(Boolean);
    if (pairResults.length !== adjacentPairs.length) {
      throw new Error("Cross-page checkpoint set is incomplete");
    }
    const candidates = normalizeBlindFixtureCandidates([
      ...edgeArtifacts.candidates,
      ...pairResults.flatMap((pair) => pair.mergeCandidates)
    ]);
    const mergedQuestions = dependencies.mergeQuestions
      ? dependencies.mergeQuestions(questionsWithEdgeFragments, candidates)
      : mergeBlindFixtureQuestions(questionsWithEdgeFragments, candidates);
    const finalQuestions = dependencies.reconcileQuestions
      ? dependencies.reconcileQuestions({
          pages: pagesWithSemanticText,
          questions: mergedQuestions,
          questionPageLayoutMode
        })
      : mergedQuestions;
    const pageNumberById = new Map(
      pagesWithSemanticText.map((page) => [page.id, page.pageNumber])
    );
    const crossPageBoundaries = getUniqueCrossPageBoundaries(candidates, pageNumberById);
    const result = {
      schemaVersion: 1,
      analysisVersion,
      status: "completed",
      completedAt: new Date().toISOString(),
      input: {
        pdfPath: path.resolve(options.pdfPath),
        sha256: rendered.sha256,
        byteLength: rendered.byteLength,
        pageCount: pagesWithSemanticText.length,
        physicalPageCount: physicalPages.length,
        ignoredTrailingBlankPages,
        subject: options.subject,
        questionPageLayoutMode,
        documentId
      },
      summary: {
        initialQuestionCount: initialQuestions.length,
        candidateCount: candidates.length,
        mergeCount: candidates.length,
        finalQuestionCount: finalQuestions.length,
        crossPageBoundaryCount: crossPageBoundaries.length
      },
      pages: pagesWithSemanticText.map(stripPageImage),
      pageAnalyses,
      pagePairs: pairResults,
      edgeQuestionDrafts: edgeArtifacts.questionDrafts,
      candidates,
      crossPageBoundaries,
      initialQuestions,
      finalQuestions
    };

    stage = "seal";
    await sealBlindFixtureResult(options.outputDirectory, result);
    return result;
  } catch (error) {
    await writeJson(
      path.join(options.outputDirectory, "failure.json"),
      createFailureRecord(error, stage)
    ).catch(() => undefined);
    throw error;
  }
}
