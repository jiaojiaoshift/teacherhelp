import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildStandaloneBackendLaunchPlan,
  findAvailableLoopbackPort,
  runDesktopLibraryMigration,
  startStandaloneBackend
} from "../desktop/backend-runtime.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next-desktop", "standalone");
const dataRoot = path.resolve(
  process.env.TEACHHELPER_DESKTOP_SMOKE_DATA_ROOT ||
    path.join(projectRoot, "tmp", "desktop-smoke-data")
);
const sessionToken = randomBytes(32).toString("hex");
const port = await findAvailableLoopbackPort();

await mkdir(dataRoot, { recursive: true });

const launchPlan = buildStandaloneBackendLaunchPlan({
  isPackaged: false,
  resourcesPath: projectRoot,
  projectRoot,
  executablePath: process.execPath,
  dataRoot,
  port,
  sessionToken,
  environment: {
    ...process.env,
    TEACHHELPER_LEGACY_LIBRARY_PATH: ""
  }
});
const runtime = await startStandaloneBackend({ launchPlan });

try {
  const migration = await runDesktopLibraryMigration({
    baseUrl: runtime.url,
    sessionToken
  });
  const unauthorizedResponse = await fetch(`${runtime.url}/api/local-library`);
  const cookie = `teachhelper_desktop_session=${sessionToken}`;
  const pageResponse = await fetch(runtime.url, {
    headers: { cookie }
  });
  const pageHtml = await pageResponse.text();
  const stylesheetPath = /<link[^>]+href="([^"]+\.css)"/u.exec(pageHtml)?.[1] ?? null;

  if (!stylesheetPath) {
    throw new Error("Desktop page did not reference one stylesheet");
  }

  const stylesheetResponse = await fetch(new URL(stylesheetPath, runtime.url), {
    headers: { cookie }
  });
  const stylesheet = await stylesheetResponse.text();
  const libraryResponse = await fetch(`${runtime.url}/api/local-library`, {
    headers: { "x-teachhelper-desktop-token": sessionToken }
  });
  const standaloneRequire = createRequire(path.join(standaloneRoot, "package.json"));
  const { createCanvas } = standaloneRequire("@napi-rs/canvas");
  const canvas = createCanvas(2, 2);
  const context = canvas.getContext("2d");
  context.fillStyle = "#00b894";
  context.fillRect(0, 0, 2, 2);
  const pixel = Array.from(context.getImageData(0, 0, 1, 1).data);

  if (
    unauthorizedResponse.status !== 401 ||
    !pageResponse.ok ||
    !pageHtml.includes("智题库") ||
    !stylesheetResponse.ok ||
    stylesheet.length === 0 ||
    !libraryResponse.ok ||
    pixel[3] !== 255
  ) {
    throw new Error("Desktop standalone smoke assertions failed");
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "ok",
      port,
      unauthorizedStatus: unauthorizedResponse.status,
      pageStatus: pageResponse.status,
      stylesheetStatus: stylesheetResponse.status,
      libraryStatus: libraryResponse.status,
      migrationStatus: migration.status,
      nativeCanvas: true
    })}\n`
  );
} finally {
  await runtime.stop();
}
