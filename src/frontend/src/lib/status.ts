export interface HealthSnapshot {
  status?: string;
}

export interface ProviderStatusSnapshot {
  available_keys?: number;
  total_keys?: number;
  cache_enabled?: boolean;
  success_count?: number;
  error_count?: number;
  error_types?: Record<string, number>;
  input_tokens?: number;
  output_tokens?: number;
  cache_tokens?: number;
  cache_hits?: number;
}

export interface StatusOverview {
  health: HealthSnapshot;
  provider_types?: Record<string, string>;
  provider_stats: Record<string, ProviderStatusSnapshot>;
}

export interface StatusSummary {
  cacheHits: number;
  cacheTokens: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  providerCount: number;
  successCount: number;
}

export const statusRefreshIntervalMs = 15000;

export function createEmptyStatusOverview(): StatusOverview {
  return {
    health: { status: "unknown" },
    provider_stats: {}
  };
}

export function normalizeHealthStatus(rawStatus: unknown) {
  const status = String(rawStatus || "").toLowerCase();
  if (status === "ok" || status === "warning" || status === "error") {
    return status;
  }
  if (!status) {
    return "unknown";
  }
  return status;
}

export function collectStatusSummary(overview: StatusOverview): StatusSummary {
  const providerStats = overview?.provider_stats || {};
  const summary: StatusSummary = {
    cacheHits: 0,
    cacheTokens: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    providerCount: 0,
    successCount: 0
  };
  const entries = Object.values(providerStats);
  summary.providerCount = entries.length;
  for (let index = 0; index < entries.length; index += 1) {
    const snapshot = entries[index] || {};
    summary.successCount += Number(snapshot.success_count || 0);
    summary.errorCount += Number(snapshot.error_count || 0);
    summary.inputTokens += Number(snapshot.input_tokens || 0);
    summary.outputTokens += Number(snapshot.output_tokens || 0);
    summary.cacheTokens += Number(snapshot.cache_tokens || 0);
    summary.cacheHits += Number(snapshot.cache_hits || 0);
  }
  return summary;
}

export function buildProviderCards(overview: StatusOverview) {
  return Object.entries(overview?.provider_stats || {})
    .sort(function compareProviderNames(leftEntry, rightEntry) {
      return String(leftEntry[0] || "").localeCompare(String(rightEntry[0] || ""));
    })
    .map(function toCard(entry) {
      return {
        name: entry[0],
        snapshot: entry[1] || {},
        status: overview?.health?.status || "unknown",
        type: overview?.provider_types?.[entry[0]] || ""
      };
    });
}

export function buildErrorTypeSummaries(snapshot: ProviderStatusSnapshot, limit = 4) {
  return Object.entries(snapshot?.error_types || {})
    .map(function toErrorTypeEntry(entry) {
      return {
        code: String(entry[0] || ""),
        count: Number(entry[1] || 0)
      };
    })
    .filter(function keepPositiveEntry(entry) {
      return entry.code && entry.count > 0;
    })
    .sort(function compareErrorTypeEntries(leftEntry, rightEntry) {
      if (rightEntry.count !== leftEntry.count) {
        return rightEntry.count - leftEntry.count;
      }
      return leftEntry.code.localeCompare(rightEntry.code, "en");
    })
    .slice(0, limit)
    .map(function toErrorTypeSummary(entry) {
      return `${entry.code} × ${entry.count}`;
    });
}

export function buildErrorTypeSummaryClassName() {
  return "inline-flex min-h-8 items-center rounded-full border border-[#991b1b] bg-[#dc2626] px-3 py-1.5 text-sm font-semibold leading-none text-white shadow-sm dark:border-[#f87171] dark:bg-[#b91c1c] dark:text-white";
}

export function buildStatusErrorCountClassName() {
  return "inline-flex min-h-11 items-center rounded-xl border border-[#991b1b] bg-[#dc2626] px-3 py-1.5 font-mono text-2xl font-bold text-white shadow-sm dark:border-[#f87171] dark:bg-[#b91c1c] dark:text-white";
}

export function buildStatusErrorAlertClassName() {
  return "rounded-lg border border-[#991b1b] bg-[#7f1d1d] px-4 py-3 text-sm font-medium text-white shadow-sm dark:border-[#f87171] dark:bg-[#991b1b] dark:text-white";
}

export function computeStatusRefreshCountdownSeconds(nextRefreshAt: number, nowMs = Date.now()) {
  const remainingMs = Number(nextRefreshAt || 0) - Number(nowMs || 0);
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

export function formatStatusRefreshCountdownLabel(seconds: number) {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? Math.floor(seconds) : 0);
  return `${safeSeconds}s`;
}
