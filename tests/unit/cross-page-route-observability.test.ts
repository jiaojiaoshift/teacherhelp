import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/ai/detect-cross-page/route";
import * as codexAgent from "@/lib/ai/teachhelper-codex-agent";

const temporaryDirectories: string[] = [];

function createRequest() {
  return new Request("http://localhost/api/ai/detect-cross-page", {
    method: "POST",
    body: JSON.stringify({
      workflowRunId: "workflow-cross-page-test",
      sequence: 2,
      total: 5,
      documentId: "doc-1",
      leftPage: "page-1",
      rightPage: "page-2",
      leftImageDataUrl: "data:image/png;base64,left-secret",
      rightImageDataUrl: "data:image/png;base64,right-secret",
      candidates: []
    })
  });
}

function readOnlyLogEntry(logDirectory: string) {
  const files = readdirSync(logDirectory);
  expect(files).toHaveLength(1);
  return {
    entry: JSON.parse(readFileSync(path.join(logDirectory, files[0]), "utf8").trim()),
    text: readFileSync(path.join(logDirectory, files[0]), "utf8")
  };
}

describe("cross-page route observability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.TEACHHELPER_AI_PROVIDER;
    delete process.env.TEACHHELPER_WORKFLOW_LOG_DIR;
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records the candidate count for a completed adjacent page pair", async () => {
    const logDirectory = mkdtempSync(path.join(os.tmpdir(), "teachhelper-cross-page-log-"));
    temporaryDirectories.push(logDirectory);
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";
    process.env.TEACHHELPER_WORKFLOW_LOG_DIR = logDirectory;
    vi.spyOn(codexAgent, "detectCrossPageWithCodex").mockResolvedValue([
      {
        id: "merge-1",
        sourceQuestionIds: ["q-1", "q-2"],
        confidence: 0.9
      }
    ]);

    await POST(createRequest());

    const { entry, text } = readOnlyLogEntry(logDirectory);
    expect(entry).toMatchObject({
      runId: "workflow-cross-page-test",
      event: "cross_page_pair",
      stage: "cross_page",
      status: "done",
      sequence: 2,
      total: 5,
      candidateCount: 1
    });
    expect(entry.elapsedMs).toEqual(expect.any(Number));
    expect(text).not.toContain("left-secret");
    expect(text).not.toContain("right-secret");
  });

  it("records a safe failed event when the adjacent page request fails", async () => {
    const logDirectory = mkdtempSync(path.join(os.tmpdir(), "teachhelper-cross-page-log-"));
    temporaryDirectories.push(logDirectory);
    process.env.TEACHHELPER_AI_PROVIDER = "ccswitch";
    process.env.TEACHHELPER_WORKFLOW_LOG_DIR = logDirectory;
    vi.spyOn(codexAgent, "detectCrossPageWithCodex").mockRejectedValue(
      new Error("sensitive upstream error body")
    );

    await POST(createRequest());

    const { entry, text } = readOnlyLogEntry(logDirectory);
    expect(entry).toMatchObject({
      runId: "workflow-cross-page-test",
      event: "cross_page_pair",
      stage: "cross_page",
      status: "failed",
      sequence: 2,
      total: 5,
      candidateCount: 0
    });
    expect(text).not.toContain("sensitive upstream error body");
  });
});
