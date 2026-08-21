import { readFile } from "node:fs/promises";
import path from "node:path";

import { verifyBlindFixtureSeal } from "./blind-pdf-fixture-run-service.mjs";

function boundaryKey(boundary) {
  return `${boundary.leftPageNumber}-${boundary.rightPageNumber}`;
}

function normalizeBoundaries(boundaries) {
  if (!Array.isArray(boundaries)) {
    return [];
  }

  const byKey = new Map();

  for (const boundary of boundaries) {
    if (
      Number.isInteger(boundary?.leftPageNumber) &&
      Number.isInteger(boundary?.rightPageNumber) &&
      boundary.rightPageNumber === boundary.leftPageNumber + 1
    ) {
      byKey.set(boundaryKey(boundary), {
        leftPageNumber: boundary.leftPageNumber,
        rightPageNumber: boundary.rightPageNumber
      });
    }
  }

  return Array.from(byKey.values()).sort(
    (left, right) => left.leftPageNumber - right.leftPageNumber
  );
}

export async function evaluateSealedBlindFixture(directory, expectation) {
  const seal = await verifyBlindFixtureSeal(directory);

  if (!seal.valid) {
    return {
      passed: false,
      sealValid: false,
      countMatches: false,
      missingBoundaries: [],
      unexpectedBoundaries: []
    };
  }

  const result = JSON.parse(
    await readFile(path.join(directory, "sealed-result.json"), "utf8")
  );
  const expectedBoundaries = normalizeBoundaries(expectation.crossPageBoundaries);
  const actualBoundaries = normalizeBoundaries(result.crossPageBoundaries);
  const expectedKeys = new Set(expectedBoundaries.map(boundaryKey));
  const actualKeys = new Set(actualBoundaries.map(boundaryKey));
  const missingBoundaries = expectedBoundaries.filter(
    (boundary) => !actualKeys.has(boundaryKey(boundary))
  );
  const unexpectedBoundaries = actualBoundaries.filter(
    (boundary) => !expectedKeys.has(boundaryKey(boundary))
  );
  const countMatches =
    Number.isInteger(expectation.finalQuestionCount) &&
    result.summary?.finalQuestionCount === expectation.finalQuestionCount;

  return {
    passed:
      countMatches &&
      missingBoundaries.length === 0 &&
      unexpectedBoundaries.length === 0,
    sealValid: true,
    countMatches,
    expectedFinalQuestionCount: expectation.finalQuestionCount,
    actualFinalQuestionCount: result.summary?.finalQuestionCount ?? null,
    expectedBoundaries,
    actualBoundaries,
    missingBoundaries,
    unexpectedBoundaries,
    inputSha256: result.input?.sha256 ?? null,
    resultSha256: seal.actualSha256
  };
}
