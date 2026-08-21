import { describe, expect, it } from "vitest";

import vitestConfig from "../../vitest.config";

describe("Vitest runtime budget", () => {
  it("allows image, PDF, and full-workbench tests to run on supported computers", () => {
    const config = vitestConfig as { test?: { testTimeout?: number } };

    expect(config.test?.testTimeout).toBe(15_000);
  });
});
