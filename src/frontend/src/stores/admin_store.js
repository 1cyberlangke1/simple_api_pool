import { signal } from "@preact/signals";

import { clamp, toInteger } from "../api.js";
import { createGlobalDraft } from "../forms/global_config_form.js";
import { createDefaultProviderDraft, createProviderDraftFromSnapshot } from "../forms/provider_form.js";

export function createEmptyAdminOverview() {
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

export function createInitialAdminState() {
  return {
    actionMessage: { kind: "", text: "" },
    authenticated: false,
    bulkMode: "disable_until",
    bulkSeconds: 3600,
    checkedAuth: false,
    createProviderDraft: createDefaultProviderDraft(),
    createProviderMessage: { kind: "", text: "" },
    etag: "",
    globalClientKeysDirty: false,
    globalDirty: false,
    globalDraft: createGlobalDraft(null),
    globalMessage: { kind: "", text: "" },
    hidePanelLogs: true,
    importText: "",
    keySearch: "",
    logModalOpen: false,
    loginMessage: { kind: "", text: "" },
    loginPending: false,
    overview: createEmptyAdminOverview(),
    pending: false,
    providerMessage: { kind: "", text: "" },
    providerSearch: "",
    selectedKeyRefs: [],
    selectedProviderDraft: null,
    selectedProviderDirty: false,
    selectedProviderName: ""
  };
}

export const adminState = signal(createInitialAdminState());

export function resetAdminState() {
  adminState.value = createInitialAdminState();
}

export function setAdminState(nextStateOrUpdater) {
  adminState.value = typeof nextStateOrUpdater === "function"
    ? nextStateOrUpdater(adminState.value)
    : nextStateOrUpdater;
}

export function getProviderByName(providers, providerName) {
  for (let index = 0; index < providers.length; index += 1) {
    if (providers[index].name === providerName) {
      return providers[index];
    }
  }
  return null;
}

export function filterKeysBySearch(keys, searchText) {
  const normalizedSearch = String(searchText || "").trim().toLowerCase();
  if (!normalizedSearch) {
    return keys;
  }
  return keys.filter(function keepMatchingKey(keySnapshot) {
    const maskedValue = String(keySnapshot.value || "").toLowerCase();
    const reference = String(keySnapshot.ref || "").toLowerCase();
    return maskedValue.indexOf(normalizedSearch) >= 0 || reference.indexOf(normalizedSearch) >= 0;
  });
}

export function filterSelectedRefs(selectedRefs, providerSnapshot) {
  if (!providerSnapshot || !providerSnapshot.keys) {
    return [];
  }
  const validRefs = new Set();
  for (let index = 0; index < providerSnapshot.keys.length; index += 1) {
    validRefs.add(String(providerSnapshot.keys[index].ref || ""));
  }
  return selectedRefs.filter(function keepExistingRef(keyRef) {
    return validRefs.has(keyRef);
  });
}

export function chooseSelectedProviderName(currentProviderName, providers, preferredProviderName) {
  const nextProviderName = preferredProviderName || currentProviderName;
  if (nextProviderName && getProviderByName(providers, nextProviderName)) {
    return nextProviderName;
  }
  if (providers.length === 0) {
    return "";
  }
  return providers[0].name;
}

export function getDisableBounds(providerDraft) {
  const draft = providerDraft || createDefaultProviderDraft();
  const minDisableSecs = Math.max(1, toInteger(draft.min_disable_secs, 30));
  const maxDisableSecs = Math.max(minDisableSecs, toInteger(draft.max_disable_secs, 43200));
  return {
    max: maxDisableSecs,
    min: minDisableSecs
  };
}

export function normalizeBulkSeconds(bulkSeconds, providerDraft) {
  const bounds = getDisableBounds(providerDraft);
  const fallbackValue = clamp(3600, bounds.min, bounds.max);
  return clamp(toInteger(bulkSeconds, fallbackValue), bounds.min, bounds.max);
}

export function syncAdminStateFromOverview(currentState, overview, etag, options) {
  const syncOptions = options || {};
  const providers = overview.providers || [];
  const nextSelectedProviderName = chooseSelectedProviderName(
    currentState.selectedProviderName,
    providers,
    syncOptions.preferredProviderName
  );
  const nextSelectedProvider = getProviderByName(providers, nextSelectedProviderName);
  const preserveGlobalDraft = syncOptions.preserveGlobalDraft !== false;
  const preserveProviderDraft = syncOptions.preserveProviderDraft !== false;
  const keepGlobalDraft = preserveGlobalDraft && currentState.globalDirty;
  const keepProviderDraft = preserveProviderDraft && currentState.selectedProviderDirty && currentState.selectedProviderName === nextSelectedProviderName;

  return {
    ...currentState,
    actionMessage: syncOptions.resetActionMessage ? { kind: "", text: "" } : currentState.actionMessage,
    authenticated: true,
    bulkMode: currentState.bulkMode || "disable_until",
    bulkSeconds: normalizeBulkSeconds(
      currentState.bulkSeconds,
      keepProviderDraft ? currentState.selectedProviderDraft : createProviderDraftFromSnapshot(nextSelectedProvider)
    ),
    checkedAuth: true,
    etag,
    globalClientKeysDirty: keepGlobalDraft ? currentState.globalClientKeysDirty : false,
    globalDirty: keepGlobalDraft,
    globalDraft: keepGlobalDraft ? currentState.globalDraft : createGlobalDraft(overview.global_config),
    importText: syncOptions.resetProviderPanel ? "" : currentState.importText,
    keySearch: syncOptions.resetProviderPanel ? "" : currentState.keySearch,
    loginMessage: currentState.loginMessage,
    overview,
    pending: false,
    providerMessage: currentState.providerMessage,
    selectedKeyRefs: filterSelectedRefs(currentState.selectedKeyRefs, nextSelectedProvider),
    selectedProviderDirty: keepProviderDraft,
    selectedProviderDraft: keepProviderDraft ? currentState.selectedProviderDraft : createProviderDraftFromSnapshot(nextSelectedProvider),
    selectedProviderName: nextSelectedProviderName
  };
}
