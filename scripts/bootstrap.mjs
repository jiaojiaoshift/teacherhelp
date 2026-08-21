import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isSupportedNodeVersion } from "./lib/deployment-readiness-service.mjs";
import { buildFreshSetupPlan } from "./lib/fresh-setup-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = new Set(process.argv.slice(2));

if (argv.has("--help") || argv.has("-h")) {
  process.stdout.write(`TeachHelper fresh setup\n\n`);
  process.stdout.write(`  node scripts/bootstrap.mjs [--skip-install] [--skip-build] [--install-command]\n`);
  process.exit(0);
}

if (!isSupportedNodeVersion(process.version)) {
  throw new Error("TeachHelper requires Node.js 20.19 through 24.x; Node.js 22 LTS is recommended.");
}

try {
  await copyFile(
    path.join(root, ".env.example"),
    path.join(root, ".env.local"),
    constants.COPYFILE_EXCL
  );
  process.stdout.write("Created .env.local from .env.example.\n");
} catch (error) {
  if (!error || typeof error !== "object" || error.code !== "EEXIST") {
    throw error;
  }
  process.stdout.write("Kept existing .env.local unchanged.\n");
}

const dataRoot = path.resolve(process.env.TEACHHELPER_DATA_ROOT?.trim() || path.join(root, "data"));
await Promise.all([
  mkdir(path.join(dataRoot, "library"), { recursive: true }),
  mkdir(path.join(dataRoot, "logs"), { recursive: true }),
  mkdir(path.join(dataRoot, "temp"), { recursive: true })
]);

const plan = buildFreshSetupPlan({
  platform: process.platform,
  skipInstall: argv.has("--skip-install"),
  skipBuild: argv.has("--skip-build"),
  installCommand: argv.has("--install-command")
});

for (const step of plan) {
  process.stdout.write(`Running ${step.command} ${step.args.join(" ")}\n`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: root,
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

process.stdout.write("TeachHelper fresh setup completed.\n");
