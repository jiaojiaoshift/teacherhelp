export type ThemeMode = "dark" | "light";
export type AiMode = "ccswitch" | "api" | "local";
export type DirectApiPreset = "qwen" | "doubao" | "gpt-5.6-sol";
export type AiWireApi = "responses" | "chat_completions";

export interface TeachHelperAiSettings {
  mode: AiMode;
  apiPreset: DirectApiPreset | null;
  baseUrl: string;
  apiKey?: string;
  model: string;
  wireApi: AiWireApi;
  reasoningEffort: string;
}

export interface TeachHelperSettings {
  version: 1;
  theme: ThemeMode;
  ai: TeachHelperAiSettings;
}

export interface PublicTeachHelperAiSettings
  extends Omit<TeachHelperAiSettings, "apiKey"> {
  apiKeyConfigured: boolean;
}

export interface PublicTeachHelperSettings
  extends Omit<TeachHelperSettings, "ai"> {
  ai: PublicTeachHelperAiSettings;
}

export interface TeachHelperSettingsPatch {
  theme?: ThemeMode;
  ai?: Partial<Omit<TeachHelperAiSettings, "apiKey">> & {
    apiKey?: string;
  };
  clearApiKey?: boolean;
}

export const DIRECT_API_PRESETS: Record<
  DirectApiPreset,
  {
    label: string;
    model: string;
    wireApi: AiWireApi;
    directSupported: boolean;
  }
> = {
  qwen: {
    label: "千问",
    model: "qwen-plus",
    wireApi: "chat_completions",
    directSupported: true
  },
  doubao: {
    label: "豆包",
    model: "doubao-seed-1-6-250615",
    wireApi: "chat_completions",
    directSupported: true
  },
  "gpt-5.6-sol": {
    label: "GPT-5.6-sol",
    model: "gpt-5.6-sol",
    wireApi: "responses",
    directSupported: false
  }
};

export const DEFAULT_TEACHHELPER_SETTINGS: TeachHelperSettings = {
  version: 1,
  theme: "dark",
  ai: {
    mode: "ccswitch",
    apiPreset: null,
    baseUrl: "",
    model: "gpt-5.6-sol",
    wireApi: "responses",
    reasoningEffort: "xhigh"
  }
};

