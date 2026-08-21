import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import OpenAI from "openai";

import {
  appendAiErrorLog,
  createAiErrorDiagnosticId
} from "@/lib/ai/ai-error-log";
import { readTeachHelperSettingsSync } from "@/lib/server/teachhelper-settings-repository";

type AiEnv = Record<string, string | undefined>;
type AiWireApi = "responses" | "chat_completions";

export interface OpenAiCompatibleConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  reasoningEffort: string | null;
  wireApi: AiWireApi;
  providerName: string;
}

export interface OpenAiCompatibleErrorDiagnostic {
  kind:
    | "upstream_http"
    | "invalid_json"
    | "stream_failed"
    | "gateway_not_configured"
    | "browser_environment"
    | "timeout"
    | "unknown";
  status?: number;
  code?: string;
}

interface ParsedCodexProviderConfig {
  name?: string;
  baseURL?: string;
  wireApi?: string;
  requiresOpenAiAuth?: boolean;
}

interface ParsedCodexConfig {
  modelProvider?: string;
  model?: string;
  modelReasoningEffort?: string;
  providers: Record<string, ParsedCodexProviderConfig>;
}

export interface OpenAiCompatibleClient {
  responses?: {
    create: (
      body: Record<string, unknown>,
      options?: { timeout?: number; signal?: AbortSignal }
    ) => Promise<unknown>;
  };
  chat?: {
    completions?: {
      create: (
        body: Record<string, unknown>,
        options?: { timeout?: number; signal?: AbortSignal }
      ) => Promise<unknown>;
    };
  };
}

export interface OpenAiCompatibleJsonModelInput {
  taskName: string;
  prompt: string;
  imageDataUrls?: string[];
  reasoningEffort?: string;
  env?: AiEnv;
  platform?: NodeJS.Platform;
  timeoutMs?: number;
  client?: OpenAiCompatibleClient;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 400;
export const DEFAULT_TEACHHELPER_AI_MODEL = "gpt-5.6-sol";
export const DEFAULT_TEACHHELPER_AI_REASONING_EFFORT = "xhigh";
const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  "api",
  "ccswitch",
  "cc-switch",
  "openai",
  "openai-compatible",
  "openai_compatible"
]);
const errorDiagnosticIds = new WeakMap<object, string>();
const errorDiagnostics = new WeakMap<object, OpenAiCompatibleErrorDiagnostic>();

export function getOpenAiCompatibleErrorDiagnosticId(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const recordedId = errorDiagnosticIds.get(error);
  if (recordedId) {
    return recordedId;
  }

  const explicitId = (error as { diagnosticId?: unknown }).diagnosticId;
  return typeof explicitId === "string" && /^aierr-[A-Za-z0-9-]{3,100}$/.test(explicitId)
    ? explicitId
    : null;
}

export function getOpenAiCompatibleErrorDiagnostic(
  error: unknown
): OpenAiCompatibleErrorDiagnostic {
  if (error && typeof error === "object") {
    const recordedDiagnostic = errorDiagnostics.get(error);
    if (recordedDiagnostic) {
      return recordedDiagnostic;
    }
  }

  const record = error && typeof error === "object"
    ? (error as { status?: unknown; code?: unknown; message?: unknown; name?: unknown })
    : null;
  const message = typeof record?.message === "string" ? record.message.toLowerCase() : "";
  const status =
    typeof record?.status === "number" &&
    Number.isInteger(record.status) &&
    record.status >= 400 &&
    record.status <= 599
      ? record.status
      : undefined;
  const code =
    typeof record?.code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(record.code)
      ? record.code
      : undefined;

  if (message.includes("did not return json") || error instanceof SyntaxError) {
    return { kind: "invalid_json" };
  }

  if (message.includes("stream failed")) {
    return { kind: "stream_failed" };
  }

  if (message.includes("gateway is not configured")) {
    return { kind: "gateway_not_configured" };
  }

  if (message.includes("browser-like environment")) {
    return { kind: "browser_environment" };
  }

  if (
    record?.name === "AbortError" ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    return { kind: "timeout" };
  }

  if (status) {
    return {
      kind: "upstream_http",
      status,
      ...(code ? { code } : {})
    };
  }

  return { kind: "unknown" };
}

