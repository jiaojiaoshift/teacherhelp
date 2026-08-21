import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile
} from "node:fs/promises";
import path from "node:path";

const ANSWER_ROUTE_PATH = "/api/local-library/resume-answer-stage";
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

function parsePositiveInteger(value, name) {
  if (!/^\d+$/.test(value ?? "") || Number(value) < 1) {
    throw new Error(`${name} must be a positive integer`);
  }

  return Number(value);
}

export function parseBlindAnswerFixtureArguments(args) {
  const allowed = new Set([
    "--pdf",
    "--library",
    "--document-id",
    "--answer-start-page",
    "--server",
    "--output",
    "--client"
  ]);
  const values = new Map();

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];

    if (!allowed.has(name)) {
      throw new Error(`Unknown argument: ${name ?? "<missing>"}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${name}`);
    }
    values.set(name, value);
  }

  const required = [
    "--pdf",
    "--library",
    "--document-id",
    "--answer-start-page",
    "--server",
    "--output"
  ];

  for (const name of required) {
    if (!values.has(name)) {
      throw new Error(`Missing required argument: ${name}`);
    }
  }

  const clientKind = values.get("--client") ?? "web";

  if (clientKind !== "web" && clientKind !== "desktop") {
    throw new Error("--client must be web or desktop");
  }

  return {
    pdfPath: path.resolve(values.get("--pdf")),
    libraryDirectory: path.resolve(values.get("--library")),
    documentId: values.get("--document-id").trim(),
    answerStartPage: parsePositiveInteger(
      values.get("--answer-start-page"),
      "--answer-start-page"
    ),
    serverUrl: values.get("--server").replace(/\/+$/, ""),
    outputDirectory: path.resolve(values.get("--output")),
    clientKind
  };
}

