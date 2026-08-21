#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createInstalledTeacherhelpCommand,
  resolveTeacherhelpInstallDirectory
} from "./lib/teacherhelp-command-install-service.mjs";

const currentFilePath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(currentFilePath), "..");

function resolveInstallDirectory() {
  return resolveTeacherhelpInstallDirectory({
    platform: process.platform,
    explicitDirectory: process.argv[2] || process.env.TEACHERHELP_BIN_DIR,
    env: process.env,
    repositoryRoot
  });
}

const installDirectory = resolveInstallDirectory();
mkdirSync(installDirectory, { recursive: true });

if (process.platform === "win32") {
  const commandPath = path.join(installDirectory, "teacherhelp.cmd");

  writeFileSync(
    commandPath,
    createInstalledTeacherhelpCommand({
      platform: process.platform,
      repositoryRoot
    }),
    "utf8"
  );

  console.log(`Installed teacherhelp command: ${commandPath}`);
  console.log("Open a new terminal, then run: teacherhelp");
} else {
  const commandPath = path.join(installDirectory, "teacherhelp");

  writeFileSync(commandPath, createInstalledTeacherhelpCommand({
    platform: process.platform,
    repositoryRoot
  }), {
    encoding: "utf8",
    mode: 0o755
  });

  console.log(`Installed teacherhelp command: ${commandPath}`);
  console.log("Make sure this directory is on PATH, then run: teacherhelp");
}
