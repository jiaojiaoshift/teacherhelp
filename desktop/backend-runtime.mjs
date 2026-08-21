import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

export function findAvailableLoopbackPort(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: preferredPort, exclusive: true }, () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not resolve an available loopback port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function isMissingFileError(error) {
  return error && typeof error === "object" && error.code === "ENOENT";
}

function parseDesktopOriginPort(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.version !== 1 ||
    !Number.isInteger(value.port) ||
    value.port < 1 ||
    value.port > 65535
  ) {
    throw new Error("TeachHelper desktop origin metadata is invalid");
  }

  return value.port;
}

export async function resolvePersistentLoopbackPort({
  dataRoot,
  findAvailablePort = findAvailableLoopbackPort
}) {
  const metadataPath = path.join(path.resolve(dataRoot), "tasks", "desktop-origin.json");
  let persistedPort = null;

  try {
    persistedPort = parseDesktopOriginPort(JSON.parse(await readFile(metadataPath, "utf8")));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  if (persistedPort !== null) {
    let availablePort;

    try {
      availablePort = await findAvailablePort(persistedPort);
    } catch (error) {
      throw new Error(
        `TeachHelper desktop origin port ${persistedPort} is unavailable`,
        { cause: error }
      );
    }

    if (availablePort !== persistedPort) {
      throw new Error("TeachHelper desktop origin port validation returned another port");
    }

    return persistedPort;
  }

  const selectedPort = await findAvailablePort();
  const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(metadataPath), { recursive: true });
  await writeFile(
    temporaryPath,
    `${JSON.stringify({ version: 1, port: selectedPort }, null, 2)}\n`,
    "utf8"
  );
  await rename(temporaryPath, metadataPath);
  return selectedPort;
}

export function buildStandaloneBackendLaunchPlan(input) {
  const standaloneRoot = input.isPackaged
    ? path.resolve(input.resourcesPath, "backend", "standalone")
    : path.resolve(input.projectRoot, ".next-desktop", "standalone");
  const serverEntry = path.join(standaloneRoot, "server.js");
  const port = String(input.port);

  return {
    command: input.executablePath,
    args: [serverEntry],
    cwd: standaloneRoot,
    url: `http://127.0.0.1:${port}`,
    environment: {
      ...(input.environment ?? process.env),
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: port,
      TEACHHELPER_DATA_ROOT: path.resolve(input.dataRoot),
      TEACHHELPER_DESKTOP_SESSION_TOKEN: input.sessionToken
    }
  };
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function waitForStandaloneBackend({
  baseUrl,
  sessionToken,
  fetchImpl = fetch,
  sleep = defaultSleep,
  timeoutMs = 30_000,
  retryIntervalMs = 150
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/desktop/health`, {
        cache: "no-store",
        headers: {
          "x-teachhelper-desktop-token": sessionToken
        }
      });
      const payload = response.ok ? await response.json().catch(() => null) : null;

      if (payload?.status === "ok" && payload?.service === "teachhelper") {
        return;
      }

      lastError = new Error(`TeachHelper backend returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(retryIntervalMs);
  }

  throw new Error("TeachHelper backend did not become ready", { cause: lastError });
}

export async function runDesktopLibraryMigration({
  baseUrl,
  sessionToken,
  fetchImpl = fetch
}) {
  const response = await fetchImpl(`${baseUrl}/api/desktop/migrate-library`, {
    method: "POST",
    headers: {
      "x-teachhelper-desktop-token": sessionToken
    }
  });
  const payload = await response.json().catch(() => null);

  if (
    !response.ok ||
    !payload ||
    (payload.status !== "migrated" && payload.status !== "skipped")
  ) {
    throw new Error("TeachHelper legacy library migration failed");
  }

  return payload;
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null && child.exitCode !== undefined) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (didExit) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(didExit);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopOwnedChild(child, timeoutMs = 5_000) {
  if (child.exitCode !== null && child.exitCode !== undefined) {
    return;
  }

  child.kill("SIGTERM");
  const exited = await waitForChildExit(child, timeoutMs);

  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child, 1_000);
  }
}

export async function startStandaloneBackend({
  launchPlan,
  spawnImpl = spawn,
  fetchImpl = fetch,
  sleep = defaultSleep,
  healthTimeoutMs = 30_000
}) {
  const child = spawnImpl(launchPlan.command, launchPlan.args, {
    cwd: launchPlan.cwd,
    env: launchPlan.environment,
    stdio: "ignore",
    windowsHide: true
  });

  try {
    await waitForStandaloneBackend({
      baseUrl: launchPlan.url,
      sessionToken: launchPlan.environment.TEACHHELPER_DESKTOP_SESSION_TOKEN,
      fetchImpl,
      sleep,
      timeoutMs: healthTimeoutMs
    });
  } catch (error) {
    await stopOwnedChild(child);
    throw error;
  }

  let stopPromise = null;

  return {
    pid: child.pid ?? null,
    url: launchPlan.url,
    stop() {
      stopPromise ??= stopOwnedChild(child);
      return stopPromise;
    }
  };
}
