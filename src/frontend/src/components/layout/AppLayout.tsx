import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Globe, Moon, Shield, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildVersionLabel, useAppStore } from "@/store/appStore";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout(props: AppLayoutProps) {
  const location = useLocation();
  const language = useAppStore(function selectLanguage(state) {
    return state.language;
  });
  const runtimeError = useAppStore(function selectRuntimeError(state) {
    return state.runtimeError;
  });
  const theme = useAppStore(function selectTheme(state) {
    return state.theme;
  });
  const themeMode = useAppStore(function selectThemeMode(state) {
    return state.themeMode;
  });
  const toggleLanguage = useAppStore(function selectToggleLanguage(state) {
    return state.toggleLanguage;
  });
  const setThemeMode = useAppStore(function selectSetThemeMode(state) {
    return state.setThemeMode;
  });
  const translate = useAppStore(function selectTranslate(state) {
    return state.translate;
  });

  useEffect(function syncDocumentState() {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
    document.title = location.pathname.startsWith("/admin")
      ? "Simple API Pool - " + translate("app.adminTitle")
      : "Simple API Pool - " + translate("app.statusTitle");
  }, [language, location.pathname, theme, translate]);

  function cycleThemeMode() {
    if (themeMode === "system") {
      setThemeMode("dark");
      return;
    }
    if (themeMode === "dark") {
      setThemeMode("light");
      return;
    }
    setThemeMode("system");
  }

  return (
    <div className="app-shell flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/status" className="flex items-center gap-2 font-display font-bold text-xl tracking-tight">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                <Activity className="h-5 w-5" />
              </div>
              <span className="hidden sm:inline-block">API Pool</span>
            </Link>

            <nav className="flex items-center gap-4 text-sm font-medium">
              <Link
                to="/status"
                className={`transition-colors hover:text-foreground/80 ${location.pathname === "/status" ? "text-foreground" : "text-foreground/60"}`}
              >
                {translate("nav.status")}
              </Link>
              <Link
                to="/admin"
                className={`flex items-center gap-1 transition-colors hover:text-foreground/80 ${location.pathname.startsWith("/admin") ? "text-foreground" : "text-foreground/60"}`}
              >
                <Shield className="h-4 w-4" />
                {translate("nav.admin")}
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleLanguage} title="Toggle Language">
              <Globe className="h-4 w-4" />
              <span className="sr-only">Toggle Language</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleThemeMode}
              title={`${translate("theme.label")}: ${translate(`theme.mode.${themeMode}`)}`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="sr-only">{translate("theme.label")}</span>
            </Button>
          </div>
        </div>
      </header>

      {runtimeError ? (
        <div className="container max-w-7xl mx-auto w-full px-4 pt-4 sm:px-6">
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {runtimeError}
          </div>
        </div>
      ) : null}

      <main className="flex-1 container max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {props.children}
      </main>

      <footer className="border-t py-6 md:py-0">
        <div className="container max-w-7xl mx-auto flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row px-4 sm:px-6">
          <p className="text-sm leading-loose text-muted-foreground">
            {translate("meta.version")}
          </p>
          <strong className="font-mono text-xs text-muted-foreground">{buildVersionLabel()}</strong>
        </div>
      </footer>
    </div>
  );
}
