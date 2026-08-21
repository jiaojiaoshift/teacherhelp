import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  callOpenAiCompatibleJsonModel,
  getOpenAiCompatibleErrorDiagnostic,
  getOpenAiCompatibleErrorDiagnosticId,
  isOpenAiCompatibleGatewayEnabled,
  resolveOpenAiCompatibleConfig
} from "@/lib/ai/openai-compatible-gateway";

describe("openai-compatible-gateway", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();

    for (const tmpRoot of tmpRoots.splice(0)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  function createCodexHome(input?: {
    providerName?: string;
    model?: string;
    baseURL?: string;
    wireApi?: "responses" | "chat_completions";
    apiKey?: string;
  }) {
    const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "teachhelper-ccswitch-test-"));
    const codexHome = path.join(tmpRoot, ".codex");
    const providerName = input?.providerName ?? "RouteProxy";
    tmpRoots.push(tmpRoot);
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      path.join(codexHome, "config.toml"),
      [
        `model_provider = "${providerName}"`,
        `model = "${input?.model ?? "routed-model"}"`,
        "model_reasoning_effort = \"xhigh\"",
        "",
        `[model_providers.${providerName}]`,
        `name = "${providerName}"`,
        `base_url = "${input?.baseURL ?? "http://127.0.0.1:15721/v1"}"`,
        `wire_api = "${input?.wireApi ?? "responses"}"`,
        "requires_openai_auth = true"
      ].join("\n"),
      "utf8"
    );
    writeFileSync(
      path.join(codexHome, "auth.json"),
      JSON.stringify({
        OPENAI_API_KEY: input?.apiKey ?? "local-proxy-key"
      }),
      "utf8"
    );

    return codexHome;
  }

  async function* streamEvents(events: unknown[]) {
    for (const event of events) {
      yield event;
    }
  }

  it("is enabled for the ccSwitch and generic OpenAI-compatible provider names", () => {
    expect(isOpenAiCompatibleGatewayEnabled({})).toBe(false);
    expect(isOpenAiCompatibleGatewayEnabled({ TEACHHELPER_AI_PROVIDER: "local" })).toBe(false);
    expect(isOpenAiCompatibleGatewayEnabled({ TEACHHELPER_AI_PROVIDER: "ccswitch" })).toBe(true);
    expect(isOpenAiCompatibleGatewayEnabled({ TEACHHELPER_AI_PROVIDER: "openai-compatible" })).toBe(
      true
    );
  });

  it("reduces gateway failures to safe diagnostics without returning raw error text", () => {
    const upstreamError = Object.assign(new Error("request includes sensitive upstream text"), {
      status: 400,
      code: "invalid_request_error"
    });

    expect(getOpenAiCompatibleErrorDiagnostic(upstreamError)).toEqual({
      kind: "upstream_http",
      status: 400,
      code: "invalid_request_error"
    });
    expect(
      getOpenAiCompatibleErrorDiagnostic(new Error("AI gateway did not return JSON."))
    ).toEqual({
      kind: "invalid_json"
    });
    expect(
      getOpenAiCompatibleErrorDiagnostic(
        new Error("It looks like you're running in a browser-like environment.")
      )
    ).toEqual({
      kind: "browser_environment"
    });
  });

  it("uses the active ccSwitch Codex config before stale generic OpenAI environment values", () => {
    const codexHome = createCodexHome();

    expect(
      resolveOpenAiCompatibleConfig(
        {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          CODEX_HOME: codexHome,
          OPENAI_BASE_URL: "https://stale-relay.example/v1",
          OPENAI_MODEL: "stale-model",
          OPENAI_API_KEY: "stale-key"
        },
        "win32"
      )
    ).toEqual({
      baseURL: "http://127.0.0.1:15721/v1",
      apiKey: "local-proxy-key",
      model: "routed-model",
      reasoningEffort: "xhigh",
      wireApi: "responses",
      providerName: "RouteProxy"
    });
  });

  it("upgrades a legacy gpt-5.5 selection to gpt-5.6-sol with xhigh reasoning", () => {
    const codexHome = createCodexHome({
      model: "gpt-5.5"
    });

    expect(
      resolveOpenAiCompatibleConfig(
        {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          CODEX_HOME: codexHome
        },
        "win32"
      )
    ).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh"
    });
  });

  it("uses the current default model when ccSwitch has no model selector", () => {
    expect(
      resolveOpenAiCompatibleConfig(
        {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          TEACHHELPER_AI_BASE_URL: "http://127.0.0.1:15721/v1",
          TEACHHELPER_AI_API_KEY: "local-proxy-key"
        },
        "win32"
      )
    ).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh"
    });
  });

  it("uses persisted direct API settings when the UI selects API mode", () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "teachhelper-settings-gateway-"));
    tmpRoots.push(dataRoot);
    writeFileSync(
      path.join(dataRoot, "settings.json"),
      JSON.stringify({
        version: 1,
        theme: "dark",
        ai: {
          mode: "api",
          apiPreset: "qwen",
          baseUrl: "https://api.example.test/v1",
          apiKey: "redacted-test-key",
          model: "qwen-plus",
          wireApi: "chat_completions",
          reasoningEffort: "high"
        }
      }),
      "utf8"
    );

    expect(
      resolveOpenAiCompatibleConfig(
        {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          TEACHHELPER_DATA_ROOT: dataRoot
        },
        "win32"
      )
    ).toEqual({
      baseURL: "https://api.example.test/v1",
      apiKey: "redacted-test-key",
      model: "qwen-plus",
      reasoningEffort: "high",
      wireApi: "chat_completions",
      providerName: "qwen"
    });
  });

  it("allows TeachHelper-specific values to explicitly override the ccSwitch config", () => {
    const codexHome = createCodexHome();

    expect(
      resolveOpenAiCompatibleConfig(
        {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          CODEX_HOME: codexHome,
          TEACHHELPER_AI_BASE_URL: "http://127.0.0.1:19000/v1",
          TEACHHELPER_AI_MODEL: "explicit-model",
          TEACHHELPER_AI_API_KEY: "explicit-key",
          TEACHHELPER_AI_WIRE_API: "chat_completions"
        },
        "win32"
      )
    ).toEqual({
      baseURL: "http://127.0.0.1:19000/v1",
      apiKey: "explicit-key",
      model: "explicit-model",
      reasoningEffort: "xhigh",
      wireApi: "chat_completions",
      providerName: "RouteProxy"
    });
  });

  it("consumes a streamed Responses API result from the ccSwitch local proxy", async () => {
    const codexHome = createCodexHome();
    const create = vi.fn(async () =>
      streamEvents([
        { type: "response.created" },
        { type: "response.output_text.delta", delta: '{"ok":' },
        { type: "response.output_text.delta", delta: "true}" },
        { type: "response.output_text.done", text: '{"ok":true}' },
        { type: "response.completed" }
      ])
    );

    const result = await callOpenAiCompatibleJsonModel<{ ok: boolean }>({
      taskName: "stream-smoke",
      prompt: "Return strict JSON.",
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        responses: {
          create
        }
      }
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "routed-model",
        stream: true,
        reasoning: { effort: "xhigh" },
        store: false
      }),
      expect.objectContaining({
        timeout: 180_000,
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("consumes a streamed Chat Completions result when that wire API is configured", async () => {
    const codexHome = createCodexHome({
      wireApi: "chat_completions"
    });
    const create = vi.fn(async () =>
      streamEvents([
        { choices: [{ delta: { content: '{"ok":' } }] },
        { choices: [{ delta: { content: "true}" } }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] }
      ])
    );

    const result = await callOpenAiCompatibleJsonModel<{ ok: boolean }>({
      taskName: "chat-stream-smoke",
      prompt: "Return strict JSON.",
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        chat: {
          completions: {
            create
          }
        }
      }
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "routed-model",
        stream: true
      }),
      expect.objectContaining({
        timeout: 180_000,
        signal: expect.any(AbortSignal)
      })
    );
  });

  it("keeps the Chat Completions system instruction compatible with the local relay", async () => {
    const codexHome = createCodexHome({
      wireApi: "chat_completions"
    });
    const create = vi.fn(async () => ({
      choices: [{ message: { content: '{"ok":true}' } }]
    }));

    const result = await callOpenAiCompatibleJsonModel<{ ok: boolean }>({
      taskName: "chat-instruction-compatibility",
      prompt: "Return strict JSON.",
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        TEACHHELPER_AI_STREAM: "false",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        chat: {
          completions: {
            create
          }
        }
      }
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "system",
            content:
              "You are a TeachHelper document-processing service. Return strict JSON only."
          },
          {
            role: "user",
            content: [{ type: "text", text: "Return strict JSON." }]
          }
        ]
      }),
      expect.anything()
    );
  });

  it("allows an image task to override the global reasoning effort", async () => {
    const codexHome = createCodexHome({
      wireApi: "chat_completions"
    });
    const create = vi.fn(async () => ({
      choices: [{ message: { content: '{"ok":true}' } }]
    }));

    await expect(
      callOpenAiCompatibleJsonModel<{ ok: boolean }>({
        taskName: "image-reasoning-override",
        prompt: "Return strict JSON.",
        reasoningEffort: "high",
        env: {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          TEACHHELPER_AI_STREAM: "false",
          CODEX_HOME: codexHome
        },
        platform: "win32",
        client: {
          chat: {
            completions: {
              create
            }
          }
        }
      })
    ).resolves.toEqual({ ok: true });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning_effort: "high"
      }),
      expect.anything()
    );
  });

  it("can opt into a non-streamed Responses request for unstable relay routes", async () => {
    const codexHome = createCodexHome();
    const create = vi.fn(async () => ({
      output_text: '{"ok":true}'
    }));

    const result = await callOpenAiCompatibleJsonModel<{ ok: boolean }>({
      taskName: "non-stream-smoke",
      prompt: "Return strict JSON.",
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        TEACHHELPER_AI_STREAM: "false",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        responses: {
          create
        }
      }
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "routed-model",
        stream: false,
        store: false
      }),
      expect.objectContaining({
        timeout: 180_000,
        signal: expect.any(AbortSignal)
      })
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty("max_output_tokens");
  });

  it("retries one failed ccSwitch response stream after route failover", async () => {
    const codexHome = createCodexHome();
    const create = vi
      .fn()
      .mockResolvedValueOnce(
        streamEvents([
          { type: "response.created" },
          { type: "response.failed", response: { error: { message: "upstream failed" } } }
        ])
      )
      .mockResolvedValueOnce(
        streamEvents([
          { type: "response.output_text.delta", delta: '{"ok":true}' },
          { type: "response.completed" }
        ])
      );

    const result = await callOpenAiCompatibleJsonModel<{ ok: boolean }>({
      taskName: "failover-smoke",
      prompt: "Return strict JSON.",
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        TEACHHELPER_AI_RETRY_DELAY_MS: "0",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        responses: {
          create
        }
      }
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries a 400 wrapper when the relay reports an upstream failure", async () => {
    const codexHome = createCodexHome();
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("400 Upstream request failed request id: redacted"), {
          status: 400
        })
      )
      .mockResolvedValueOnce({
        output_text: '{"ok":true}'
      });

    const result = await callOpenAiCompatibleJsonModel<{ ok: boolean }>({
      taskName: "upstream-wrapper-retry",
      prompt: "Return strict JSON.",
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        TEACHHELPER_AI_RETRY_DELAY_MS: "0",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        responses: {
          create
        }
      }
    });

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("enforces the timeout across the complete streamed response", async () => {
    const codexHome = createCodexHome();
    async function* neverEndingStream() {
      yield { type: "response.created" };
      await new Promise(() => undefined);
    }
    const request = callOpenAiCompatibleJsonModel({
      taskName: "stream-wall-clock-timeout",
      prompt: "Return strict JSON.",
      timeoutMs: 15,
      env: {
        TEACHHELPER_AI_PROVIDER: "ccswitch",
        TEACHHELPER_AI_MAX_ATTEMPTS: "1",
        CODEX_HOME: codexHome
      },
      platform: "win32",
      client: {
        responses: {
          create: vi.fn(async () => neverEndingStream())
        }
      }
    });
    const outcome = await Promise.race([
      request.then(
        () => ({ type: "resolved" as const }),
        (error: unknown) => ({ type: "rejected" as const, error })
      ),
      new Promise<{ type: "still-pending" }>((resolve) =>
        setTimeout(() => resolve({ type: "still-pending" }), 100)
      )
    ]);

    expect(outcome.type).toBe("rejected");
    if (outcome.type === "rejected") {
      expect(getOpenAiCompatibleErrorDiagnostic(outcome.error)).toEqual({
        kind: "timeout"
      });
    }
  });

  it("does not retry a non-transient upstream 400 response", async () => {
    const codexHome = createCodexHome();
    const logDirectory = path.join(path.dirname(codexHome), "ai-error-logs");
    const create = vi.fn().mockRejectedValue(
      Object.assign(new Error("invalid request with secret sk-test-never-log"), {
        status: 400,
        code: "invalid_request_error"
      })
    );
    let caughtError: unknown;

    try {
      await callOpenAiCompatibleJsonModel({
        taskName: "bad-request-smoke",
        prompt: "private prompt content must not be logged",
        env: {
          TEACHHELPER_AI_PROVIDER: "ccswitch",
          TEACHHELPER_AI_RETRY_DELAY_MS: "0",
          TEACHHELPER_AI_LOG_DIR: logDirectory,
          CODEX_HOME: codexHome
        },
        platform: "win32",
        client: {
          responses: {
            create
          }
        }
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toMatchObject({
      status: 400
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(getOpenAiCompatibleErrorDiagnosticId(caughtError)).toMatch(/^aierr-/);

    const logFiles = readdirSync(logDirectory);
    expect(logFiles).toHaveLength(1);

    const logText = readFileSync(path.join(logDirectory, logFiles[0]), "utf8");
    const entry = JSON.parse(logText.trim());

    expect(entry).toMatchObject({
      taskName: "bad-request-smoke",
      attempt: 1,
      maxAttempts: 2,
      providerName: "RouteProxy",
      model: "routed-model",
      wireApi: "responses",
      diagnostic: {
        kind: "upstream_http",
        status: 400,
        code: "invalid_request_error"
      }
    });
    expect(entry.diagnosticId).toBe(getOpenAiCompatibleErrorDiagnosticId(caughtError));
    expect(logText).not.toContain("private prompt content");
    expect(logText).not.toContain("sk-test-never-log");
    expect(logText).not.toContain("local-proxy-key");
  });
});
