import { describe, expect, it, vi } from "vitest";

import { LatestWorkspaceSnapshotSaveQueue } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe("workspace snapshot save queue", () => {
  it("keeps only the newest snapshot while an IndexedDB write is in flight", async () => {
    const firstWrite = createDeferred<void>();
    const savedIds: string[] = [];
    const save = vi.fn(async (snapshot: { id: string }) => {
      savedIds.push(snapshot.id);

      if (snapshot.id === "first") {
        await firstWrite.promise;
      }
    });
    const queue = new LatestWorkspaceSnapshotSaveQueue(save);

    const first = queue.enqueue({ id: "first" });
    const second = queue.enqueue({ id: "second" });
    const latest = queue.enqueue({ id: "latest" });

    expect(save).toHaveBeenCalledTimes(1);
    expect(savedIds).toEqual(["first"]);

    firstWrite.resolve();

    await expect(Promise.all([first, second, latest])).resolves.toEqual([
      undefined,
      undefined,
      undefined
    ]);
    expect(savedIds).toEqual(["first", "latest"]);
  });

  it("continues with the newest pending snapshot after a failed write", async () => {
    const firstWrite = createDeferred<void>();
    const savedIds: string[] = [];
    const save = vi.fn(async (snapshot: { id: string }) => {
      savedIds.push(snapshot.id);

      if (snapshot.id === "first") {
        await firstWrite.promise;
      }
    });
    const queue = new LatestWorkspaceSnapshotSaveQueue(save);

    const first = queue.enqueue({ id: "first" });
    const latest = queue.enqueue({ id: "latest" });
    const failure = new Error("IndexedDB write failed");

    firstWrite.reject(failure);

    await expect(first).rejects.toBe(failure);
    await expect(latest).resolves.toBeUndefined();
    expect(savedIds).toEqual(["first", "latest"]);
  });
});
