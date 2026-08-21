import { describe, expect, it } from "vitest";

import { useUiStore } from "@/lib/stores/ui-store";

describe("ui-store", () => {
  it("defaults review mode to document flow", () => {
    expect(useUiStore.getState().reviewMode).toBe("document_flow");
  });
});
