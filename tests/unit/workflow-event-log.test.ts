import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appendWorkflowEventLog,
  type WorkflowEventLogInput
} from "@/lib/server/workflow-event-log";

const temporaryDirectories: string[] = [];

describe("workflow-event-log", () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("writes one daily JSONL record containing only approved diagnostic fields", async () => {
    const logDirectory = mkdtempSync(path.join(os.tmpdir(), "teachhelper-workflow-log-"));
    temporaryDirectories.push(logDirectory);
    const input = {
      runId: "workflow-20260810-test",
      event: "cross_page_pair",
      stage: "cross_page",
      status: "done",
      sequence: 2,
      total: 5,
      candidateCount: 3,
      filteredCount: 1,
      acceptedCount: 0,
      elapsedMs: 234.6,
      timestamp: new Date("2026-08-10T07:30:00.000Z"),
      logDirectory,
      prompt: "SECRET_PROMPT_MUST_NOT_BE_LOGGED",
      apiKey: "sk-secret-must-not-be-logged",
      imageDataUrl: "data:image/png;base64,secret",
      upstreamError: "sensitive upstream body"
    } as unknown as WorkflowEventLogInput;

    const filePath = await appendWorkflowEventLog(input);
    const logText = readFileSync(filePath, "utf8");
    const entry = JSON.parse(logText.trim());

    expect(path.basename(filePath)).toBe("teachhelper-workflows-2026-08-10.log");
    expect(entry).toEqual({
      timestamp: "2026-08-10T07:30:00.000Z",
      runId: "workflow-20260810-test",
      event: "cross_page_pair",
      stage: "cross_page",
      status: "done",
      sequence: 2,
      total: 5,
      candidateCount: 3,
      filteredCount: 1,
      acceptedCount: 0,
      elapsedMs: 235
    });
    expect(logText).not.toContain("SECRET_PROMPT_MUST_NOT_BE_LOGGED");
    expect(logText).not.toContain("sk-secret-must-not-be-logged");
    expect(logText).not.toContain("data:image");
    expect(logText).not.toContain("sensitive upstream body");
  });
});
