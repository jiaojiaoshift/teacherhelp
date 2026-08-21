import { spawn } from "node:child_process";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [nextBin, "build"], {
    cwd: root,
    env: {
      ...process.env,
      TEACHHELPER_STANDALONE_BUILD: "1"
    },
    stdio: "inherit"
  });
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  process.exitCode = exitCode;
} else {
  const standaloneRoot = path.join(root, ".next", "standalone");
  const staticTarget = path.join(standaloneRoot, ".next", "static");
  await mkdir(path.dirname(staticTarget), { recursive: true });
  await cp(path.join(root, ".next", "static"), staticTarget, { recursive: true });

  try {
    await access(path.join(root, "public"));
    await cp(path.join(root, "public"), path.join(standaloneRoot, "public"), {
      recursive: true
    });
  } catch {
    // App Router metadata assets do not require a public directory.
  }

  process.stdout.write(`Web standalone ready: ${path.join(standaloneRoot, "server.js")}\n`);
}
