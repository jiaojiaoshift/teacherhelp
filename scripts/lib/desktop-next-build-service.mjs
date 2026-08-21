import { cp, rm, stat } from "node:fs/promises";
import path from "node:path";

export function buildDesktopNextEnvironment({ environment = process.env } = {}) {
  return {
    ...environment,
    TEACHHELPER_DESKTOP_BUILD: "1",
    TEACHHELPER_NEXT_DIST_DIR: ".next-desktop"
  };
}

export function resolveDesktopStandalonePaths(projectRoot) {
  const normalizedProjectRoot = path.resolve(projectRoot);
  const distRoot = path.join(normalizedProjectRoot, ".next-desktop");
  const standaloneRoot = path.join(distRoot, "standalone");

  return {
    projectRoot: normalizedProjectRoot,
    distRoot,
    standaloneRoot,
    serverEntry: path.join(standaloneRoot, "server.js"),
    staticSource: path.join(distRoot, "static"),
    staticTarget: path.join(standaloneRoot, ".next-desktop", "static"),
    publicSource: path.join(normalizedProjectRoot, "public"),
    publicTarget: path.join(standaloneRoot, "public")
  };
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function replaceDirectory(sourceDirectory, targetDirectory) {
  if (!(await pathExists(sourceDirectory))) {
    return;
  }

  await rm(targetDirectory, { recursive: true, force: true });
  await cp(sourceDirectory, targetDirectory, { recursive: true });
}

export async function prepareDesktopStandaloneResources({ projectRoot }) {
  const paths = resolveDesktopStandalonePaths(projectRoot);

  if (!(await pathExists(paths.serverEntry))) {
    throw new Error(`Desktop standalone server is missing: ${paths.serverEntry}`);
  }

  await Promise.all([
    replaceDirectory(paths.staticSource, paths.staticTarget),
    replaceDirectory(paths.publicSource, paths.publicTarget)
  ]);

  return paths;
}
