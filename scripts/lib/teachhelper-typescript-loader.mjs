import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    return nextResolve(specifier, context);
  }

  const unresolvedPath = path.join(PROJECT_ROOT, specifier.slice(2));
  const candidates = [
    unresolvedPath,
    `${unresolvedPath}.ts`,
    `${unresolvedPath}.tsx`,
    `${unresolvedPath}.mjs`,
    `${unresolvedPath}.js`,
    path.join(unresolvedPath, "index.ts"),
    path.join(unresolvedPath, "index.tsx"),
    path.join(unresolvedPath, "index.mjs"),
    path.join(unresolvedPath, "index.js")
  ];
  const resolvedPath = candidates.find((candidate) => existsSync(candidate));

  if (!resolvedPath) {
    return nextResolve(specifier, context);
  }

  return {
    url: pathToFileURL(resolvedPath).href,
    shortCircuit: true
  };
}
