import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "@/app/api/settings/route";

describe("/api/settings", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("returns a redacted configuration and accepts a settings update", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-settings-route-"));
    temporaryDirectories.push(root);
    vi.stubEnv("TEACHHELPER_DATA_ROOT", root);

    const initial = await GET();
    expect(initial.status).toBe(200);
    expect((await initial.json()).ai.apiKeyConfigured).toBe(false);

    const update = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme: "light",
          ai: {
            mode: "api",
            apiPreset: "qwen",
            baseUrl: "https://api.example.test/v1",
            model: "qwen-plus",
            wireApi: "chat_completions",
            apiKey: "redacted-test-key"
          }
        })
      })
    );

    expect(update.status).toBe(200);
    const response = await update.json();
    expect(response.theme).toBe("light");
    expect(response.ai.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(response)).not.toContain("redacted-test-key");
  });

  it("rejects malformed settings without writing them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-settings-route-"));
    temporaryDirectories.push(root);
    vi.stubEnv("TEACHHELPER_DATA_ROOT", root);

    const response = await PUT(
      new Request("http://localhost/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ai: { mode: "api", baseUrl: "not-a-url" } })
      })
    );

    expect(response.status).toBe(400);
  });
});
