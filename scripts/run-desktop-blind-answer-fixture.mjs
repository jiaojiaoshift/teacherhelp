#!/usr/bin/env node

import {
  parseDesktopBlindAnswerFixtureArguments,
  postAnswerStageThroughDesktopRenderer
} from "./lib/desktop-answer-fixture-client.mjs";
import { runBlindAnswerFixture } from "./lib/blind-answer-fixture-run-service.mjs";

async function main() {
  const options = parseDesktopBlindAnswerFixtureArguments(process.argv.slice(2));
  const result = await runBlindAnswerFixture(
    {
      pdfPath: options.pdfPath,
      libraryDirectory: options.libraryDirectory,
      documentId: options.documentId,
      answerStartPage: options.answerStartPage,
      serverUrl: "http://desktop-renderer.invalid",
      outputDirectory: options.outputDirectory,
      clientKind: "desktop"
    },
    {
      postAnswerStage: (input) =>
        postAnswerStageThroughDesktopRenderer({
          ...input,
          cdpPort: options.cdpPort,
          timeoutMs: 15 * 60 * 1000
        })
    }
  );

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
    `[desktop-blind-answer] failed: ${error instanceof Error ? error.message : "unknown error"}\n`
  );
  process.exitCode = 1;
});