function tagAiError(input: {
  error: unknown;
  diagnosticId: string;
  diagnostic: OpenAiCompatibleErrorDiagnostic;
}): object {
  const taggedError = input.error && typeof input.error === "object"
    ? input.error
    : new Error("OpenAI-compatible AI gateway request failed.");

  errorDiagnosticIds.set(taggedError, input.diagnosticId);
  errorDiagnostics.set(taggedError, input.diagnostic);

  return taggedError;
}

async function recordAiError(input: {
  error: unknown;
  taskName: string;
  attempt: number;
  maxAttempts: number;
  providerName: string;
  model: string;
  wireApi: string;
  elapsedMs: number;
  logDirectory?: string;
}): Promise<object> {
  const diagnostic = getOpenAiCompatibleErrorDiagnostic(input.error);
  const diagnosticId = createAiErrorDiagnosticId();
  const taggedError = tagAiError({
    error: input.error,
    diagnosticId,
    diagnostic
  });

  try {
    await appendAiErrorLog({
      diagnosticId,
      taskName: input.taskName,
      attempt: input.attempt,
      maxAttempts: input.maxAttempts,
      providerName: input.providerName,
      model: input.model,
      wireApi: input.wireApi,
      elapsedMs: input.elapsedMs,
      diagnostic,
      logDirectory: input.logDirectory
    });
  } catch {
    // Logging must never replace the original AI failure.
  }

  return taggedError;
}

function normalizeProvider(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

export function isLegacyTeachHelperAiModel(value?: string): boolean {
  return /^gpt-5\.5(?:$|[-_])/iu.test(value?.trim() ?? "");
}

function resolveTeachHelperAiModel(input: {
  configuredModel?: string;
  useDefaultWhenMissing: boolean;
}): { model: string | null; wasUpgraded: boolean } {
  const configuredModel = input.configuredModel?.trim();

  if (configuredModel && !isLegacyTeachHelperAiModel(configuredModel)) {
    return {
      model: configuredModel,
      wasUpgraded: false
    };
  }

  if (configuredModel || input.useDefaultWhenMissing) {
    return {
      model: DEFAULT_TEACHHELPER_AI_MODEL,
      wasUpgraded: true
    };
  }

  return {
    model: null,
    wasUpgraded: false
  };
}

function normalizeWireApi(value?: string | null): AiWireApi {
  const normalized = value?.trim().toLowerCase().replace(/[.-]/g, "_");

  return normalized === "chat" || normalized === "chat_completions"
    ? "chat_completions"
    : "responses";
}

export function isOpenAiCompatibleGatewayEnabled(env: AiEnv): boolean {
  return OPENAI_COMPATIBLE_PROVIDERS.has(normalizeProvider(env.TEACHHELPER_AI_PROVIDER));
}

function resolveCodexHome(env: AiEnv, platform: NodeJS.Platform): string | null {
  if (env.CODEX_HOME) {
    return env.CODEX_HOME;
  }

  if (platform === "win32") {
    if (env.USERPROFILE) {
      return path.join(env.USERPROFILE, ".codex");
    }

    if (env.APPDATA) {
      return path.join(path.resolve(env.APPDATA, "..", ".."), ".codex");
    }

    return null;
  }

  return env.HOME ? path.join(env.HOME, ".codex") : null;
}

function parseTomlStringValue(rawValue: string): string | undefined {
  const trimmed = rawValue.trim();
  const quoted = /^["']([\s\S]*)["']$/.exec(trimmed);

  return quoted?.[1] ?? (trimmed || undefined);
}

function parseTomlBooleanValue(rawValue: string): boolean | undefined {
  const normalized = rawValue.trim().toLowerCase();

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return undefined;
}

function parseCodexConfig(content: string): ParsedCodexConfig {
  const config: ParsedCodexConfig = {
    providers: {}
  };
  let currentProvider: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();

    if (!line) {
      continue;
    }

    const providerSection = /^\[model_providers\.("?)([^"\]]+)\1\]$/.exec(line);
    if (providerSection) {
      currentProvider = providerSection[2];
      config.providers[currentProvider] ??= {};
      continue;
    }

    if (line.startsWith("[")) {
      currentProvider = null;
      continue;
    }

    const assignment = /^([A-Za-z0-9_]+)\s*=\s*([\s\S]+)$/.exec(line);
    if (!assignment) {
      continue;
    }

    const [, key, rawValue] = assignment;

    if (currentProvider) {
      const provider = config.providers[currentProvider];

      if (key === "name") {
        provider.name = parseTomlStringValue(rawValue);
      } else if (key === "base_url") {
        provider.baseURL = parseTomlStringValue(rawValue);
      } else if (key === "wire_api") {
        provider.wireApi = parseTomlStringValue(rawValue);
      } else if (key === "requires_openai_auth") {
        provider.requiresOpenAiAuth = parseTomlBooleanValue(rawValue);
      }

      continue;
    }

    if (key === "model_provider") {
      config.modelProvider = parseTomlStringValue(rawValue);
    } else if (key === "model") {
      config.model = parseTomlStringValue(rawValue);
    } else if (key === "model_reasoning_effort") {
      config.modelReasoningEffort = parseTomlStringValue(rawValue);
    }
  }

  return config;
}

