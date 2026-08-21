"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DIRECT_API_PRESETS,
  type AiMode,
  type AiWireApi,
  type DirectApiPreset,
  type ThemeMode
} from "@/lib/config/app-settings";
import { useAppSettingsStore } from "@/lib/stores/app-settings-store";

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-muted">{children}</label>;
}

export default function SettingsPage() {
  const settings = useAppSettingsStore((state) => state.settings);
  const hydrated = useAppSettingsStore((state) => state.hydrated);
  const saving = useAppSettingsStore((state) => state.saving);
  const save = useAppSettingsStore((state) => state.save);
  const setTheme = useAppSettingsStore((state) => state.setTheme);
  const [theme, setDraftTheme] = useState<ThemeMode>(settings.theme);
  const [mode, setMode] = useState<AiMode>(settings.ai.mode);
  const [apiPreset, setApiPreset] = useState<DirectApiPreset | null>(settings.ai.apiPreset);
  const [baseUrl, setBaseUrl] = useState(settings.ai.baseUrl);
  const [model, setModel] = useState(settings.ai.model);
  const [wireApi, setWireApi] = useState<AiWireApi>(settings.ai.wireApi);
  const [reasoningEffort, setReasoningEffort] = useState(settings.ai.reasoningEffort);
  const [apiKey, setApiKey] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setDraftTheme(settings.theme);
    setMode(settings.ai.mode);
    setApiPreset(settings.ai.apiPreset);
    setBaseUrl(settings.ai.baseUrl);
    setModel(settings.ai.model);
    setWireApi(settings.ai.wireApi);
    setReasoningEffort(settings.ai.reasoningEffort);
  }, [settings]);

  const selectedPreset = apiPreset ? DIRECT_API_PRESETS[apiPreset] : null;
  const modeDescription = useMemo(() => {
    if (mode === "ccswitch") {
      return "沿用本机 ccSwitch / Codex 路由，不需要在此页复制密钥。";
    }

    if (mode === "api") {
      return "直接连接兼容 OpenAI API 的服务；密钥只保存在本机数据目录。";
    }

    return "连接你自己运行的 OpenAI-compatible 本地模型服务。";
  }, [mode]);

  function selectMode(nextMode: AiMode) {
    setMode(nextMode);
    if (nextMode === "ccswitch") {
      setApiPreset(null);
      return;
    }

    if (!apiPreset && nextMode === "api") {
      setApiPreset("qwen");
      setModel(DIRECT_API_PRESETS.qwen.model);
      setWireApi(DIRECT_API_PRESETS.qwen.wireApi);
    }
  }

  function selectPreset(nextPreset: DirectApiPreset) {
    setApiPreset(nextPreset);
    setModel(DIRECT_API_PRESETS[nextPreset].model);
    setWireApi(DIRECT_API_PRESETS[nextPreset].wireApi);
  }

  async function handleSave() {
    setNotice(null);

    try {
      const saved = await save({
        theme,
        ai: {
          mode,
          apiPreset,
          baseUrl,
          model,
          wireApi,
          reasoningEffort,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {})
        }
      });
      setApiKey("");
      setTheme(saved.theme);
      setNotice("设置已保存");
    } catch {
      setNotice("设置保存失败，请检查地址和本机权限");
    }
  }

  async function handleClearKey() {
    setNotice(null);

    try {
      const saved = await save({ clearApiKey: true });
      setApiKey("");
      setNotice(saved.ai.apiKeyConfigured ? "未能清除密钥" : "已清除已保存密钥");
    } catch {
      setNotice("密钥清除失败");
    }
  }

  return (
    <main aria-label="settings-page" className="min-h-screen bg-app-background px-4 py-6 text-app-ink md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-app-line pb-5">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">TeachHelper</div>
            <h1 className="text-2xl font-semibold">设置</h1>
            <p className="mt-2 text-sm text-muted">统一管理外观和 AI 连接方式</p>
          </div>
          <Link className="rounded-md border border-app-line px-3 py-2 text-sm text-muted transition hover:border-accent hover:text-accent" href="/">
            返回工作台
          </Link>
        </header>

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <section className="settings-panel">
            <div className="settings-panel-heading">
              <div>
                <h2 className="text-base font-semibold">外观</h2>
                <p className="mt-1 text-sm text-muted">当前选择会同步到 Web 和桌面端。</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3" role="radiogroup" aria-label="主题模式">
              {(["dark", "light"] as const).map((option) => (
                <label key={option} className={["settings-choice", theme === option ? "settings-choice-active" : ""].join(" ")}>
                  <input
                    aria-label={option === "dark" ? "深色" : "浅色"}
                    checked={theme === option}
                    className="sr-only"
                    name="theme"
                    onChange={() => {
                      setDraftTheme(option);
                      setTheme(option);
                    }}
                    type="radio"
                    value={option}
                  />
                  <span className="text-sm font-medium">{option === "dark" ? "深色" : "浅色"}</span>
                  <span className="mt-1 text-xs text-muted">{option === "dark" ? "低亮度工作台" : "明亮工作台"}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <div className="settings-panel-heading">
              <div>
                <h2 className="text-base font-semibold">AI 调用</h2>
                <p className="mt-1 text-sm text-muted">三种连接方式中选择一种。</p>
              </div>
              <span className="text-xs text-muted">{hydrated ? "已读取本机设置" : "读取中"}</span>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3" role="group" aria-label="AI 连接方式">
              {([
                ["ccswitch", "ccSwitch 路由"],
                ["api", "直接 API"],
                ["local", "本地模型"]
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={mode === value}
                  className={["settings-mode-button", mode === value ? "settings-mode-button-active" : ""].join(" ")}
                  onClick={() => selectMode(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mt-4 rounded-md border border-app-line bg-app-muted px-3 py-3 text-sm text-muted">{modeDescription}</p>

            {mode === "ccswitch" ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="settings-readonly-field"><span>模型</span><strong>{settings.ai.model}</strong></div>
                <div className="settings-readonly-field"><span>推理强度</span><strong>{settings.ai.reasoningEffort}</strong></div>
                <div className="settings-readonly-field sm:col-span-2"><span>凭据</span><strong>由本机 ccSwitch / Codex 配置提供</strong></div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {mode === "api" ? (
                  <div>
                    <FieldLabel>服务预设</FieldLabel>
                    <select className="settings-input" onChange={(event) => selectPreset(event.target.value as DirectApiPreset)} value={apiPreset ?? "qwen"}>
                      {(Object.entries(DIRECT_API_PRESETS) as Array<[DirectApiPreset, (typeof DIRECT_API_PRESETS)[DirectApiPreset]]>).map(([value, preset]) => (
                        <option key={value} value={value}>{preset.label}{preset.directSupported ? "" : "（推荐通过 ccSwitch）"}</option>
                      ))}
                    </select>
                    {selectedPreset && !selectedPreset.directSupported ? <p className="mt-1 text-xs text-amber-600">该入口已预留；当前直接接入优先支持千问和豆包。</p> : null}
                  </div>
                ) : null}
                <div>
                  <FieldLabel>API URL</FieldLabel>
                  <input aria-label="API URL" className="settings-input" onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://example.com/v1" type="url" value={baseUrl} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>模型</FieldLabel>
                    <input aria-label="模型" className="settings-input" onChange={(event) => setModel(event.target.value)} type="text" value={model} />
                  </div>
                  <div>
                    <FieldLabel>接口类型</FieldLabel>
                    <select aria-label="接口类型" className="settings-input" onChange={(event) => setWireApi(event.target.value as AiWireApi)} value={wireApi}>
                      <option value="chat_completions">Chat Completions</option>
                      <option value="responses">Responses</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel>推理强度</FieldLabel>
                    <input aria-label="推理强度" className="settings-input" onChange={(event) => setReasoningEffort(event.target.value)} type="text" value={reasoningEffort} />
                  </div>
                  <div>
                    <FieldLabel>API Key</FieldLabel>
                    <input aria-label="API Key" className="settings-input" onChange={(event) => setApiKey(event.target.value)} placeholder={settings.ai.apiKeyConfigured ? "已保存，留空则保留" : "仅保存在本机"} type="password" value={apiKey} />
                  </div>
                </div>
                {settings.ai.apiKeyConfigured ? <button className="text-left text-xs text-danger hover:underline" onClick={handleClearKey} type="button">清除已保存 API Key</button> : null}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-app-line pt-4">
              <button className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#07130f] transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} onClick={() => void handleSave()} type="button">
                {saving ? "保存中..." : "保存设置"}
              </button>
              {notice ? <span aria-live="polite" className="text-sm text-muted">{notice}</span> : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
