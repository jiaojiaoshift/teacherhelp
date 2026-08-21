import { describe, expect, it } from "vitest";

import { isRenderedPageBlank } from "../../scripts/lib/rendered-page-blank-service.mjs";

describe("rendered page blank service", () => {
  it("marks an all-white page without native text as blank", () => {
    expect(
      isRenderedPageBlank({
        rgba: new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]),
        textLineCount: 0
      })
    ).toBe(true);
  });

  it("keeps a page when it contains any visible pixel or native text", () => {
    expect(
      isRenderedPageBlank({
        rgba: new Uint8ClampedArray([255, 255, 255, 255, 253, 255, 255, 255]),
        textLineCount: 0
      })
    ).toBe(false);
    expect(
      isRenderedPageBlank({
        rgba: new Uint8ClampedArray([255, 255, 255, 255]),
        textLineCount: 1
      })
    ).toBe(false);
  });
});