function readCodexConfig(input: {
  env: AiEnv;
  platform: NodeJS.Platform;
}): ParsedCodexConfig | null {
  const codexHome = resolveCodexHome(input.env, input.platform);
  const configPath = codexHome ? path.join(codexHome, "config.toml") : null;

  if (!configPath || !existsSync(configPath)) {
    return null;
  }

  return parseCodexConfig(readFileSync(configPath, "utf8"));
}

function readCodexOpenAiApiKey(input: {
  env: AiEnv;
  platform: NodeJS.Platform;
}): string | undefined {
  const codexHome = resolveCodexHome(input.env, input.platform);
  const authPath = codexHome ? path.join(codexHome, "auth.json") : null;

  if (!authPath || !existsSync(authPath)) {
    return undefined;
  }

  try {
    const auth = JSON.parse(readFileSync(authPath, "utf8")) as {
      OPENAI_API_KEY?: unknown;
    };

    return typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.trim()
      ? auth.OPENAI_API_KEY
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveOpenAiCompatibleConfig(
  env: AiEnv,
  platform: NodeJS.Platform = process.platform
): OpenAiCompatibleConfig | null {
  const persistedSettings = readTeachHelperSettingsSync(env as NodeJS.ProcessEnv);
  const persistedAi = persistedSettings?.ai;
  const persistedDirectMode = persistedAi?.mode === "api" || persistedAi?.mode === "local";

  if (!isOpenAiCompatibleGatewayEnabled(env) && !persistedDirectMode) {
    return null;
  }

  const effectiveEnv: AiEnv = persistedDirectMode
    ? {
        ...env,
        TEACHHELPER_AI_PROVIDER: "api",
        TEACHHELPER_AI_BASE_URL: persistedAi.baseUrl,
        TEACHHELPER_AI_API_KEY: persistedAi.apiKey,
        TEACHHELPER_AI_MODEL: persistedAi.model,
        TEACHHELPER_AI_WIRE_API: persistedAi.wireApi,
        TEACHHELPER_AI_REASONING_EFFORT: persistedAi.reasoningEffort
      }
    : env;

  const codexConfig = readCodexConfig({
    env: effectiveEnv,
    platform
  });
  const activeProviderName = effectiveEnv.TEACHHELPER_AI_CODEX_PROVIDER?.trim() || codexConfig?.modelProvider;
  const activeProvider = activeProviderName ? codexConfig?.providers[activeProviderName] : undefined;
  const preferCodexConfig = ["ccswitch", "cc-switch"].includes(
    normalizeProvider(effectiveEnv.TEACHHELPER_AI_PROVIDER)
  );
  const codexApiKey = readCodexOpenAiApiKey({
    env: effectiveEnv,
    platform
  });
  const baseURL =
    effectiveEnv.TEACHHELPER_AI_BASE_URL?.trim() ||
    (preferCodexConfig
      ? activeProvider?.baseURL?.trim() || env.OPENAI_BASE_URL?.trim()
      : effectiveEnv.OPENAI_BASE_URL?.trim() || activeProvider?.baseURL?.trim());
  const configuredModel =
    effectiveEnv.TEACHHELPER_AI_MODEL?.trim() ||
    (preferCodexConfig
      ? codexConfig?.model?.trim() || env.OPENAI_MODEL?.trim()
      : effectiveEnv.OPENAI_MODEL?.trim() || codexConfig?.model?.trim());
  const modelSelection = resolveTeachHelperAiModel({
    configuredModel,
    useDefaultWhenMissing: preferCodexConfig
  });
  const explicitReasoningEffort = effectiveEnv.TEACHHELPER_AI_REASONING_EFFORT?.trim();
  const configuredReasoningEffort =
    explicitReasoningEffort ||
    (modelSelection.wasUpgraded
      ? DEFAULT_TEACHHELPER_AI_REASONING_EFFORT
      : codexConfig?.modelReasoningEffort?.trim());
  const reasoningEffort = configuredReasoningEffort?.toLowerCase() === "ultra"
    ? "xhigh"
    : configuredReasoningEffort || null;
  const apiKey =
    effectiveEnv.TEACHHELPER_AI_API_KEY?.trim() ||
    (preferCodexConfig
      ? codexApiKey || env.OPENAI_API_KEY?.trim()
      : effectiveEnv.OPENAI_API_KEY?.trim() || codexApiKey);

  if (!baseURL || !modelSelection.model || !apiKey) {
    return null;
  }

  return {
    baseURL,
    apiKey,
    model: modelSelection.model,
    reasoningEffort,
    wireApi: normalizeWireApi(effectiveEnv.TEACHHELPER_AI_WIRE_API || activeProvider?.wireApi),
    providerName:
      (persistedDirectMode ? persistedAi.apiPreset || persistedAi.mode : activeProviderName) ||
      "openai_compatible"
  };
}

function createOpenAiCompatibleClient(config: OpenAiCompatibleConfig): OpenAiCompatibleClient {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    maxRetries: 0
  }) as unknown as OpenAiCompatibleClient;
}

