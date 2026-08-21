import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildDesktopSessionCookie,
  buildTeachHelperWindowOptions,
  isAllowedDesktopNavigation,
  resolveElectronDataRoot
} from "../../desktop/electron-policy.mjs";

describe("Electron window policy", () => {
  it("defaults desktop AI routing to the same selector used by the Web launcher", async () => {
    const policy = (await import("../../desktop/electron-policy.mjs")) as {
      buildDesktopBackendEnvironment?: (
        environment: Record<string, string | undefined>
      ) => Record<string, string | undefined>;
    };

    expect(policy.buildDesktopBackendEnvironment).toBeTypeOf("function");
    expect(policy.buildDesktopBackendEnvironment?.({ EXISTING_VALUE: "kept" })).toMatchObject({
      EXISTING_VALUE: "kept",
      TEACHHELPER_AI_PROVIDER: "ccswitch",
      TEACHHELPER_AI_MODEL: "gpt-5.6-sol",
      TEACHHELPER_AI_REASONING_EFFORT: "xhigh"
    });
  });

  it("preserves explicit desktop AI routing overrides", async () => {
    const policy = (await import("../../desktop/electron-policy.mjs")) as {
      buildDesktopBackendEnvironment?: (
        environment: Record<string, string | undefined>
      ) => Record<string, string | undefined>;
    };

    expect(
      policy.buildDesktopBackendEnvironment?.({
        TEACHHELPER_AI_PROVIDER: "openai-compatible",
        TEACHHELPER_AI_MODEL: "custom-model",
        TEACHHELPER_AI_REASONING_EFFORT: "high"
      })
    ).toMatchObject({
      TEACHHELPER_AI_PROVIDER: "openai-compatible",
      TEACHHELPER_AI_MODEL: "custom-model",
      TEACHHELPER_AI_REASONING_EFFORT: "high"
    });
  });

  it("upgrades a legacy desktop model before launching the backend", async () => {
    const policy = (await import("../../desktop/electron-policy.mjs")) as {
      buildDesktopBackendEnvironment?: (
        environment: Record<string, string | undefined>
      ) => Record<string, string | undefined>;
    };

    expect(
      policy.buildDesktopBackendEnvironment?.({
        TEACHHELPER_AI_MODEL: "gpt-5.5",
        TEACHHELPER_AI_REASONING_EFFORT: "high"
      })
    ).toMatchObject({
      TEACHHELPER_AI_MODEL: "gpt-5.6-sol",
      TEACHHELPER_AI_REASONING_EFFORT: "xhigh"
    });
  });

  it("keeps Chromium profile and app data below LOCALAPPDATA on Windows", () => {
    expect(
      resolveElectronDataRoot({
        platform: "win32",
        environment: {
          LOCALAPPDATA: "C:\\Users\\Teacher\\AppData\\Local"
        },
        homeDirectory: "C:\\Users\\Teacher"
      })
    ).toBe(path.resolve("C:\\Users\\Teacher\\AppData\\Local", "TeachHelper"));
  });

  it("honors an explicit desktop data root", () => {
    expect(
      resolveElectronDataRoot({
        platform: "win32",
        environment: {
          LOCALAPPDATA: "C:\\Users\\Teacher\\AppData\\Local",
          TEACHHELPER_DATA_ROOT: "D:\\TeachHelperData"
        },
        homeDirectory: "C:\\Users\\Teacher"
      })
    ).toBe(path.resolve("D:\\TeachHelperData"));
  });

  it("creates a hidden, constrained window with no renderer Node access", () => {
    const options = buildTeachHelperWindowOptions({
      preloadPath: "E:\\teachhelper\\desktop\\preload.cjs",
      iconPath: "E:\\teachhelper\\public\\teachhelper-icon.ico"
    });

    expect(options).toMatchObject({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 700,
      show: false,
      backgroundColor: "#080b10",
      autoHideMenuBar: true,
      icon: path.resolve("E:\\teachhelper\\public\\teachhelper-icon.ico"),
      webPreferences: {
        preload: path.resolve("E:\\teachhelper\\desktop\\preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false
      }
    });
  });

  it("creates one strict HttpOnly cookie for the loopback application origin", () => {
    expect(
      buildDesktopSessionCookie({
        applicationUrl: "http://127.0.0.1:43123",
        sessionToken: "session-token"
      })
    ).toEqual({
      url: "http://127.0.0.1:43123",
      name: "teachhelper_desktop_session",
      value: "session-token",
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/"
    });
  });

  it("allows only navigation within the exact local application origin", () => {
    const applicationUrl = "http://127.0.0.1:43123";

    expect(
      isAllowedDesktopNavigation({
        applicationUrl,
        targetUrl: "http://127.0.0.1:43123/library/questions"
      })
    ).toBe(true);
    expect(
      isAllowedDesktopNavigation({
        applicationUrl,
        targetUrl: "http://localhost:43123/library/questions"
      })
    ).toBe(false);
    expect(
      isAllowedDesktopNavigation({
        applicationUrl,
        targetUrl: "https://example.com/"
      })
    ).toBe(false);
    expect(
      isAllowedDesktopNavigation({
        applicationUrl,
        targetUrl: "file:///C:/Windows/System32/config"
      })
    ).toBe(false);
  });
});
