import { create } from "zustand";

import { createTranslator, detectInitialLanguage, persistLanguage, type Language } from "@/lib/i18n";

export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type NotificationKind = "error" | "info" | "ok" | "warning";

export interface AppNotification {
  durationMs: number;
  id: string;
  kind: NotificationKind;
  text: string;
}

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
  notifications: AppNotification[];
  runtimeError: string;
  theme: ResolvedTheme;
  themeMode: ThemeMode;
  clearRuntimeError: () => void;
  dismissNotification: (notificationId: string) => void;
  notify: (kind: NotificationKind, text: string, options?: { durationMs?: number }) => string;
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
let notificationSequence = 0;

export function createNotification(kind: NotificationKind, text: string, options?: { durationMs?: number }): AppNotification {
  notificationSequence += 1;
  return {
    durationMs: Math.max(1200, Number(options?.durationMs || 4200)),
    id: `notice-${notificationSequence}`,
    kind,
    text: String(text || "").trim()
  };
}

export const useAppStore = create<AppState>(function createAppStore(set, get) {
  return {
    language: initialLanguage,
    notifications: [],
    runtimeError: "",
    theme: resolveThemeMode(initialThemeMode),
    themeMode: initialThemeMode,
    clearRuntimeError() {
      set({ runtimeError: "" });
    },
    dismissNotification(notificationId) {
      set(function removeNotification(previousState) {
        return {
          notifications: previousState.notifications.filter(function keepNotification(notification) {
            return notification.id !== notificationId;
          })
        };
      });
    },
    notify(kind, text, options) {
      const notification = createNotification(kind, text, options);
      if (!notification.text) {
        return "";
      }
      set(function pushNotification(previousState) {
        return {
          notifications: previousState.notifications.concat([notification])
        };
      });
      return notification.id;
    },
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
      set({ runtimeError: String(message || "").trim() });
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
