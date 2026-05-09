import { useEffect } from "preact/hooks";

import { normalizeErrorMessage } from "../api.js";
import { setAdminState } from "../stores/admin_store.js";
import { persistTheme, setRuntimeError } from "../stores/app_store.js";
import { persistLanguage } from "../i18n.js";

export function useDocumentState(appStateSnapshot, route, translate) {
  useEffect(function syncDocument() {
    window.document.documentElement.lang = appStateSnapshot.language === "en" ? "en" : "zh-CN";
    window.document.documentElement.dataset.theme = appStateSnapshot.theme;
    window.document.title = route === "admin"
      ? "Simple API Pool - " + translate("app.adminTitle")
      : "Simple API Pool - " + translate("app.statusTitle");
    persistLanguage(appStateSnapshot.language);
    persistTheme(appStateSnapshot.theme);
  }, [appStateSnapshot.language, appStateSnapshot.theme, route, translate]);
}

export function useRuntimeErrorBinding(translate) {
  useEffect(function bindRuntimeErrors() {
    function handleRuntimeError(event) {
      const failure = event && (event.error || event.reason);
      setRuntimeError(normalizeErrorMessage(failure, translate("message.runtimeError")));
    }
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRuntimeError);
    return function cleanupRuntimeErrors() {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleRuntimeError);
    };
  }, [translate]);
}

export function useAdminLogsEscape(logModalOpen) {
  useEffect(function bindModalEscape() {
    if (!logModalOpen) {
      return undefined;
    }
    function handleKeyDown(event) {
      if (event.key !== "Escape") {
        return;
      }
      setAdminState(function closeModal(currentState) {
        return {
          ...currentState,
          logModalOpen: false
        };
      });
    }
    window.addEventListener("keydown", handleKeyDown);
    return function cleanupModalEscape() {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [logModalOpen]);
}
