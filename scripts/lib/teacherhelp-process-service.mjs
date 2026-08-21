import { execFile, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

function normalizeRuntimeMetadata(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const metadata = value;
  if (
    metadata.version !== 1 ||
    !Number.isInteger(metadata.launcherPid) ||
    metadata.launcherPid <= 0 ||
    !Number.isInteger(metadata.serverPid) ||
    metadata.serverPid <= 0 ||
    typeof metadata.projectRoot !== "string" ||
    !metadata.projectRoot.trim() ||
    !Number.isInteger(metadata.port) ||
    metadata.port <= 0 ||
    metadata.port > 65535 ||
    typeof metadata.startedAt !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    launcherPid: metadata.launcherPid,
    serverPid: metadata.serverPid,
    projectRoot: path.resolve(metadata.projectRoot),
    port: metadata.port,
    startedAt: metadata.startedAt
  };
}

export function readTeacherHelpRuntimeMetadata(metadataPath) {
  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return normalizeRuntimeMetadata(JSON.parse(readFileSync(metadataPath, "utf8")));
  } catch {
    return null;
  }
}

export async function writeTeacherHelpRuntimeMetadata(metadataPath, metadata) {
  const normalized = normalizeRuntimeMetadata(metadata);
  if (!normalized) {
    throw new Error("Invalid TeachHelper runtime metadata.");
  }

  const directory = path.dirname(metadataPath);
  const temporaryPath = `${metadataPath}.${process.pid}.${Date.now()}.tmp`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, metadataPath);
}

export function removeTeacherHelpRuntimeMetadata(metadataPath) {
  rmSync(metadataPath, { force: true });
}

export function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function verifyTeacherHelpLauncherProcess(
  pid,
  projectRoot,
  platform = process.platform
) {
  const expectedScript = path
    .join(path.resolve(projectRoot), "scripts", "teacherhelp-cli.mjs")
    .toLowerCase();

  try {
    if (platform === "win32") {
      const command = [
        `$process = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"`,
        "if ($null -ne $process) { [Console]::Out.Write($process.CommandLine) }"
      ].join("; ");
      const commandLine = readProcessOutput("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        command
      ]);
      return commandLine.toLowerCase().includes(expectedScript);
    }

    const commandLine = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    return commandLine.toLowerCase().includes(expectedScript);
  } catch {
    return false;
  }
}

function readProcessOutput(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    windowsHide: true
  });
}

export function killTeacherHelpProcessTree(pid, platform = process.platform) {
  if (platform !== "win32") {
    process.kill(pid, "SIGTERM");
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    execFile(
      "taskkill.exe",
      ["/PID", String(pid), "/T", "/F"],
      { windowsHide: true },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

export async function stopTeacherHelpRuntime(input) {
  const metadata = readTeacherHelpRuntimeMetadata(input.metadataPath);
  if (!metadata) {
    return { status: "not_running", pid: null };
  }

  if (path.resolve(metadata.projectRoot) !== path.resolve(input.projectRoot)) {
    throw new Error("Recorded TeachHelper process does not belong to this project.");
  }

  const processIsRunning = input.isProcessRunning ?? isProcessRunning;
  if (!processIsRunning(metadata.launcherPid)) {
    removeTeacherHelpRuntimeMetadata(input.metadataPath);
    return { status: "not_running", pid: metadata.launcherPid };
  }

  const verifyProcess = input.verifyProcess ?? verifyTeacherHelpLauncherProcess;
  if (!verifyProcess(metadata.launcherPid, input.projectRoot)) {
    throw new Error("Recorded PID is not the TeachHelper launcher for this project.");
  }

  const killProcessTree = input.killProcessTree ?? killTeacherHelpProcessTree;
  await killProcessTree(metadata.launcherPid);
  removeTeacherHelpRuntimeMetadata(input.metadataPath);

  return { status: "stopped", pid: metadata.launcherPid };
}
