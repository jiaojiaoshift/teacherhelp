import { describe, expect, it } from "vitest";

import {
  buildFixturePageEntity,
  buildQuestionClassificationRequest,
  buildClassificationAggregate,
  mapFixtureQuestionBBoxToRenderedPixels,
  getClassificationCheckpointKey
} from "../../scripts/lib/blind-pdf-library-workflow-service.mjs";

describe("blind pdf library workflow service", () => {
  it("builds reviewed page records and one-question classification regions", () => {
    const page = buildFixturePageEntity({
      id: "page-1",
      documentId: "doc-1",
      pageNumber: 3,
      width: 1000,
      height: 1400,
      textLines: []
    });
    const request = buildQuestionClassificationRequest({
      documentId: "doc-1",
      subjectScope: "高中物理",
      directoryPaths: [["高中物理", "曲线运动", "平抛运动基础"]],
      question: {
        id: "q-1",
        primaryPageId: "page-1",
        pageIds: ["page-1"],
        bboxByPage: {
          "page-1": { x: 100, y: 200, width: 400, height: 500 }
        }
      },
      pages: [page],
      imageDataUrls: { "page-1": "data:image/png;base64,page" }
    });

    expect(page).toMatchObject({
      analysisStatus: "done",
      reviewStatus: "reviewed",
      pageNumber: 3
    });
    expect(request).toMatchObject({
      documentId: "doc-1",
      subjectScope: "高中物理",
      pages: [{
        id: "page-1",
        reviewStatus: "reviewed",
        questionIds: ["q-1"],
        questionRegions: [{
          questionId: "q-1",
          isPrimary: true,
          normalizedBBox: { x1: 100, y1: 143, x2: 500, y2: 500 }
        }]
      }]
    });
    expect(request.pages[0].imageDataUrl).toBe("data:image/png;base64,page");
  });

  it("maps a question box to high-resolution rendered pixels without leaving the page", () => {
    expect(
      mapFixtureQuestionBBoxToRenderedPixels({
        bbox: { x: 100, y: 200, width: 400, height: 500 },
        page: { width: 1000, height: 1400 },
        rendered: { width: 4167, height: 5833 }
      })
    ).toEqual({ x: 416, y: 833, width: 1668, height: 2084 });
  });

  it("creates stable checkpoint keys from a document fingerprint and question id", () => {
    expect(getClassificationCheckpointKey("sha-1", "q-1")).toBe(
      getClassificationCheckpointKey("sha-1", "q-1")
    );
    expect(getClassificationCheckpointKey("sha-1", "q-1")).not.toBe(
      getClassificationCheckpointKey("sha-1", "q-2")
    );
  });

  it("keeps failed question ids in the durable classification aggregate", () => {
    const aggregate = buildClassificationAggregate({
      documentId: "doc-1",
      documentSha256: "sha-1",
      questions: [{ id: "q-1" }, { id: "q-2" }],
      resultsByQuestionId: new Map([["q-1", { questionId: "q-1" }]]),
      settled: [
        { value: { questionId: "q-1" } },
        { error: new Error("upstream failed"), questionId: "q-2" }
      ]
    });

    expect(aggregate).toMatchObject({
      status: "failed",
      completedCount: 1,
      failedQuestionIds: ["q-2"],
      results: [{ questionId: "q-1" }]
    });
  });
});
