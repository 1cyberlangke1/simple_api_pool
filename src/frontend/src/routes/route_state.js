import { collectStatusSummary } from "../stores/status_store.js";
import { filterKeysBySearch, getDisableBounds, getProviderByName } from "../stores/admin_store.js";

export function resolveRoute(location) {
  return location === "/admin" ? "admin" : "status";
}

export function buildAdminRouteState(adminStateSnapshot) {
  const selectedProvider = getProviderByName(adminStateSnapshot.overview.providers || [], adminStateSnapshot.selectedProviderName);
  const selectedProviderStats = adminStateSnapshot.selectedProviderName
    ? adminStateSnapshot.overview.provider_stats[adminStateSnapshot.selectedProviderName] || {}
    : {};
  const visibleProviders = (adminStateSnapshot.overview.providers || []).filter(function keepVisibleProvider(providerSnapshot) {
    const searchText = String(adminStateSnapshot.providerSearch || "").trim().toLowerCase();
    if (!searchText) {
      return true;
    }
    return String(providerSnapshot.name || "").toLowerCase().indexOf(searchText) >= 0;
  });
  const visibleKeys = selectedProvider ? filterKeysBySearch(selectedProvider.keys || [], adminStateSnapshot.keySearch) : [];

  return {
    disableBounds: getDisableBounds(adminStateSnapshot.selectedProviderDraft),
    selectedProvider,
    selectedProviderStats,
    visibleKeys,
    visibleProviders
  };
}

export function buildStatusRouteState(statusStateSnapshot) {
  return {
    statusSummary: collectStatusSummary(statusStateSnapshot.overview)
  };
}
