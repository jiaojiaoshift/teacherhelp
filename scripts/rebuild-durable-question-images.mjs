import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";

import {
  createCanvas,
  DOMMatrix,
  ImageData,
  Path2D
} from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/build/pdf.mjs";
import { WorkerMessageHandler } from "pdfjs-dist/build/pdf.worker.mjs";

const TARGET_DPI = 300;
const PDF_POINTS_PER_INCH = 72;
const IMAGE_VERSION = 1;

function parseArguments(argv) {
  const sources = new Map();
  let libraryRoot = null;
  let dryRun = false;
  let skipBackup = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--library") {
      libraryRoot = argv[++index] ?? null;
      continue;
    }

    if (token === "--source") {
      const mapping = argv[++index] ?? "";
      const separatorIndex = mapping.indexOf("=");

      if (separatorIndex <= 0) {
        throw new Error(`Invalid --source mapping: ${mapping}`);
      }

      sources.set(mapping.slice(0, separatorIndex), mapping.slice(separatorIndex + 1));
      continue;
    }

    if (token === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (token === "--skip-backup") {
      skipBackup = true;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  if (!libraryRoot || sources.size === 0) {
    throw new Error(
      "Usage: node scripts/rebuild-durable-question-images.mjs --library <path> " +
        "--source <documentId=pdfPath> [--source ...] [--dry-run]"
    );
  }

  return {
    libraryRoot: path.resolve(libraryRoot),
    sources: new Map(
      Array.from(sources, ([documentId, sourcePath]) => [documentId, path.resolve(sourcePath)])
    ),
    dryRun,
    skipBackup
  };
}

function stableFileStem(id) {
  return createHash("sha256").update(id).digest("hex").slice(0, 32);
}

function buildAssetId(questionId, pageId) {
  return `question-crop-v${IMAGE_VERSION}-${questionId}-${pageId}`;
}

function buildAttachmentId(questionId, pageId) {
  return `question-image-v${IMAGE_VERSION}-${questionId}-${pageId}`;
}

function mapBBoxToRenderedPixels(bbox, page, renderedWidth, renderedHeight) {
  const pageWidth = Math.max(1, page.width);
  const pageHeight = Math.max(1, page.height);
  const left = Math.max(
    0,
    Math.min(renderedWidth - 1, Math.floor((bbox.x / pageWidth) * renderedWidth))
  );
  const top = Math.max(
    0,
    Math.min(renderedHeight - 1, Math.floor((bbox.y / pageHeight) * renderedHeight))
  );
  const right = Math.max(
    left + 1,
    Math.min(renderedWidth, Math.ceil(((bbox.x + bbox.width) / pageWidth) * renderedWidth))
  );
  const bottom = Math.max(
    top + 1,
    Math.min(renderedHeight, Math.ceil(((bbox.y + bbox.height) / pageHeight) * renderedHeight))
  );

  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, targetPath);
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function loadLibrary(libraryRoot) {
  const catalogPath = path.join(libraryRoot, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const questions = await Promise.all(
    catalog.questionFiles.map(async (entry) => ({
      entry,
      value: JSON.parse(await readFile(path.join(libraryRoot, "questions", entry.file), "utf8"))
    }))
  );
  const pages = await Promise.all(
    catalog.pageFiles.map(async (entry) => ({
      entry,
      value: JSON.parse(await readFile(path.join(libraryRoot, "pages", entry.file), "utf8"))
    }))
  );

  return { catalogPath, catalog, questions, pages };
}

async function materializeDocument({
  documentId,
  pdfPath,
  questions,
  pages,
  stagingAssetsDirectory
}) {
  const documentQuestions = questions
    .filter((item) => item.value.documentId === documentId)
    .sort((left, right) => left.value.globalOrder - right.value.globalOrder);
  const documentPages = pages.filter((item) => item.value.documentId === documentId);
  const pageById = new Map(documentPages.map((item) => [item.value.id, item.value]));

  if (documentQuestions.length === 0) {
    throw new Error(`No questions found for document ${documentId}`);
  }

  const questionsByPageNumber = new Map();

  for (const questionItem of documentQuestions) {
    for (const pageId of questionItem.value.pageIds) {
      const page = pageById.get(pageId);
      const bbox = questionItem.value.bboxByPage?.[pageId];

      if (!page || !bbox) {
        throw new Error(`Question ${questionItem.value.id} has incomplete geometry for ${pageId}`);
      }

      const entries = questionsByPageNumber.get(page.pageNumber) ?? [];
      entries.push({ questionItem, page, bbox });
      questionsByPageNumber.set(page.pageNumber, entries);
    }
  }

  const pdfBuffer = await readFile(pdfPath);
  const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  const attachmentsByQuestionId = new Map(documentQuestions.map((item) => [item.value.id, []]));
  const generatedAssets = [];

  try {
    for (const pageNumber of Array.from(questionsByPageNumber.keys()).sort((a, b) => a - b)) {
      if (pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new Error(`PDF ${pdfPath} does not contain page ${pageNumber}`);
      }

      const pdfPage = await pdf.getPage(pageNumber);
      const viewport = pdfPage.getViewport({ scale: TARGET_DPI / PDF_POINTS_PER_INCH });
      const pageCanvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const pageContext = pageCanvas.getContext("2d");
      await pdfPage.render({ canvasContext: pageContext, viewport }).promise;

      for (const { questionItem, page, bbox } of questionsByPageNumber.get(pageNumber)) {
        const crop = mapBBoxToRenderedPixels(
          bbox,
          page,
          pageCanvas.width,
          pageCanvas.height
        );
        const cropCanvas = createCanvas(crop.width, crop.height);
        const cropContext = cropCanvas.getContext("2d");
        cropContext.drawImage(
          pageCanvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );
        const png = cropCanvas.toBuffer("image/png");
        const assetId = buildAssetId(questionItem.value.id, page.id);
        const file = `${stableFileStem(assetId)}.png`;
        await writeFile(path.join(stagingAssetsDirectory, file), png);
        generatedAssets.push({
          id: assetId,
          file,
          documentId,
          pageId: page.id,
          kind: "question_crop",
          mimeType: "image/png",
          byteLength: png.byteLength
        });
        attachmentsByQuestionId.get(questionItem.value.id).push({
          id: buildAttachmentId(questionItem.value.id, page.id),
          assetId,
          pageId: page.id,
          pixelWidth: crop.width,
          pixelHeight: crop.height,
          renderDpi: TARGET_DPI,
          version: IMAGE_VERSION
        });
      }

      pdfPage.cleanup?.();
    }
  } finally {
    await pdf.destroy?.();
  }

  for (const questionItem of documentQuestions) {
    const attachmentByPageId = new Map(
      attachmentsByQuestionId
        .get(questionItem.value.id)
        .map((attachment) => [attachment.pageId, attachment])
    );
    const orderedAttachments = questionItem.value.pageIds.map((pageId) =>
      attachmentByPageId.get(pageId)
    );

    if (orderedAttachments.some((attachment) => !attachment)) {
      throw new Error(`Question ${questionItem.value.id} did not produce every page fragment`);
    }

    questionItem.value = {
      ...questionItem.value,
      questionImageAttachments: orderedAttachments
    };
  }

  return {
    questionCount: documentQuestions.length,
    fragmentCount: generatedAssets.length,
    generatedAssets
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const loaded = await loadLibrary(options.libraryRoot);
  const stagingRoot = path.join(
    path.dirname(options.libraryRoot),
    `.question-image-migration-${randomUUID()}`
  );
  const stagingAssetsDirectory = path.join(stagingRoot, "assets");
  await mkdir(stagingAssetsDirectory, { recursive: true });

  globalThis.Path2D ??= Path2D;
  globalThis.DOMMatrix ??= DOMMatrix;
  globalThis.ImageData ??= ImageData;
  globalThis.pdfjsWorker ??= { WorkerMessageHandler };

  try {
    const summaries = [];
    const generatedAssets = [];

    for (const [documentId, pdfPath] of options.sources) {
      if (!(await pathExists(pdfPath))) {
        throw new Error(`Source PDF does not exist: ${pdfPath}`);
      }

      const result = await materializeDocument({
        documentId,
        pdfPath,
        questions: loaded.questions,
        pages: loaded.pages,
        stagingAssetsDirectory
      });
      summaries.push({ documentId, pdfPath, ...result, generatedAssets: undefined });
      generatedAssets.push(...result.generatedAssets);
    }

    const targetDocumentIds = new Set(options.sources.keys());
    const expectedFragmentCount = loaded.questions
      .filter((item) => targetDocumentIds.has(item.value.documentId))
      .reduce((total, item) => total + item.value.pageIds.length, 0);

    if (generatedAssets.length !== expectedFragmentCount) {
      throw new Error(
        `Generated ${generatedAssets.length} fragments, expected ${expectedFragmentCount}`
      );
    }

    if (options.dryRun) {
      process.stdout.write(
        `${JSON.stringify(
          {
            dryRun: true,
            libraryRevision: loaded.catalog.revision,
            targetDpi: TARGET_DPI,
            questionCount: summaries.reduce((total, item) => total + item.questionCount, 0),
            fragmentCount: generatedAssets.length,
            documents: summaries
          },
          null,
          2
        )}\n`
      );
      return;
    }

    let backupPath = null;

    if (!options.skipBackup) {
      backupPath = path.join(
        path.dirname(options.libraryRoot),
        "library-backups",
        `before-question-images-${buildTimestamp()}`
      );
      await mkdir(path.dirname(backupPath), { recursive: true });
      await cp(options.libraryRoot, backupPath, { recursive: true, errorOnExist: true });
    }

    const assetsDirectory = path.join(options.libraryRoot, "assets");
    const questionsDirectory = path.join(options.libraryRoot, "questions");
    await mkdir(assetsDirectory, { recursive: true });

    for (const asset of generatedAssets) {
      await copyFile(
        path.join(stagingAssetsDirectory, asset.file),
        path.join(assetsDirectory, asset.file)
      );
    }

    for (const questionItem of loaded.questions) {
      if (!targetDocumentIds.has(questionItem.value.documentId)) {
        continue;
      }

      await writeAtomic(
        path.join(questionsDirectory, questionItem.entry.file),
        `${JSON.stringify(questionItem.value, null, 2)}\n`
      );
    }

    const removedAssetFiles = loaded.catalog.assetFiles.filter(
      (asset) => asset.kind === "question_crop" && targetDocumentIds.has(asset.documentId)
    );
    const nextCatalog = {
      ...loaded.catalog,
      revision: loaded.catalog.revision + 1,
      updatedAt: new Date().toISOString(),
      assetFiles: loaded.catalog.assetFiles
        .filter(
          (asset) => !(asset.kind === "question_crop" && targetDocumentIds.has(asset.documentId))
        )
        .concat(generatedAssets)
    };
    await writeAtomic(loaded.catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`);

    const retainedFiles = new Set(nextCatalog.assetFiles.map((asset) => asset.file));
    await Promise.all(
      removedAssetFiles
        .filter((asset) => !retainedFiles.has(asset.file))
        .map((asset) => rm(path.join(assetsDirectory, asset.file), { force: true }))
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          dryRun: false,
          previousRevision: loaded.catalog.revision,
          revision: nextCatalog.revision,
          targetDpi: TARGET_DPI,
          questionCount: summaries.reduce((total, item) => total + item.questionCount, 0),
          fragmentCount: generatedAssets.length,
          backupPath,
          documents: summaries
        },
        null,
        2
      )}\n`
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

await main();
