import { create } from "zustand";

import { createTranslator, detectInitialLanguage, persistLanguage, type Language } from "@/lib/i18n";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const themeStorageKey = "simple-api-pool.theme";
const autoThemeLightStartHour = 7;
const autoThemeDarkStartHour = 19;
const buildVersion = typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;
const buildRevision = typeof __APP_REVISION__ === "undefined" ? "local" : __APP_REVISION__;
const buildTime = typeof __APP_BUILD_TIME__ === "undefined" ? "unknown" : __APP_BUILD_TIME__;

export const BUILD_INFO = {
  version: buildVersion,
  revision: buildRevision,
  buildTime
};

export interface AppState {
  language: Language;
  runtimeError: string;
  theme: ResolvedTheme;
  themeMode: ThemeMode;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  setRuntimeError: (message: string) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  syncThemeWithAutoMode: () => void;
  translate: ReturnType<typeof createTranslator>;
}

export function buildVersionLabel() {
  return BUILD_INFO.version + " / " + BUILD_INFO.revision + " / " + BUILD_INFO.buildTime;
}

export function readStoredThemeMode(targetWindow: Window = window): ThemeMode {
  const storedTheme = targetWindow.localStorage.getItem(themeStorageKey);
  if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "auto") {
    return storedTheme;
  }
  if (storedTheme === "system") {
    return "auto";
  }
  return "auto";
}

export function persistThemeMode(themeMode: ThemeMode, targetWindow: Window = window) {
  targetWindow.localStorage.setItem(themeStorageKey, themeMode);
}

export function resolveAutomaticThemeForHour(hour: number): ResolvedTheme {
  if (!Number.isFinite(hour)) {
    return "light";
  }
  if (hour >= autoThemeLightStartHour && hour < autoThemeDarkStartHour) {
    return "light";
  }
  return "dark";
}

export function resolveThemeMode(themeMode: ThemeMode, _targetWindow: Window = window): ResolvedTheme {
  if (themeMode === "dark") {
    return "dark";
  }
  if (themeMode === "light") {
    return "light";
  }
  return resolveAutomaticThemeForHour(new Date().getHours());
}

const initialLanguage = detectInitialLanguage();
const initialThemeMode = readStoredThemeMode();

export const useAppStore = create<AppState>(function createAppStore(set, get) {
  return {
    language: initialLanguage,
    runtimeError: "",
    theme: resolveThemeMode(initialThemeMode),
    themeMode: initialThemeMode,
    setLanguage(language) {
      persistLanguage(language);
      set({
        language,
        translate: createTranslator(language)
      });
    },
    toggleLanguage() {
      const nextLanguage = get().language === "zh" ? "en" : "zh";
      get().setLanguage(nextLanguage);
    },
    setRuntimeError(message) {
      set({ runtimeError: String(message || "") });
    },
    setThemeMode(themeMode) {
      persistThemeMode(themeMode);
      set({
        theme: resolveThemeMode(themeMode),
        themeMode
      });
    },
    syncThemeWithAutoMode() {
      if (get().themeMode !== "auto") {
        return;
      }
      const nextTheme = resolveThemeMode("auto");
      if (nextTheme !== get().theme) {
        set({ theme: nextTheme });
      }
    },
    translate: createTranslator(initialLanguage)
  };
});
