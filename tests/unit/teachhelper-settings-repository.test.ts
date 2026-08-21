import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { TeachHelperSettingsRepository } from "@/lib/server/teachhelper-settings-repository";

describe("TeachHelper settings repository", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  it("writes settings atomically and never exposes the stored API key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-settings-"));
    temporaryDirectories.push(root);
    const repository = new TeachHelperSettingsRepository({
      filePath: path.join(root, "settings.json")
    });

    await repository.save({
      theme: "light",
      ai: {
        mode: "api",
        apiPreset: "doubao",
        baseUrl: "https://api.example.test/v1",
        model: "doubao-test",
        wireApi: "chat_completions",
        apiKey: "redacted-test-key"
      }
    });

    const publicSettings = await repository.loadPublic();
    expect(publicSettings.theme).toBe("light");
    expect(publicSettings.ai.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(publicSettings)).not.toContain("redacted-test-key");

    const stored = await readFile(path.join(root, "settings.json"), "utf8");
    expect(stored).toContain("redacted-test-key");
    expect(stored).not.toContain(".tmp");
  });

  it("retains an existing key when a save omits the key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-settings-"));
    temporaryDirectories.push(root);
    const repository = new TeachHelperSettingsRepository({
      filePath: path.join(root, "settings.json")
    });

    await repository.save({
      ai: {
        mode: "local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "local-model",
        apiKey: "redacted-test-key"
      }
    });
    await repository.save({
      ai: { mode: "local", model: "local-model-v2" }
    });

    expect((await repository.loadInternal()).ai.apiKey).toBe("redacted-test-key");
    await repository.clearApiKey();
    expect((await repository.loadInternal()).ai.apiKey).toBeUndefined();
  });

  it("retains an existing key when a caller submits an empty key", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "teachhelper-settings-"));
    temporaryDirectories.push(root);
    const repository = new TeachHelperSettingsRepository({
      filePath: path.join(root, "settings.json")
    });

    await repository.save({
      ai: {
        mode: "api",
        baseUrl: "https://api.example.test/v1",
        model: "qwen-plus",
        apiKey: "redacted-test-key"
      }
    });
    await repository.save({
      ai: { mode: "api", apiKey: "   " }
    });

    expect((await repository.loadInternal()).ai.apiKey).toBe("redacted-test-key");
  });
});
