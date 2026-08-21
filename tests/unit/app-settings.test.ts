import { describe, expect, it } from "vitest";

import {
  DEFAULT_TEACHHELPER_SETTINGS,
  normalizeTeachHelperSettings,
  toPublicTeachHelperSettings,
  validateTeachHelperSettingsPatch
} from "@/lib/config/app-settings";

describe("application settings contract", () => {
  it("provides a dark ccSwitch default without a secret", () => {
    expect(DEFAULT_TEACHHELPER_SETTINGS).toMatchObject({
      version: 1,
      theme: "dark",
      ai: {
        mode: "ccswitch",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh"
      }
    });
    expect(DEFAULT_TEACHHELPER_SETTINGS.ai).not.toHaveProperty("apiKey");
  });

  it("normalizes a valid direct API patch and rejects unsafe URLs", () => {
    expect(
      validateTeachHelperSettingsPatch({
        theme: "light",
        ai: {
          mode: "api",
          apiPreset: "qwen",
          baseUrl: "https://api.example.test/v1",
          model: "qwen-plus",
          wireApi: "chat_completions",
          reasoningEffort: "high",
          apiKey: "redacted-test-key"
        }
      })
    ).toMatchObject({ ok: true });

    expect(
      validateTeachHelperSettingsPatch({
        ai: { mode: "api", baseUrl: "file:///private/key" }
      })
    ).toMatchObject({ ok: false });
  });

  it("keeps a persisted key server-side when producing the public shape", () => {
    const settings = normalizeTeachHelperSettings({
      ai: {
        mode: "local",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiKey: "redacted-test-key",
        model: "local-model",
        wireApi: "chat_completions"
      }
    });

    const publicSettings = toPublicTeachHelperSettings(settings);
    expect(publicSettings.ai.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(publicSettings)).not.toContain("redacted-test-key");
  });

  it("treats an empty key as omitted and rejects credentials embedded in the URL", () => {
    expect(
      validateTeachHelperSettingsPatch({
        ai: {
          baseUrl: "https://user:password@example.test/v1"
        }
      })
    ).toMatchObject({ ok: false });
  });
});
