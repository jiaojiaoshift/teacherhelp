import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { waitForServerReady } from "../../scripts/lib/teacherhelp-launcher-service.mjs";

describe("teacherhelp launcher", () => {
  it("exposes a root Windows command shim that forwards to the launcher script", () => {
    const cmdPath = path.join(process.cwd(), "teacherhelp.cmd");

    expect(existsSync(cmdPath)).toBe(true);
    expect(readFileSync(cmdPath, "utf8")).toContain("scripts\\teacherhelp-cli.mjs");
  });

  it("prints the web dev-server startup plan in dry-run mode", () => {
    const output = execFileSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "teacherhelp-cli.mjs"), "--dry-run", "--port", "3015", "--no-open"],
      {
        cwd: process.cwd(),
        encoding: "utf8"
      }
    );

    const plan = JSON.parse(output) as {
      projectRoot: string;
      url: string;
      openBrowser: boolean;
      aiProvider: string;
      aiModel: string;
      aiReasoningEffort: string;
      codexHome: string | null;
      command: string;
      args: string[];
      shell: boolean;
    };

    expect(plan.projectRoot).toBe(process.cwd());
    expect(plan.url).toBe("http://localhost:3015");
    expect(plan.openBrowser).toBe(false);
    expect(plan.aiProvider).toBe("ccswitch");
    expect(plan.aiModel).toBe("gpt-5.6-sol");
    expect(plan.aiReasoningEffort).toBe("xhigh");
    expect(plan.codexHome).toBe(
      process.platform === "win32"
        ? path.join(process.env.USERPROFILE ?? path.resolve(process.env.APPDATA ?? "", "..", ".."), ".codex")
        : path.join(process.env.HOME ?? "", ".codex")
    );
    expect(plan.command).toBe(process.platform === "win32" ? "npm.cmd" : "npm");
    expect(plan.args).toEqual(["run", "dev", "--", "-H", "0.0.0.0", "-p", "3015"]);
    expect(plan.shell).toBe(process.platform === "win32");
  });

  it("accepts both -stop and --stop without requiring the project directory", () => {
    for (const stopFlag of ["-stop", "--stop"]) {
      const output = execFileSync(
        process.execPath,
        [path.join(process.cwd(), "scripts", "teacherhelp-cli.mjs"), "--dry-run", stopFlag],
        {
          cwd: path.parse(process.cwd()).root,
          encoding: "utf8"
        }
      );
      const plan = JSON.parse(output) as {
        action: string;
        projectRoot: string;
        metadataPath: string;
      };

      expect(plan).toMatchObject({
        action: "stop",
        projectRoot: process.cwd()
      });
      expect(plan.metadataPath).toBe(
        path.join(process.cwd(), "tmp", "teacherhelp-runtime.json")
      );
    }
  });

  it("preserves an explicit CODEX_HOME in the startup plan", () => {
    const explicitCodexHome = path.join(process.cwd(), "tmp", "codex-home");
    const output = execFileSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "teacherhelp-cli.mjs"), "--dry-run", "--no-open"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_HOME: explicitCodexHome
        }
      }
    );

    const plan = JSON.parse(output) as {
      codexHome: string | null;
    };

    expect(plan.codexHome).toBe(explicitCodexHome);
  });

  it("allows a TeachHelper-specific model override without changing global Codex config", () => {
    const output = execFileSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "teacherhelp-cli.mjs"), "--dry-run", "--no-open"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          TEACHHELPER_AI_MODEL: "test-model",
          TEACHHELPER_AI_REASONING_EFFORT: "high"
        }
      }
    );

    const plan = JSON.parse(output) as {
      aiModel: string;
      aiReasoningEffort: string;
    };

    expect(plan.aiModel).toBe("test-model");
    expect(plan.aiReasoningEffort).toBe("high");
  });

  it("does not pass a legacy model from the shell into the dev server", () => {
    const output = execFileSync(
      process.execPath,
      [path.join(process.cwd(), "scripts", "teacherhelp-cli.mjs"), "--dry-run", "--no-open"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          TEACHHELPER_AI_MODEL: "gpt-5.5",
          TEACHHELPER_AI_REASONING_EFFORT: "high"
        }
      }
    );

    const plan = JSON.parse(output) as {
      aiModel: string;
      aiReasoningEffort: string;
    };

    expect(plan.aiModel).toBe("gpt-5.6-sol");
    expect(plan.aiReasoningEffort).toBe("xhigh");
  });

  it("waits until the web URL is reachable before opening the browser", async () => {
    let attempts = 0;

    const result = await waitForServerReady("http://localhost:3015", {
      intervalMs: 0,
      timeoutMs: 1000,
      probe: async () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("not ready");
        }

        return {
          statusCode: 200
        };
      }
    });

    expect(result.statusCode).toBe(200);
    expect(attempts).toBe(3);
  });
});
