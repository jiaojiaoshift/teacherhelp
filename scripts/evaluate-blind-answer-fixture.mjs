#!/usr/bin/env node

import path from "node:path";

import {
  compareSealedBlindAnswerFixtures,
  evaluateSealedBlindAnswerFixture
} from "./lib/blind-answer-fixture-evaluator.mjs";

function parseArguments(args) {
  const allowed = new Set(["--result", "--expectation", "--baseline"]);
  const values = new Map();

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
    expectationPath: path.resolve(values.get("--expectation")),
    baselineDirectory: values.get("--baseline")
      ? path.resolve(values.get("--baseline"))
      : null
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const evaluation = await evaluateSealedBlindAnswerFixture(
    options.resultDirectory,
    options.expectationPath
  );
  const clientComparison = options.baselineDirectory
    ? await compareSealedBlindAnswerFixtures(
        options.baselineDirectory,
        options.resultDirectory
      )
    : null;
  const passed = evaluation.passed && (clientComparison?.passed ?? true);

  process.stdout.write(`${JSON.stringify({
    ...evaluation,
    clientComparison
  }, null, 2)}\n`);
  process.exitCode = passed ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(
    `[blind-answer-evaluator] failed: ${error instanceof Error ? error.message : "unknown error"}\n`
  );
  process.exitCode = 1;
});
