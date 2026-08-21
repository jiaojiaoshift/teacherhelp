#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForServerReady } from "./lib/teacherhelp-launcher-service.mjs";
import {
  readTeacherHelpRuntimeMetadata,
  removeTeacherHelpRuntimeMetadata,
  stopTeacherHelpRuntime,
  writeTeacherHelpRuntimeMetadata
} from "./lib/teacherhelp-process-service.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const DEFAULT_AI_MODEL = "gpt-5.6-sol";
const DEFAULT_AI_REASONING_EFFORT = "xhigh";
const LEGACY_AI_MODEL_PATTERN = /^gpt-5\.5(?:$|[-_])/iu;
const runtimeMetadataPath = path.join(projectRoot, "tmp", "teacherhelp-runtime.json");

function isLegacyAiModel(value) {
  return LEGACY_AI_MODEL_PATTERN.test(value?.trim() || "");
}

function resolveStartupModel(value) {
  const configuredModel = value?.trim();
  return configuredModel && !isLegacyAiModel(configuredModel)
    ? configuredModel
    : DEFAULT_AI_MODEL;
}

function resolveStartupReasoning(value, configuredModel) {
  const configuredReasoning = value?.trim();
  return configuredReasoning && !isLegacyAiModel(configuredModel)
    ? configuredReasoning
    : DEFAULT_AI_REASONING_EFFORT;
}

function resolveCodexHome(env = process.env, platform = process.platform) {
  if (env.CODEX_HOME) {
    return env.CODEX_HOME;
  }

  if (platform === "win32") {
    if (env.USERPROFILE) {
      return path.join(env.USERPROFILE, ".codex");
    }

    if (env.APPDATA) {
      return path.join(path.resolve(env.APPDATA, "..", ".."), ".codex");
    }

    return null;
  }

  return env.HOME ? path.join(env.HOME, ".codex") : null;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    host: "0.0.0.0",
    port: "3000",
    openBrowser: true,
    help: false,
    stop: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "-stop" || arg === "--stop") {
      options.stop = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--no-open" || arg === "--no-browser") {
      options.openBrowser = false;
      continue;
    }

    if (arg === "--open") {
      options.openBrowser = true;
      continue;
    }

    if (arg === "--port" || arg === "-p") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--port requires a value.");
      }
      options.port = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      options.port = arg.slice("--port=".length);
      continue;
    }

    if (arg === "--host" || arg === "-H") {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error("--host requires a value.");
      }
      options.host = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  const portNumber = Number(options.port);

  if (!Number.isInteger(portNumber) || portNumber <= 0 || portNumber > 65535) {
    throw new Error(`Invalid port: ${options.port}`);
  }

  return options;
}

function buildPlan(options) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "dev", "--", "-H", options.host, "-p", options.port];
  const browserHost = options.host === "0.0.0.0" ? "localhost" : options.host;

  return {
    action: "start",
    projectRoot,
    url: `http://${browserHost}:${options.port}`,
    openBrowser: options.openBrowser,
    aiProvider: process.env.TEACHHELPER_AI_PROVIDER || "ccswitch",
    aiModel: resolveStartupModel(process.env.TEACHHELPER_AI_MODEL),
    aiReasoningEffort: resolveStartupReasoning(
      process.env.TEACHHELPER_AI_REASONING_EFFORT,
      process.env.TEACHHELPER_AI_MODEL
    ),
    codexHome: resolveCodexHome(),
    command,
    args,
    shell: process.platform === "win32"
  };
}

function buildStopPlan() {
  return {
    action: "stop",
    projectRoot,
    metadataPath: runtimeMetadataPath
  };
}

function printHelp() {
  console.log(`teacherhelp

Start the TeachHelper local web workspace.

Usage:
  teacherhelp
  teacherhelp --port 3015
  teacherhelp --no-open
  teacherhelp -stop

Options:
  --port, -p <port>    Port for Next.js dev server. Default: 3000
  --host, -H <host>    Host for Next.js dev server. Default: 0.0.0.0
  --no-open            Do not open the browser automatically.
  --dry-run            Print the startup plan as JSON without launching.
  -stop, --stop        Stop the TeachHelper process tree started by this command.
  --help, -h           Show this help.
`);
}

function openUrl(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return;
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(opener, [url], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (options.stop) {
    const stopPlan = buildStopPlan();
    if (options.dryRun) {
      console.log(JSON.stringify(stopPlan, null, 2));
      return;
    }

    const result = await stopTeacherHelpRuntime(stopPlan);
    console.log(
      result.status === "stopped"
        ? `TeachHelper stopped (PID ${result.pid}).`
        : "TeachHelper is not running."
    );
    return;
  }

  if (!existsSync(path.join(projectRoot, "package.json"))) {
    throw new Error(`Cannot find package.json under ${projectRoot}.`);
  }

  const plan = buildPlan(options);

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log("Starting TeachHelper web workspace...");
  console.log(`Project: ${plan.projectRoot}`);
  console.log(`URL: ${plan.url}`);
  console.log(`AI model: ${plan.aiModel} (${plan.aiReasoningEffort})`);
  if (plan.codexHome) {
    console.log(`Codex home: ${plan.codexHome}`);
  }
  console.log("Press Ctrl+C to stop the server.");

  if (plan.openBrowser) {
    console.log("Waiting for the web server before opening the browser...");
    waitForServerReady(plan.url)
      .then(() => {
        console.log(`Ready: ${plan.url}`);
        openUrl(plan.url);
      })
      .catch((error) => {
        console.warn(error instanceof Error ? error.message : String(error));
        console.warn(`The server is still running if the terminal shows Next.js ready. Open ${plan.url} manually.`);
      });
  }

  const child = spawn(plan.command, plan.args, {
    cwd: plan.projectRoot,
    env: {
      ...process.env,
      TEACHHELPER_AI_PROVIDER: plan.aiProvider,
      TEACHHELPER_AI_MODEL: plan.aiModel,
      TEACHHELPER_AI_REASONING_EFFORT: plan.aiReasoningEffort,
      ...(plan.codexHome ? { CODEX_HOME: plan.codexHome } : {})
    },
    stdio: "inherit",
    shell: plan.shell
  });

  if (!child.pid) {
    throw new Error("TeachHelper dev server did not expose a process id.");
  }

  await writeTeacherHelpRuntimeMetadata(runtimeMetadataPath, {
    version: 1,
    launcherPid: process.pid,
    serverPid: child.pid,
    projectRoot,
    port: Number(options.port),
    startedAt: new Date().toISOString()
  });

  const clearOwnedRuntimeMetadata = () => {
    const metadata = readTeacherHelpRuntimeMetadata(runtimeMetadataPath);
    if (metadata?.launcherPid === process.pid) {
      removeTeacherHelpRuntimeMetadata(runtimeMetadataPath);
    }
  };

  child.on("error", (error) => {
    clearOwnedRuntimeMetadata();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    clearOwnedRuntimeMetadata();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
