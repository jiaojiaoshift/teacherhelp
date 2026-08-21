import { NextRequest } from "next/server";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DESKTOP_SESSION_COOKIE, middleware } from "@/middleware";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(pathname: string, headers?: HeadersInit) {
  return new NextRequest(`http://127.0.0.1:43123${pathname}`, { headers });
}

describe("desktop session middleware", () => {
  it("keeps ordinary web mode compatible when no desktop token is configured", () => {
    const response = middleware(request("/api/local-library"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects API requests without the desktop session cookie", async () => {
    vi.stubEnv("TEACHHELPER_DESKTOP_SESSION_TOKEN", "desktop-session-secret");

    const response = middleware(request("/api/local-library"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "desktop_session_required" });
  });

  it("accepts renderer requests carrying the HttpOnly desktop session cookie", () => {
    vi.stubEnv("TEACHHELPER_DESKTOP_SESSION_TOKEN", "desktop-session-secret");

    const response = middleware(
      request("/library/questions", {
        cookie: `${DESKTOP_SESSION_COOKIE}=desktop-session-secret`
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows a token-authenticated health check before the renderer cookie exists", () => {
    vi.stubEnv("TEACHHELPER_DESKTOP_SESSION_TOKEN", "desktop-session-secret");

    const response = middleware(
      request("/api/desktop/health", {
        "x-teachhelper-desktop-token": "desktop-session-secret"
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects direct page navigation from an unrelated local browser", async () => {
    vi.stubEnv("TEACHHELPER_DESKTOP_SESSION_TOKEN", "desktop-session-secret");

    const response = middleware(request("/"));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("TeachHelper desktop session required");
  });
});
