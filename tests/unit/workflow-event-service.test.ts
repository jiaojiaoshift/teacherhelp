import { describe, expect, it, vi } from "vitest";

import {
  createWorkflowRunId,
  recordWorkflowEvent,
  type WorkflowEventPayload
} from "@/lib/services/workflow-event-service";

describe("workflow-event-service", () => {
  it("creates an opaque run id without document metadata", () => {
    expect(
      createWorkflowRunId(
        new Date("2026-08-10T07:31:22.000Z"),
        () => "fixed-random"
      )
    ).toBe("workflow-20260810T073122-fixed-random");
  });

  it("posts only approved event fields", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const input = {
      runId: "workflow-safe-test",
      event: "specialized_sync",
      stage: "specialized_sync",
      status: "done",
      taskId: "document-task-safe",
      documentId: "doc-safe",
      pageId: "page-safe",
      pageNumber: 3,
      diagnosticId: "aierr-safe-123",
      total: 1,
      candidateCount: 6,
      elapsedMs: 42,
      prompt: "SECRET_PROMPT",
      apiKey: "sk-secret",
      imageDataUrl: "data:image/png;base64,secret"
    } as unknown as WorkflowEventPayload;

    await recordWorkflowEvent(input, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/workflow-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        runId: "workflow-safe-test",
        event: "specialized_sync",
        stage: "specialized_sync",
        status: "done",
        taskId: "document-task-safe",
        documentId: "doc-safe",
        pageId: "page-safe",
        pageNumber: 3,
        diagnosticId: "aierr-safe-123",
        total: 1,
        candidateCount: 6,
        elapsedMs: 42
      }),
      keepalive: true
    });
  });

  it("does not reject when telemetry delivery fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network response with secrets"));

    await expect(
      recordWorkflowEvent(
        {
          runId: "workflow-safe-test",
          event: "workflow_stage",
          stage: "ocr",
          status: "failed"
        },
        fetcher
      )
    ).resolves.toBeUndefined();
  });
});
