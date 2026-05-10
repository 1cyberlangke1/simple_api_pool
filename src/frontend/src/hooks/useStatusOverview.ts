import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeErrorMessage } from "@/api.js";
import { fetchStatusOverview } from "@/services/status_service.js";
import { createEmptyStatusOverview, type StatusOverview } from "@/lib/status";

export interface StatusOverviewState {
  error: string;
  etag: string;
  loadedAt: number;
  loading: boolean;
  overview: StatusOverview;
}

const statusPollIntervalMs = 15000;

export function useStatusOverview(translate: (key: string, params?: Record<string, unknown>) => string) {
  const [state, setState] = useState<StatusOverviewState>({
    error: "",
    etag: "",
    loadedAt: 0,
    loading: false,
    overview: createEmptyStatusOverview()
  });
  const etagRef = useRef("");

  const refresh = useCallback(async function refreshStatusOverview(forceRefresh = false) {
    setState(function markLoading(previousState) {
      return {
        ...previousState,
        error: "",
        loading: true
      };
    });
    try {
      const result = await fetchStatusOverview({
        etag: etagRef.current,
        forceRefresh
      });
      if (result.notModified) {
        setState(function markNotModified(previousState) {
          return {
            ...previousState,
            loadedAt: Date.now(),
            loading: false
          };
        });
        return;
      }
      etagRef.current = result.etag || "";
      setState({
        error: "",
        etag: etagRef.current,
        loadedAt: Date.now(),
        loading: false,
        overview: (result.data || createEmptyStatusOverview()) as StatusOverview
      });
    } catch (error) {
      setState(function markError(previousState) {
        return {
          ...previousState,
          error: normalizeErrorMessage(error, translate("status.reloadFailed")),
          loading: false
        };
      });
    }
  }, [translate]);

  useEffect(function pollStatusOverview() {
    let timerId = 0;

    void refresh(false);

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        return;
      }
      void refresh(true);
    }

    timerId = window.setInterval(function onInterval() {
      if (document.visibilityState === "hidden") {
        return;
      }
      void refresh(false);
    }, statusPollIntervalMs);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return function cleanupPolling() {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return {
    refresh,
    state
  };
}
