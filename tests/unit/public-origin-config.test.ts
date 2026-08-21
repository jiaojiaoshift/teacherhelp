import { describe, expect, it } from "vitest";

import {
  buildTeachHelperMetadata,
  resolveTeachHelperPublicOrigin
} from "@/lib/config/public-origin";

describe("public origin config", () => {
  it("keeps local development unconfigured by default", () => {
    expect(resolveTeachHelperPublicOrigin({})).toBeNull();
    expect(buildTeachHelperMetadata({}).metadataBase).toBeUndefined();
  });

  it("normalizes one root http or https deployment origin", () => {
    expect(
      resolveTeachHelperPublicOrigin({
        TEACHHELPER_PUBLIC_ORIGIN: " https://library.example.com/ "
      })
    ).toBe("https://library.example.com");
    expect(
      resolveTeachHelperPublicOrigin({
        TEACHHELPER_PUBLIC_ORIGIN: "http://127.0.0.1:3100"
      })
    ).toBe("http://127.0.0.1:3100");

    const metadata = buildTeachHelperMetadata({
      TEACHHELPER_PUBLIC_ORIGIN: "https://library.example.com"
    });
    expect(metadata.metadataBase?.toString()).toBe("https://library.example.com/");
    expect(metadata.icons).toEqual({
      icon: [{ type: "image/png", url: "/icon.png" }]
    });
  });

  it.each([
    "ftp://library.example.com",
    "https://user:password@library.example.com",
    "https://library.example.com/teachhelper",
    "https://library.example.com/?tenant=one",
    "https://library.example.com/#workspace",
    "not-a-url"
  ])("rejects an unsafe or unsupported public origin: %s", (value) => {
    expect(() =>
      resolveTeachHelperPublicOrigin({
        TEACHHELPER_PUBLIC_ORIGIN: value
      })
    ).toThrow("TEACHHELPER_PUBLIC_ORIGIN");
  });
});
