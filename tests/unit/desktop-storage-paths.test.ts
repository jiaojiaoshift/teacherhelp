import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAiErrorLogDirectory } from "@/lib/ai/ai-error-log";
import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";
import {
  resolveDefaultDesktopDataRoot,
  resolveTeachHelperStoragePaths
} from "@/lib/server/teachhelper-storage-paths";
import { resolveWorkflowEventLogDirectory } from "@/lib/server/workflow-event-log";
import { buildEmptyLocalLibrarySnapshot } from "@/lib/services/local-library-contract";

const originalWorkingDirectory = process.cwd();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.chdir(originalWorkingDirectory);
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("TeachHelper storage paths", () => {
  it("keeps the existing repository-relative paths in ordinary web mode", () => {
    const paths = resolveTeachHelperStoragePaths({
      cwd: "E:\\teachhelper",
      environment: {}
    });

    expect(paths).toEqual({
      dataRoot: path.resolve("E:\\teachhelper", "data"),
      libraryDirectory: path.resolve("E:\\teachhelper", "data", "library"),
      tasksDirectory: path.resolve("E:\\teachhelper", "data", "tasks"),
      backupsDirectory: path.resolve("E:\\teachhelper", "data", "library-backups"),
      logsDirectory: path.resolve("E:\\teachhelper", "logs"),
      tempDirectory: path.resolve("E:\\teachhelper", "tmp"),
      mobileUploadStateFile: path.resolve(
        "E:\\teachhelper",
        "tmp",
        "mobile-upload-helper-state.json"
      ),
      settingsFile: path.resolve("E:\\teachhelper", "data", "settings.json")
    });
  });

  it("resolves the Windows desktop root beneath LOCALAPPDATA", () => {
    expect(
      resolveDefaultDesktopDataRoot({
        platform: "win32",
        environment: {
          LOCALAPPDATA: "C:\\Users\\Teacher\\AppData\\Local"
        },
        homeDirectory: "C:\\Users\\Teacher"
      })
    ).toBe(path.resolve("C:\\Users\\Teacher\\AppData\\Local", "TeachHelper"));
  });

  it("puts all mutable desktop files below an explicit data root", () => {
    const paths = resolveTeachHelperStoragePaths({
      cwd: "E:\\teachhelper",
      environment: {
        TEACHHELPER_DATA_ROOT: "D:\\TeachHelperData"
      }
    });

    expect(paths).toEqual({
      dataRoot: path.resolve("D:\\TeachHelperData"),
      libraryDirectory: path.resolve("D:\\TeachHelperData", "library"),
      tasksDirectory: path.resolve("D:\\TeachHelperData", "tasks"),
      backupsDirectory: path.resolve("D:\\TeachHelperData", "backups"),
      logsDirectory: path.resolve("D:\\TeachHelperData", "logs"),
      tempDirectory: path.resolve("D:\\TeachHelperData", "temp"),
      mobileUploadStateFile: path.resolve(
        "D:\\TeachHelperData",
        "tasks",
        "mobile-upload-helper-state.json"
      ),
      settingsFile: path.resolve("D:\\TeachHelperData", "settings.json")
    });
  });

  it("keeps the dedicated library and helper-state overrides authoritative", () => {
    const paths = resolveTeachHelperStoragePaths({
      cwd: "E:\\teachhelper",
      environment: {
        TEACHHELPER_DATA_ROOT: "D:\\TeachHelperData",
        TEACHHELPER_LOCAL_LIBRARY_PATH: "F:\\QuestionLibrary",
        TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH: "F:\\Runtime\\helper.json"
      }
    });

    expect(paths.libraryDirectory).toBe(path.resolve("F:\\QuestionLibrary"));
    expect(paths.mobileUploadStateFile).toBe(path.resolve("F:\\Runtime\\helper.json"));
  });

  it("routes the default library repository through the desktop data root", async () => {
    const workingDirectory = await mkdtemp(path.join(tmpdir(), "teachhelper-desktop-cwd-"));
    const dataRoot = await mkdtemp(path.join(tmpdir(), "teachhelper-desktop-data-"));
    temporaryDirectories.push(workingDirectory, dataRoot);
    process.chdir(workingDirectory);
    vi.stubEnv("TEACHHELPER_DATA_ROOT", dataRoot);

    await new LocalLibraryFilesystemRepository().save({
      expectedRevision: 0,
      snapshot: buildEmptyLocalLibrarySnapshot()
    });

    await expect(stat(path.join(dataRoot, "library", "catalog.json"))).resolves.toBeDefined();
  });

  it("routes AI and workflow logs through the desktop data root", async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), "teachhelper-desktop-logs-"));
    temporaryDirectories.push(dataRoot);
    vi.stubEnv("TEACHHELPER_DATA_ROOT", dataRoot);

    expect(resolveAiErrorLogDirectory()).toBe(path.join(dataRoot, "logs", "ai-errors"));
    expect(resolveWorkflowEventLogDirectory()).toBe(
      path.join(dataRoot, "logs", "workflows")
    );
  });
});
