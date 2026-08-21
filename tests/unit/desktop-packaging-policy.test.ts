import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

import { loadImage } from "@napi-rs/canvas";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("desktop packaging policy", () => {
  it("uses Electron entry points and explicit desktop scripts", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as {
      main?: string;
      directories?: Record<string, string>;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.main).toBe("desktop/main.cjs");
    expect(packageJson.directories).toBeUndefined();
    expect(packageJson.scripts).toMatchObject({
      "desktop:next:build": "node ./scripts/build-desktop-next.mjs",
      "desktop:run": "electron .",
      "desktop:pack":
        "npm run desktop:next:build && electron-builder --dir --config desktop/electron-builder.config.cjs",
      "desktop:dist":
        "npm run desktop:next:build && electron-builder --win nsis --config desktop/electron-builder.config.cjs"
    });
    expect(packageJson.devDependencies?.electron).toBeTruthy();
    expect(packageJson.devDependencies?.["electron-builder"]).toBeTruthy();
  });

  it("packages only the shell and standalone backend without private state", () => {
    const config = require("../../desktop/electron-builder.config.cjs") as {
      asar: boolean;
      beforeBuild?: () => boolean | Promise<boolean>;
      files: string[];
      extraResources: Array<{ from: string; to: string; filter?: string[] }>;
      publish: unknown[];
      nsis: Record<string, unknown>;
    };

    expect(config.asar).toBe(true);
    expect(config.beforeBuild).toBeTypeOf("function");
    expect(config.beforeBuild?.()).toBe(false);
    expect(config.files).toEqual([
      "desktop/main.cjs",
      "desktop/preload.cjs",
      "desktop/backend-runtime.mjs",
      "desktop/electron-policy.mjs",
      "package.json"
    ]);
    expect(config.extraResources).toEqual([
      {
        from: ".next-desktop",
        to: "backend",
        filter: ["standalone/**/*"]
      },
      {
        from: "desktop/resources/icon.png",
        to: "app-icon.png"
      }
    ]);
    expect(config.publish).toEqual([]);
    expect(config.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false
    });

    const packageInputs = JSON.stringify({
      files: config.files,
      extraResources: config.extraResources
    });
    for (const forbidden of [
      ".env",
      ".codex",
      ".cc-connect",
      "data/",
      "logs/",
      "tmp/",
      "*.pdf"
    ]) {
      expect(packageInputs).not.toContain(forbidden);
    }
  });

  it("uses a square high-resolution copy of the approved launcher artwork", async () => {
    const icon = await loadImage(
      readFileSync(path.join(process.cwd(), "desktop", "resources", "icon.png"))
    );

    expect(icon.width).toBe(512);
    expect(icon.height).toBe(512);
  });
});
