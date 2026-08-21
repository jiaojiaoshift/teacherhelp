import { describe, expect, it, vi } from "vitest";

import {
  DocumentTaskClientConflictError,
  DocumentTaskSaveQueue,
  loadDocumentTasks
} from "@/lib/services/document-task-client-service";
import { createDocumentProcessingTask } from "@/lib/services/document-task-service";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("document task client service", () => {
  it("loads a valid server task payload without caching", async () => {
    const task = createDocumentProcessingTask({
      id: "task-1",
      runId: "run-1",
      documentId: "document-1",
      documentName: "sample.pdf"
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ revision: 3, tasks: [task] }));

    await expect(loadDocumentTasks(fetchImpl)).resolves.toEqual({ revision: 3, tasks: [task] });
    expect(fetchImpl).toHaveBeenCalledWith("/api/document-tasks", { cache: "no-store" });
  });

  it("serializes saves and skips an unchanged task snapshot", async () => {
    const task = createDocumentProcessingTask({
      id: "task-1",
      runId: "run-1",
      documentId: "document-1",
      documentName: "sample.pdf"
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ revision: 2 }))
      .mockResolvedValueOnce(jsonResponse({ revision: 3 }));
    const queue = new DocumentTaskSaveQueue({
      revision: 1,
      initialTasks: [],
      fetchImpl
    });

    await expect(queue.enqueue([task])).resolves.toEqual({ revision: 2 });
    await expect(queue.enqueue([task])).resolves.toEqual({ revision: 2 });
    await expect(queue.enqueue([])).resolves.toEqual({ revision: 3 });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({
      expectedRevision: 2,
      tasks: []
    });
  });

  it("invokes a receiver-sensitive browser fetch without rebinding it to queue input", async () => {
    const task = createDocumentProcessingTask({
      id: "task-browser-fetch",
      runId: "run-browser-fetch",
      documentId: "document-browser-fetch",
      documentName: "browser-fetch.pdf"
    });
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetchImpl = async function (
      this: unknown,
      input: RequestInfo | URL,
      init?: RequestInit
    ) {
      if (this !== undefined) {
        throw new TypeError("Illegal invocation");
      }
      calls.push({ input, init });
      return jsonResponse({ revision: 1 });
    };
    const queue = new DocumentTaskSaveQueue({
      revision: 0,
      initialTasks: [],
      fetchImpl
    });

    await expect(queue.enqueue([task])).resolves.toEqual({ revision: 1 });
    expect(calls).toHaveLength(1);
  });

  it("blocks later saves after one revision conflict", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: "revision_conflict", actualRevision: 7 }, 409)
    );
    const queue = new DocumentTaskSaveQueue({ revision: 2, fetchImpl });

    await expect(queue.enqueue([])).rejects.toBeInstanceOf(DocumentTaskClientConflictError);
    await expect(queue.enqueue([])).rejects.toBeInstanceOf(DocumentTaskClientConflictError);
    expect(queue.blocked).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
