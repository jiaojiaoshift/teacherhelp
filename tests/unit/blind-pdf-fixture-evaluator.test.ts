import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateSealedBlindFixture } from "../../scripts/lib/blind-pdf-fixture-evaluator.mjs";
import { sealBlindFixtureResult } from "../../scripts/lib/blind-pdf-fixture-run-service.mjs";

describe("blind pdf fixture evaluator", () => {
  it("compares expectations only after validating the sealed result", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-evaluator-"));

    await sealBlindFixtureResult(directory, {
      schemaVersion: 1,
      status: "completed",
      input: { sha256: "abc123", pageCount: 3 },
      summary: {
        initialQuestionCount: 4,
        candidateCount: 2,
        mergeCount: 2,
        finalQuestionCount: 2,
        crossPageBoundaryCount: 2
      },
      crossPageBoundaries: [
        { leftPageNumber: 1, rightPageNumber: 2 },
        { leftPageNumber: 2, rightPageNumber: 3 }
      ]
    });

    await expect(
      evaluateSealedBlindFixture(directory, {
        finalQuestionCount: 2,
        crossPageBoundaries: [
          { leftPageNumber: 1, rightPageNumber: 2 },
          { leftPageNumber: 2, rightPageNumber: 3 }
        ]
      })
    ).resolves.toMatchObject({
      passed: true,
      sealValid: true,
      missingBoundaries: [],
      unexpectedBoundaries: []
    });
  });

  it("reports count and boundary differences without changing the sealed result", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-difference-"));

    await sealBlindFixtureResult(directory, {
      schemaVersion: 1,
      status: "completed",
      input: { sha256: "abc123", pageCount: 3 },
      summary: { finalQuestionCount: 3 },
      crossPageBoundaries: [{ leftPageNumber: 1, rightPageNumber: 2 }]
    });

    await expect(
      evaluateSealedBlindFixture(directory, {
        finalQuestionCount: 2,
        crossPageBoundaries: [{ leftPageNumber: 2, rightPageNumber: 3 }]
      })
    ).resolves.toMatchObject({
      passed: false,
      countMatches: false,
      missingBoundaries: [{ leftPageNumber: 2, rightPageNumber: 3 }],
      unexpectedBoundaries: [{ leftPageNumber: 1, rightPageNumber: 2 }]
    });
  });
});
