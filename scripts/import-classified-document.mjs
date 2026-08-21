import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

function readArgument(name, fallback = null) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));

  return argument ? argument.slice(prefix.length) : fallback;
}

function buildBackupToken(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function loadProjectModules() {
  const require = createRequire(import.meta.url);
  const jiti = require("jiti")(import.meta.url, {
    alias: {
      "@": process.cwd()
    },
    interopDefault: true
  });
  const repositoryModule = jiti("../lib/server/local-library-filesystem-repository.ts");
  const classificationModule = jiti("../lib/services/classification-service.ts");
  const importModule = jiti("../lib/services/local-library-document-import-service.ts");

  return {
    LocalLibraryFilesystemRepository:
      repositoryModule.LocalLibraryFilesystemRepository,
    applyClassificationResults: classificationModule.applyClassificationResults,
    bulkConfirmQuestions: classificationModule.bulkConfirmQuestions,
    importDocumentIntoLocalLibrary: importModule.importDocumentIntoLocalLibrary
  };
}

async function hydrateDocumentAssets(repository, snapshot, documentId) {
  return Promise.all(
    snapshot.binaryAssets.map(async (asset) => {
      if (asset.documentId !== documentId) {
        return asset;
      }

      const readable = await repository.readAsset(asset.id);
      if (!readable) {
        throw new Error(`Source asset is unavailable: ${asset.id}`);
      }

      return {
        ...asset,
        mimeType: readable.mimeType,
        byteLength: readable.data.byteLength,
        dataUrl: `data:${readable.mimeType};base64,${readable.data.toString("base64")}`
      };
    })
  );
}

function buildAudit(snapshot, documentId) {
  const documentQuestions = snapshot.questionDrafts.filter(
    (question) => question.documentId === documentId
  );
  const topicCounts = documentQuestions.reduce((counts, question) => {
    const topic = question.directoryPath?.at(-1) ?? "unclassified";
    counts[topic] = (counts[topic] ?? 0) + 1;
    return counts;
  }, {});

  return {
    questions: snapshot.questionDrafts.length,
    pages: snapshot.pages.length,
    assets: snapshot.binaryAssets.length,
    examDocuments: snapshot.examLibraryDocuments.length,
    documentQuestions: documentQuestions.length,
    crossPageQuestions: documentQuestions.filter((question) => question.pageIds.length > 1)
      .length,
    topicCounts
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const documentId = readArgument("document-id");
  const sourceRoot = path.resolve(
    readArgument("source-root", "data/fixture-runs/electric-final-candidate")
  );
  const targetRoot = path.resolve(readArgument("target-root", "data/library"));
  const classificationPath = path.resolve(
    readArgument(
      "classification-results",
      "tmp/electrostatics-migration-20260814/classification-results.json"
    )
  );

  if (!documentId) {
    throw new Error("--document-id is required");
  }

  const modules = await loadProjectModules();

  const sourceRepository = new modules.LocalLibraryFilesystemRepository({
      rootDirectory: sourceRoot
    });
    const targetRepository = new modules.LocalLibraryFilesystemRepository({
      rootDirectory: targetRoot
    });
    const [sourcePayload, targetPayload, classificationFile] = await Promise.all([
      sourceRepository.load(),
      targetRepository.load(),
      readFile(classificationPath, "utf8")
    ]);
    const classificationRun = JSON.parse(classificationFile);
    const sourceQuestions = sourcePayload.snapshot.questionDrafts.filter(
      (question) => question.documentId === documentId
    );

    if (
      classificationRun.documentId !== documentId ||
      classificationRun.failedQuestionIds?.length ||
      classificationRun.results?.length !== sourceQuestions.length
    ) {
      throw new Error("Classification result set is incomplete or belongs to another document");
    }

    const classifiedQuestions = modules.applyClassificationResults(
      sourcePayload.snapshot.questionDrafts,
      documentId,
      classificationRun.results
    );
    const confirmedQuestions = modules.bulkConfirmQuestions(
      classifiedQuestions,
      sourceQuestions.map((question) => question.id),
      `maintenance-import-${documentId}`
    ).nextQuestions;
    const source = {
      ...sourcePayload.snapshot,
      questionDrafts: confirmedQuestions,
      binaryAssets: await hydrateDocumentAssets(
        sourceRepository,
        sourcePayload.snapshot,
        documentId
      )
    };
    const nextSnapshot = modules.importDocumentIntoLocalLibrary({
      existing: targetPayload.snapshot,
      source,
      documentId
    });
    const before = buildAudit(targetPayload.snapshot, documentId);
    const after = buildAudit(nextSnapshot, documentId);

    if (after.documentQuestions !== sourceQuestions.length) {
      throw new Error(
        `Document question count mismatch: ${after.documentQuestions}/${sourceQuestions.length}`
      );
    }

    if (!apply) {
      console.log(JSON.stringify({ mode: "dry-run", revision: targetPayload.revision, before, after }, null, 2));
      return;
    }

    const backupRoot = path.resolve(
      "data/backups",
      `library-before-${buildBackupToken(new Date())}`
    );
    await mkdir(path.dirname(backupRoot), { recursive: true });
    await cp(targetRoot, backupRoot, { recursive: true, errorOnExist: true });
    const saved = await targetRepository.save({
      expectedRevision: targetPayload.revision,
      snapshot: nextSnapshot
    });

  console.log(
      JSON.stringify(
        {
          mode: "applied",
          previousRevision: targetPayload.revision,
          revision: saved.revision,
          backupRoot,
          before,
          after
        },
        null,
        2
      )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
