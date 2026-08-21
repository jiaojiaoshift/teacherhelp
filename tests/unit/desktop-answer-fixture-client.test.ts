import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildDesktopAnswerFixtureExpression,
  parseDesktopBlindAnswerFixtureArguments,
  postAnswerStageThroughDesktopRenderer,
  selectDesktopRendererTarget
} from "../../scripts/lib/desktop-answer-fixture-client.mjs";

describe("desktop answer fixture client", () => {
  it("parses only runtime inputs and rejects expected results", () => {
    expect(
      parseDesktopBlindAnswerFixtureArguments([
        "--pdf",
        "E:/teachhelper/input.pdf",
        "--library",
        "E:/teachhelper/data/desktop-run/library",
        "--document-id",
        "doc-1",
        "--answer-start-page",
        "15",
        "--output",
        "E:/teachhelper/tmp/desktop-run/result",
        "--cdp-port",
        "9333"
      ])
    ).toEqual({
      pdfPath: path.resolve("E:/teachhelper/input.pdf"),
      libraryDirectory: path.resolve("E:/teachhelper/data/desktop-run/library"),
      documentId: "doc-1",
      answerStartPage: 15,
      outputDirectory: path.resolve("E:/teachhelper/tmp/desktop-run/result"),
      cdpPort: 9333
    });

    expect(() =>
      parseDesktopBlindAnswerFixtureArguments([
        "--pdf",
        "input.pdf",
        "--library",
        "library",
        "--document-id",
        "doc-1",
        "--answer-start-page",
        "15",
        "--output",
        "result",
        "--expected-boundary",
        "20-21"
      ])
    ).toThrow(/unknown argument/i);
  });

  it("builds a same-origin renderer request without reading or injecting a session token", () => {
    const expression = buildDesktopAnswerFixtureExpression({
      fixtureUrl: "http://127.0.0.1:54321/fixture.pdf",
      pdfFileName: "input.pdf",
      documentId: "doc-1",
      expectedRevision: 274,
      answerStartPage: 15
    });

    expect(expression).toContain("/api/local-library/resume-answer-stage");
    expect(expression).toContain("http://127.0.0.1:54321/fixture.pdf");
    expect(expression).toContain('formData.append("expectedRevision", "274")');
    expect(expression).toContain('formData.append("answerStartPage", "15")');
    expect(expression).not.toMatch(/sessionToken|document\.cookie|Cookie/i);
  });

  it("selects the Electron page target instead of DevTools or workers", () => {
    expect(
      selectDesktopRendererTarget([
        { type: "service_worker", url: "http://127.0.0.1:43111/sw.js" },
        {
          type: "page",
          url: "devtools://devtools/bundled/inspector.html",
          webSocketDebuggerUrl: "ws://devtools"
        },
        {
          type: "page",
          url: "http://127.0.0.1:43111/",
          webSocketDebuggerUrl: "ws://renderer"
        }
      ])
    ).toMatchObject({ webSocketDebuggerUrl: "ws://renderer" });
  });

  it("serves the PDF temporarily and returns the renderer route payload", async () => {
    const close = vi.fn(async () => undefined);
    const servePdf = vi.fn(async () => ({
      url: "http://127.0.0.1:54321/fixture.pdf",
      close
    }));
    const evaluateInRenderer = vi.fn(async () => ({
      status: 200,
      payload: {
        revision: 275,
        questionCount: 35,
        answeredQuestionCount: 35,
        attachmentCount: 46,
        answerPageCount: 13,
        source: "native_pdf_text"
      }
    }));

    await expect(
      postAnswerStageThroughDesktopRenderer(
        {
          cdpPort: 9333,
          pdfBytes: Buffer.from("fixture-pdf"),
          pdfFileName: "input.pdf",
          documentId: "doc-1",
          expectedRevision: 274,
          answerStartPage: 15
        },
        { servePdf, evaluateInRenderer }
      )
    ).resolves.toMatchObject({ revision: 275, attachmentCount: 46 });

    expect(evaluateInRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ cdpPort: 9333, expression: expect.any(String) })
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the temporary PDF server when the desktop route fails", async () => {
    const close = vi.fn(async () => undefined);

    await expect(
      postAnswerStageThroughDesktopRenderer(
        {
          cdpPort: 9333,
          pdfBytes: Buffer.from("fixture-pdf"),
          pdfFileName: "input.pdf",
          documentId: "doc-1",
          expectedRevision: 274,
          answerStartPage: 15
        },
        {
          servePdf: async () => ({ url: "http://127.0.0.1:54321/fixture.pdf", close }),
          evaluateInRenderer: async () => ({
            status: 401,
            payload: { error: "desktop_session_required" }
          })
        }
      )
    ).rejects.toThrow(/HTTP 401/);

    expect(close).toHaveBeenCalledOnce();
  });
});
