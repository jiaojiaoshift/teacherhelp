#!/usr/bin/env node

import {
  parseBlindAnswerFixtureArguments,
  runBlindAnswerFixture
} from "./lib/blind-answer-fixture-run-service.mjs";

async function main() {
  const options = parseBlindAnswerFixtureArguments(process.argv.slice(2));
  const result = await runBlindAnswerFixture(options);

  process.stdout.write(`${JSON.stringify({
    status: result.status,
    clientKind: result.clientKind,
    outputDirectory: options.outputDirectory,
    inputSha256: result.input.sha256,
    initialRevision: result.initialRevision,
    finalRevision: result.finalRevision,
    routeResult: result.routeResult,
    summary: result.summary,
    answerCrossPageBoundaries: result.answerCrossPageBoundaries
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `[blind-answer] failed: ${error instanceof Error ? error.message : "unknown error"}\n`
  );
  process.exitCode = 1;
});
