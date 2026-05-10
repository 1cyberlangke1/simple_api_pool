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

export interface AdminOverview {
  health: { status?: string };
  global_config: {
    admin_key_configured: boolean;
    token_estimation_enabled: boolean;
    client_key_count: number;
  };
  providers: AdminProviderSnapshot[];
  provider_stats: Record<string, Record<string, number>>;
  recent_logs: Array<Record<string, unknown>>;
}

export interface ProviderRecentError {
  message: string;
  path: string;
  status: number;
  time: string;
}

export type BulkDisableDraft =
  | { mode: "forever" }
  | { mode: "duration"; seconds: number }
  | { mode: "until"; until: string };

export function createEmptyAdminOverview(): AdminOverview {
  return {
    health: { status: "unknown" },
    global_config: {
      admin_key_configured: false,
      token_estimation_enabled: false,
      client_key_count: 0
    },
    providers: [],
    provider_stats: {},
    recent_logs: []
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

export function collectProviderRecentErrors(
  logs: Array<Record<string, unknown>>,
  providerName: string,
  limit = 2
): ProviderRecentError[] {
  if (!providerName || !Array.isArray(logs) || limit <= 0) {
    return [];
  }

  const normalizedProviderName = providerName.trim().toLowerCase();
  const matchedErrors: ProviderRecentError[] = [];

  for (let index = 0; index < logs.length; index += 1) {
    const entry = logs[index];
    if (!entry || String(entry.level || "").toUpperCase() !== "ERROR") {
      continue;
    }

    const attrs = typeof entry.attrs === "object" && entry.attrs ? entry.attrs as Record<string, unknown> : {};
    const entryProviderName = String(attrs.provider || attrs.provider_name || "").trim().toLowerCase();
    if (entryProviderName !== normalizedProviderName) {
      continue;
    }

    matchedErrors.push({
      message: String(attrs.error || entry.msg || "").trim(),
      path: String(attrs.path || ""),
      status: toInteger(attrs.upstream_status ?? attrs.status, 0),
      time: String(entry.time || "")
    });

    if (matchedErrors.length >= limit) {
      return matchedErrors;
    }
  }

  return matchedErrors;
}

export function isPanelRequestLog(entry: Record<string, unknown> | null | undefined) {
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