async function parseResponseJson(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${ANSWER_ROUTE_PATH} returned invalid JSON`);
  }
}

export async function postAnswerStageMultipart(input, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const formData = new FormData();

  formData.append(
    "file",
    new Blob([input.pdfBytes], { type: "application/pdf" }),
    input.pdfFileName
  );
  formData.append("documentId", input.documentId);
  formData.append("expectedRevision", String(input.expectedRevision));
  formData.append("answerStartPage", String(input.answerStartPage));

  const serverUrl = input.serverUrl.replace(/\/+$/, "");
  const response = await fetchImpl(`${serverUrl}${ANSWER_ROUTE_PATH}`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  });
  const payload = await parseResponseJson(response);

  if (!response.ok) {
    const error = new Error(
      `${ANSWER_ROUTE_PATH} returned HTTP ${response.status}: ${payload.error ?? "unknown_error"}`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function stableQuestionLabel(question) {
  const explicit = question.questionNumberLabel?.trim();
  return explicit || String(question.globalOrder);
}

function readAnswerPageNumber(documentId, pageId) {
  const prefix = `durable-answer-page-${documentId}-`;

  if (typeof pageId !== "string" || !pageId.startsWith(prefix)) {
    return null;
  }

  const rawPageNumber = pageId.slice(prefix.length);

  return /^\d+$/.test(rawPageNumber) && Number(rawPageNumber) >= 1
    ? Number(rawPageNumber)
    : null;
}

function buildAnswerCrossPageBoundaries(questions) {
  const labelsByBoundary = new Map();

  for (const question of questions) {
    const pages = question.answerPageNumbers;

    for (let index = 0; index < pages.length - 1; index += 1) {
      const leftPageNumber = pages[index];
      const rightPageNumber = pages[index + 1];

      if (rightPageNumber !== leftPageNumber + 1) {
        continue;
      }

      const key = `${leftPageNumber}-${rightPageNumber}`;
      const labels = labelsByBoundary.get(key) ?? new Set();
      labels.add(question.questionLabel);
      labelsByBoundary.set(key, labels);
    }
  }

  return Array.from(labelsByBoundary.entries())
    .map(([key, labels]) => {
      const [leftPageNumber, rightPageNumber] = key.split("-").map(Number);
      return {
        leftPageNumber,
        rightPageNumber,
        questionLabels: Array.from(labels).sort((left, right) =>
          left.localeCompare(right, undefined, { numeric: true })
        )
      };
    })
    .sort((left, right) => left.leftPageNumber - right.leftPageNumber);
}

export function buildBlindAnswerFixtureResult(input) {
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const questions = input.questions
    .slice()
    .sort((left, right) => left.globalOrder - right.globalOrder)
    .map((question) => {
      const attachments = (question.answerAttachments ?? []).map((attachment) => {
        const asset = assetById.get(attachment.assetId) ?? null;
        return {
          id: attachment.id,
          assetId: attachment.assetId,
          kind: attachment.kind,
          pageId: asset?.pageId ?? null,
          pageNumber: asset
            ? readAnswerPageNumber(input.documentId, asset.pageId)
            : null,
          fileExists: asset?.fileExists === true
        };
      });
      const answerPageNumbers = Array.from(
        new Set(
          attachments
            .map((attachment) => attachment.pageNumber)
            .filter((pageNumber) => Number.isInteger(pageNumber))
        )
      ).sort((left, right) => left - right);

      return {
        questionId: question.id,
        globalOrder: question.globalOrder,
        questionLabel: stableQuestionLabel(question),
        answerPageNumbers,
        attachments
      };
    });
  const attachmentCount = questions.reduce(
    (total, question) => total + question.attachments.length,
    0
  );
  const missingAssetCount = questions.reduce(
    (total, question) =>
      total + question.attachments.filter((attachment) => !attachment.fileExists).length,
    0
  );

  return {
    schemaVersion: 1,
    status: "completed",
    completedAt: new Date().toISOString(),
    clientKind: input.clientKind,
    input: {
      pdfPath: path.resolve(input.pdf.path),
      sha256: input.pdf.sha256,
      byteLength: input.pdf.byteLength,
      documentId: input.documentId,
      answerStartPage: input.answerStartPage
    },
    initialRevision: input.initialRevision,
    finalRevision: input.finalRevision,
    routeResult: input.routeResult,
    summary: {
      questionCount: questions.length,
      answeredQuestionCount: questions.filter(
        (question) => question.answerPageNumbers.length > 0
      ).length,
      attachmentCount,
      answerPageCount: new Set(questions.flatMap((question) => question.answerPageNumbers)).size,
      answerCrossPageBoundaryCount: buildAnswerCrossPageBoundaries(questions).length,
      missingAssetCount
    },
    questions,
    answerCrossPageBoundaries: buildAnswerCrossPageBoundaries(questions)
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadBlindAnswerLibraryState(libraryDirectory, documentId) {
  const catalog = JSON.parse(
    await readFile(path.join(libraryDirectory, "catalog.json"), "utf8")
  );
  const questionEntries = Array.isArray(catalog.questionFiles)
    ? catalog.questionFiles
    : [];
  const questions = (
    await Promise.all(
      questionEntries.map(async (entry) => {
        if (path.basename(entry.file) !== entry.file) {
          throw new Error("Invalid question file path in fixture catalog");
        }

        return JSON.parse(
          await readFile(path.join(libraryDirectory, "questions", entry.file), "utf8")
        );
      })
    )
  ).filter((question) => question.documentId === documentId);

  if (questions.length === 0) {
    throw new Error(`Fixture library has no questions for document ${documentId}`);
  }

  const referencedAssetIds = new Set(
    questions.flatMap((question) =>
      (question.answerAttachments ?? []).map((attachment) => attachment.assetId)
    )
  );
  const assets = await Promise.all(
    (catalog.assetFiles ?? [])
      .filter((asset) => referencedAssetIds.has(asset.id))
      .map(async (asset) => {
        if (path.basename(asset.file) !== asset.file) {
          throw new Error("Invalid asset file path in fixture catalog");
        }

        return {
          id: asset.id,
          pageId: asset.pageId,
          file: asset.file,
          fileExists: await fileExists(path.join(libraryDirectory, "assets", asset.file))
        };
      })
  );

  return {
    revision: catalog.revision,
    questions,
    assets
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomically(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
}

export async function sealBlindAnswerFixtureResult(directory, result) {
  if (result?.status !== "completed") {
    throw new Error("Only a completed blind answer fixture result can be sealed");
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
  return seal;
}

export async function verifyBlindAnswerFixtureSeal(directory) {
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
    return { valid: false, expectedSha256: null, actualSha256: null };
  }
}

async function prepareFreshOutputDirectory(directory) {
  try {
    const entries = await readdir(directory);

    if (entries.length > 0) {
      throw new Error("Blind answer fixture output directory must be empty");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(directory, { recursive: true });
}

export async function runBlindAnswerFixture(options, dependencies = {}) {
  const readPdf = dependencies.readPdf ?? readFile;
  const loadLibraryState = dependencies.loadLibraryState ?? loadBlindAnswerLibraryState;
  const postAnswerStage = dependencies.postAnswerStage ?? postAnswerStageMultipart;
  let stage = "prepare";

  await prepareFreshOutputDirectory(options.outputDirectory);

  try {
    stage = "read_input";
    const pdfBytes = await readPdf(options.pdfPath);
    const initialState = await loadLibraryState(
      options.libraryDirectory,
      options.documentId
    );

    if (
      initialState.questions.some(
        (question) => (question.answerAttachments?.length ?? 0) > 0
      )
    ) {
      throw new Error("Blind answer fixture must start from unanswered questions");
    }

    stage = "answer_route";
    const routeResult = await postAnswerStage({
      serverUrl: options.serverUrl,
      pdfBytes,
      pdfFileName: path.basename(options.pdfPath),
      documentId: options.documentId,
      expectedRevision: initialState.revision,
      answerStartPage: options.answerStartPage
    });

    stage = "read_committed_library";
    const finalState = await loadLibraryState(
      options.libraryDirectory,
      options.documentId
    );

    if (finalState.revision !== routeResult.revision) {
      throw new Error(
        `Committed revision ${finalState.revision} does not match route revision ${routeResult.revision}`
      );
    }

    const result = buildBlindAnswerFixtureResult({
      clientKind: options.clientKind,
      pdf: {
        path: options.pdfPath,
        sha256: sha256(pdfBytes),
        byteLength: pdfBytes.byteLength
      },
      documentId: options.documentId,
      answerStartPage: options.answerStartPage,
      initialRevision: initialState.revision,
      finalRevision: finalState.revision,
      routeResult,
      questions: finalState.questions,
      assets: finalState.assets
    });

    stage = "seal";
    await sealBlindAnswerFixtureResult(options.outputDirectory, result);
    return result;
  } catch (error) {
    await writeAtomically(
      path.join(options.outputDirectory, "failure.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        status: "failed",
        stage,
        errorName: error instanceof Error ? error.name : "UnknownError",
        occurredAt: new Date().toISOString()
      }, null, 2)}\n`
    ).catch(() => undefined);
    throw error;
  }
}
