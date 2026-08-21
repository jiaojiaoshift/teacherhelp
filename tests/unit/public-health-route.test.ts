import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

describe("public health route", () => {
  it("returns only deployment-safe readiness metadata", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      status: "ok",
      service: "teachhelper",
      version: "1.0.0"
    });
  });
});
