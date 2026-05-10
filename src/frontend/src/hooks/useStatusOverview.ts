import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeErrorMessage } from "@/api.js";
import { createStatusLiveSnapshot, reduceStatusLiveEvent } from "@/lib/live";
import { createEmptyStatusOverview, type StatusOverview } from "@/lib/status";
import { buildStreamURL, openLiveStream } from "@/services/live_service.js";
import { fetchStatusBootstrap } from "@/services/status_service.js";

export interface StatusOverviewState {
  error: string;
  etag: string;
  loadedAt: number;
  loading: boolean;
  overview: StatusOverview;
}

export function useStatusOverview(translate: (key: string, params?: Record<string, unknown>) => string) {
  const [state, setState] = useState<StatusOverviewState>({
    error: "",
    etag: "",
    loadedAt: 0,
    loading: false,
    overview: createEmptyStatusOverview()
  });

  const streamRef = useRef<{ close: () => void } | null>(null);
  const cursorRef = useRef(0);

  const closeStream = useCallback(function closeStream() {
    if (!streamRef.current) {
      return;
    }
    streamRef.current.close();
    streamRef.current = null;
  }, []);

  const connectStream = useCallback(function connectStream(after: number, reload: (forceRefresh?: boolean) => Promise<void>) {
    closeStream();

    if (typeof window === "undefined" || typeof window.EventSource !== "function") {
      return;
    }

    streamRef.current = openLiveStream(buildStreamURL("/api/status/stream", after), {
      eventNames: ["stats_delta", "providers_changed", "resync_required"],
      onEvent(event) {
        setState(function applyLiveEvent(previousState) {
          const result = reduceStatusLiveEvent({
            cursor: cursorRef.current,
            overview: previousState.overview
          }, event);

          cursorRef.current = result.snapshot.cursor;
          if (result.requiresBootstrap) {
            closeStream();
            window.setTimeout(function reloadFromBootstrap() {
              void reload(true);
            }, 0);
            return previousState;
          }

          return {
            ...previousState,
            error: "",
            loadedAt: Date.now(),
            overview: result.snapshot.overview
          };
        });
      }
    });
  }, [closeStream]);

  const refresh = useCallback(async function refreshStatusOverview(forceRefresh = false) {
    setState(function markLoading(previousState) {
      return {
        ...previousState,
        error: "",
        loading: true
      };
    });

    try {
      const result = await fetchStatusBootstrap();
      const snapshot = createStatusLiveSnapshot((result.data || createEmptyStatusOverview()) as Record<string, unknown>);
      cursorRef.current = snapshot.cursor;

      setState(function applyBootstrap(previousState) {
        return {
          ...previousState,
          error: "",
          loadedAt: Date.now(),
          loading: false,
          overview: snapshot.overview
        };
      });

      connectStream(snapshot.cursor, refresh);
    } catch (error) {
      if (forceRefresh) {
        closeStream();
      }
      setState(function markError(previousState) {
        return {
          ...previousState,
          error: normalizeErrorMessage(error, translate("status.reloadFailed")),
          loading: false
        };
      });
    }
  }, [closeStream, connectStream, translate]);

  useEffect(function loadBootstrapOnMount() {
    void refresh(false);
    return function cleanupStream() {
      closeStream();
    };
  }, [closeStream, refresh]);

  return {
    refresh,
    state
  };
}
