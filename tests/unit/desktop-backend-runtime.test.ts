import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildStandaloneBackendLaunchPlan,
  findAvailableLoopbackPort,
  runDesktopLibraryMigration,
  startStandaloneBackend,
  waitForStandaloneBackend
} from "../../desktop/backend-runtime.mjs";

class FakeChildProcess extends EventEmitter {
  pid = 4321;
  killed = false;
  killSignals: Array<NodeJS.Signals | number | undefined> = [];

  kill(signal?: NodeJS.Signals | number) {
    this.killed = true;
    this.killSignals.push(signal);
    queueMicrotask(() => this.emit("exit", 0, signal ?? null));
    return true;
  }
}

describe("desktop standalone backend runtime", () => {
  it("asks the operating system for an available loopback port", async () => {
    const port = await findAvailableLoopbackPort();

    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("persists the first random desktop origin port and reuses it after restart", async () => {
    const runtime = (await import("../../desktop/backend-runtime.mjs")) as {
      resolvePersistentLoopbackPort?: (input: {
        dataRoot: string;
        findAvailablePort: (preferredPort?: number) => Promise<number>;
      }) => Promise<number>;
    };
    const dataRoot = await mkdtemp(path.join(tmpdir(), "teachhelper-desktop-port-"));
    const findAvailablePort = vi.fn(async (preferredPort = 0) =>
      preferredPort || 43126
    );

    try {
      expect(runtime.resolvePersistentLoopbackPort).toBeTypeOf("function");
      if (!runtime.resolvePersistentLoopbackPort) {
        return;
      }

      await expect(
        runtime.resolvePersistentLoopbackPort({ dataRoot, findAvailablePort })
      ).resolves.toBe(43126);
      expect(
        JSON.parse(
          await readFile(path.join(dataRoot, "tasks", "desktop-origin.json"), "utf8")
        )
      ).toEqual({ version: 1, port: 43126 });

      await expect(
        runtime.resolvePersistentLoopbackPort({ dataRoot, findAvailablePort })
      ).resolves.toBe(43126);
      expect(findAvailablePort).toHaveBeenNthCalledWith(1);
      expect(findAvailablePort).toHaveBeenNthCalledWith(2, 43126);
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("builds a packaged Electron-as-Node launch plan on loopback", () => {
    const plan = buildStandaloneBackendLaunchPlan({
      isPackaged: true,
      resourcesPath: "C:\\Program Files\\TeachHelper\\resources",
      projectRoot: "E:\\teachhelper",
      executablePath: "C:\\Program Files\\TeachHelper\\TeachHelper.exe",
      dataRoot: "C:\\Users\\Teacher\\AppData\\Local\\TeachHelper",
      port: 43123,
      sessionToken: "session-token",
      environment: { EXISTING_ROUTE: "kept" }
    });

    expect(plan).toMatchObject({
      command: "C:\\Program Files\\TeachHelper\\TeachHelper.exe",
      args: [
        path.resolve(
          "C:\\Program Files\\TeachHelper\\resources",
          "backend",
          "standalone",
          "server.js"
        )
      ],
      cwd: path.resolve(
        "C:\\Program Files\\TeachHelper\\resources",
        "backend",
        "standalone"
      ),
      url: "http://127.0.0.1:43123"
    });
    expect(plan.environment).toMatchObject({
      EXISTING_ROUTE: "kept",
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: "43123",
      TEACHHELPER_DATA_ROOT: path.resolve(
        "C:\\Users\\Teacher\\AppData\\Local\\TeachHelper"
      ),
      TEACHHELPER_DESKTOP_SESSION_TOKEN: "session-token"
    });
  });

  it("uses the isolated source-tree standalone output in desktop development", () => {
    const plan = buildStandaloneBackendLaunchPlan({
      isPackaged: false,
      resourcesPath: "C:\\unused",
      projectRoot: "E:\\teachhelper",
      executablePath: "C:\\Electron\\electron.exe",
      dataRoot: "D:\\TeachHelperData",
      port: 43124,
      sessionToken: "session-token"
    });

    expect(plan.args).toEqual([
      path.resolve("E:\\teachhelper", ".next-desktop", "standalone", "server.js")
    ]);
    expect(plan.cwd).toBe(
      path.resolve("E:\\teachhelper", ".next-desktop", "standalone")
    );
  });

  it("retries health checks with the desktop token until the backend is ready", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("not listening"))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", service: "teachhelper" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );

    await expect(
      waitForStandaloneBackend({
        baseUrl: "http://127.0.0.1:43123",
        sessionToken: "session-token",
        fetchImpl,
        sleep: async () => undefined,
        timeoutMs: 1000
      })
    ).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][1]).toMatchObject({
      headers: { "x-teachhelper-desktop-token": "session-token" }
    });
  });

  it("runs the guarded legacy-library migration before opening the renderer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "skipped", reason: "target_not_empty" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(
      runDesktopLibraryMigration({
        baseUrl: "http://127.0.0.1:43123",
        sessionToken: "session-token",
        fetchImpl
      })
    ).resolves.toEqual({ status: "skipped", reason: "target_not_empty" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:43123/api/desktop/migrate-library",
      {
        method: "POST",
        headers: { "x-teachhelper-desktop-token": "session-token" }
      }
    );
  });

  it("owns and stops only the standalone child process it started", async () => {
    const child = new FakeChildProcess();
    const spawnImpl = vi.fn(() => child);
    const runtime = await startStandaloneBackend({
      launchPlan: buildStandaloneBackendLaunchPlan({
        isPackaged: false,
        resourcesPath: "C:\\unused",
        projectRoot: "E:\\teachhelper",
        executablePath: "C:\\Electron\\electron.exe",
        dataRoot: "D:\\TeachHelperData",
        port: 43125,
        sessionToken: "session-token"
      }),
      spawnImpl,
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok", service: "teachhelper" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      ),
      sleep: async () => undefined
    });

    expect(spawnImpl).toHaveBeenCalledOnce();
    expect(runtime.pid).toBe(4321);
    await runtime.stop();
    expect(child.killSignals).toEqual(["SIGTERM"]);
  });
});
