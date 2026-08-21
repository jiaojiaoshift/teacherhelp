import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  compareSealedBlindAnswerFixtures,
  evaluateSealedBlindAnswerFixture
} from "../../scripts/lib/blind-answer-fixture-evaluator.mjs";
import { sealBlindAnswerFixtureResult } from "../../scripts/lib/blind-answer-fixture-run-service.mjs";

function completedResult(clientKind = "web") {
  return {
    schemaVersion: 1,
    status: "completed",
    clientKind,
    input: {
      sha256: "abc123",
      documentId: "doc-1",
      answerStartPage: 15
    },
    summary: {
      questionCount: 3,
      answeredQuestionCount: 3,
      attachmentCount: 5,
      missingAssetCount: 0
    },
    questions: [
      { questionLabel: "1", answerPageNumbers: [15, 16], attachments: [] },
      { questionLabel: "2", answerPageNumbers: [16], attachments: [] },
      { questionLabel: "3", answerPageNumbers: [17, 18], attachments: [] }
    ],
    answerCrossPageBoundaries: [
      { leftPageNumber: 15, rightPageNumber: 16, questionLabels: ["1"] },
      { leftPageNumber: 17, rightPageNumber: 18, questionLabels: ["3"] }
    ]
  };
}

async function writeExpectation(directory: string) {
  const expectationPath = path.join(directory, "expectation.json");
  await writeFile(
    expectationPath,
    `${JSON.stringify({
      inputSha256: "abc123",
      documentId: "doc-1",
      answerStartPage: 15,
      questionCount: 3,
      questionLabels: ["1", "2", "3"],
      answerCrossPageBoundaries: [
        { leftPageNumber: 15, rightPageNumber: 16 },
        { leftPageNumber: 17, rightPageNumber: 18 }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  return expectationPath;
}

describe("blind answer fixture evaluator", () => {
  it("validates the seal before reading the expectation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-answer-invalid-seal-"));
    const malformedExpectationPath = path.join(directory, "malformed-expectation.json");
    await writeFile(malformedExpectationPath, "not-json", "utf8");

    await expect(
      evaluateSealedBlindAnswerFixture(directory, malformedExpectationPath)
    ).resolves.toMatchObject({ passed: false, sealValid: false });
  });

  it("checks ordered labels, durable assets and exact answer boundaries", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-answer-evaluator-"));
    await sealBlindAnswerFixtureResult(directory, completedResult());
    const expectationPath = await writeExpectation(directory);

    await expect(
      evaluateSealedBlindAnswerFixture(directory, expectationPath)
    ).resolves.toMatchObject({
      passed: true,
      sealValid: true,
      inputMatches: true,
      countMatches: true,
      labelsMatch: true,
      allQuestionsAnswered: true,
      allAssetsPresent: true,
      missingBoundaries: [],
      unexpectedBoundaries: []
    });
  });

  it("reports missing answers, assets, labels and boundary differences", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-answer-difference-"));
    const result = completedResult();
    result.summary.answeredQuestionCount = 2;
    result.summary.missingAssetCount = 1;
    result.questions[1].questionLabel = "4";
    result.questions[1].answerPageNumbers = [];
    result.answerCrossPageBoundaries = [
      { leftPageNumber: 16, rightPageNumber: 17, questionLabels: ["4"] }
    ];
    await sealBlindAnswerFixtureResult(directory, result);
    const expectationPath = await writeExpectation(directory);

    await expect(
      evaluateSealedBlindAnswerFixture(directory, expectationPath)
    ).resolves.toMatchObject({
      passed: false,
      labelsMatch: false,
      allQuestionsAnswered: false,
      allAssetsPresent: false,
      missingQuestionLabels: ["2"],
      unexpectedQuestionLabels: ["4"],
      unansweredQuestionLabels: ["4"],
      missingBoundaries: [
        { leftPageNumber: 15, rightPageNumber: 16 },
        { leftPageNumber: 17, rightPageNumber: 18 }
      ],
      unexpectedBoundaries: [{ leftPageNumber: 16, rightPageNumber: 17 }]
    });
  });

  it("compares Web and Electron question-to-page mappings after validating both seals", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-answer-clients-"));
    const webDirectory = path.join(root, "web");
    const desktopDirectory = path.join(root, "desktop");
    await sealBlindAnswerFixtureResult(webDirectory, completedResult("web"));
    await sealBlindAnswerFixtureResult(desktopDirectory, completedResult("desktop"));

    await expect(
      compareSealedBlindAnswerFixtures(webDirectory, desktopDirectory)
    ).resolves.toMatchObject({
      passed: true,
      leftSealValid: true,
      rightSealValid: true,
      mappingMatches: true,
      differences: []
    });
  });
});
