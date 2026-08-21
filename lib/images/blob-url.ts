export function createObjectUrlRegistry() {
  const entries = new Map<string, string>();

  return {
    create(key: string, blob: Blob) {
      const previous = entries.get(key);
      if (previous) {
        URL.revokeObjectURL(previous);
      }

      const next = URL.createObjectURL(blob);
      entries.set(key, next);
      return next;
    },
    revoke(key: string) {
      const current = entries.get(key);
      if (!current) {
        return;
      }

      URL.revokeObjectURL(current);
      entries.delete(key);
    }
  };
}
