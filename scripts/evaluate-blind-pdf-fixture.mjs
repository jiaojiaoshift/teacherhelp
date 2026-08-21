#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluateSealedBlindFixture } from "./lib/blind-pdf-fixture-evaluator.mjs";

function parseArguments(args) {
  const values = new Map();
  const allowed = new Set(["--result", "--expectation"]);

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];

    if (!allowed.has(name)) {
      throw new Error(`Unknown argument: ${name ?? "<missing>"}`);
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for argument: ${name}`);
    }
    values.set(name, value);
  }

  if (!values.get("--result") || !values.get("--expectation")) {
    throw new Error("Both --result and --expectation are required");
  }

  return {
    resultDirectory: path.resolve(values.get("--result")),
    expectationPath: path.resolve(values.get("--expectation"))
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const expectation = JSON.parse(await readFile(options.expectationPath, "utf8"));
  const evaluation = await evaluateSealedBlindFixture(
    options.resultDirectory,
    expectation
  );

  process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);
  process.exitCode = evaluation.passed ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(
    `[blind-evaluator] failed: ${error instanceof Error ? error.message : "unknown error"}\n`
  );
  process.exitCode = 1;
});
