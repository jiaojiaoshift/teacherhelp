import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/desktop/migrate-library/route";
import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";
import { buildEmptyLocalLibrarySnapshot } from "@/lib/services/local-library-contract";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(prefix: string) {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("desktop library migration route", () => {
  it("skips safely when the main process did not configure a legacy path", async () => {
    const dataRoot = await createTemporaryDirectory("teachhelper-desktop-route-data-");
    vi.stubEnv("TEACHHELPER_DATA_ROOT", dataRoot);
    vi.stubEnv("TEACHHELPER_LEGACY_LIBRARY_PATH", "");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "skipped",
      reason: "source_not_configured"
    });
  });

  it("migrates from the main-process path without exposing absolute paths", async () => {
    const sourceDirectory = await createTemporaryDirectory(
      "teachhelper-desktop-route-source-"
    );
    const dataRoot = await createTemporaryDirectory("teachhelper-desktop-route-data-");
    await new LocalLibraryFilesystemRepository({ rootDirectory: sourceDirectory }).save({
      expectedRevision: 0,
      snapshot: buildEmptyLocalLibrarySnapshot()
    });
    vi.stubEnv("TEACHHELPER_DATA_ROOT", dataRoot);
    vi.stubEnv("TEACHHELPER_LEGACY_LIBRARY_PATH", sourceDirectory);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "migrated",
      fileCount: 1,
      byteLength: expect.any(Number),
      sha256: expect.stringMatching(/^[A-F0-9]{64}$/)
    });
    expect(JSON.stringify(body)).not.toContain(sourceDirectory);
    expect(JSON.stringify(body)).not.toContain(dataRoot);
    await expect(stat(path.join(dataRoot, "library", "catalog.json"))).resolves.toBeDefined();
    await expect(stat(path.join(sourceDirectory, "catalog.json"))).resolves.toBeDefined();
  });

  it("returns a safe error without creating a target for an invalid source", async () => {
    const sourceDirectory = await createTemporaryDirectory(
      "teachhelper-desktop-route-invalid-"
    );
    const dataRoot = await createTemporaryDirectory("teachhelper-desktop-route-data-");
    await writeFile(path.join(sourceDirectory, "catalog.json"), "{\"version\":99}\n", "utf8");
    vi.stubEnv("TEACHHELPER_DATA_ROOT", dataRoot);
    vi.stubEnv("TEACHHELPER_LEGACY_LIBRARY_PATH", sourceDirectory);

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "desktop_library_migration_failed" });
    await expect(stat(path.join(dataRoot, "library"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
