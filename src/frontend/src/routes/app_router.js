import { useLocation } from "wouter-preact";

import { appState, buildVersionLabel, toggleLanguage, toggleTheme } from "../stores/app_store.js";
import { adminState } from "../stores/admin_store.js";
import { html, InlineMessage } from "../shared/view_helpers.js";
import { createTranslator } from "../i18n.js";
import { useAdminLogsEscape, useDocumentState, useRuntimeErrorBinding } from "./app_effects.js";
import { createRefreshRoute, useRoutePolling } from "./admin_polling.js";
import { useAdminRouteController } from "./admin_route_controller.js";
import { resolveRoute } from "./route_state.js";
import { useStatusRouteController } from "./status_route_controller.js";

export function AppRouter() {
  const [location, navigate] = useLocation();
  const route = resolveRoute(location);
  const app = appState.value;
  const translate = createTranslator(app.language);
  const refreshRoute = createRefreshRoute(route, translate);

  useDocumentState(app, route, translate);
  useRuntimeErrorBinding(translate);
  useAdminLogsEscape(adminState.value.logModalOpen);
  useRoutePolling(route, adminState.value, translate);

  function goTo(nextRoute) {
    navigate(nextRoute === "admin" ? "/admin" : "/status");
  }
  const controller = route === "status"
    ? useStatusRouteController(translate, refreshRoute)
    : useAdminRouteController(route, app.language, translate, refreshRoute);

  return html`
    <div class="app-shell">
      <header class="hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Simple API Pool</p>
          <h1>${route === "admin" ? translate("app.adminTitle") : translate("app.statusTitle")}</h1>
          <p>${route === "admin" ? translate("app.adminCopy") : translate("app.statusCopy")}</p>
        </div>
        <div class="hero-actions">
          <div class="nav-row">
            <button class=${route === "status" ? "nav-button active" : "nav-button"} type="button" onClick=${function showStatus() {
              goTo("status");
            }}>
              ${translate("nav.status")}
            </button>
            <button class=${route === "admin" ? "nav-button active" : "nav-button"} type="button" onClick=${function showAdmin() {
              goTo("admin");
            }}>
              ${translate("nav.admin")}
            </button>
          </div>
          <div class="toolbar-row">
            <button class="ghost-button" type="button" onClick=${function refreshCurrentRoute() {
              controller.refresh();
            }}>
              ${translate("action.refresh")}
            </button>
            <button class="ghost-button" type="button" onClick=${toggleLanguage}>
              ${app.language === "zh" ? "EN" : "中"}
            </button>
            <button class="ghost-button" type="button" onClick=${toggleTheme}>
              ${app.theme === "light" ? "Dark" : "Light"}
            </button>
          </div>
          <div class="build-badge">
            <span>${translate("meta.version")}</span>
            <strong>${buildVersionLabel()}</strong>
          </div>
        </div>
      </header>

      ${app.runtimeError
        ? html`
            <section class="panel banner-panel">
              <${InlineMessage} kind="error" text=${app.runtimeError} />
            </section>
          `
        : null}

      ${controller.page}
    </div>
  `;
}