const AI_MODES = new Set<AiMode>(["ccswitch", "api", "local"]);
const THEMES = new Set<ThemeMode>(["dark", "light"]);
const WIRE_APIS = new Set<AiWireApi>(["responses", "chat_completions"]);
const API_PRESETS = new Set<DirectApiPreset>([
  "qwen",
  "doubao",
  "gpt-5.6-sol"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeUrl(value: unknown): string {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.toString().replace(/\/$/u, "")
      : "";
  } catch {
    return "";
  }
}

function normalizeMode(value: unknown): AiMode {
  return typeof value === "string" && AI_MODES.has(value as AiMode)
    ? (value as AiMode)
    : DEFAULT_TEACHHELPER_SETTINGS.ai.mode;
}

function normalizeTheme(value: unknown): ThemeMode {
  return typeof value === "string" && THEMES.has(value as ThemeMode)
    ? (value as ThemeMode)
    : DEFAULT_TEACHHELPER_SETTINGS.theme;
}

function normalizePreset(value: unknown): DirectApiPreset | null {
  return typeof value === "string" && API_PRESETS.has(value as DirectApiPreset)
    ? (value as DirectApiPreset)
    : null;
}

function normalizeWireApi(value: unknown, fallback: AiWireApi): AiWireApi {
  return typeof value === "string" && WIRE_APIS.has(value as AiWireApi)
    ? (value as AiWireApi)
    : fallback;
}

export function normalizeTeachHelperSettings(value: unknown): TeachHelperSettings {
  const record = isRecord(value) ? value : {};
  const rawAi = isRecord(record.ai) ? record.ai : {};
  const apiPreset = normalizePreset(rawAi.apiPreset);
  const presetDefaults = apiPreset ? DIRECT_API_PRESETS[apiPreset] : null;
  const mode = normalizeMode(rawAi.mode);
  const defaultModel =
    mode === "ccswitch"
      ? DEFAULT_TEACHHELPER_SETTINGS.ai.model
      : presetDefaults?.model ?? "";
  const defaultWireApi =
    mode === "ccswitch"
      ? DEFAULT_TEACHHELPER_SETTINGS.ai.wireApi
      : presetDefaults?.wireApi ?? "chat_completions";
  const rawApiKey = normalizeOptionalString(rawAi.apiKey);

  return {
    version: 1,
    theme: normalizeTheme(record.theme),
    ai: {
      mode,
      apiPreset,
      baseUrl: normalizeUrl(rawAi.baseUrl),
      ...(rawApiKey ? { apiKey: rawApiKey } : {}),
      model: normalizeString(rawAi.model, defaultModel),
      wireApi: normalizeWireApi(rawAi.wireApi, defaultWireApi),
      reasoningEffort: normalizeString(
        rawAi.reasoningEffort,
        DEFAULT_TEACHHELPER_SETTINGS.ai.reasoningEffort
      )
    }
  };
}

export function validateTeachHelperSettingsPatch(
  value: unknown
): { ok: true; value: TeachHelperSettingsPatch } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "settings_payload_must_be_an_object" };
  }

  if (value.theme !== undefined && !THEMES.has(value.theme as ThemeMode)) {
    return { ok: false, error: "invalid_theme" };
  }

  if (value.clearApiKey !== undefined && typeof value.clearApiKey !== "boolean") {
    return { ok: false, error: "invalid_clear_api_key_flag" };
  }

  if (value.ai !== undefined && !isRecord(value.ai)) {
    return { ok: false, error: "invalid_ai_settings" };
  }

  const ai = isRecord(value.ai) ? value.ai : undefined;

  if (ai?.mode !== undefined && !AI_MODES.has(ai.mode as AiMode)) {
    return { ok: false, error: "invalid_ai_mode" };
  }

  if (ai?.apiPreset !== undefined && ai.apiPreset !== null && !API_PRESETS.has(ai.apiPreset as DirectApiPreset)) {
    return { ok: false, error: "invalid_api_preset" };
  }

  if (ai?.baseUrl !== undefined) {
    if (typeof ai.baseUrl !== "string" || (ai.baseUrl.trim() && !normalizeUrl(ai.baseUrl))) {
      return { ok: false, error: "invalid_base_url" };
    }
  }

  if (ai?.apiKey !== undefined && (typeof ai.apiKey !== "string" || ai.apiKey.length > 4096 || /[\r\n]/u.test(ai.apiKey))) {
    return { ok: false, error: "invalid_api_key" };
  }

  if (ai?.model !== undefined && (typeof ai.model !== "string" || ai.model.length > 256)) {
    return { ok: false, error: "invalid_model" };
  }

  if (ai?.wireApi !== undefined && !WIRE_APIS.has(ai.wireApi as AiWireApi)) {
    return { ok: false, error: "invalid_wire_api" };
  }

  if (ai?.reasoningEffort !== undefined && (typeof ai.reasoningEffort !== "string" || ai.reasoningEffort.length > 64)) {
    return { ok: false, error: "invalid_reasoning_effort" };
  }

  return { ok: true, value: value as TeachHelperSettingsPatch };
}

export function mergeTeachHelperSettings(
  current: TeachHelperSettings,
  patch: TeachHelperSettingsPatch
): TeachHelperSettings {
  const hasApiKeyPatch = Boolean(
    patch.ai && Object.prototype.hasOwnProperty.call(patch.ai, "apiKey")
  );
  const nextAi = {
    ...current.ai,
    ...(patch.ai ?? {})
  };

  if (hasApiKeyPatch && !normalizeOptionalString(patch.ai?.apiKey)) {
    if (current.ai.apiKey) {
      nextAi.apiKey = current.ai.apiKey;
    } else {
      delete nextAi.apiKey;
    }
  }

  if (patch.clearApiKey) {
    delete nextAi.apiKey;
  }

  return normalizeTeachHelperSettings({
    ...current,
    ...(patch.theme ? { theme: patch.theme } : {}),
    ai: nextAi
  });
}

export function toPublicTeachHelperSettings(
  settings: TeachHelperSettings
): PublicTeachHelperSettings {
  const { apiKey: _apiKey, ...publicAi } = settings.ai;

  return {
    version: settings.version,
    theme: settings.theme,
    ai: {
      ...publicAi,
      apiKeyConfigured: Boolean(settings.ai.apiKey)
    }
  };
}