function getMaxOutputTokens(env: AiEnv): number | null {
  const rawValue = env.TEACHHELPER_AI_MAX_OUTPUT_TOKENS?.trim();

  if (!rawValue) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function getTemperature(env: AiEnv): number | null {
  const rawValue = env.TEACHHELPER_AI_TEMPERATURE?.trim();

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  return Number.isFinite(value) ? value : null;
}

function shouldStreamResponse(env: AiEnv): boolean {
  const value = env.TEACHHELPER_AI_STREAM?.trim().toLowerCase();

  return value !== "false" && value !== "0" && value !== "no" && value !== "off";
}

function getBoundedInteger(input: {
  rawValue?: string;
  fallback: number;
  minimum: number;
  maximum: number;
}): number {
  const parsed = Number(input.rawValue?.trim());

  if (!Number.isInteger(parsed)) {
    return input.fallback;
  }

  return Math.max(input.minimum, Math.min(input.maximum, parsed));
}

function isRetryableGatewayError(error: unknown): boolean {
  const diagnostic = getOpenAiCompatibleErrorDiagnostic(error);

  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";

  if (
    diagnostic.kind === "upstream_http" &&
    diagnostic.status === 400 &&
    message.includes("upstream request failed")
  ) {
    return true;
  }

  if (
    diagnostic.kind === "stream_failed" ||
    diagnostic.kind === "timeout" ||
    diagnostic.kind === "invalid_json" ||
    diagnostic.kind === "unknown"
  ) {
    return true;
  }

  return diagnostic.kind === "upstream_http" && Boolean(
    diagnostic.status &&
      ([408, 409, 425, 429].includes(diagnostic.status) || diagnostic.status >= 500)
  );
}

function waitForRetry(delayMs: number): Promise<void> {
  return delayMs > 0
    ? new Promise((resolve) => setTimeout(resolve, delayMs))
    : Promise.resolve();
}

async function runWithWallClockTimeout<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutError = Object.assign(
    new Error(`OpenAI-compatible request timed out after ${timeoutMs}ms.`),
    {
      name: "AbortError",
      code: "wall_clock_timeout"
    }
  );
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function getModelInstructions(): string {
  return [
    "You are a TeachHelper document-processing service.",
    "Return strict JSON only."
  ].join(" ");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fencedJson = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fencedJson?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start < 0 || end <= start) {
      throw new Error("AI gateway did not return JSON.");
    }

    return JSON.parse(candidate.slice(start, end + 1));
  }
}

