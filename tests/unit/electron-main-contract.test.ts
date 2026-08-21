import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Electron main-process contract", () => {
  it("owns one standalone backend and one secure application window", () => {
    const mainSource = readProjectFile("desktop/main.cjs");

    expect(mainSource).toContain("requestSingleInstanceLock");
    expect(mainSource).toContain('setPath("userData"');
    expect(mainSource).toContain("resolvePersistentLoopbackPort");
    expect(mainSource).toContain("buildDesktopBackendEnvironment");
    expect(mainSource).toContain("buildStandaloneBackendLaunchPlan");
    expect(mainSource).toContain("startStandaloneBackend");
    expect(mainSource).toContain("cookies.set");
    expect(mainSource).toContain("new BrowserWindow");
    expect(mainSource).toContain('on("will-navigate"');
    expect(mainSource).toContain("setWindowOpenHandler");
    expect(mainSource).toContain('on("before-quit"');
    expect(mainSource).toContain("backendRuntime.stop");
    expect(mainSource).not.toContain("nodeIntegration: true");
  });

  it("exposes only immutable desktop identity from the sandboxed preload", () => {
    const preloadSource = readProjectFile("desktop/preload.cjs");

    expect(preloadSource).toContain("contextBridge.exposeInMainWorld");
    expect(preloadSource).toContain('isDesktop: true');
    expect(preloadSource).not.toContain("ipcRenderer");
    expect(preloadSource).not.toMatch(/require\(["'](?:node:)?fs["']\)/);
    expect(preloadSource).not.toContain("shell");
  });

  it("supports one explicit screenshot smoke run that exits through normal cleanup", () => {
    const mainSource = readProjectFile("desktop/main.cjs");

    expect(mainSource).toContain('process.argv.includes("--smoke-test")');
    expect(mainSource).toContain("capturePage");
    expect(mainSource).toContain("TEACHHELPER_DESKTOP_SMOKE_OUTPUT");
    expect(mainSource).toContain("app.quit()");
  });
});
