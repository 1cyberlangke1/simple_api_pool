import { toInteger } from "@/api.js";
import {
  adminLogCacheMaxEntries,
  applyAdminLogDelta,
  createEmptyAdminLogCache,
  createEmptyAdminOverview,
  type AdminLogCache,
  type AdminOverview
} from "@/lib/admin";
import { createEmptyStatusOverview, type StatusOverview } from "@/lib/status";

export interface LiveEvent<T = unknown> {
  data: T;
  lastEventId: number;
  type: string;
}

export interface StatusLiveSnapshot {
  cursor: number;
  overview: StatusOverview;
}

export interface AdminLiveSnapshot {
  cursor: number;
  logCache: AdminLogCache;
  overview: AdminOverview;
}

type StatusBootstrapPayload = Partial<StatusOverview> & {
  stream_cursor?: number;
};

type AdminBootstrapPayload = Partial<AdminOverview> & {
  recent_logs?: Array<Record<string, unknown>>;
  stream_cursor?: number;
};

function normalizeCursor(rawValue: unknown, fallbackValue = 0) {
  const nextCursor = toInteger(rawValue, fallbackValue);
  if (nextCursor < 0) {
    return fallbackValue;
  }
  return nextCursor;
}

function normalizeStatusOverview(payload: Partial<StatusOverview> | null | undefined): StatusOverview {
  const nextOverview = payload || {};
  return {
    ...createEmptyStatusOverview(),
    ...nextOverview,
    health: {
      ...createEmptyStatusOverview().health,
      ...(nextOverview.health || {})
    },
    provider_stats: {
      ...(nextOverview.provider_stats || {})
    },
    provider_types: {
      ...(nextOverview.provider_types || {})
    }
  };
}

function normalizeAdminOverview(payload: Partial<AdminOverview> | null | undefined): AdminOverview {
  const nextOverview = payload || {};
  const emptyOverview = createEmptyAdminOverview();
  return {
    ...emptyOverview,
    ...nextOverview,
    global_config: {
      ...emptyOverview.global_config,
      ...(nextOverview.global_config || {}),
      client_keys: Array.isArray(nextOverview.global_config?.client_keys)
        ? nextOverview.global_config?.client_keys.slice()
        : emptyOverview.global_config.client_keys.slice()
    },
    provider_stats: {
      ...(nextOverview.provider_stats || {})
    },
    groups: Array.isArray(nextOverview.groups) ? nextOverview.groups.slice() : [],
    providers: Array.isArray(nextOverview.providers) ? nextOverview.providers.slice() : []
  };
}

export function createStatusLiveSnapshot(payload?: StatusBootstrapPayload | null): StatusLiveSnapshot {
  return {
    cursor: normalizeCursor(payload?.stream_cursor, 0),
    overview: normalizeStatusOverview(payload || null)
  };
}

export function reduceStatusLiveEvent(snapshot: StatusLiveSnapshot, event: LiveEvent) {
  const nextCursor = Math.max(snapshot.cursor, normalizeCursor(event.lastEventId, snapshot.cursor));
  switch (event.type) {
    case "stats_delta": {
      const payload = event.data as {
        provider?: string;
        snapshot?: StatusOverview["provider_stats"][string];
      };
      const providerName = String(payload?.provider || "");
      if (!providerName) {
        return {
          requiresBootstrap: false,
          snapshot: {
            ...snapshot,
            cursor: nextCursor
          }
        };
      }

      return {
        requiresBootstrap: false,
        snapshot: {
          cursor: nextCursor,
          overview: {
            ...snapshot.overview,
            provider_stats: {
              ...snapshot.overview.provider_stats,
              [providerName]: {
                ...(payload?.snapshot || {})
              }
            }
          }
        }
      };
    }
    case "providers_changed":
    case "resync_required":
      return {
        requiresBootstrap: true,
        snapshot: {
          ...snapshot,
          cursor: nextCursor
        }
      };
    default:
      return {
        requiresBootstrap: false,
        snapshot: {
          ...snapshot,
          cursor: nextCursor
        }
      };
  }
}

function buildBootstrapLogCache(
  currentLogCache: AdminLogCache,
  recentLogs: Array<Record<string, unknown>>,
  streamCursor: number,
  maxEntries: number,
  nowMs: number
) {
  if (currentLogCache.cursor > 0 && streamCursor > 0 && streamCursor < currentLogCache.cursor) {
    return applyAdminLogDelta(createEmptyAdminLogCache(), {
      gap: true,
      next_cursor: streamCursor,
      snapshot: recentLogs
    }, maxEntries, nowMs).cache;
  }

  return applyAdminLogDelta(currentLogCache, {
    entries: recentLogs,
    gap: false,
    next_cursor: streamCursor
  }, maxEntries, nowMs).cache;
}

export function createAdminLiveSnapshot(
  payload?: AdminBootstrapPayload | null,
  currentLogCache: AdminLogCache = createEmptyAdminLogCache(),
  maxEntries = adminLogCacheMaxEntries,
  nowMs = Date.now()
): AdminLiveSnapshot {
  const streamCursor = normalizeCursor(payload?.stream_cursor, 0);
  const recentLogs = Array.isArray(payload?.recent_logs)
    ? payload.recent_logs
    : [];

  return {
    cursor: streamCursor,
    logCache: buildBootstrapLogCache(currentLogCache, recentLogs, streamCursor, maxEntries, nowMs),
    overview: normalizeAdminOverview(payload || null)
  };
}

export function reduceAdminLiveEvent(
  snapshot: AdminLiveSnapshot,
  event: LiveEvent,
  maxEntries = adminLogCacheMaxEntries,
  nowMs = Date.now()
) {
  const nextCursor = Math.max(snapshot.cursor, normalizeCursor(event.lastEventId, snapshot.cursor));

  switch (event.type) {
    case "stats_delta": {
      const payload = event.data as {
        provider?: string;
        snapshot?: AdminOverview["provider_stats"][string];
      };
      const providerName = String(payload?.provider || "");
      if (!providerName) {
        return {
          requiresBootstrap: false,
          snapshot: {
            ...snapshot,
            cursor: nextCursor
          }
        };
      }

      return {
        requiresBootstrap: false,
        snapshot: {
          ...snapshot,
          cursor: nextCursor,
          overview: {
            ...snapshot.overview,
            provider_stats: {
              ...snapshot.overview.provider_stats,
              [providerName]: {
                ...(payload?.snapshot || {})
              }
            }
          }
        }
      };
    }
    case "log_append":
      return {
        requiresBootstrap: false,
        snapshot: {
          ...snapshot,
          cursor: nextCursor,
          logCache: applyAdminLogDelta(snapshot.logCache, {
            entries: [event.data as Record<string, unknown>],
            gap: false,
            next_cursor: nextCursor
          }, maxEntries, nowMs).cache
        }
      };
    case "providers_changed":
    case "global_config_changed":
    case "resync_required":
      return {
        requiresBootstrap: true,
        snapshot: {
          ...snapshot,
          cursor: nextCursor
        }
      };
    default:
      return {
        requiresBootstrap: false,
        snapshot: {
          ...snapshot,
          cursor: nextCursor
        }
      };
  }
}
