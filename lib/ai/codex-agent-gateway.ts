import { spawn as spawnChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type CodexEnv = Record<string, string | undefined>;

interface CodexExecInvocationInput {
  cwd: string;
  outputLastMessagePath: string;
  imagePaths?: string[];
  env?: CodexEnv;
  platform?: NodeJS.Platform;
  nodeExecPath?: string;
  codexJsPathExists?: boolean;
}

interface CodexExecInvocation {
  command: string;
  args: string[];
  cwd: string;
  shell: boolean;
  env: NodeJS.ProcessEnv;
}

interface CodexJsonAgentSpawnInput {
  command: string;
  args: string[];
  cwd: string;
  shell: boolean;
  env: NodeJS.ProcessEnv;
  prompt: string;
  outputLastMessagePath: string;
  imagePaths: string[];
}

interface CodexJsonAgentInput {
  taskName: string;
  prompt: string;
  imageDataUrls?: string[];
  tmpRoot?: string;
  cwd?: string;
  env?: CodexEnv;
  timeoutMs?: number;
  spawn?: (input: CodexJsonAgentSpawnInput) => Promise<void>;
}

const DEFAULT_CODEX_TIMEOUT_MS = 120_000;

export function isCodexAgentEnabled(env: CodexEnv): boolean {
  return env.TEACHHELPER_AI_PROVIDER?.trim().toLowerCase() === "codex";
}

function getGlobalCodexJsPath(input: {
  env: CodexEnv;
  platform: NodeJS.Platform;
}): string | null {
  if (input.platform === "win32") {
    const appData = input.env.APPDATA;

    if (!appData) {
      return null;
    }

    return path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js"
    );
  }

  return null;
}

function getDefaultCodexHome(input: {
  env: CodexEnv;
  platform: NodeJS.Platform;
}): string | null {
  if (input.env.CODEX_HOME) {
    return input.env.CODEX_HOME;
  }

  if (input.platform === "win32") {
    const userProfile = input.env.USERPROFILE;

    if (userProfile) {
      return path.join(userProfile, ".codex");
    }

    const appData = input.env.APPDATA;

    return appData ? path.join(path.resolve(appData, "..", ".."), ".codex") : null;
  }

  const home = input.env.HOME;

  return home ? path.join(home, ".codex") : null;
}

export function buildCodexExecInvocation(input: CodexExecInvocationInput): CodexExecInvocation {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const imagePaths = input.imagePaths ?? [];
  const globalCodexJsPath = getGlobalCodexJsPath({
    env,
    platform
  });
  const shouldUseGlobalCodexJs =
    Boolean(globalCodexJsPath) &&
    (input.codexJsPathExists ?? (globalCodexJsPath ? existsSync(globalCodexJsPath) : false));
  const command = shouldUseGlobalCodexJs
    ? input.nodeExecPath ?? process.execPath
    : platform === "win32"
      ? "codex.cmd"
      : "codex";
  const args = shouldUseGlobalCodexJs && globalCodexJsPath
    ? [globalCodexJsPath]
    : [];
  const codexHome = getDefaultCodexHome({
    env,
    platform
  });

  args.push(
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--output-last-message",
    input.outputLastMessagePath
  );

  for (const imagePath of imagePaths) {
    args.push("--image", imagePath);
  }

  args.push("-");

  return {
    command,
    args,
    cwd: input.cwd,
    shell: !shouldUseGlobalCodexJs && platform === "win32",
    env: {
      ...process.env,
      ...(codexHome ? { CODEX_HOME: codexHome } : {})
    }
  };
}

function parseDataUrl(dataUrl: string): {
  extension: string;
  content: Buffer;
} {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error("Invalid image data URL for Codex agent.");
  }

  const mimeType = match[1] ?? "image/png";
  const extension = mimeType.includes("jpeg") || mimeType.includes("jpg")
    ? "jpg"
    : mimeType.includes("webp")
      ? "webp"
      : "png";

  return {
    extension,
    content: Buffer.from(match[2], "base64")
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fencedJson = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fencedJson?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("Codex agent did not return JSON.");
    }

    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function runCodexExec(input: CodexJsonAgentSpawnInput & { timeoutMs: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnChildProcess(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      shell: input.shell,
      stdio: ["pipe", "ignore", "pipe"]
    });
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Codex agent timed out."));
    }, input.timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(stderr || `Codex agent exited with code ${code ?? "unknown"}.`));
    });

    child.stdin.end(input.prompt);
  });
}

export async function callCodexJsonAgent<T>(input: CodexJsonAgentInput): Promise<T> {
  const tmpRoot = input.tmpRoot ?? mkdtempSync(path.join(os.tmpdir(), "teachhelper-codex-"));
  mkdirSync(tmpRoot, { recursive: true });

  const imagePaths = (input.imageDataUrls ?? []).map((dataUrl, index) => {
    const parsed = parseDataUrl(dataUrl);
    const imagePath = path.join(tmpRoot, `${input.taskName}-${index + 1}.${parsed.extension}`);
    writeFileSync(imagePath, parsed.content);
    return imagePath;
  });
  const outputLastMessagePath = path.join(tmpRoot, `${input.taskName}-last-message.json`);
  const invocation = buildCodexExecInvocation({
    cwd: input.cwd ?? process.cwd(),
    outputLastMessagePath,
    imagePaths,
    env: input.env ?? process.env
  });
  const prompt = [
    "You are a TeachHelper document-processing subagent.",
    "Return strict JSON only. Do not edit files. Do not include Markdown unless asked by the schema.",
    input.prompt
  ].join("\n\n");

  await (input.spawn ?? ((spawnInput) =>
    runCodexExec({
      ...spawnInput,
      timeoutMs: input.timeoutMs ?? DEFAULT_CODEX_TIMEOUT_MS
    })))({
    ...invocation,
    prompt,
    outputLastMessagePath,
    imagePaths
  });

  return extractJsonObject(readFileSync(outputLastMessagePath, "utf8")) as T;
}
