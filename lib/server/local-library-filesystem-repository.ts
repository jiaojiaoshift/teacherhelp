import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

import type { BinaryAssetEntity } from "@/lib/domain/entities";
import {
  buildEmptyLocalLibrarySnapshot,
  type LocalLibraryPayload,
  type LocalLibrarySnapshot
} from "@/lib/services/local-library-contract";
import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

export type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";

const CATALOG_VERSION = 1;

interface CatalogEntityFile {
  id: string;
  file: string;
}

interface CatalogAssetFile extends CatalogEntityFile {
  documentId: string;
  pageId: string;
  kind: BinaryAssetEntity["kind"];
  mimeType: string;
  byteLength: number;
}

interface LocalLibraryCatalog {
  version: 1;
  revision: number;
  updatedAt: string;
  folders: LocalLibrarySnapshot["folders"];
  examLibraryFolders: LocalLibrarySnapshot["examLibraryFolders"];
  examWorkspaceDraft: LocalLibrarySnapshot["examWorkspaceDraft"];
  questionFiles: CatalogEntityFile[];
  pageFiles: CatalogEntityFile[];
  examDocumentFiles: CatalogEntityFile[];
  assetFiles: CatalogAssetFile[];
}

interface RepositoryOptions {
  rootDirectory?: string;
}

interface SavedLocalLibrary {
  revision: number;
}

export type LocalLibraryAssetBinary = Blob | ArrayBuffer | Uint8Array;

function isBlobBinary(value: LocalLibraryAssetBinary): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

interface LocalLibraryAsset {
  mimeType: string;
  data: Buffer;
}

const saveQueues = new Map<string, Promise<void>>();

export class LocalLibraryRevisionConflictError extends Error {
  readonly actualRevision: number;

  constructor(actualRevision: number) {
    super(`Local library revision conflict: current revision is ${actualRevision}`);
    this.name = "LocalLibraryRevisionConflictError";
    this.actualRevision = actualRevision;
  }
}

function stableFileStem(id: string) {
  return createHash("sha256").update(id).digest("hex").slice(0, 32);
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

function decodeDataUrl(dataUrl: string): { mimeType: string; data: Buffer } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    return null;
  }

  const mimeType = match[1] || "application/octet-stream";
  const data = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");

  return { mimeType, data };
}

function isLocalAssetUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value, "http://localhost");
    return parsed.pathname === "/api/local-library/asset" && Boolean(parsed.searchParams.get("id"));
  } catch {
    return false;
  }
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomic(filePath: string, content: string | Buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
}

function binaryLength(content: LocalLibraryAssetBinary) {
  if (isBlobBinary(content)) {
    return content.size;
  }

  return content instanceof ArrayBuffer ? content.byteLength : content.byteLength;
}

