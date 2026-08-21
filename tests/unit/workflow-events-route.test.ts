import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/workflow-events/route";

const temporaryDirectories: string[] = [];

describe("workflow events route", () => {
  afterEach(() => {
    delete process.env.TEACHHELPER_WORKFLOW_LOG_DIR;
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("records a sanitized workflow event in the configured local directory", async () => {
    const logDirectory = mkdtempSync(path.join(os.tmpdir(), "teachhelper-workflow-route-"));
    temporaryDirectories.push(logDirectory);
    process.env.TEACHHELPER_WORKFLOW_LOG_DIR = logDirectory;

    const response = await POST(
      new Request("http://localhost/api/workflow-events", {
        method: "POST",
        body: JSON.stringify({
          runId: "workflow-route-test",
          event: "cross_page_summary",
          stage: "cross_page",
          status: "done",
          total: 4,
          candidateCount: 3,
          filteredCount: 1,
          prompt: "SECRET_PROMPT",
          logDirectory: "C:/must-not-be-used"
        })
      })
    );

    expect(response.status).toBe(200);
    const files = await import("node:fs/promises").then((fs) => fs.readdir(logDirectory));
    expect(files).toHaveLength(1);
    const logText = readFileSync(path.join(logDirectory, files[0]), "utf8");
    expect(JSON.parse(logText.trim())).toMatchObject({
      runId: "workflow-route-test",
      event: "cross_page_summary",
      stage: "cross_page",
      status: "done",
      total: 4,
      candidateCount: 3,
      filteredCount: 1
    });
    expect(logText).not.toContain("SECRET_PROMPT");
    expect(existsSync("C:/must-not-be-used")).toBe(false);
  });

  it("rejects unknown event names without writing a log", async () => {
    const logDirectory = mkdtempSync(path.join(os.tmpdir(), "teachhelper-workflow-route-"));
    temporaryDirectories.push(logDirectory);
    process.env.TEACHHELPER_WORKFLOW_LOG_DIR = logDirectory;

    const response = await POST(
      new Request("http://localhost/api/workflow-events", {
        method: "POST",
        body: JSON.stringify({
          runId: "workflow-route-test",
          event: "dump_prompt_and_key",
          stage: "cross_page",
          status: "failed"
        })
      })
    );

    expect(response.status).toBe(400);
    const files = await import("node:fs/promises").then((fs) => fs.readdir(logDirectory));
    expect(files).toEqual([]);
  });

  it("records sanitized task and page identifiers for a failed page request", async () => {
    const logDirectory = mkdtempSync(path.join(os.tmpdir(), "teachhelper-workflow-route-"));
    temporaryDirectories.push(logDirectory);
    process.env.TEACHHELPER_WORKFLOW_LOG_DIR = logDirectory;

    const response = await POST(
      new Request("http://localhost/api/workflow-events", {
        method: "POST",
        body: JSON.stringify({
          runId: "workflow-page-failure",
          taskId: "task/page failure",
          documentId: "doc/private name",
          pageId: "page-7",
          pageNumber: 7,
          diagnosticId: "aierr-20260817-safe",
          event: "question_box_page",
          stage: "question_boxes",
          status: "failed",
          prompt: "SECRET_PROMPT",
          apiKey: "sk-secret",
          imageDataUrl: "data:image/png;base64,secret"
        })
      })
    );

    expect(response.status).toBe(200);
    const files = await import("node:fs/promises").then((fs) => fs.readdir(logDirectory));
    const logText = readFileSync(path.join(logDirectory, files[0]), "utf8");

    expect(JSON.parse(logText.trim())).toMatchObject({
      runId: "workflow-page-failure",
      taskId: "task_page_failure",
      documentId: "doc_private_name",
      pageId: "page-7",
      pageNumber: 7,
      diagnosticId: "aierr-20260817-safe",
      event: "question_box_page",
      stage: "question_boxes",
      status: "failed"
    });
    expect(logText).not.toContain("SECRET_PROMPT");
    expect(logText).not.toContain("sk-secret");
    expect(logText).not.toContain("base64");
  });
});
