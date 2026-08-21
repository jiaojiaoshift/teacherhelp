import { describe, expect, it } from "vitest";

import { buildNativeAnswerRegions } from "@/lib/services/durable-answer-layout-service";

describe("durable-answer-layout-service", () => {
  it("selects the expected answer sequence and ignores formula-number noise", () => {
    const result = buildNativeAnswerRegions({
      expectedAnswerLabels: ["1", "2", "3"],
      pages: [
        {
          pageNumber: 15,
          textLines: [
            {
              text: "1 D",
              normalizedBBox: { x1: 150, y1: 90, x2: 190, y2: 105 }
            },
            {
              text: "answer one",
              normalizedBBox: { x1: 150, y1: 120, x2: 850, y2: 150 }
            },
            {
              text: "2 . A",
              normalizedBBox: { x1: 150, y1: 360, x2: 200, y2: 375 }
            },
            {
              text: "4 3 2 1",
              normalizedBBox: { x1: 160, y1: 500, x2: 240, y2: 510 }
            },
            {
              text: "3. BC",
              normalizedBBox: { x1: 150, y1: 700, x2: 210, y2: 715 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(true);
    expect(result.missingAnswerLabels).toEqual([]);
    expect(result.regions.map((region) => region.answerLabel)).toEqual(["1", "2", "3"]);
    expect(result.regions[0]).toMatchObject({
      pageNumber: 15,
      normalizedBBox: { y1: 80, y2: 350 }
    });
    expect(result.regions[1]).toMatchObject({
      pageNumber: 15,
      normalizedBBox: { y1: 350, y2: 690 }
    });
  });

  it("creates one region per page when an answer continues onto the next page", () => {
    const result = buildNativeAnswerRegions({
      expectedAnswerLabels: ["8", "9"],
      pages: [
        {
          pageNumber: 16,
          textLines: [
            {
              text: "8. B",
              normalizedBBox: { x1: 150, y1: 810, x2: 200, y2: 825 }
            },
            {
              text: "answer eight starts",
              normalizedBBox: { x1: 150, y1: 840, x2: 850, y2: 880 }
            }
          ]
        },
        {
          pageNumber: 17,
          textLines: [
            {
              text: "answer eight continues",
              normalizedBBox: { x1: 150, y1: 80, x2: 850, y2: 140 }
            },
            {
              text: "9 D",
              normalizedBBox: { x1: 150, y1: 175, x2: 195, y2: 190 }
            },
            {
              text: "answer nine",
              normalizedBBox: { x1: 150, y1: 210, x2: 850, y2: 300 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(true);
    expect(result.regions.filter((region) => region.answerLabel === "8")).toEqual([
      expect.objectContaining({
        pageNumber: 16,
        normalizedBBox: expect.objectContaining({ y1: 800, y2: 1000 })
      }),
      expect.objectContaining({
        pageNumber: 17,
        normalizedBBox: expect.objectContaining({ y1: 0, y2: 165 })
      })
    ]);
    expect(result.regions.find((region) => region.answerLabel === "8" && region.pageNumber === 17)?.ocrText).toContain(
      "answer eight continues"
    );
  });

  it("does not create a blank continuation before the next page answer anchor", () => {
    const result = buildNativeAnswerRegions({
      expectedAnswerLabels: ["18", "19"],
      pages: [
        {
          pageNumber: 20,
          textLines: [
            {
              text: "18. BCD",
              normalizedBBox: { x1: 150, y1: 400, x2: 230, y2: 420 }
            },
            {
              text: "answer eighteen ends on this page",
              normalizedBBox: { x1: 150, y1: 450, x2: 850, y2: 520 }
            }
          ]
        },
        {
          pageNumber: 21,
          textLines: [
            {
              text: "19. BD",
              normalizedBBox: { x1: 150, y1: 80, x2: 220, y2: 100 }
            },
            {
              text: "answer nineteen",
              normalizedBBox: { x1: 150, y1: 130, x2: 850, y2: 220 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(true);
    expect(
      result.regions
        .filter((region) => region.answerLabel === "18")
        .map((region) => region.pageNumber)
    ).toEqual([20]);
  });

  it("ignores small formula-number runs that duplicate an expected answer label", () => {
    const result = buildNativeAnswerRegions({
      expectedAnswerLabels: ["4", "5"],
      pages: [
        {
          pageNumber: 21,
          textLines: [
            {
              text: "4. D",
              normalizedBBox: { x1: 150, y1: 100, x2: 200, y2: 115 }
            },
            {
              text: "formula labels",
              normalizedBBox: { x1: 150, y1: 180, x2: 500, y2: 210 }
            },
            {
              text: "4 3 2 1",
              normalizedBBox: { x1: 160, y1: 300, x2: 240, y2: 307 }
            },
            {
              text: "5. A",
              normalizedBBox: { x1: 150, y1: 500, x2: 200, y2: 515 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(true);
    expect(result.missingAnswerLabels).toEqual([]);
    expect(result.regions.map((region) => region.answerLabel)).toEqual(["4", "5"]);
  });

  it("selects the unique ordered answer-anchor chain when later formulas repeat old labels", () => {
    const result = buildNativeAnswerRegions({
      expectedAnswerLabels: ["1", "2", "3", "4", "5"],
      pages: [
        {
          pageNumber: 15,
          textLines: [
            { text: "1. D", normalizedBBox: { x1: 150, y1: 90, x2: 200, y2: 105 } },
            { text: "2. A", normalizedBBox: { x1: 150, y1: 260, x2: 200, y2: 275 } },
            { text: "3. B", normalizedBBox: { x1: 150, y1: 430, x2: 200, y2: 445 } },
            { text: "4. A", normalizedBBox: { x1: 150, y1: 600, x2: 200, y2: 615 } },
            { text: "5. C", normalizedBBox: { x1: 150, y1: 780, x2: 200, y2: 795 } }
          ]
        },
        {
          pageNumber: 16,
          textLines: [
            {
              text: "4 washing-machine option continuation",
              normalizedBBox: { x1: 205, y1: 260, x2: 850, y2: 275 }
            },
            {
              text: "2 v tan",
              normalizedBBox: { x1: 214, y1: 640, x2: 300, y2: 652 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(true);
    expect(result.missingAnswerLabels).toEqual([]);
    expect(result.regions.map((region) => region.answerLabel)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "5"
    ]);
  });

  it("reports an incomplete native layout instead of guessing a missing answer", () => {
    const result = buildNativeAnswerRegions({
      expectedAnswerLabels: ["1", "2", "3"],
      pages: [
        {
          pageNumber: 15,
          textLines: [
            {
              text: "1. A",
              normalizedBBox: { x1: 150, y1: 90, x2: 200, y2: 105 }
            },
            {
              text: "3. C",
              normalizedBBox: { x1: 150, y1: 500, x2: 200, y2: 515 }
            }
          ]
        }
      ]
    });

    expect(result.complete).toBe(false);
    expect(result.regions).toEqual([]);
    expect(result.missingAnswerLabels).toEqual(["2"]);
  });
});
