import { signal } from "@preact/signals";

import { normalizeErrorMessage } from "../api.js";
import { fetchStatusOverview } from "../services/status_service.js";

export function createEmptyStatusOverview() {
  return {
    health: { status: "unknown" },
    provider_stats: {}
  };
}

export function normalizeHealthStatus(rawStatus) {
  const status = String(rawStatus || "").toLowerCase();
  if (status === "ok") {
    return "ok";
  }
  if (!status) {
    return "unknown";
  }
  return status;
}

export function collectStatusSummary(overview) {
  const providerStats = overview && overview.provider_stats ? overview.provider_stats : {};
  const summary = {
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

export const statusState = signal({
  error: "",
  etag: "",
  loading: false,
  overview: createEmptyStatusOverview()
});

export async function loadStatusOverview(forceRefresh, translate) {
  statusState.value = {
    ...statusState.value,
    error: "",
    loading: true
  };
  try {
    const result = await fetchStatusOverview({
      etag: statusState.value.etag,
      forceRefresh
    });
    if (result.notModified) {
      statusState.value = {
        ...statusState.value,
        loading: false
      };
      return;
    }
    statusState.value = {
      error: "",
      etag: result.etag,
      loading: false,
      overview: result.data || createEmptyStatusOverview()
    };
  } catch (error) {
    statusState.value = {
      ...statusState.value,
      error: normalizeErrorMessage(error, translate("status.reloadFailed")),
      loading: false
    };
  }
}
