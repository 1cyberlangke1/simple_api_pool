import { clamp, toInteger } from "@/api.js";
import { createDefaultProviderDraft } from "@/forms/provider_form.js";

export interface AdminKeySnapshot {
  ref: string;
  value: string;
  disabled_until: number;
  consecutive_fails: number;
}

export interface AdminProviderSnapshot {
  name: string;
  type: string;
  base_url: string;
  keys: AdminKeySnapshot[];
  cache_enabled: boolean;
  cache_max_entries: number;
  key_strategy: string;
  fail_threshold: number;
  min_disable_secs: number;
  max_disable_secs: number;
}

export interface AdminProviderStatsSnapshot {
  available_keys?: number;
  total_keys?: number;
  success_count?: number;
  error_count?: number;
  error_types?: Record<string, number>;
  input_tokens?: number;
  output_tokens?: number;
  cache_tokens?: number;
  cache_hits?: number;
}

export interface AdminOverview {
  health: { status?: string };
  global_config: {
    admin_key_configured: boolean;
    client_keys: string[];
    token_estimation_enabled: boolean;
    client_key_count: number;
  };
  providers: AdminProviderSnapshot[];
  provider_stats: Record<string, AdminProviderStatsSnapshot>;
}

export interface AdminLogEntry {
  attrs?: Record<string, unknown>;
  level: string;
  msg: string;
  seq: number;
  time: string;
}

export interface AdminLogCache {
  cursor: number;
  entries: AdminLogEntry[];
  updatedAt: number;
}

export interface AdminLogDeltaResponse {
  entries?: Array<Record<string, unknown>>;
  gap?: boolean;
  next_cursor?: number;
  snapshot?: Array<Record<string, unknown>>;
}

export type BulkDisableDraft =
  | { mode: "forever" }
  | { mode: "duration"; seconds: number }
  | { mode: "until"; until: string };

export const adminLogCacheStorageKey = "admin-log-cache-v1";
export const adminLogCacheMaxEntries = 100;
export const permanentDisabledUntilThreshold = 32503680000;

export function createEmptyAdminOverview(): AdminOverview {
  return {
    health: { status: "unknown" },
    global_config: {
      admin_key_configured: false,
      client_keys: [],
      token_estimation_enabled: false,
      client_key_count: 0
    },
    providers: [],
    provider_stats: {}
  };
}

export function createEmptyAdminLogCache(): AdminLogCache {
  return {
    cursor: 0,
    entries: [],
    updatedAt: 0
  };
}

export function getProviderByName(providers: AdminProviderSnapshot[], providerName: string) {
  for (let index = 0; index < providers.length; index += 1) {
    if (providers[index].name === providerName) {
      return providers[index];
    }
  }
  return null;
}

export function filterKeysBySearch(keys: AdminKeySnapshot[], searchText: string) {
  const normalizedSearch = String(searchText || "").trim().toLowerCase();
  if (!normalizedSearch) {
    return keys;
  }
  return keys.filter(function keepMatchingKey(keySnapshot) {
    const maskedValue = String(keySnapshot.value || "").toLowerCase();
    const reference = String(keySnapshot.ref || "").toLowerCase();
    return maskedValue.includes(normalizedSearch) || reference.includes(normalizedSearch);
  });
}

export function filterProvidersBySearch(providers: AdminProviderSnapshot[], searchText: string) {
  const normalizedSearch = String(searchText || "").trim().toLowerCase();
  if (!normalizedSearch) {
    return providers;
  }
  return providers.filter(function keepMatchingProvider(providerSnapshot) {
    return String(providerSnapshot.name || "").toLowerCase().includes(normalizedSearch);
  });
}

