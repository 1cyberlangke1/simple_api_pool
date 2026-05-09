import { formatErrorRate, formatNumber, formatPercent, html } from "../shared/view_helpers.js";
import { statusState } from "../stores/status_store.js";
import { buildStatusRouteState } from "./route_state.js";
import { StatusPage } from "../views/status_page.js";

export function useStatusRouteController(translate, refreshRoute) {
  const status = statusState.value;
  const routeState = buildStatusRouteState(status);

  return {
    page: html`
      <${StatusPage}
        formatErrorRate=${formatErrorRate}
        formatNumber=${formatNumber}
        formatPercent=${formatPercent}
        statusState=${status}
        statusSummary=${routeState.statusSummary}
        translate=${translate}
      />
    `,
    refresh() {
      refreshRoute(true);
    }
  };
}
