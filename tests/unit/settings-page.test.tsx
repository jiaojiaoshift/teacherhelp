import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import SettingsPage from "@/app/settings/page";
import { useAppSettingsStore } from "@/lib/stores/app-settings-store";

describe("settings page", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: 1,
      theme: "dark",
      ai: {
        mode: "ccswitch",
        apiPreset: null,
        baseUrl: "",
        apiKeyConfigured: false,
        model: "gpt-5.6-sol",
        wireApi: "responses",
        reasoningEffort: "xhigh"
      }
    }), { status: 200, headers: { "content-type": "application/json" } })));
    useAppSettingsStore.getState().reset();
  });

  it("offers theme and all three AI connection modes", () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "深色" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "浅色" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ccSwitch 路由" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "直接 API" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "本地模型" })).toBeInTheDocument();
  });
});