export function filterSelectedRefs(selectedRefs: string[], providerSnapshot: AdminProviderSnapshot | null) {
  if (!providerSnapshot || !providerSnapshot.keys) {
    return [];
  }
  const validRefs = new Set<string>();
  for (let index = 0; index < providerSnapshot.keys.length; index += 1) {
    validRefs.add(String(providerSnapshot.keys[index].ref || ""));
  }
  return selectedRefs.filter(function keepExistingRef(keyRef) {
    return validRefs.has(keyRef);
  });
}

export function isKeyDisabledAt(rawValue: unknown, nowUnix = Math.floor(Date.now() / 1000)) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return false;
  }

  const disabledUntil = Number(rawValue);
  if (!Number.isFinite(disabledUntil) || disabledUntil <= 0) {
    return false;
  }
  if (disabledUntil >= permanentDisabledUntilThreshold) {
    return true;
  }
  return disabledUntil > nowUnix;
}

export function countAvailableProviderKeys(keys: AdminKeySnapshot[], nowUnix = Math.floor(Date.now() / 1000)) {
  let availableKeyCount = 0;
  for (let index = 0; index < keys.length; index += 1) {
    if (!isKeyDisabledAt(keys[index].disabled_until, nowUnix)) {
      availableKeyCount += 1;
    }
  }
  return availableKeyCount;
}

export function replaceProviderKeysInOverview(
  overview: AdminOverview,
  providerName: string,
  nextKeys: AdminKeySnapshot[],
  nowUnix = Math.floor(Date.now() / 1000)
) {
  let matchedProvider = false;
  const providers = (overview.providers || []).map(function replaceProviderKeys(providerSnapshot) {
    if (providerSnapshot.name !== providerName) {
      return providerSnapshot;
    }
    matchedProvider = true;
    return {
      ...providerSnapshot,
      keys: nextKeys.slice()
    };
  });

  if (!matchedProvider) {
    return overview;
  }

  return {
    ...overview,
    providers,
    provider_stats: {
      ...overview.provider_stats,
      [providerName]: {
        ...(overview.provider_stats[providerName] || {}),
        available_keys: countAvailableProviderKeys(nextKeys, nowUnix),
        total_keys: nextKeys.length
      }
    }
  };
}

export function removeProviderKeyFromOverview(
  overview: AdminOverview,
  providerName: string,
  keyRef: string,
  nowUnix = Math.floor(Date.now() / 1000)
) {
  const providerSnapshot = getProviderByName(overview.providers || [], providerName);
  if (!providerSnapshot) {
    return overview;
  }

  return replaceProviderKeysInOverview(
    overview,
    providerName,
    (providerSnapshot.keys || []).filter(function keepProviderKey(keySnapshot) {
      return keySnapshot.ref !== keyRef;
    }),
    nowUnix
  );
}

export function syncProviderKeyAvailability(overview: AdminOverview, nowUnix = Math.floor(Date.now() / 1000)) {
  let statsChanged = false;
  const nextProviderStats = { ...overview.provider_stats };
  const providers = overview.providers || [];

  for (let index = 0; index < providers.length; index += 1) {
    const providerSnapshot = providers[index];
    const nextAvailableKeyCount = countAvailableProviderKeys(providerSnapshot.keys || [], nowUnix);
    const nextTotalKeyCount = (providerSnapshot.keys || []).length;
    const previousProviderStats = nextProviderStats[providerSnapshot.name] || {};

    if (
      previousProviderStats.available_keys === nextAvailableKeyCount &&
      previousProviderStats.total_keys === nextTotalKeyCount
    ) {
      continue;
    }

    nextProviderStats[providerSnapshot.name] = {
      ...previousProviderStats,
      available_keys: nextAvailableKeyCount,
      total_keys: nextTotalKeyCount
    };
    statsChanged = true;
  }

  if (!statsChanged) {
    return overview;
  }

  return {
    ...overview,
    provider_stats: nextProviderStats
  };
}

