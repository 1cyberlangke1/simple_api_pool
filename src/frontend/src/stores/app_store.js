import { signal } from "@preact/signals";

import { detectInitialLanguage } from "../i18n.js";

const themeStorageKey = "simple-api-pool.theme";

export const BUILD_INFO = {
  version: __APP_VERSION__,
  revision: __APP_REVISION__,
  buildTime: __APP_BUILD_TIME__
};

export const appState = signal({
  language: detectInitialLanguage(),
  runtimeError: "",
  theme: readStoredTheme()
});

export function buildVersionLabel() {
  return BUILD_INFO.version + " / " + BUILD_INFO.revision + " / " + BUILD_INFO.buildTime;
}

export function readStoredTheme() {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function persistTheme(theme) {
  window.localStorage.setItem(themeStorageKey, theme);
}

export function setRuntimeError(message) {
  appState.value = {
    ...appState.value,
    runtimeError: String(message || "")
  };
}

export function toggleLanguage() {
  appState.value = {
    ...appState.value,
    language: appState.value.language === "zh" ? "en" : "zh"
  };
}

export function toggleTheme() {
  appState.value = {
    ...appState.value,
    theme: appState.value.theme === "light" ? "dark" : "light"
  };
}