function readResponsesText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const directText = (response as { output_text?: unknown }).output_text;
  if (typeof directText === "string") {
    return directText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) => {
        if (!part || typeof part !== "object") {
          return [];
        }

        const outputText = part as {
          type?: unknown;
          text?: unknown;
        };

        return outputText.type === "output_text" && typeof outputText.text === "string"
          ? [outputText.text]
          : [];
      });
    })
    .join("\n");
}

function readChatCompletionText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = (message as { content?: unknown }).content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? [(part as { text: string }).text]
        : []
    )
    .join("\n");
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in value &&
      typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}

function isFailedStreamEvent(event: unknown): boolean {
  if (!event || typeof event !== "object") {
    return false;
  }

  const type = (event as { type?: unknown }).type;
  return type === "error" || type === "response.failed";
}

async function readResponsesResultText(response: unknown): Promise<string> {
  if (!isAsyncIterable(response)) {
    return readResponsesText(response);
  }

  let deltaText = "";
  let doneText = "";
  let completedText = "";

  for await (const event of response) {
    if (isFailedStreamEvent(event)) {
      throw new Error("OpenAI-compatible Responses API stream failed.");
    }

    if (!event || typeof event !== "object") {
      continue;
    }

    const responseEvent = event as {
      type?: unknown;
      delta?: unknown;
      text?: unknown;
      response?: unknown;
    };

    if (responseEvent.type === "response.output_text.delta" && typeof responseEvent.delta === "string") {
      deltaText += responseEvent.delta;
    } else if (
      responseEvent.type === "response.output_text.done" &&
      typeof responseEvent.text === "string"
    ) {
      doneText = responseEvent.text;
    } else if (responseEvent.type === "response.completed") {
      completedText = readResponsesText(responseEvent.response);
    }
  }

  return deltaText || doneText || completedText;
}

function readChatCompletionDelta(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") {
    return "";
  }

  const choices = (chunk as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return "";
  }

  return choices
    .flatMap((choice) => {
      if (!choice || typeof choice !== "object") {
        return [];
      }

      const delta = (choice as { delta?: unknown }).delta;
      if (!delta || typeof delta !== "object") {
        return [];
      }

      const content = (delta as { content?: unknown }).content;
      if (typeof content === "string") {
        return [content];
      }

      if (!Array.isArray(content)) {
        return [];
      }

      return content.flatMap((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? [(part as { text: string }).text]
          : []
      );
    })
    .join("");
}

async function readChatCompletionsResultText(response: unknown): Promise<string> {
  if (!isAsyncIterable(response)) {
    return readChatCompletionText(response);
  }

  let outputText = "";

  for await (const chunk of response) {
    if (isFailedStreamEvent(chunk)) {
      throw new Error("OpenAI-compatible Chat Completions stream failed.");
    }

    outputText += readChatCompletionDelta(chunk);
  }

  return outputText;
}

async function callResponsesApi(input: {
  client: OpenAiCompatibleClient;
  config: OpenAiCompatibleConfig;
  env: AiEnv;
  reasoningEffort?: string;
  prompt: string;
  imageDataUrls: string[];
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<string> {
  if (!input.client.responses?.create) {
    throw new Error("OpenAI-compatible Responses API client is unavailable.");
  }

  const temperature = getTemperature(input.env);
  const body: Record<string, unknown> = {
    model: input.config.model,
    stream: shouldStreamResponse(input.env),
    instructions: getModelInstructions(),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: input.prompt
          },
          ...input.imageDataUrls.map((imageDataUrl) => ({
            type: "input_image",
            image_url: imageDataUrl,
            detail: "high"
          }))
        ]
      }
    ],
    text: {
      format: {
        type: "json_object"
      }
    },
    store: false
  };

  if (temperature !== null) {
    body.temperature = temperature;
  }

  if (input.reasoningEffort || input.config.reasoningEffort) {
    body.reasoning = {
      effort: input.reasoningEffort || input.config.reasoningEffort
    };
  }

  return readResponsesResultText(
    await input.client.responses.create(body, {
      timeout: input.timeoutMs,
      signal: input.signal
    })
  );
}