export function findNearestDisabledUntilMs(providers: AdminProviderSnapshot[], nowMs = Date.now()) {
  const nowUnix = Math.floor(nowMs / 1000);
  let nearestDisabledUntilMs = 0;

  for (let providerIndex = 0; providerIndex < providers.length; providerIndex += 1) {
    const keys = providers[providerIndex].keys || [];
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const disabledUntil = Number(keys[keyIndex].disabled_until || 0);
      if (!Number.isFinite(disabledUntil) || disabledUntil <= nowUnix || disabledUntil >= permanentDisabledUntilThreshold) {
        continue;
      }

      const candidateTimeMs = disabledUntil * 1000;
      if (nearestDisabledUntilMs <= 0 || candidateTimeMs < nearestDisabledUntilMs) {
        nearestDisabledUntilMs = candidateTimeMs;
      }
    }
  }

  return nearestDisabledUntilMs;
}

export function chooseSelectedProviderName(
  currentProviderName: string,
  providers: AdminProviderSnapshot[],
  preferredProviderName?: string
) {
  const nextProviderName = preferredProviderName || currentProviderName;
  if (nextProviderName && getProviderByName(providers, nextProviderName)) {
    return nextProviderName;
  }
  if (providers.length === 0) {
    return "";
  }
  return providers[0].name;
}

export function getDisableBounds(providerDraft: Partial<AdminProviderSnapshot> | null) {
  const draft = providerDraft || createDefaultProviderDraft();
  const minDisableSecs = Math.max(1, toInteger(draft.min_disable_secs, 30));
  const maxDisableSecs = Math.max(minDisableSecs, toInteger(draft.max_disable_secs, 43200));
  return {
    max: maxDisableSecs,
    min: minDisableSecs
  };
}

export function normalizeBulkSeconds(bulkSeconds: unknown, providerDraft: Partial<AdminProviderSnapshot> | null) {
  const bounds = getDisableBounds(providerDraft);
  const fallbackValue = clamp(3600, bounds.min, bounds.max);
  return clamp(toInteger(bulkSeconds, fallbackValue), bounds.min, bounds.max);
}

export function buildBulkDisableRequest(
  draft: BulkDisableDraft,
  providerDraft: Partial<AdminProviderSnapshot> | null,
  nowMs = Date.now()
) {
  if (draft.mode === "forever") {
    return {
      action: "disable_forever"
    };
  }

  if (draft.mode === "duration") {
    return {
      action: "disable_until",
      disable_seconds: normalizeBulkSeconds(draft.seconds, providerDraft)
    };
  }

  const targetMs = Date.parse(String(draft.until || ""));
  const fallbackSeconds = getDisableBounds(providerDraft).min;
  const disableSeconds = Number.isFinite(targetMs)
    ? Math.ceil((targetMs - nowMs) / 1000)
    : fallbackSeconds;

  return {
    action: "disable_until",
    disable_seconds: normalizeBulkSeconds(disableSeconds, providerDraft)
  };
}

function normalizeLogSequence(rawValue: unknown) {
  const nextSequence = toInteger(rawValue, 0);
  if (nextSequence <= 0) {
    return 0;
  }
  return nextSequence;
}

function normalizeAdminLogEntry(rawEntry: Record<string, unknown> | null | undefined): AdminLogEntry | null {
  if (!rawEntry) {
    return null;
  }

  const nextSequence = normalizeLogSequence(rawEntry.seq);
  if (nextSequence <= 0) {
    return null;
  }

  const attrs = typeof rawEntry.attrs === "object" && rawEntry.attrs
    ? rawEntry.attrs as Record<string, unknown>
    : undefined;

  return {
    attrs,
    level: String(rawEntry.level || ""),
    msg: String(rawEntry.msg || ""),
    seq: nextSequence,
    time: String(rawEntry.time || "")
  };
}

