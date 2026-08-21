import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCodexExecInvocation,
  callCodexJsonAgent,
  isCodexAgentEnabled
} from "@/lib/ai/codex-agent-gateway";

describe("codex-agent-gateway", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();

    for (const tmpRoot of tmpRoots.splice(0)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  function createTempDir() {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "teachhelper-codex-test-"));
    tmpRoots.push(tmpRoot);
    return tmpRoot;
  }

  it("is enabled only when TeachHelper explicitly selects the codex provider", () => {
    expect(isCodexAgentEnabled({})).toBe(false);
    expect(isCodexAgentEnabled({ TEACHHELPER_AI_PROVIDER: "local" })).toBe(false);
    expect(isCodexAgentEnabled({ TEACHHELPER_AI_PROVIDER: "codex" })).toBe(true);
  });

  it("builds a local codex exec invocation without provider-specific secrets", () => {
    const invocation = buildCodexExecInvocation({
      cwd: "E:\\teachhelper",
      outputLastMessagePath: "E:\\tmp\\last-message.json",
      imagePaths: ["E:\\tmp\\page.png"],
      env: {
        APPDATA: "C:\\Users\\32503\\AppData\\Roaming",
        TEACHHELPER_UNUSED_SECRET: "must-not-be-used"
      },
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
      codexJsPathExists: true
    });

    expect(invocation.command).toBe("C:\\Program Files\\nodejs\\node.exe");
    expect(invocation.env.CODEX_HOME).toBe("C:\\Users\\32503\\.codex");
    expect(invocation.args).toContain(
      "C:\\Users\\32503\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"
    );
    expect(invocation.args).toContain("exec");
    expect(invocation.args).toContain("--skip-git-repo-check");
    expect(invocation.args).toContain("--ephemeral");
    expect(invocation.args).toContain("--sandbox");
    expect(invocation.args).toContain("read-only");
    expect(invocation.args).not.toContain("--ask-for-approval");
    expect(invocation.args).not.toContain("never");
    expect(invocation.args).toContain("--image");
    expect(invocation.args).toContain("E:\\tmp\\page.png");
    expect(invocation.args).not.toContain("must-not-be-used");
  });

  it("preserves an explicit CODEX_HOME for the local codex subprocess", () => {
    const invocation = buildCodexExecInvocation({
      cwd: "E:\\teachhelper",
      outputLastMessagePath: "E:\\tmp\\last-message.json",
      env: {
        APPDATA: "C:\\Users\\32503\\AppData\\Roaming",
        CODEX_HOME: "E:\\tmp\\custom-codex-home",
        USERPROFILE: "C:\\Users\\32503"
      },
      platform: "win32",
      nodeExecPath: "C:\\Program Files\\nodejs\\node.exe",
      codexJsPathExists: true
    });

    expect(invocation.env.CODEX_HOME).toBe("E:\\tmp\\custom-codex-home");
  });

  it("writes data-url images to temporary files and parses the last JSON message", async () => {
    const tmpRoot = createTempDir();
    const spawn = vi.fn(async (input: { outputLastMessagePath: string; prompt: string }) => {
      expect(input.prompt).toContain("Return strict JSON only");
      writeFileSync(
        input.outputLastMessagePath,
        "```json\n{\"detections\":[{\"id\":\"draft-1\",\"localOrder\":1,\"confidence\":0.95,\"normalizedBBox\":{\"x1\":10,\"y1\":20,\"x2\":900,\"y2\":300}}]}\n```",
        "utf8"
      );
    });

    const result = await callCodexJsonAgent<{ detections: unknown[] }>({
      taskName: "detect-question-boxes",
      prompt: "Return strict JSON only.",
      imageDataUrls: ["data:image/png;base64,cGFnZQ=="],
      tmpRoot,
      spawn
    });

    expect(result).toEqual({
      detections: [
        {
          id: "draft-1",
          localOrder: 1,
          confidence: 0.95,
          normalizedBBox: {
            x1: 10,
            y1: 20,
            x2: 900,
            y2: 300
          }
        }
      ]
    });
    expect(spawn).toHaveBeenCalledTimes(1);

    const imagePath = spawn.mock.calls[0][0].imagePaths[0];
    expect(readFileSync(imagePath, "utf8")).toBe("page");
  });
});
