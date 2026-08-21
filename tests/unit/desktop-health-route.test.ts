import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/desktop/health/route";

describe("desktop health route", () => {
  it("returns only a minimal readiness payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "teachhelper"
    });
  });
});
