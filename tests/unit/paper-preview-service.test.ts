import { describe, expect, it } from "vitest";

import { buildPaperPreview } from "@/lib/services/paper-preview-service";

describe("paper-preview-service", () => {
  it("keeps custom numeric labels in the current question order", () => {
    const preview = buildPaperPreview({
      document: {
        numberingMode: "custom_numeric",
        questionIds: ["q-2", "q-1"],
        lectureSpacing: {
          defaultGap: 48,
          perQuestionGapOverrides: {
            "q-2": 96
          }
        }
      },
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "12",
          ocrText: "question one"
        },
        {
          id: "q-2",
          questionNumberLabel: "15",
          ocrText: "question two"
        }
      ]
    });

    expect(preview.sections).toHaveLength(1);
    expect(preview.sections[0]).toMatchObject({
      key: "current-order",
      label: "Current Order"
    });
    expect(preview.sections[0].items.map((item) => item.displayNumber)).toEqual(["15", "12"]);
    expect(preview.sections[0].items.map((item) => item.summaryText)).toEqual([
      "question two",
      "question one"
    ]);
    expect(preview.sections[0].items.map((item) => item.gapAfter)).toEqual([96, 48]);
  });

  it("resequences specialized paper blocks by the current paper order", () => {
    const preview = buildPaperPreview({
      document: {
        numberingMode: "resequence",
        questionIds: ["q-2", "q-1"],
        questionBlocks: [
          {
            key: "dynamics",
            label: "Dynamics",
            questionIds: ["q-2"]
          },
          {
            key: "kinematics",
            label: "Kinematics",
            questionIds: ["q-1"]
          }
        ]
      },
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "12",
          ocrText: "question one"
        },
        {
          id: "q-2",
          questionNumberLabel: "15",
          ocrText: "question two"
        }
      ]
    });

    expect(preview.sections).toHaveLength(2);
    expect(preview.sections[0].label).toBe("Dynamics");
    expect(preview.sections[0].items.map((item) => item.displayNumber)).toEqual(["1"]);
    expect(preview.sections[1].label).toBe("Kinematics");
    expect(preview.sections[1].items.map((item) => item.displayNumber)).toEqual(["2"]);
  });

  it("keeps one empty specialized block visible after manual editing", () => {
    const preview = buildPaperPreview({
      document: {
        numberingMode: "resequence",
        questionIds: ["q-1"],
        questionBlocks: [
          {
            key: "mechanics",
            label: "Mechanics",
            questionIds: ["q-1"]
          },
          {
            key: "optics",
            label: "Optics",
            questionIds: []
          }
        ]
      },
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "12",
          ocrText: "question one"
        }
      ]
    });

    expect(preview.sections).toHaveLength(2);
    expect(preview.sections[1]).toMatchObject({
      key: "optics",
      label: "Optics",
      items: []
    });
  });
});
