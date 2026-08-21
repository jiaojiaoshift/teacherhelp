import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DesktopLibraryMigrationError,
  migrateLegacyLibraryToDesktop
} from "@/lib/server/desktop-library-migration";
import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";
import { buildEmptyLocalLibrarySnapshot } from "@/lib/services/local-library-contract";

const temporaryDirectories: string[] = [];

async function createFixtureRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-library-migration-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createValidLibrary(directory: string) {
  await new LocalLibraryFilesystemRepository({ rootDirectory: directory }).save({
    expectedRevision: 0,
    snapshot: buildEmptyLocalLibrarySnapshot()
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("desktop library migration", () => {
  it("copies and validates a legacy library before atomically switching the target", async () => {
    const root = await createFixtureRoot();
    const sourceDirectory = path.join(root, "legacy", "library");
    const targetDirectory = path.join(root, "desktop", "library");
    await createValidLibrary(sourceDirectory);

    const result = await migrateLegacyLibraryToDesktop({
      sourceDirectory,
      targetDirectory
    });

    expect(result).toMatchObject({
      status: "migrated",
      sourceDirectory,
      targetDirectory,
      fileCount: 1
    });
    expect(result.byteLength).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[A-F0-9]{64}$/);
    await expect(stat(path.join(sourceDirectory, "catalog.json"))).resolves.toBeDefined();
    expect(await readFile(path.join(targetDirectory, "catalog.json"), "utf8")).toBe(
      await readFile(path.join(sourceDirectory, "catalog.json"), "utf8")
    );
    await expect(
      new LocalLibraryFilesystemRepository({ rootDirectory: targetDirectory }).load()
    ).resolves.toMatchObject({ revision: 1 });
  });

  it("does not overwrite a target directory that already contains data", async () => {
    const root = await createFixtureRoot();
    const sourceDirectory = path.join(root, "legacy", "library");
    const targetDirectory = path.join(root, "desktop", "library");
    await createValidLibrary(sourceDirectory);
    await createValidLibrary(targetDirectory);
    const originalTargetCatalog = await readFile(path.join(targetDirectory, "catalog.json"), "utf8");

    await expect(
      migrateLegacyLibraryToDesktop({ sourceDirectory, targetDirectory })
    ).resolves.toEqual({
      status: "skipped",
      reason: "target_not_empty",
      sourceDirectory,
      targetDirectory
    });
    expect(await readFile(path.join(targetDirectory, "catalog.json"), "utf8")).toBe(
      originalTargetCatalog
    );
  });

  it("does not create a target when the legacy library is missing", async () => {
    const root = await createFixtureRoot();
    const sourceDirectory = path.join(root, "missing", "library");
    const targetDirectory = path.join(root, "desktop", "library");

    await expect(
      migrateLegacyLibraryToDesktop({ sourceDirectory, targetDirectory })
    ).resolves.toEqual({
      status: "skipped",
      reason: "source_missing",
      sourceDirectory,
      targetDirectory
    });
    await expect(stat(targetDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an invalid copied catalog, removes staging data and preserves the source", async () => {
    const root = await createFixtureRoot();
    const sourceDirectory = path.join(root, "legacy", "library");
    const targetDirectory = path.join(root, "desktop", "library");
    await createValidLibrary(sourceDirectory);
    await writeFile(path.join(sourceDirectory, "catalog.json"), "{\"version\":99}\n", "utf8");

    await expect(
      migrateLegacyLibraryToDesktop({ sourceDirectory, targetDirectory })
    ).rejects.toBeInstanceOf(DesktopLibraryMigrationError);
    expect(await readFile(path.join(sourceDirectory, "catalog.json"), "utf8")).toBe(
      "{\"version\":99}\n"
    );
    await expect(stat(targetDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await readdir(path.dirname(targetDirectory))).filter((name) => name.includes(".migration-"))
    ).toEqual([]);
  });
});
