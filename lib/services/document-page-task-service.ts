export interface DocumentPageTaskResult<R> {
  completedPageIds: string[];
  failedPageIds: string[];
  resultsByPageId: Record<string, R>;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error("Document page task interrupted");
  }
}

export async function runDocumentPageTasks<P extends { id: string }, R>(input: {
  pages: P[];
  completedPageIds?: string[];
  concurrency: number;
  signal: AbortSignal;
  execute: (page: P, index: number, signal: AbortSignal) => Promise<R>;
  onSuccess?: (page: P, result: R) => void | Promise<void>;
  onFailure?: (page: P, error: unknown) => void | Promise<void>;
  onProgress?: (progress: {
    current: number;
    total: number;
    pageId: string;
    status: "completed" | "failed";
  }) => void;
}): Promise<DocumentPageTaskResult<R>> {
  const pageIdSet = new Set(input.pages.map((page) => page.id));
  const completedPageIds = new Set(
    (input.completedPageIds ?? []).filter((pageId) => pageIdSet.has(pageId))
  );
  const failedPageIds = new Set<string>();
  const resultsByPageId: Record<string, R> = {};
  const pendingEntries = input.pages
    .map((page, index) => ({ page, index }))
    .filter(({ page }) => !completedPageIds.has(page.id));
  const concurrency = Math.max(1, Math.min(Math.floor(input.concurrency), pendingEntries.length));
  let nextIndex = 0;
  let settledCount = completedPageIds.size;

  throwIfAborted(input.signal);

  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < pendingEntries.length) {
      throwIfAborted(input.signal);
      const entry = pendingEntries[nextIndex];
      nextIndex += 1;

      try {
        const result = await input.execute(entry.page, entry.index, input.signal);
        throwIfAborted(input.signal);
        await input.onSuccess?.(entry.page, result);
        throwIfAborted(input.signal);
        resultsByPageId[entry.page.id] = result;
        completedPageIds.add(entry.page.id);
        failedPageIds.delete(entry.page.id);
        settledCount += 1;
        input.onProgress?.({
          current: settledCount,
          total: input.pages.length,
          pageId: entry.page.id,
          status: "completed"
        });
      } catch (error) {
        if (input.signal.aborted) {
          throw input.signal.reason ?? error;
        }

        await input.onFailure?.(entry.page, error);
        failedPageIds.add(entry.page.id);
        completedPageIds.delete(entry.page.id);
        settledCount += 1;
        input.onProgress?.({
          current: settledCount,
          total: input.pages.length,
          pageId: entry.page.id,
          status: "failed"
        });
      }
    }
  });

  await Promise.all(workers);

  return {
    completedPageIds: Array.from(completedPageIds),
    failedPageIds: Array.from(failedPageIds),
    resultsByPageId
  };
}
