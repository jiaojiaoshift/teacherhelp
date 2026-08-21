import { create } from "zustand";

import {
  DEFAULT_TEACHHELPER_SETTINGS,
  normalizeTeachHelperSettings,
  toPublicTeachHelperSettings,
  type PublicTeachHelperSettings,
  type TeachHelperSettingsPatch,
  type ThemeMode
} from "@/lib/config/app-settings";

const THEME_STORAGE_KEY = "teachhelper.theme";

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function readLocalTheme(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "dark" ? value : null;
}

function normalizePublicSettings(value: unknown): PublicTeachHelperSettings {
  const normalized = toPublicTeachHelperSettings(normalizeTeachHelperSettings(value));
  const rawAi =
    value && typeof value === "object" && "ai" in value && value.ai && typeof value.ai === "object"
      ? (value.ai as { apiKeyConfigured?: unknown })
      : null;

  return {
    ...normalized,
    ai: {
      ...normalized.ai,
      apiKeyConfigured:
        typeof rawAi?.apiKeyConfigured === "boolean"
          ? rawAi.apiKeyConfigured
          : normalized.ai.apiKeyConfigured
    }
  };
}

interface AppSettingsStoreState {
  settings: PublicTeachHelperSettings;
  hydrated: boolean;
  saving: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  save: (patch: TeachHelperSettingsPatch) => Promise<PublicTeachHelperSettings>;
  setTheme: (theme: ThemeMode) => void;
  reset: () => void;
}

const initialSettings = toPublicTeachHelperSettings(DEFAULT_TEACHHELPER_SETTINGS);

export const useAppSettingsStore = create<AppSettingsStoreState>((set) => ({
  settings: initialSettings,
  hydrated: false,
  saving: false,
  error: null,
  hydrate: async () => {
    const localTheme = readLocalTheme();

    if (localTheme) {
      applyTheme(localTheme);
      set((state) => ({
        settings: { ...state.settings, theme: localTheme }
      }));
    }

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("settings_read_failed");
      }

      const settings = normalizePublicSettings(await response.json());
      set({ settings, hydrated: true, error: null });
      applyTheme(settings.theme);
      window.localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
    } catch {
      set({ hydrated: true, error: "settings_read_failed" });
    }
  },
  save: async (patch) => {
    set({ saving: true, error: null });

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });

      if (!response.ok) {
        throw new Error("settings_write_failed");
      }

      const settings = normalizePublicSettings(await response.json());
      set({ settings, saving: false, hydrated: true, error: null });
      applyTheme(settings.theme);
      window.localStorage.setItem(THEME_STORAGE_KEY, settings.theme);
      return settings;
    } catch (error) {
      set({ saving: false, error: "settings_write_failed" });
      throw error;
    }
  },
  setTheme: (theme) => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    set((state) => ({
      settings: { ...state.settings, theme }
    }));
  },
  reset: () => {
    set({
      settings: toPublicTeachHelperSettings(DEFAULT_TEACHHELPER_SETTINGS),
      hydrated: false,
      saving: false,
      error: null
    });
  }
}));

export { applyTheme };
