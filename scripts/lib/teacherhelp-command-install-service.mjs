import path from "node:path";

export function resolveTeacherhelpInstallDirectory(input) {
  if (input.explicitDirectory) {
    return path.resolve(input.explicitDirectory);
  }

  if (input.platform === "win32") {
    const appData = input.env.APPDATA;

    if (!appData) {
      throw new Error("APPDATA is not set; cannot resolve the Windows npm command directory.");
    }

    return path.join(appData, "npm");
  }

  return path.join(input.env.HOME ?? input.repositoryRoot ?? process.cwd(), ".local", "bin");
}

export function createInstalledTeacherhelpCommand(input) {
  const cliPath = path.join(input.repositoryRoot, "scripts", "teacherhelp-cli.mjs");

  if (input.platform === "win32") {
    return [
      "@echo off",
      "setlocal",
      `node "${cliPath}" %*`
    ].join("\r\n") + "\r\n";
  }

  return [
    "#!/usr/bin/env sh",
    `node "${cliPath}" "$@"`
  ].join("\n") + "\n";
}