async function writeBinaryAtomic(filePath: string, content: LocalLibraryAssetBinary) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    if (isBlobBinary(content) && typeof content.stream === "function") {
      await pipeline(
        Readable.fromWeb(content.stream() as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(temporaryPath)
      );
    } else if (isBlobBinary(content)) {
      await writeFile(temporaryPath, new Uint8Array(await content.arrayBuffer()));
    } else if (content instanceof ArrayBuffer) {
      await writeFile(temporaryPath, new Uint8Array(content));
    } else {
      await writeFile(temporaryPath, content);
    }

    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function writeJsonAtomic(filePath: string, value: unknown) {
  await writeAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function removeOrphanFiles(directory: string, retainedFiles: Set<string>) {
  if (!(await pathExists(directory))) {
    return;
  }

  const currentFiles = await readdir(directory);

  await Promise.all(
    currentFiles
      .filter((file) => !retainedFiles.has(file) && !file.endsWith(".tmp"))
      .map((file) => rm(path.join(directory, file), { force: true }))
  );
}

function validateQuestionIds(
  label: string,
  questionIds: string[] | undefined,
  availableQuestionIds: Set<string>
) {
  for (const questionId of questionIds ?? []) {
    if (!availableQuestionIds.has(questionId)) {
      throw new Error(`${label} references unavailable question ${questionId}`);
    }
  }
}

function validateSnapshotReferences(snapshot: LocalLibrarySnapshot) {
  const pageIds = new Set(snapshot.pages.map((page) => page.id));
  const assetIds = new Set(snapshot.binaryAssets.map((asset) => asset.id));
  const questionIds = new Set(snapshot.questionDrafts.map((question) => question.id));

  for (const page of snapshot.pages) {
    if (page.displayAssetId && !assetIds.has(page.displayAssetId)) {
      throw new Error(`Page ${page.id} references unavailable display asset ${page.displayAssetId}`);
    }
  }

  for (const question of snapshot.questionDrafts) {
    for (const pageId of new Set(question.pageIds.concat(question.primaryPageId))) {
      if (!pageIds.has(pageId)) {
        throw new Error(`Question ${question.id} references unavailable page ${pageId}`);
      }
    }

    for (const attachment of question.answerAttachments ?? []) {
      if (!assetIds.has(attachment.assetId)) {
        throw new Error(
          `Question ${question.id} references unavailable answer asset ${attachment.assetId}`
        );
      }
    }

    for (const attachment of question.questionImageAttachments ?? []) {
      if (!assetIds.has(attachment.assetId)) {
        throw new Error(
          `Question ${question.id} references unavailable question image asset ${attachment.assetId}`
        );
      }
    }
  }

  for (const document of snapshot.examLibraryDocuments) {
    validateQuestionIds(`Document ${document.id}`, document.questionIds, questionIds);
    validateQuestionIds(`Document ${document.id}`, document.pendingQuestionIds, questionIds);
    validateQuestionIds(
      `Document ${document.id}`,
      document.pendingManualPlacementQuestionIds,
      questionIds
    );
    document.questionBlocks?.forEach((block) =>
      validateQuestionIds(`Document ${document.id} block ${block.key}`, block.questionIds, questionIds)
    );
    document.pendingQuestionBlocks?.forEach((block) =>
      validateQuestionIds(`Document ${document.id} block ${block.key}`, block.questionIds, questionIds)
    );

    for (const assetId of document.rawPageAssetIds.concat(document.pendingRawPageAssetIds ?? [])) {
      if (!assetIds.has(assetId)) {
        throw new Error(`Document ${document.id} references unavailable raw asset ${assetId}`);
      }
    }

    for (const page of document.uploadedPdfPages ?? []) {
      if (!assetIds.has(page.previewAssetId)) {
        throw new Error(
          `Document ${document.id} references unavailable preview asset ${page.previewAssetId}`
        );
      }
    }
  }
}

export class LocalLibraryFilesystemRepository {
  private readonly rootDirectory: string;
  private readonly catalogPath: string;
  private readonly questionsDirectory: string;
  private readonly pagesDirectory: string;
  private readonly examDocumentsDirectory: string;
  private readonly assetsDirectory: string;

  constructor(options: RepositoryOptions = {}) {
    this.rootDirectory =
      options.rootDirectory ?? resolveTeachHelperStoragePaths().libraryDirectory;
    this.catalogPath = path.join(this.rootDirectory, "catalog.json");
    this.questionsDirectory = path.join(this.rootDirectory, "questions");
    this.pagesDirectory = path.join(this.rootDirectory, "pages");
    this.examDocumentsDirectory = path.join(this.rootDirectory, "exam-documents");
    this.assetsDirectory = path.join(this.rootDirectory, "assets");
  }

  private async readCatalog(): Promise<LocalLibraryCatalog | null> {
    if (!(await pathExists(this.catalogPath))) {
      return null;
    }

    const parsed = JSON.parse(await readFile(this.catalogPath, "utf8")) as LocalLibraryCatalog;

    if (parsed.version !== CATALOG_VERSION || !Number.isInteger(parsed.revision)) {
      throw new Error("Unsupported local library catalog");
    }

    return parsed;
  }

  private async readEntityFiles<T>(
    directory: string,
    entries: CatalogEntityFile[]
  ): Promise<T[]> {
    return Promise.all(
      entries.map(async (entry) => JSON.parse(await readFile(path.join(directory, entry.file), "utf8")) as T)
    );
  }

  async load(): Promise<LocalLibraryPayload> {
    const catalog = await this.readCatalog();

    if (!catalog) {
      return {
        revision: 0,
        snapshot: buildEmptyLocalLibrarySnapshot()
      };
    }

    const [questionDrafts, pages, examLibraryDocuments] = await Promise.all([
      this.readEntityFiles<LocalLibrarySnapshot["questionDrafts"][number]>(
        this.questionsDirectory,
        catalog.questionFiles
      ),
      this.readEntityFiles<LocalLibrarySnapshot["pages"][number]>(
        this.pagesDirectory,
        catalog.pageFiles
      ),
      this.readEntityFiles<LocalLibrarySnapshot["examLibraryDocuments"][number]>(
        this.examDocumentsDirectory,
        catalog.examDocumentFiles
      )
    ]);

    return {
      revision: catalog.revision,
      snapshot: {
        folders: catalog.folders,
        pages,
        binaryAssets: catalog.assetFiles.map((asset) => ({
          id: asset.id,
          documentId: asset.documentId,
          pageId: asset.pageId,
          kind: asset.kind,
          mimeType: asset.mimeType,
          byteLength: asset.byteLength,
          dataUrl: `/api/local-library/asset?id=${encodeURIComponent(asset.id)}`
        })),
        questionDrafts,
        examLibraryFolders: catalog.examLibraryFolders,
        examLibraryDocuments,
        examWorkspaceDraft: catalog.examWorkspaceDraft
      }
    };
  }

  async readAsset(assetId: string): Promise<LocalLibraryAsset | null> {
    const catalog = await this.readCatalog();
    const asset = catalog?.assetFiles.find((entry) => entry.id === assetId);

    if (!asset || path.basename(asset.file) !== asset.file) {
      return null;
    }

    return {
      mimeType: asset.mimeType,
      data: await readFile(path.join(this.assetsDirectory, asset.file))
    };
  }

  async save(input: {
    expectedRevision: number;
    snapshot: LocalLibrarySnapshot;
    assetBlobs?: ReadonlyMap<string, LocalLibraryAssetBinary>;
  }): Promise<SavedLocalLibrary> {
    const previousQueue = saveQueues.get(this.rootDirectory) ?? Promise.resolve();
    let releaseQueue: () => void = () => undefined;
    const currentGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    saveQueues.set(this.rootDirectory, previousQueue.then(() => currentGate));
    await previousQueue;

    try {
      return await this.saveExclusive(input);
    } finally {
      releaseQueue();
    }
  }

  private async saveExclusive(input: {
    expectedRevision: number;
    snapshot: LocalLibrarySnapshot;
    assetBlobs?: ReadonlyMap<string, LocalLibraryAssetBinary>;
  }): Promise<SavedLocalLibrary> {
    const currentCatalog = await this.readCatalog();
    const currentRevision = currentCatalog?.revision ?? 0;

    if (input.expectedRevision !== currentRevision) {
      throw new LocalLibraryRevisionConflictError(currentRevision);
    }

    validateSnapshotReferences(input.snapshot);

    await Promise.all([
      mkdir(this.questionsDirectory, { recursive: true }),
      mkdir(this.pagesDirectory, { recursive: true }),
      mkdir(this.examDocumentsDirectory, { recursive: true }),
      mkdir(this.assetsDirectory, { recursive: true })
    ]);

    const questionFiles = input.snapshot.questionDrafts.map((question) => ({
      id: question.id,
      file: `${stableFileStem(question.id)}.json`
    }));
    const pageFiles = input.snapshot.pages.map((page) => ({
      id: page.id,
      file: `${stableFileStem(page.id)}.json`
    }));
    const examDocumentFiles = input.snapshot.examLibraryDocuments.map((document) => ({
      id: document.id,
      file: `${stableFileStem(document.id)}.json`
    }));

    await Promise.all([
      ...input.snapshot.questionDrafts.map((question, index) =>
        writeJsonAtomic(path.join(this.questionsDirectory, questionFiles[index].file), question)
      ),
      ...input.snapshot.pages.map((page, index) =>
        writeJsonAtomic(path.join(this.pagesDirectory, pageFiles[index].file), page)
      ),
      ...input.snapshot.examLibraryDocuments.map((document, index) =>
        writeJsonAtomic(
          path.join(this.examDocumentsDirectory, examDocumentFiles[index].file),
          document
        )
      )
    ]);

    const currentAssetsById = new Map(
      (currentCatalog?.assetFiles ?? []).map((asset) => [asset.id, asset])
    );
    const assetFiles: CatalogAssetFile[] = [];

    for (const asset of input.snapshot.binaryAssets) {
      const decoded = asset.dataUrl ? decodeDataUrl(asset.dataUrl) : null;
      const currentAsset = currentAssetsById.get(asset.id);
      const binary = input.assetBlobs?.get(asset.id) ?? asset.blob ?? null;
      let file: string;
      let mimeType: string;
      let byteLength: number;

      if (binary) {
        mimeType = asset.mimeType;
        file = `${stableFileStem(asset.id)}${extensionForMimeType(mimeType)}`;
        byteLength = binaryLength(binary);
        await writeBinaryAtomic(path.join(this.assetsDirectory, file), binary);
      } else if (decoded) {
        mimeType = decoded.mimeType || asset.mimeType;
        file = `${stableFileStem(asset.id)}${extensionForMimeType(mimeType)}`;
        byteLength = decoded.data.byteLength;
        await writeAtomic(path.join(this.assetsDirectory, file), decoded.data);
      } else if (
        currentAsset &&
        (isLocalAssetUrl(asset.dataUrl) || asset.dataUrl == null) &&
        (await pathExists(path.join(this.assetsDirectory, currentAsset.file)))
      ) {
        file = currentAsset.file;
        mimeType = currentAsset.mimeType;
        byteLength = currentAsset.byteLength;
      } else {
        throw new Error(`Durable asset data is unavailable for ${asset.id}`);
      }

      assetFiles.push({
        id: asset.id,
        file,
        documentId: asset.documentId,
        pageId: asset.pageId,
        kind: asset.kind,
        mimeType,
        byteLength
      });
    }

    const nextCatalog: LocalLibraryCatalog = {
      version: CATALOG_VERSION,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
      folders: input.snapshot.folders,
      examLibraryFolders: input.snapshot.examLibraryFolders,
      examWorkspaceDraft: input.snapshot.examWorkspaceDraft,
      questionFiles,
      pageFiles,
      examDocumentFiles,
      assetFiles
    };

    await writeJsonAtomic(this.catalogPath, nextCatalog);

    await Promise.all([
      removeOrphanFiles(this.questionsDirectory, new Set(questionFiles.map((entry) => entry.file))),
      removeOrphanFiles(this.pagesDirectory, new Set(pageFiles.map((entry) => entry.file))),
      removeOrphanFiles(
        this.examDocumentsDirectory,
        new Set(examDocumentFiles.map((entry) => entry.file))
      ),
      removeOrphanFiles(this.assetsDirectory, new Set(assetFiles.map((entry) => entry.file)))
    ]);

    return { revision: nextCatalog.revision };
  }
}
