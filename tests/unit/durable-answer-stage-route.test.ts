import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as resumeAnswerStagePost } from "@/app/api/local-library/resume-answer-stage/route";
import {
  DurableAnswerStageIncompleteError,
  resumeDurableAnswerStage
} from "@/lib/server/durable-answer-stage-service";
import { LocalLibraryRevisionConflictError } from "@/lib/server/local-library-filesystem-repository";

vi.mock("@/lib/server/durable-answer-stage-service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/server/durable-answer-stage-service")
  >();

  return {
    ...actual,
    resumeDurableAnswerStage: vi.fn()
  };
});

function buildRequest(input?: {
  file?: File;
  documentId?: string;
  answerStartPage?: string;
  expectedRevision?: string;
}) {
  const formData = new FormData();

  formData.set(
    "file",
    input?.file ?? new File(["%PDF-1.7"], "fixture.pdf", { type: "application/pdf" })
  );
  formData.set("documentId", input?.documentId ?? "source-doc-1");
  formData.set("answerStartPage", input?.answerStartPage ?? "15");
  formData.set("expectedRevision", input?.expectedRevision ?? "274");

  return new Request("http://localhost/api/local-library/resume-answer-stage", {
    method: "POST",
    body: formData
  });
}

describe("durable answer stage route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("accepts one PDF and forwards only the validated answer-stage input", async () => {
    vi.mocked(resumeDurableAnswerStage).mockResolvedValue({
      revision: 275,
      questionCount: 35,
      answeredQuestionCount: 35,
      attachmentCount: 47,
      answerPageCount: 13,
      source: "native_pdf_text"
    });

    const response = await resumeAnswerStagePost(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      revision: 275,
      questionCount: 35,
      answeredQuestionCount: 35,
      attachmentCount: 47,
      answerPageCount: 13,
      source: "native_pdf_text"
    });
    const forwardedInput = vi.mocked(resumeDurableAnswerStage).mock.calls[0]?.[0];

    expect(forwardedInput).toMatchObject({
      expectedRevision: 274,
      documentId: "source-doc-1",
      answerStartPage: 15
    });
    expect(forwardedInput?.pdfArrayBuffer.byteLength).toBeGreaterThan(0);
  });

  it("rejects a non-PDF or malformed numeric input before running the service", async () => {
    const response = await resumeAnswerStagePost(
      buildRequest({
        file: new File(["plain text"], "fixture.txt", { type: "text/plain" }),
        answerStartPage: "zero"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_answer_stage_request" });
    expect(resumeDurableAnswerStage).not.toHaveBeenCalled();
  });

  it("returns a conflict without hiding the current library revision", async () => {
    vi.mocked(resumeDurableAnswerStage).mockRejectedValue(
      new LocalLibraryRevisionConflictError(280)
    );

    const response = await resumeAnswerStagePost(buildRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "revision_conflict",
      actualRevision: 280
    });
  });

  it("reports incomplete detection without committing placeholder answers", async () => {
    vi.mocked(resumeDurableAnswerStage).mockRejectedValue(
      new DurableAnswerStageIncompleteError("Answer detection incomplete")
    );

    const response = await resumeAnswerStagePost(buildRequest());

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "answer_detection_incomplete" });
  });

  it("logs a safe server diagnostic for an unexpected failure without exposing its message", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unexpectedError = Object.assign(
      new Error("sensitive upstream body and credentials"),
      { code: "ERR_TEST_FAILURE" }
    );
    vi.mocked(resumeDurableAnswerStage).mockRejectedValue(unexpectedError);

    const response = await resumeAnswerStagePost(buildRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "answer_stage_failed" });
    expect(consoleError).toHaveBeenCalledWith(
      "[resume-answer-stage] failed",
      expect.objectContaining({
        name: "Error",
        code: "ERR_TEST_FAILURE",
        stackFrames: expect.any(Array)
      })
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "sensitive upstream body and credentials"
    );
  });
});
