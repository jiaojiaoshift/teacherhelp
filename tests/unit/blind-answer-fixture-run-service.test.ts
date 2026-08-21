import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildBlindAnswerFixtureResult,
  parseBlindAnswerFixtureArguments,
  postAnswerStageMultipart,
  runBlindAnswerFixture,
  sealBlindAnswerFixtureResult,
  verifyBlindAnswerFixtureSeal
} from "../../scripts/lib/blind-answer-fixture-run-service.mjs";

describe("blind answer fixture run service", () => {
  it("accepts runtime inputs but rejects expected-result arguments", () => {
    expect(
      parseBlindAnswerFixtureArguments([
        "--pdf",
        "E:/teachhelper/input.pdf",
        "--library",
        "E:/teachhelper/data/run-1/library",
        "--document-id",
        "doc-1",
        "--answer-start-page",
        "15",
        "--server",
        "http://127.0.0.1:3018",
        "--output",
        "E:/teachhelper/tmp/run-1/result",
        "--client",
        "web"
      ])
    ).toEqual({
      pdfPath: path.resolve("E:/teachhelper/input.pdf"),
      libraryDirectory: path.resolve("E:/teachhelper/data/run-1/library"),
      documentId: "doc-1",
      answerStartPage: 15,
      serverUrl: "http://127.0.0.1:3018",
      outputDirectory: path.resolve("E:/teachhelper/tmp/run-1/result"),
      clientKind: "web"
    });

    expect(() =>
      parseBlindAnswerFixtureArguments([
        "--pdf",
        "input.pdf",
        "--library",
        "library",
        "--document-id",
        "doc-1",
        "--answer-start-page",
        "15",
        "--server",
        "http://127.0.0.1:3018",
        "--output",
        "result",
        "--expected-count",
        "35"
      ])
    ).toThrow(/unknown argument/i);
  });

  it("posts the production multipart contract without exposing reference data", async () => {
    const pdfBytes = Buffer.from("fixture-pdf");
    let capturedUrl = "";
    let capturedFormData: FormData | null = null;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedFormData = init?.body as FormData;
      return new Response(
        JSON.stringify({
          revision: 275,
          questionCount: 2,
          answeredQuestionCount: 2,
          attachmentCount: 3,
          answerPageCount: 2,
          source: "native_pdf_text"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    await expect(
      postAnswerStageMultipart(
        {
          serverUrl: "http://127.0.0.1:3018/",
          pdfBytes,
          pdfFileName: "input.pdf",
          documentId: "doc-1",
          expectedRevision: 274,
          answerStartPage: 15
        },
        { fetchImpl }
      )
    ).resolves.toMatchObject({ revision: 275, attachmentCount: 3 });

    expect(capturedUrl).toBe(
      "http://127.0.0.1:3018/api/local-library/resume-answer-stage"
    );
    expect(capturedFormData?.get("documentId")).toBe("doc-1");
    expect(capturedFormData?.get("expectedRevision")).toBe("274");
    expect(capturedFormData?.get("answerStartPage")).toBe("15");
    const file = capturedFormData?.get("file") as File;
    expect(file.name).toBe("input.pdf");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(pdfBytes);
    expect(Array.from(capturedFormData?.keys() ?? []).sort()).toEqual([
      "answerStartPage",
      "documentId",
      "expectedRevision",
      "file"
    ]);
  });

  it("derives absolute answer pages and cross-page boundaries from durable attachments", () => {
    const result = buildBlindAnswerFixtureResult({
      clientKind: "web",
      pdf: {
        path: "E:/teachhelper/input.pdf",
        sha256: "abc123",
        byteLength: 1234
      },
      documentId: "doc-1",
      answerStartPage: 15,
      initialRevision: 274,
      finalRevision: 275,
      routeResult: {
        revision: 275,
        questionCount: 3,
        answeredQuestionCount: 3,
        attachmentCount: 5,
        answerPageCount: 3,
        source: "native_pdf_text"
      },
      questions: [
        {
          id: "q-1",
          globalOrder: 1,
          questionNumberLabel: "1",
          answerAttachments: [
            { id: "a-1", assetId: "asset-1", kind: "matched" },
            { id: "a-2", assetId: "asset-2", kind: "matched" }
          ]
        },
        {
          id: "q-2",
          globalOrder: 2,
          questionNumberLabel: "2",
          answerAttachments: [{ id: "a-3", assetId: "asset-3", kind: "matched" }]
        },
        {
          id: "q-3",
          globalOrder: 3,
          questionNumberLabel: "3",
          answerAttachments: [
            { id: "a-4", assetId: "asset-4", kind: "matched" },
            { id: "a-5", assetId: "asset-5", kind: "matched" }
          ]
        }
      ],
      assets: [
        { id: "asset-1", pageId: "durable-answer-page-doc-1-15", fileExists: true },
        { id: "asset-2", pageId: "durable-answer-page-doc-1-16", fileExists: true },
        { id: "asset-3", pageId: "durable-answer-page-doc-1-16", fileExists: true },
        { id: "asset-4", pageId: "durable-answer-page-doc-1-17", fileExists: true },
        { id: "asset-5", pageId: "durable-answer-page-doc-1-18", fileExists: false }
      ]
    });

    expect(result.questions.map(({ questionLabel, answerPageNumbers }) => ({
      questionLabel,
      answerPageNumbers
    }))).toEqual([
      { questionLabel: "1", answerPageNumbers: [15, 16] },
      { questionLabel: "2", answerPageNumbers: [16] },
      { questionLabel: "3", answerPageNumbers: [17, 18] }
    ]);
    expect(result.answerCrossPageBoundaries).toEqual([
      { leftPageNumber: 15, rightPageNumber: 16, questionLabels: ["1"] },
      { leftPageNumber: 17, rightPageNumber: 18, questionLabels: ["3"] }
    ]);
    expect(result.summary).toMatchObject({
      questionCount: 3,
      answeredQuestionCount: 3,
      attachmentCount: 5,
      missingAssetCount: 1
    });
  });

  it("runs against an untouched revision and seals only the committed library state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-blind-answer-run-"));
    const outputDirectory = path.join(root, "result");
    const stateSequence = [
      {
        revision: 274,
        questions: [
          {
            id: "q-1",
            globalOrder: 1,
            questionNumberLabel: "1",
            answerAttachments: []
          }
        ],
        assets: []
      },
      {
        revision: 275,
        questions: [
          {
            id: "q-1",
            globalOrder: 1,
            questionNumberLabel: "1",
            answerAttachments: [
              { id: "attachment-1", assetId: "asset-1", kind: "matched" }
            ]
          }
        ],
        assets: [
          {
            id: "asset-1",
            pageId: "durable-answer-page-doc-1-15",
            fileExists: true
          }
        ]
      }
    ];
    const loadLibraryState = vi.fn(async () => stateSequence.shift());
    const postAnswerStage = vi.fn(async (input) => ({
      revision: input.expectedRevision + 1,
      questionCount: 1,
      answeredQuestionCount: 1,
      attachmentCount: 1,
      answerPageCount: 1,
      source: "native_pdf_text"
    }));

    const result = await runBlindAnswerFixture(
      {
        pdfPath: path.join(root, "input.pdf"),
        libraryDirectory: path.join(root, "library"),
        documentId: "doc-1",
        answerStartPage: 15,
        serverUrl: "http://127.0.0.1:3018",
        outputDirectory,
        clientKind: "web"
      },
      {
        readPdf: async () => Buffer.from("fixture-pdf"),
        loadLibraryState,
        postAnswerStage
      }
    );

    expect(postAnswerStage).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 274, answerStartPage: 15 })
    );
    expect(result).toMatchObject({
      status: "completed",
      initialRevision: 274,
      finalRevision: 275,
      summary: { answeredQuestionCount: 1, missingAssetCount: 0 }
    });
    expect(loadLibraryState).toHaveBeenCalledTimes(2);
    await expect(verifyBlindAnswerFixtureSeal(outputDirectory)).resolves.toMatchObject({
      valid: true
    });
  });

  it("seals a completed answer result and detects later mutation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-answer-seal-"));
    const result = {
      schemaVersion: 1,
      status: "completed",
      input: { sha256: "abc123" },
      summary: { questionCount: 1 },
      questions: []
    };

    const seal = await sealBlindAnswerFixtureResult(directory, result);
    expect(seal.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(verifyBlindAnswerFixtureSeal(directory)).resolves.toMatchObject({ valid: true });

    const resultPath = path.join(directory, "sealed-result.json");
    const parsed = JSON.parse(await readFile(resultPath, "utf8"));
    parsed.summary.questionCount = 99;
    await writeFile(resultPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

    await expect(verifyBlindAnswerFixtureSeal(directory)).resolves.toMatchObject({ valid: false });
  });
});
