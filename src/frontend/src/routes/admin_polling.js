import { useEffect } from "preact/hooks";

import { normalizeErrorMessage } from "../api.js";
import { createEmptyAdminOverview, resetAdminState, setAdminState, syncAdminStateFromOverview, adminState } from "../stores/admin_store.js";
import { fetchAdminOverview } from "../services/admin_service.js";
import { loadStatusOverview } from "../stores/status_store.js";

export const statusPollIntervalMs = 15000;
export const adminPollIntervalMs = 10000;

export async function loadAdminOverview(translate, forceRefresh, syncOptions) {
  const nextSyncOptions = syncOptions || {};
  setAdminState(function markAdminLoading(currentState) {
    return {
      ...currentState,
      pending: true
    };
  });
  try {
    const result = await fetchAdminOverview({
      etag: adminState.value.etag,
      forceRefresh
    });
    if (result.notModified) {
      setAdminState(function markAdminReady(currentState) {
        return {
          ...currentState,
          authenticated: true,
          checkedAuth: true,
          pending: false
        };
      });
      return;
    }
    setAdminState(function mergeOverview(currentState) {
      return syncAdminStateFromOverview(currentState, result.data || createEmptyAdminOverview(), result.etag, nextSyncOptions);
    });
  } catch (error) {
    if (error && (error.status === 401 || error.status === 403)) {
      setAdminState(function resetAuthState(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "", text: "" },
          authenticated: false,
          checkedAuth: true,
          etag: "",
          globalMessage: { kind: "", text: "" },
          loginMessage: { kind: "error", text: translate("admin.unauthorized") },
          logModalOpen: false,
          overview: createEmptyAdminOverview(),
          pending: false,
          providerMessage: { kind: "", text: "" },
          selectedKeyRefs: [],
          selectedProviderDraft: null,
          selectedProviderDirty: false,
          selectedProviderName: ""
        };
      });
      return;
    }
    setAdminState(function setAdminError(currentState) {
      return {
        ...currentState,
        actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.overviewLoadFailed")) },
        pending: false
      };
    });
  }
}

export function createRefreshRoute(route, translate) {
  return function refreshRoute(forceRefresh) {
    if (route === "status") {
      void loadStatusOverview(Boolean(forceRefresh), translate);
      return;
    }
    void loadAdminOverview(translate, Boolean(forceRefresh));
  };
}

export function useRoutePolling(route, adminStateSnapshot, translate) {
  useEffect(function schedulePolling() {
    let timerId = 0;
    const shouldProbeAdminAuth = route === "admin" && !adminStateSnapshot.checkedAuth;
    const shouldPollAdmin = route === "admin" && adminStateSnapshot.authenticated;

    if (route === "status") {
      void loadStatusOverview(false, translate);
    } else if (shouldProbeAdminAuth || shouldPollAdmin) {
      void loadAdminOverview(translate, false);
    }

    function refreshVisiblePage() {
      if (window.document.visibilityState === "hidden") {
        return;
      }
      if (route === "status") {
        void loadStatusOverview(true, translate);
        return;
      }
      if (adminState.value.authenticated) {
        void loadAdminOverview(translate, true);
      }
    }

    const intervalMs = route === "status" ? statusPollIntervalMs : shouldPollAdmin ? adminPollIntervalMs : 0;
    if (intervalMs > 0) {
      timerId = window.setInterval(function pollPage() {
        if (window.document.visibilityState === "hidden") {
          return;
        }
        if (route === "status") {
          void loadStatusOverview(false, translate);
          return;
        }
        if (adminState.value.authenticated) {
          void loadAdminOverview(translate, false);
        }
      }, intervalMs);
    }

    window.document.addEventListener("visibilitychange", refreshVisiblePage);
    return function cleanupPolling() {
      if (timerId) {
        window.clearInterval(timerId);
      }
      window.document.removeEventListener("visibilitychange", refreshVisiblePage);
    };
  }, [adminStateSnapshot.authenticated, adminStateSnapshot.checkedAuth, route, translate]);
}

export function resetAdminSessionState() {
  resetAdminState();
}
