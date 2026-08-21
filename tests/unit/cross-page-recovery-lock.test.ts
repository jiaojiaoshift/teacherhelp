import { describe, expect, it, vi } from "vitest";

import { runWithCrossPageRecoveryLock } from "@/lib/services/cross-page-recovery-lock";

describe("cross-page recovery lock", () => {
  it("does not run recovery when another tab already holds the browser lock", async () => {
    const work = vi.fn();
    const request = vi.fn(
      async (
        _name: string,
        _options: { ifAvailable: boolean; mode: string },
        callback: (lock: object | null) => unknown
      ) => callback(null)
    );

    await expect(
      runWithCrossPageRecoveryLock("doc-1", work, { request })
    ).resolves.toEqual({ acquired: false });

    expect(request).toHaveBeenCalledWith(
      "teachhelper-cross-page-recovery:doc-1",
      { ifAvailable: true, mode: "exclusive" },
      expect.any(Function)
    );
    expect(work).not.toHaveBeenCalled();
  });

  it("holds the browser lock until recovery finishes", async () => {
    const work = vi.fn().mockResolvedValue(["candidate-1"]);
    const request = vi.fn(
      async (
        _name: string,
        _options: { ifAvailable: boolean; mode: string },
        callback: (lock: object | null) => unknown
      ) => callback({ name: "teachhelper-cross-page-recovery:doc-1" })
    );

    await expect(
      runWithCrossPageRecoveryLock("doc-1", work, { request })
    ).resolves.toEqual({ acquired: true, value: ["candidate-1"] });

    expect(work).toHaveBeenCalledOnce();
  });

  it("runs normally when the browser does not expose Web Locks", async () => {
    const work = vi.fn().mockResolvedValue(["candidate-1"]);

    await expect(
      runWithCrossPageRecoveryLock("doc-1", work, null)
    ).resolves.toEqual({ acquired: true, value: ["candidate-1"] });

    expect(work).toHaveBeenCalledOnce();
  });
});
