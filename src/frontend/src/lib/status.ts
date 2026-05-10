export interface HealthSnapshot {
  status?: string;
}

export interface ProviderStatusSnapshot {
  available_keys?: number;
  total_keys?: number;
  success_count?: number;
  error_count?: number;
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
