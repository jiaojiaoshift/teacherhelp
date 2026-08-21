import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  readTeacherHelpRuntimeMetadata,
  stopTeacherHelpRuntime,
  writeTeacherHelpRuntimeMetadata
} from "../../scripts/lib/teacherhelp-process-service.mjs";

describe("teacherhelp process service", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it("atomically stores only the local launcher metadata needed for stop", async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "teacherhelp-runtime-"));
    roots.push(projectRoot);
    const metadataPath = path.join(projectRoot, "tmp", "teacherhelp-runtime.json");

    await writeTeacherHelpRuntimeMetadata(metadataPath, {
      version: 1,
      launcherPid: 1234,
      serverPid: 1235,
      projectRoot,
      port: 3000,
      startedAt: "2026-08-17T08:00:00.000Z"
    });

    expect(readTeacherHelpRuntimeMetadata(metadataPath)).toEqual({
      version: 1,
      launcherPid: 1234,
      serverPid: 1235,
      projectRoot,
      port: 3000,
      startedAt: "2026-08-17T08:00:00.000Z"
    });
    expect(readFileSync(metadataPath, "utf8")).not.toContain("key");
  });

  it("refuses to stop a pid whose metadata belongs to another project", async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "teacherhelp-runtime-"));
    roots.push(projectRoot);
    const metadataPath = path.join(projectRoot, "tmp", "teacherhelp-runtime.json");
    await writeTeacherHelpRuntimeMetadata(metadataPath, {
      version: 1,
      launcherPid: 1234,
      serverPid: 1235,
      projectRoot: path.join(projectRoot, "another-project"),
      port: 3000,
      startedAt: "2026-08-17T08:00:00.000Z"
    });
    const killProcessTree = vi.fn();

    await expect(
      stopTeacherHelpRuntime({
        metadataPath,
        projectRoot,
        isProcessRunning: () => true,
        verifyProcess: () => true,
        killProcessTree
      })
    ).rejects.toThrow("does not belong");
    expect(killProcessTree).not.toHaveBeenCalled();
  });

  it("verifies and terminates only the recorded launcher process tree", async () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "teacherhelp-runtime-"));
    roots.push(projectRoot);
    const metadataPath = path.join(projectRoot, "tmp", "teacherhelp-runtime.json");
    await writeTeacherHelpRuntimeMetadata(metadataPath, {
      version: 1,
      launcherPid: 4321,
      serverPid: 4322,
      projectRoot,
      port: 3000,
      startedAt: "2026-08-17T08:00:00.000Z"
    });
    const verifyProcess = vi.fn(() => true);
    const killProcessTree = vi.fn(async () => undefined);

    await expect(
      stopTeacherHelpRuntime({
        metadataPath,
        projectRoot,
        isProcessRunning: () => true,
        verifyProcess,
        killProcessTree
      })
    ).resolves.toEqual({ status: "stopped", pid: 4321 });

    expect(verifyProcess).toHaveBeenCalledWith(4321, projectRoot);
    expect(killProcessTree).toHaveBeenCalledWith(4321);
    expect(readTeacherHelpRuntimeMetadata(metadataPath)).toBeNull();
  });
});
