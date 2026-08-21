import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildBlindFixturePageId,
  buildBlindFixtureQuestionId,
  getBlindFixtureAiPreviewMaxDimension,
  mergeBlindFixtureQuestions,
  normalizeBlindFixtureCandidates,
  postQuestionDetectionWithImageFallback,
  postJsonWithModelRetry,
  parseBlindFixtureArguments,
  runBlindFixtureAnalysis,
  sealBlindFixtureResult,
  verifyBlindFixtureSeal
} from "../../scripts/lib/blind-pdf-fixture-run-service.mjs";

describe("blind pdf fixture run service", () => {
  it("uses a higher AI preview for double-column pages without changing single-column defaults", () => {
    expect(getBlindFixtureAiPreviewMaxDimension("single_column")).toBe(600);
    expect(getBlindFixtureAiPreviewMaxDimension("double_column")).toBe(1200);
  });

  it("retries a valid empty double-column detection with the original page image", async () => {
    const calls: Array<{ imageDataUrl: string }> = [];
    const payload = await postQuestionDetectionWithImageFallback(
      async (_url, body) => {
        calls.push({ imageDataUrl: body.imageDataUrl });
        return {
          source: { provider: "openai_compatible" },
          textLines: [],
          detections: calls.length === 1
            ? []
            : [{
                id: "draft-1",
                localOrder: 1,
                confidence: 0.9,
                normalizedBBox: { x1: 10, y1: 10, x2: 490, y2: 490 }
              }]
        };
      },
      {
        url: "http://127.0.0.1:3017/api/ai/detect-question-boxes",
        body: {
          pageId: "page-1",
          imageDataUrl: "preview-image",
          subjectScope: "高中物理",
          questionPageLayoutMode: "double_column",
          textLines: []
        },
        fallbackImageDataUrl: "original-image",
        stage: "Question detection for page 1"
      }
    );

    expect(calls).toEqual([
      { imageDataUrl: "preview-image" },
      { imageDataUrl: "original-image" }
    ]);
    expect(payload.detections).toHaveLength(1);
  });

  it("accepts only runtime inputs and exposes no expected-result arguments", () => {
    expect(
      parseBlindFixtureArguments([
        "--pdf",
        "E:/teachhelper/input.pdf",
        "--subject",
        "高中物理",
        "--server",
        "http://127.0.0.1:3017",
        "--output",
        "E:/teachhelper/tmp/run-1",
        "--concurrency",
        "12",
        "--layout",
        "double_column",
        "--resume"
      ])
    ).toEqual({
      pdfPath: path.resolve("E:/teachhelper/input.pdf"),
      subject: "高中物理",
      serverUrl: "http://127.0.0.1:3017",
      outputDirectory: path.resolve("E:/teachhelper/tmp/run-1"),
      concurrency: 12,
      questionPageLayoutMode: "double_column",
      resume: true
    });

    expect(() =>
      parseBlindFixtureArguments([
        "--pdf",
        "input.pdf",
        "--subject",
        "高中物理",
        "--server",
        "http://127.0.0.1:3017",
        "--output",
        "run-1",
        "--expected-count",
        "14"
      ])
    ).toThrow(/unknown argument/i);
  });

  it("scopes deterministic page and detector ids without using the source filename", () => {
    const documentId = "fixture-287129477f02";

    expect(buildBlindFixturePageId(documentId, 1)).toBe("fixture-287129477f02-page-0001");
    expect(buildBlindFixtureQuestionId(`${documentId}-page-0001`, "draft-1")).toBe(
      "fixture-287129477f02-page-0001-draft-1"
    );
    expect(buildBlindFixtureQuestionId(`${documentId}-page-0002`, "draft-1")).toBe(
      "fixture-287129477f02-page-0002-draft-1"
    );
  });

  it("deduplicates equivalent cross-page candidates before merging questions", () => {
    const candidates = normalizeBlindFixtureCandidates([
      {
        id: "model-merge-1",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-1", "q-2"],
        confidence: 0.91,
        status: "suggested"
      },
      {
        id: "edge-merge-1",
        documentId: "doc-1",
        leftPageId: "page-1",
        rightPageId: "page-2",
        sourceQuestionIds: ["q-1", "q-2"],
        confidence: 0.8,
        status: "suggested"
      }
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "page-1--page-2--q-1--q-2",
      confidence: 0.91
    });

    const merged = mergeBlindFixtureQuestions(
      [
        {
          id: "q-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          globalOrder: 1,
          bboxByPage: { "page-1": { x: 10, y: 700, width: 900, height: 250 } }
        },
        {
          id: "q-2",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          globalOrder: 2,
          bboxByPage: { "page-2": { x: 10, y: 20, width: 900, height: 220 } }
        },
        {
          id: "q-3",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          globalOrder: 3,
          bboxByPage: { "page-2": { x: 10, y: 260, width: 900, height: 300 } }
        }
      ],
      candidates
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: "page-1--page-2--q-1--q-2",
      pageIds: ["page-1", "page-2"],
      sourceQuestionIds: ["q-1", "q-2"]
    });
    expect(Object.keys(merged[0].bboxByPage)).toEqual(["page-1", "page-2"]);
  });

  it("retries a fallback response before failing the current page", async () => {
    let calls = 0;
    const payload = await postJsonWithModelRetry(
      async () => {
        calls += 1;
        return calls === 1
          ? { source: { provider: "local_fallback" }, detections: [] }
          : { source: { provider: "openai_compatible" }, detections: [] };
      },
      "http://127.0.0.1:3017/api/ai/detect-question-boxes",
      {},
      "probe page",
      { maxAttempts: 2, delayMs: 0 }
    );

    expect(calls).toBe(2);
    expect(payload.source.provider).toBe("openai_compatible");
  });

  it("seals a completed result and detects later mutation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-run-"));
    const result = {
      schemaVersion: 1,
      status: "completed",
      input: { sha256: "abc123", pageCount: 2 },
      summary: { initialQuestionCount: 3, mergeCount: 1, finalQuestionCount: 2 },
      pagePairs: [{ leftPageNumber: 1, rightPageNumber: 2, candidateCount: 1 }]
    };

    const seal = await sealBlindFixtureResult(directory, result);

    expect(seal.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyBlindFixtureSeal(directory)).resolves.toMatchObject({ valid: true });

    const resultPath = path.join(directory, "sealed-result.json");
    const parsed = JSON.parse(await readFile(resultPath, "utf8"));
    parsed.summary.finalQuestionCount = 99;
    await writeFile(resultPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    await expect(verifyBlindFixtureSeal(directory)).resolves.toMatchObject({ valid: false });
  });

  it("removes a stale failure marker when a resumed run is sealed", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-stale-failure-"));
    await writeFile(path.join(directory, "failure.json"), "{}\n", "utf8");

    await sealBlindFixtureResult(directory, {
      schemaVersion: 1,
      status: "completed",
      input: { sha256: "abc123", pageCount: 1 },
      summary: { initialQuestionCount: 1, mergeCount: 0, finalQuestionCount: 1 }
    });

    await expect(access(path.join(directory, "failure.json"))).rejects.toThrow();
  });

  it("runs page detection before adjacent-pair detection and seals derived results", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-orchestration-"));
    const outputDirectory = path.join(root, "run-1");
    const calls: Array<{ pathname: string; body: Record<string, unknown> }> = [];
    let mergeCalled = false;
    let reconcileCalled = false;
    let normalizeCalled = false;
    const pages = [1, 2, 3].map((pageNumber) => ({
      pageNumber,
      width: 1000,
      height: 1400,
      imageDataUrl: `data:image/png;base64,page-${pageNumber}`,
      aiImageDataUrl: `data:image/jpeg;base64,ai-page-${pageNumber}`,
      textLines: [],
      isBlank: pageNumber === 3
    }));

    const result = await runBlindFixtureAnalysis(
      {
        pdfPath: "E:/teachhelper/input.pdf",
        subject: "高中物理",
        serverUrl: "http://127.0.0.1:3017",
        outputDirectory,
        concurrency: 2,
        questionPageLayoutMode: "double_column"
      },
      {
        renderPdf: async () => ({
          sha256: "287129477f02d5fb",
          byteLength: 1234,
          pages
        }),
        postJson: async (url: string, body: Record<string, unknown>) => {
          const pathname = new URL(url).pathname;
          calls.push({ pathname, body });

          if (pathname.endsWith("detect-question-boxes")) {
            const pageId = String(body.pageId);
            return {
              source: { provider: "openai_compatible" },
              textLines: [],
              detections: [
                {
                  id: "draft-1",
                  localOrder: 1,
                  confidence: 0.9,
                  normalizedBBox: { x1: 80, y1: 80, x2: 920, y2: 1320 },
                  pageId
                }
              ]
            };
          }

          const candidates = body.candidates as Array<{ id: string }>;
          return {
            source: { provider: "openai_compatible" },
            mergeCandidates: [
              {
                id: "merge-1",
                sourceQuestionIds: candidates.map((candidate) => candidate.id),
                confidence: 0.94
              }
            ]
          };
        },
        buildQuestions: (input: {
          documentId: string;
          pageId: string;
          pageLayoutMode: "single_column" | "double_column";
          detections: Array<{ id: string }>;
          globalOrderOffset: number;
        }) => {
          expect(input.pageLayoutMode).toBe("double_column");
          return [{
            id: buildBlindFixtureQuestionId(input.pageId, input.detections[0].id),
            documentId: input.documentId,
            pageIds: [input.pageId],
            primaryPageId: input.pageId,
            localOrder: 1,
            globalOrder: input.globalOrderOffset + 1,
            bboxByPage: {
              [input.pageId]: { x: 80, y: 80, width: 840, height: 1240 }
            }
          }];
        },
        normalizeQuestionLayout: ({ questionPageLayoutMode, questions }) => {
          normalizeCalled = true;
          expect(questionPageLayoutMode).toBe("double_column");
          return questions;
        },
        buildRequestCandidates: ({ pages: pairPages, questions }) =>
          pairPages.flatMap((page) =>
            questions
              .filter((question) => question.pageIds.includes(page.id))
              .map((question) => ({
                id: question.id,
                pageId: page.id,
                localOrder: question.localOrder,
                normalizedBBox: { x1: 80, y1: 80, x2: 920, y2: 920 }
              }))
          ),
        buildEdgeArtifacts: () => ({ questionDrafts: [], candidates: [] }),
        mergeQuestions: (questions, candidates) => {
          mergeCalled = true;
          return mergeBlindFixtureQuestions(questions, candidates);
        },
        reconcileQuestions: ({ questions, questionPageLayoutMode }) => {
          reconcileCalled = true;
          expect(questionPageLayoutMode).toBe("double_column");
          return questions.map((question) => ({ ...question, reconciled: true }));
        }
      }
    );

    expect(calls.map((call) => call.pathname)).toEqual([
      "/api/ai/detect-question-boxes",
      "/api/ai/detect-question-boxes",
      "/api/ai/detect-cross-page"
    ]);
    expect(
      calls
        .filter((call) => call.pathname === "/api/ai/detect-question-boxes")
        .every((call) => call.body.questionPageLayoutMode === "double_column")
    ).toBe(true);
    expect(
      calls
        .filter((call) => call.pathname === "/api/ai/detect-question-boxes")
        .every((call) => String(call.body.imageDataUrl).includes("ai-page-"))
    ).toBe(true);
    expect(
      calls
        .filter((call) => call.pathname === "/api/ai/detect-cross-page")
        .every(
          (call) =>
            String(call.body.leftImageDataUrl).includes("ai-page-") &&
            String(call.body.rightImageDataUrl).includes("ai-page-")
        )
    ).toBe(true);
    expect(result.summary).toEqual({
      initialQuestionCount: 2,
      candidateCount: 1,
      mergeCount: 1,
      finalQuestionCount: 1,
      crossPageBoundaryCount: 1
    });
    expect(result.input).toMatchObject({
      pageCount: 2,
      physicalPageCount: 3,
      ignoredTrailingBlankPages: [3]
    });
    expect(result.crossPageBoundaries).toEqual([
      { leftPageNumber: 1, rightPageNumber: 2 }
    ]);
    expect(mergeCalled).toBe(true);
    expect(normalizeCalled).toBe(true);
    expect(reconcileCalled).toBe(true);
    expect(result.finalQuestions[0]).toMatchObject({ reconciled: true });
    await expect(verifyBlindFixtureSeal(outputDirectory)).resolves.toMatchObject({ valid: true });
  });

  it("resumes from completed page and page-pair checkpoints", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-resume-"));
    const outputDirectory = path.join(root, "run-1");
    const pages = [1, 2].map((pageNumber) => ({
      pageNumber,
      width: 1000,
      height: 1400,
      imageDataUrl: `data:image/png;base64,page-${pageNumber}`,
      aiImageDataUrl: `data:image/jpeg;base64,ai-page-${pageNumber}`,
      textLines: []
    }));
    let callCount = 0;

    const dependencies = {
      renderPdf: async () => ({
        sha256: "resume-fixture-sha",
        byteLength: 100,
        pages
      }),
      postJson: async (url: string, body: Record<string, unknown>) => {
        callCount += 1;
        const pathname = new URL(url).pathname;

        if (pathname.endsWith("detect-question-boxes")) {
          return {
            source: { provider: "openai_compatible" },
            textLines: [],
            detections: [{
              id: "draft-1",
              localOrder: 1,
              confidence: 0.9,
              normalizedBBox: { x1: 80, y1: 80, x2: 920, y2: 920 }
            }]
          };
        }

        const candidates = body.candidates as Array<{ id: string }>;
        return {
          source: { provider: "openai_compatible" },
          mergeCandidates: [{
            id: "merge-1",
            sourceQuestionIds: candidates.map((candidate) => candidate.id),
            confidence: 0.9
          }]
        };
      },
      buildQuestions: (input: {
        documentId: string;
        pageId: string;
        detections: Array<{ id: string }>;
        globalOrderOffset: number;
      }) => [{
        id: buildBlindFixtureQuestionId(input.pageId, input.detections[0].id),
        documentId: input.documentId,
        pageIds: [input.pageId],
        primaryPageId: input.pageId,
        localOrder: 1,
        globalOrder: input.globalOrderOffset + 1,
        bboxByPage: {
          [input.pageId]: { x: 80, y: 80, width: 840, height: 840 }
        }
      }],
      normalizeQuestionLayout: ({ questions }) => questions,
      buildRequestCandidates: ({ pages: pairPages, questions }) =>
        pairPages.flatMap((page) =>
          questions
            .filter((question) => question.pageIds.includes(page.id))
            .map((question) => ({
              id: question.id,
              pageId: page.id,
              localOrder: question.localOrder,
              normalizedBBox: { x1: 80, y1: 80, x2: 920, y2: 920 }
            }))
        ),
      buildEdgeArtifacts: () => ({ questionDrafts: [], candidates: [] }),
      mergeQuestions: (questions, candidates) => mergeBlindFixtureQuestions(questions, candidates),
      reconcileQuestions: ({ questions }) => questions
    };

    const first = await runBlindFixtureAnalysis({
      pdfPath: "E:/teachhelper/input.pdf",
      subject: "高中物理",
      serverUrl: "http://127.0.0.1:3017",
      outputDirectory,
      concurrency: 2
    }, dependencies);

    expect(callCount).toBe(3);

    const callsBeforeResume = callCount;
    const resumed = await runBlindFixtureAnalysis({
      pdfPath: "E:/teachhelper/input.pdf",
      subject: "高中物理",
      serverUrl: "http://127.0.0.1:3017",
      outputDirectory,
      concurrency: 2,
      resume: true
    }, {
      ...dependencies,
      postJson: async () => {
        throw new Error("completed checkpoints should not call the AI");
      }
    });

    expect(callCount).toBe(callsBeforeResume);
    expect(resumed.summary).toEqual(first.summary);
  });

  it("does not reuse a page checkpoint created by an older analysis strategy", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-cache-version-"));
    const outputDirectory = path.join(root, "run-1");
    const page = {
      pageNumber: 1,
      width: 1000,
      height: 1400,
      imageDataUrl: "data:image/png;base64,page-1",
      aiImageDataUrl: "data:image/jpeg;base64,ai-page-1",
      textLines: []
    };
    const dependencies = {
      renderPdf: async () => ({
        sha256: "cache-version-fixture-sha",
        byteLength: 100,
        pages: [page]
      }),
      postJson: async (url: string) => {
        expect(new URL(url).pathname).toBe("/api/ai/detect-question-boxes");
        return {
          source: { provider: "openai_compatible" },
          textLines: [],
          detections: []
        };
      },
      buildQuestions: () => [],
      buildRequestCandidates: () => [],
      buildEdgeArtifacts: () => ({ questionDrafts: [], candidates: [] })
    };

    await runBlindFixtureAnalysis(
      {
        pdfPath: "E:/teachhelper/input.pdf",
        subject: "高中物理",
        serverUrl: "http://127.0.0.1:3017",
        outputDirectory,
        concurrency: 1
      },
      dependencies
    );

    const pageAnalysisPath = path.join(outputDirectory, "page-analysis", "page-0001.json");
    const stalePageAnalysis = JSON.parse(await readFile(pageAnalysisPath, "utf8"));
    delete stalePageAnalysis.analysisVersion;
    await writeFile(pageAnalysisPath, `${JSON.stringify(stalePageAnalysis, null, 2)}\n`, "utf8");

    let resumedDetectionCalls = 0;
    await runBlindFixtureAnalysis(
      {
        pdfPath: "E:/teachhelper/input.pdf",
        subject: "高中物理",
        serverUrl: "http://127.0.0.1:3017",
        outputDirectory,
        concurrency: 1,
        resume: true
      },
      {
        ...dependencies,
        postJson: async () => {
          resumedDetectionCalls += 1;
          return {
            source: { provider: "openai_compatible" },
            textLines: [],
            detections: []
          };
        }
      }
    );

    expect(resumedDetectionCalls).toBe(1);
  });

  it("stops on an AI fallback and does not create a successful seal", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-fallback-"));
    const outputDirectory = path.join(root, "run-1");

    await expect(
      runBlindFixtureAnalysis(
        {
          pdfPath: "E:/teachhelper/input.pdf",
          subject: "高中物理",
          serverUrl: "http://127.0.0.1:3017",
          outputDirectory,
          concurrency: 1
        },
        {
          renderPdf: async () => ({
            sha256: "abc123",
            byteLength: 10,
            pages: [
              {
                pageNumber: 1,
                width: 1000,
                height: 1400,
                imageDataUrl: "data:image/png;base64,page-1",
                textLines: []
              }
            ]
          }),
          postJson: async () => ({
            source: { provider: "local_fallback", reason: "api_request_failed" },
            detections: []
          }),
          buildQuestions: () => [],
          buildRequestCandidates: () => [],
          buildEdgeArtifacts: () => ({ questionDrafts: [], candidates: [] })
        }
      )
    ).rejects.toThrow(/fallback/i);

    await expect(access(path.join(outputDirectory, "seal.json"))).rejects.toThrow();
  });
});
