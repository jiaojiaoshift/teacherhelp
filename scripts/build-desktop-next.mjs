import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDesktopNextEnvironment,
  prepareDesktopStandaloneResources,
  resolveDesktopStandalonePaths
} from "./lib/desktop-next-build-service.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paths = resolveDesktopStandalonePaths(projectRoot);
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

await rm(paths.distRoot, { recursive: true, force: true });

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [nextBin, "build"], {
    cwd: projectRoot,
    env: buildDesktopNextEnvironment(),
    stdio: "inherit"
  });

  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  process.exitCode = exitCode;
} else {
  const preparedPaths = await prepareDesktopStandaloneResources({ projectRoot });
  process.stdout.write(`Desktop standalone ready: ${preparedPaths.serverEntry}\n`);
}
