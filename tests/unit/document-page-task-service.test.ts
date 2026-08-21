import { describe, expect, it, vi } from "vitest";

import { runDocumentPageTasks } from "@/lib/services/document-page-task-service";

const pages = [
  { id: "page-1" },
  { id: "page-2" },
  { id: "page-3" }
];

describe("document page task service", () => {
  it("commits successful pages even when another page fails", async () => {
    const committed: string[] = [];
    const failed: string[] = [];

    const result = await runDocumentPageTasks({
      pages,
      concurrency: 3,
      signal: new AbortController().signal,
      execute: async (page) => {
        if (page.id === "page-2") {
          throw new Error("route unavailable");
        }
        return `${page.id}:result`;
      },
      onSuccess: async (page) => {
        committed.push(page.id);
      },
      onFailure: async (page) => {
        failed.push(page.id);
      }
    });

    expect(committed.sort()).toEqual(["page-1", "page-3"]);
    expect(failed).toEqual(["page-2"]);
    expect(result.completedPageIds.sort()).toEqual(["page-1", "page-3"]);
    expect(result.failedPageIds).toEqual(["page-2"]);
  });

  it("skips pages already present in the persisted checkpoint", async () => {
    const execute = vi.fn(async (page: { id: string }) => page.id);

    const result = await runDocumentPageTasks({
      pages,
      completedPageIds: ["page-1", "page-3"],
      concurrency: 2,
      signal: new AbortController().signal,
      execute
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(pages[1], 1, expect.any(AbortSignal));
    expect(result.completedPageIds.sort()).toEqual(["page-1", "page-2", "page-3"]);
  });

  it("stops dispatching queued pages after cancellation", async () => {
    const controller = new AbortController();
    const started: string[] = [];

    const promise = runDocumentPageTasks({
      pages,
      concurrency: 1,
      signal: controller.signal,
      execute: async (page, _index, signal) => {
        started.push(page.id);
        controller.abort(new Error("paused"));
        signal.throwIfAborted();
        return page.id;
      }
    });

    await expect(promise).rejects.toThrow("paused");
    expect(started).toEqual(["page-1"]);
  });
});
