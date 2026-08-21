import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";

interface MigrationInput {
  sourceDirectory: string;
  targetDirectory: string;
}

interface ManifestEntry {
  relativePath: string;
  byteLength: number;
  sha256: string;
}

export type DesktopLibraryMigrationResult =
  | {
      status: "migrated";
      sourceDirectory: string;
      targetDirectory: string;
      fileCount: number;
      byteLength: number;
      sha256: string;
    }
  | {
      status: "skipped";
      reason: "source_missing" | "target_not_empty" | "same_path";
      sourceDirectory: string;
      targetDirectory: string;
    };

export class DesktopLibraryMigrationError extends Error {
  constructor(cause?: unknown) {
    super("Desktop library migration failed", { cause });
    this.name = "DesktopLibraryMigrationError";
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

async function directoryHasEntries(directory: string) {
  if (!(await pathExists(directory))) {
    return false;
  }

  const details = await stat(directory);
  return !details.isDirectory() || (await readdir(directory)).length > 0;
}

async function listFilesRecursively(
  rootDirectory: string,
  currentDirectory = rootDirectory
): Promise<string[]> {
  const entries = await readdir(currentDirectory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        return listFilesRecursively(rootDirectory, entryPath);
      }

      if (entry.isFile()) {
        return [path.relative(rootDirectory, entryPath).split(path.sep).join("/")];
      }

      throw new Error(`Unsupported library entry: ${entry.name}`);
    })
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

async function buildManifest(rootDirectory: string): Promise<ManifestEntry[]> {
  const files = await listFilesRecursively(rootDirectory);

  return Promise.all(
    files.map(async (relativePath) => {
      const content = await readFile(path.join(rootDirectory, ...relativePath.split("/")));
      return {
        relativePath,
        byteLength: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex").toUpperCase()
      };
    })
  );
}

function summarizeManifest(manifest: ManifestEntry[]) {
  const digest = createHash("sha256");

  for (const entry of manifest) {
    digest.update(entry.relativePath);
    digest.update("\0");
    digest.update(String(entry.byteLength));
    digest.update("\0");
    digest.update(entry.sha256);
    digest.update("\n");
  }

  return {
    fileCount: manifest.length,
    byteLength: manifest.reduce((total, entry) => total + entry.byteLength, 0),
    sha256: digest.digest("hex").toUpperCase()
  };
}

function manifestsMatch(left: ManifestEntry[], right: ManifestEntry[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isNestedPath(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export async function migrateLegacyLibraryToDesktop(
  input: MigrationInput
): Promise<DesktopLibraryMigrationResult> {
  const sourceDirectory = path.resolve(input.sourceDirectory);
  const targetDirectory = path.resolve(input.targetDirectory);

  if (sourceDirectory === targetDirectory) {
    return {
      status: "skipped",
      reason: "same_path",
      sourceDirectory,
      targetDirectory
    };
  }

  if (
    isNestedPath(sourceDirectory, targetDirectory) ||
    isNestedPath(targetDirectory, sourceDirectory)
  ) {
    throw new DesktopLibraryMigrationError(new Error("Migration paths must not be nested"));
  }

  if (!(await pathExists(path.join(sourceDirectory, "catalog.json")))) {
    return {
      status: "skipped",
      reason: "source_missing",
      sourceDirectory,
      targetDirectory
    };
  }

  if (await directoryHasEntries(targetDirectory)) {
    return {
      status: "skipped",
      reason: "target_not_empty",
      sourceDirectory,
      targetDirectory
    };
  }

  await mkdir(path.dirname(targetDirectory), { recursive: true });
  const stagingDirectory = `${targetDirectory}.migration-${randomUUID()}.tmp`;

  try {
    const sourceManifest = await buildManifest(sourceDirectory);
    await cp(sourceDirectory, stagingDirectory, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    const stagingManifest = await buildManifest(stagingDirectory);

    if (!manifestsMatch(sourceManifest, stagingManifest)) {
      throw new Error("Copied library manifest does not match its source");
    }

    await new LocalLibraryFilesystemRepository({
      rootDirectory: stagingDirectory
    }).load();

    if (await pathExists(targetDirectory)) {
      await rm(targetDirectory, { recursive: true, force: false });
    }

    await rename(stagingDirectory, targetDirectory);

    return {
      status: "migrated",
      sourceDirectory,
      targetDirectory,
      ...summarizeManifest(sourceManifest)
    };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error instanceof DesktopLibraryMigrationError
      ? error
      : new DesktopLibraryMigrationError(error);
  }
}
