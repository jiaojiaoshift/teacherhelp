import { describe, expect, it } from "vitest";

import { resolveNextOutputConfig } from "../../scripts/lib/next-output-config.mjs";

describe("Next output config", () => {
  it("keeps ordinary local Web builds unchanged", () => {
    expect(resolveNextOutputConfig({})).toEqual({});
  });

  it("isolates Electron standalone output", () => {
    expect(
      resolveNextOutputConfig({
        TEACHHELPER_DESKTOP_BUILD: "1"
      })
    ).toEqual({
      output: "standalone",
      distDir: ".next-desktop"
    });
  });

  it("supports standard standalone output for server and container deployment", () => {
    expect(
      resolveNextOutputConfig({
        TEACHHELPER_STANDALONE_BUILD: "1"
      })
    ).toEqual({
      output: "standalone"
    });
  });
});
