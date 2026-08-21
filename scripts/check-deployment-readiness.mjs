import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDeploymentReadinessReport } from "./lib/deployment-readiness-service.mjs";
import { mergeDeploymentEnvironment } from "./lib/deployment-environment-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredFiles = [
  "package.json",
  "package-lock.json",
  ".env.example",
  "next.config.mjs",
  "branding/teachhelper-icon-source.png",
  "app/icon.png"
];

async function exists(relativePath) {
  return existsPath(path.join(root, relativePath));
}

async function existsPath(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function nearestWritableDirectory(targetPath) {
  let currentPath = path.resolve(targetPath);

  while (true) {
    try {
      await access(currentPath, constants.W_OK);
      return true;
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return false;
      }
      currentPath = parentPath;
    }
  }
}

async function readOptionalFile(targetPath) {
  try {
    return await readFile(targetPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function resolveCodexHome(environment) {
  if (environment.CODEX_HOME?.trim()) {
    return path.resolve(environment.CODEX_HOME);
  }

  return path.join(os.homedir(), ".codex");
}

const packageMetadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const environment = mergeDeploymentEnvironment({
  environment: process.env,
  envFileContent: await readOptionalFile(path.join(root, ".env.local"))
});
const fileStates = await Promise.all(
  requiredFiles.map(async (relativePath) => ({ relativePath, present: await exists(relativePath) }))
);
const codexHome = resolveCodexHome(environment);
const dataRoot = path.resolve(environment.TEACHHELPER_DATA_ROOT?.trim() || path.join(root, "data"));
const report = buildDeploymentReadinessReport({
  nodeVersion: process.version,
  packageVersion: packageMetadata.version,
  platform: process.platform,
  missingRequiredFiles: fileStates.filter((file) => !file.present).map((file) => file.relativePath),
  dataRootWritable: await nearestWritableDirectory(dataRoot),
  hasCodexConfig: await existsPath(path.join(codexHome, "config.toml")),
  hasCodexAuth: await existsPath(path.join(codexHome, "auth.json")),
  environment
});

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`TeachHelper deployment check: ${report.status}\n`);
  for (const check of report.checks) {
    process.stdout.write(`[${check.status.toUpperCase()}] ${check.id}: ${check.message}\n`);
  }
}

if (report.status === "blocked") {
  process.exitCode = 1;
}
