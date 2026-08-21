interface CrossPageRecoveryLockManager {
  request: <T>(
    name: string,
    options: { ifAvailable: boolean; mode: "exclusive" },
    callback: (lock: object | null) => T | Promise<T>
  ) => Promise<T>;
}

export async function runWithCrossPageRecoveryLock<T>(
  documentId: string,
  work: () => Promise<T>,
  lockManager: CrossPageRecoveryLockManager | null | undefined =
    typeof navigator !== "undefined" && ("locks" in navigator)
      ? (navigator.locks as CrossPageRecoveryLockManager)
      : null
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  if (!lockManager) {
    return { acquired: true, value: await work() };
  }

  return lockManager.request(
    `teachhelper-cross-page-recovery:${documentId}`,
    { ifAvailable: true, mode: "exclusive" },
    async (lock) => {
      if (!lock) {
        return { acquired: false } as const;
      }

      return { acquired: true, value: await work() } as const;
    }
  );
}
