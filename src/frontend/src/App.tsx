import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { AdminPage } from "@/pages/AdminPage";
import { StatusPage } from "@/pages/StatusPage";
import { useAppStore } from "@/store/appStore";
import { normalizeErrorMessage, shouldIgnoreRuntimeFailure } from "@/api.js";

function AppShell() {
  const setRuntimeError = useAppStore(function selectSetRuntimeError(state) {
    return state.setRuntimeError;
  });
  const syncThemeWithSystemPreference = useAppStore(function selectSyncTheme(state) {
    return state.syncThemeWithSystemPreference;
  });
  const themeMode = useAppStore(function selectThemeMode(state) {
    return state.themeMode;
  });
  const translate = useAppStore(function selectTranslate(state) {
    return state.translate;
  });

  useEffect(function bindRuntimeErrors() {
    function handleRuntimeError(event: ErrorEvent | PromiseRejectionEvent) {
      const failure =
        "reason" in event && event.reason !== undefined
          ? event.reason
          : "error" in event && event.error !== undefined
            ? event.error
            : "message" in event && typeof event.message === "string" && event.message.trim()
              ? { message: event.message.trim() }
              : null;
      if (!failure || shouldIgnoreRuntimeFailure(failure)) {
        return;
      }
      setRuntimeError(normalizeErrorMessage(failure, translate("message.runtimeError")));
    }
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRuntimeError);
    return function cleanupRuntimeErrors() {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleRuntimeError);
    };
  }, [setRuntimeError, translate]);

  useEffect(function bindSystemThemePreference() {
    if (themeMode !== "system" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    syncThemeWithSystemPreference();

    function handleThemeChange() {
      syncThemeWithSystemPreference();
    }

    themeQuery.addEventListener("change", handleThemeChange);
    return function cleanupThemePreference() {
      themeQuery.removeEventListener("change", handleThemeChange);
    };
  }, [syncThemeWithSystemPreference, themeMode]);

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route element={<Navigate replace to="/status" />} path="/" />
          <Route element={<StatusPage />} path="/status" />
          <Route element={<AdminPage />} path="/admin" />
          <Route element={<Navigate replace to="/status" />} path="*" />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default AppShell;
