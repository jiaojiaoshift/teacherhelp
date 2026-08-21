import { readFile } from "node:fs/promises";
import path from "node:path";

import { verifyBlindAnswerFixtureSeal } from "./blind-answer-fixture-run-service.mjs";

function boundaryKey(boundary) {
  return `${boundary.leftPageNumber}-${boundary.rightPageNumber}`;
}

function normalizeBoundaries(boundaries) {
  const unique = new Map();

  for (const boundary of Array.isArray(boundaries) ? boundaries : []) {
    if (
      Number.isInteger(boundary?.leftPageNumber) &&
      Number.isInteger(boundary?.rightPageNumber) &&
      boundary.rightPageNumber === boundary.leftPageNumber + 1
    ) {
      unique.set(boundaryKey(boundary), {
        leftPageNumber: boundary.leftPageNumber,
        rightPageNumber: boundary.rightPageNumber
      });
    }
  }

  return Array.from(unique.values()).sort(
    (left, right) => left.leftPageNumber - right.leftPageNumber
  );
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readSealedResult(directory) {
  return JSON.parse(
    await readFile(path.join(directory, "sealed-result.json"), "utf8")
  );
}

export async function evaluateSealedBlindAnswerFixture(directory, expectationPath) {
  const seal = await verifyBlindAnswerFixtureSeal(directory);

  if (!seal.valid) {
    return {
      passed: false,
      sealValid: false,
      inputMatches: false,
      countMatches: false,
      labelsMatch: false,
      allQuestionsAnswered: false,
      allAssetsPresent: false,
      missingBoundaries: [],
      unexpectedBoundaries: []
    };
  }

  const [result, expectation] = await Promise.all([
    readSealedResult(directory),
    readFile(expectationPath, "utf8").then(JSON.parse)
  ]);
  const actualLabels = result.questions.map((question) => question.questionLabel);
  const expectedLabels = Array.isArray(expectation.questionLabels)
    ? expectation.questionLabels.map(String)
    : [];
  const actualLabelSet = new Set(actualLabels);
  const expectedLabelSet = new Set(expectedLabels);
  const missingQuestionLabels = expectedLabels.filter(
    (label) => !actualLabelSet.has(label)
  );
  const unexpectedQuestionLabels = actualLabels.filter(
    (label) => !expectedLabelSet.has(label)
  );
  const unansweredQuestionLabels = result.questions
    .filter((question) => !Array.isArray(question.answerPageNumbers) || question.answerPageNumbers.length === 0)
    .map((question) => question.questionLabel);
  const expectedBoundaries = normalizeBoundaries(
    expectation.answerCrossPageBoundaries
  );
  const actualBoundaries = normalizeBoundaries(
    result.answerCrossPageBoundaries
  );
  const expectedBoundaryKeys = new Set(expectedBoundaries.map(boundaryKey));
  const actualBoundaryKeys = new Set(actualBoundaries.map(boundaryKey));
  const missingBoundaries = expectedBoundaries.filter(
    (boundary) => !actualBoundaryKeys.has(boundaryKey(boundary))
  );
  const unexpectedBoundaries = actualBoundaries.filter(
    (boundary) => !expectedBoundaryKeys.has(boundaryKey(boundary))
  );
  const inputMatches =
    result.input?.sha256 === expectation.inputSha256 &&
    result.input?.documentId === expectation.documentId &&
    result.input?.answerStartPage === expectation.answerStartPage;
  const countMatches = result.summary?.questionCount === expectation.questionCount;
  const labelsMatch = sameArray(actualLabels, expectedLabels);
  const allQuestionsAnswered =
    unansweredQuestionLabels.length === 0 &&
    result.summary?.answeredQuestionCount === result.summary?.questionCount;
  const allAssetsPresent = result.summary?.missingAssetCount === 0;
  const passed =
    inputMatches &&
    countMatches &&
    labelsMatch &&
    allQuestionsAnswered &&
    allAssetsPresent &&
    missingBoundaries.length === 0 &&
    unexpectedBoundaries.length === 0;

  return {
    passed,
    sealValid: true,
    inputMatches,
    countMatches,
    labelsMatch,
    allQuestionsAnswered,
    allAssetsPresent,
    expectedQuestionCount: expectation.questionCount,
    actualQuestionCount: result.summary?.questionCount ?? null,
    expectedQuestionLabels: expectedLabels,
    actualQuestionLabels: actualLabels,
    missingQuestionLabels,
    unexpectedQuestionLabels,
    unansweredQuestionLabels,
    expectedBoundaries,
    actualBoundaries,
    missingBoundaries,
    unexpectedBoundaries,
    resultSha256: seal.actualSha256
  };
}

function questionPageMapping(result) {
  return result.questions.map((question) => ({
    questionLabel: question.questionLabel,
    answerPageNumbers: question.answerPageNumbers
  }));
}

export async function compareSealedBlindAnswerFixtures(leftDirectory, rightDirectory) {
  const [leftSeal, rightSeal] = await Promise.all([
    verifyBlindAnswerFixtureSeal(leftDirectory),
    verifyBlindAnswerFixtureSeal(rightDirectory)
  ]);

  if (!leftSeal.valid || !rightSeal.valid) {
    return {
      passed: false,
      leftSealValid: leftSeal.valid,
      rightSealValid: rightSeal.valid,
      mappingMatches: false,
      differences: []
    };
  }

  const [leftResult, rightResult] = await Promise.all([
    readSealedResult(leftDirectory),
    readSealedResult(rightDirectory)
  ]);
  const leftMapping = questionPageMapping(leftResult);
  const rightMapping = questionPageMapping(rightResult);
  const rightByLabel = new Map(
    rightMapping.map((question) => [question.questionLabel, question.answerPageNumbers])
  );
  const leftByLabel = new Map(
    leftMapping.map((question) => [question.questionLabel, question.answerPageNumbers])
  );
  const labels = Array.from(
    new Set([...leftByLabel.keys(), ...rightByLabel.keys()])
  );
  const differences = labels.flatMap((questionLabel) => {
    const leftAnswerPageNumbers = leftByLabel.get(questionLabel) ?? null;
    const rightAnswerPageNumbers = rightByLabel.get(questionLabel) ?? null;

    return sameArray(leftAnswerPageNumbers, rightAnswerPageNumbers)
      ? []
      : [{ questionLabel, leftAnswerPageNumbers, rightAnswerPageNumbers }];
  });
  const mappingMatches = differences.length === 0 && sameArray(leftMapping, rightMapping);

  return {
    passed: mappingMatches,
    leftSealValid: true,
    rightSealValid: true,
    mappingMatches,
    differences
  };
}