function normalizeAdminLogEntries(
  rawEntries: Array<AdminLogEntry | Record<string, unknown>> | null | undefined,
  maxEntries: number
) {
  const entriesBySequence = new Map<number, AdminLogEntry>();
  const sourceEntries = Array.isArray(rawEntries) ? rawEntries : [];

  for (let index = 0; index < sourceEntries.length; index += 1) {
    const normalizedEntry = normalizeAdminLogEntry(sourceEntries[index] as Record<string, unknown>);
    if (!normalizedEntry) {
      continue;
    }
    entriesBySequence.set(normalizedEntry.seq, normalizedEntry);
  }

  return Array.from(entriesBySequence.values())
    .sort(function compareAdminLogEntries(leftEntry, rightEntry) {
      return leftEntry.seq - rightEntry.seq;
    })
    .slice(-Math.max(1, maxEntries));
}

function readStoredAdminLogCacheValue() {
  if (typeof window === "undefined" || !window.localStorage) {
    return "";
  }
  try {
    return window.localStorage.getItem(adminLogCacheStorageKey) || "";
  } catch (_error) {
    return "";
  }
}

export function restoreAdminLogCache(maxEntries = adminLogCacheMaxEntries): AdminLogCache {
  const rawValue = readStoredAdminLogCacheValue();
  if (!rawValue) {
    return createEmptyAdminLogCache();
  }

  try {
    const parsedValue = JSON.parse(rawValue) as {
      cursor?: number;
      entries?: Array<Record<string, unknown>>;
      updatedAt?: number;
    };
    const entries = normalizeAdminLogEntries(parsedValue.entries, maxEntries);
    const lastSequence = entries.length > 0 ? entries[entries.length - 1].seq : 0;
    return {
      cursor: Math.max(normalizeLogSequence(parsedValue.cursor), lastSequence),
      entries,
      updatedAt: Math.max(0, toInteger(parsedValue.updatedAt, 0))
    };
  } catch (_error) {
    return createEmptyAdminLogCache();
  }
}

export function persistAdminLogCache(cache: AdminLogCache) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(adminLogCacheStorageKey, JSON.stringify(cache));
  } catch (_error) {
  }
}

export function clearPersistedAdminLogCache() {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.removeItem(adminLogCacheStorageKey);
  } catch (_error) {
  }
}

export function applyAdminLogDelta(
  currentCache: AdminLogCache,
  response: AdminLogDeltaResponse,
  maxEntries = adminLogCacheMaxEntries,
  nowMs = Date.now()
) {
  const gapDetected = Boolean(response?.gap);
  const normalizedCurrentEntries = normalizeAdminLogEntries(currentCache.entries, maxEntries);
  const normalizedDeltaEntries = normalizeAdminLogEntries(response.entries, maxEntries);
  const normalizedSnapshotEntries = normalizeAdminLogEntries(response.snapshot, maxEntries);

  const nextEntries = gapDetected
    ? normalizedSnapshotEntries
    : normalizeAdminLogEntries(
        normalizedCurrentEntries.concat(normalizedDeltaEntries) as unknown as Array<Record<string, unknown>>,
        maxEntries
      );

  const lastSequence = nextEntries.length > 0 ? nextEntries[nextEntries.length - 1].seq : 0;
  const responseCursor = Math.max(normalizeLogSequence(response.next_cursor), lastSequence);
  const nextCursor = gapDetected
    ? responseCursor
    : Math.max(responseCursor, normalizeLogSequence(currentCache.cursor));

  return {
    cache: {
      cursor: nextCursor,
      entries: nextEntries,
      updatedAt: nowMs
    },
    gapDetected
  };
}

export function isPanelRequestLog(entry: AdminLogEntry | Record<string, unknown> | null | undefined) {
  if (!entry || entry.msg !== "http_request") {
    return false;
  }
  const attrs = typeof entry.attrs === "object" && entry.attrs ? entry.attrs as Record<string, unknown> : {};
  const path = String(attrs.path || "");
  if (path === "/favicon.ico" || path === "/favicon.svg" || path === "/api/health") {
    return true;
  }
  return path.startsWith("/api/admin") || path.startsWith("/api/status");
}