async function callChatCompletionsApi(input: {
  client: OpenAiCompatibleClient;
  config: OpenAiCompatibleConfig;
  env: AiEnv;
  reasoningEffort?: string;
  prompt: string;
  imageDataUrls: string[];
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<string> {
  if (!input.client.chat?.completions?.create) {
    throw new Error("OpenAI-compatible chat completions client is unavailable.");
  }

  const maxOutputTokens = getMaxOutputTokens(input.env);
  const temperature = getTemperature(input.env);
  const body: Record<string, unknown> = {
    model: input.config.model,
    stream: shouldStreamResponse(input.env),
    messages: [
      {
        role: "system",
        content: getModelInstructions()
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: input.prompt
          },
          ...input.imageDataUrls.map((imageDataUrl) => ({
            type: "image_url",
            image_url: {
              url: imageDataUrl,
              detail: "high"
            }
          }))
        ]
      }
    ],
    response_format: {
      type: "json_object"
    }
  };

  if (maxOutputTokens) {
    body.max_tokens = maxOutputTokens;
  }

  if (temperature !== null) {
    body.temperature = temperature;
  }

  if (input.reasoningEffort || input.config.reasoningEffort) {
    body.reasoning_effort = input.reasoningEffort || input.config.reasoningEffort;
  }

  return readChatCompletionsResultText(
    await input.client.chat.completions.create(body, {
      timeout: input.timeoutMs,
      signal: input.signal
    })
  );
}

export async function callOpenAiCompatibleJsonModel<T>(
  input: OpenAiCompatibleJsonModelInput
): Promise<T> {
  const env = input.env ?? process.env;
  const config = resolveOpenAiCompatibleConfig(env, input.platform ?? process.platform);

  if (!config) {
    const error = new Error("OpenAI-compatible AI gateway is not configured.");
    throw await recordAiError({
      error,
      taskName: input.taskName,
      attempt: 1,
      maxAttempts: 1,
      providerName: "unconfigured",
      model: "unconfigured",
      wireApi: "unconfigured",
      elapsedMs: 0,
      logDirectory: env.TEACHHELPER_AI_LOG_DIR
    });
  }

  const client = input.client ?? createOpenAiCompatibleClient(config);
  const imageDataUrls = input.imageDataUrls ?? [];
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = getBoundedInteger({
    rawValue: env.TEACHHELPER_AI_MAX_ATTEMPTS,
    fallback: DEFAULT_MAX_ATTEMPTS,
    minimum: 1,
    maximum: 3
  });
  const retryDelayMs = getBoundedInteger({
    rawValue: env.TEACHHELPER_AI_RETRY_DELAY_MS,
    fallback: DEFAULT_RETRY_DELAY_MS,
    minimum: 0,
    maximum: 10_000
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStartedAt = Date.now();

    try {
      const outputText = await runWithWallClockTimeout(timeoutMs, (signal) =>
        config.wireApi === "chat_completions"
          ? callChatCompletionsApi({
              client,
              config,
              env,
              reasoningEffort: input.reasoningEffort,
              prompt: input.prompt,
              imageDataUrls,
              timeoutMs,
              signal
            })
          : callResponsesApi({
              client,
              config,
              env,
              reasoningEffort: input.reasoningEffort,
              prompt: input.prompt,
              imageDataUrls,
              timeoutMs,
              signal
            })
      );

      return extractJsonObject(outputText) as T;
    } catch (error) {
      const taggedError = await recordAiError({
        error,
        taskName: input.taskName,
        attempt,
        maxAttempts,
        providerName: config.providerName,
        model: config.model,
        wireApi: config.wireApi,
        elapsedMs: Date.now() - attemptStartedAt,
        logDirectory: env.TEACHHELPER_AI_LOG_DIR
      });

      if (attempt >= maxAttempts || !isRetryableGatewayError(error)) {
        throw taggedError;
      }

      await waitForRetry(retryDelayMs);
    }
  }

  throw new Error("OpenAI-compatible AI gateway request failed.");
}
