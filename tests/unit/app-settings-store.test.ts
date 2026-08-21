import { afterEach, describe, expect, it, vi } from "vitest";

import { useAppSettingsStore } from "@/lib/stores/app-settings-store";

describe("app settings store", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.dataset.theme = "dark";
    localStorage.clear();
    useAppSettingsStore.getState().reset();
  });

  it("applies a selected theme to the document and local preference", () => {
    useAppSettingsStore.getState().setTheme("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("teachhelper.theme")).toBe("light");
  });

  it("hydrates the server preference without receiving an API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            version: 1,
            theme: "light",
            ai: {
              mode: "ccswitch",
              apiPreset: null,
              baseUrl: "",
              apiKeyConfigured: true,
              model: "gpt-5.6-sol",
              wireApi: "responses",
              reasoningEffort: "xhigh"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await useAppSettingsStore.getState().hydrate();

    expect(useAppSettingsStore.getState().settings.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(JSON.stringify(useAppSettingsStore.getState())).not.toContain('"apiKey":');
  });
});
