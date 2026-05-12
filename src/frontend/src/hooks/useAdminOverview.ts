import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeErrorMessage, parseImportedKeys } from "@/api.js";
import {
  applyProviderBulkAction,
  clearProviderCache,
  deleteProvider,
  deleteProviderKey,
  fetchAdminBootstrap,
  fetchProviderKeySecret,
  importProviderKeys,
  loginAdmin,
  logoutAdmin,
  saveGlobalConfig,
  saveProvider,
  updateProviderKeySecret
} from "@/services/admin_service.js";
import {
  buildAdminKeyPayload,
  buildClientKeysPayload,
  buildTokenEstimationPayload,
  createGlobalDraft
} from "@/forms/global_config_form.js";
import {
  buildProviderPayload,
  createDefaultProviderDraft,
  createProviderDraftFromSnapshot,
  normalizeProviderSaveErrorMessage
} from "@/forms/provider_form.js";
import {
  adminLogCacheMaxEntries,
  chooseSelectedProviderName,
  clearPersistedAdminLogCache,
  createEmptyAdminLogCache,
  createEmptyAdminOverview,
  filterKeysBySearch,
  filterProvidersBySearch,
  filterSelectedRefs,
  findNearestDisabledUntilMs,
  getDisableBounds,
  getProviderByName,
  isPanelRequestLog,
  normalizeBulkSeconds,
  persistAdminLogCache,
  removeProviderKeyFromOverview,
  replaceProviderKeysInOverview,
  restoreAdminLogCache,
  syncProviderKeyAvailability,
  type AdminKeySnapshot,
  type AdminLogCache,
  type AdminOverview,
  type AdminProviderSnapshot
} from "@/lib/admin";
import { createAdminLiveSnapshot, reduceAdminLiveEvent } from "@/lib/live";
import { buildStreamURL, openLiveStream } from "@/services/live_service.js";

export type AdminTab = "global" | "providers" | "groups" | "keys" | "logs";
export type BulkMode = "disable_until" | "disable_forever";

export interface MessageState {
  kind: "" | "ok" | "error" | "warning";
  text: string;
  translationKey?: string;
}

interface AdminState {
  activeTab: AdminTab;
  authenticated: boolean;
  bulkMode: BulkMode;
  bulkSeconds: number;
  checkedAuth: boolean;
  clockNow: number;
  clientKeysPending: boolean;
  createProviderDraft: ReturnType<typeof createDefaultProviderDraft>;
  flashMessage: MessageState;
  globalAdminKeyDirty: boolean;
  globalConfigLoaded: boolean;
  globalConfigPending: boolean;
  globalDraft: ReturnType<typeof createGlobalDraft>;
  globalSettingsDirty: boolean;
  hidePanelLogs: boolean;
  importText: string;
  keyImportDialogOpen: boolean;
  keySearch: string;
  loadedAt: number;
  logCache: AdminLogCache;
  logModalOpen: boolean;
  loginMessage: MessageState;
  loginPending: boolean;
  overview: AdminOverview;
  pending: boolean;
  providerDialogMode: "create" | "edit";
  providerDialogMessage: MessageState;
  providerDialogOpen: boolean;
  providerDirty: boolean;
  providerDraft: ReturnType<typeof createDefaultProviderDraft> | null;
  providerSearch: string;
  selectedKeyRefs: string[];
  selectedProviderName: string;
  tokenEstimationPending: boolean;
}

interface OverviewStateOptions {
  preferredProviderName?: string;
  replaceGlobalDraft?: boolean;
}

function mergeGlobalDraft(
  currentDraft: ReturnType<typeof createGlobalDraft>,
  nextSnapshot: Record<string, unknown> | null | undefined,
  options?: {
    keepExistingClientKeys?: boolean;
    preserveAdminKey?: boolean;
    preserveClientKeys?: boolean;
    preserveTokenEstimation?: boolean;
  }
) {
  const nextDraft = createGlobalDraft(nextSnapshot);
  const shouldKeepClientKeys = Boolean(options?.preserveClientKeys) || (
    Boolean(options?.keepExistingClientKeys) && !Array.isArray(nextSnapshot?.client_keys)
  );

  return {
    admin_key: options?.preserveAdminKey ? currentDraft.admin_key : nextDraft.admin_key,
    admin_key_configured: nextDraft.admin_key_configured,
    client_keys: shouldKeepClientKeys ? currentDraft.client_keys : nextDraft.client_keys,
    token_estimation_enabled: options?.preserveTokenEstimation
      ? currentDraft.token_estimation_enabled
      : nextDraft.token_estimation_enabled
  };
}

export function createMessage(kind: MessageState["kind"], text = "", translationKey = ""): MessageState {
  return {
    kind,
    text,
    translationKey: String(translationKey || "")
  };
}

export function resolveMessageText(
  message: MessageState,
  translate: (key: string, params?: Record<string, unknown>) => string
) {
  if (message.translationKey) {
    return translate(message.translationKey);
  }
  return String(message.text || "");
}

function readKeySnapshotList(rawValue: unknown) {
  if (!Array.isArray(rawValue)) {
    return null;
  }
  return rawValue as AdminKeySnapshot[];
}

function createInitialAdminState(): AdminState {
  return {
    activeTab: "global",
    authenticated: false,
    bulkMode: "disable_until",
    bulkSeconds: 3600,
    checkedAuth: false,
    clockNow: Date.now(),
    clientKeysPending: false,
    createProviderDraft: createDefaultProviderDraft(),
    flashMessage: createMessage(""),
    globalAdminKeyDirty: false,
    globalConfigLoaded: false,
    globalConfigPending: false,
    globalDraft: createGlobalDraft(null),
    globalSettingsDirty: false,
    hidePanelLogs: true,
    importText: "",
    keyImportDialogOpen: false,
    keySearch: "",
    loadedAt: 0,
    logCache: restoreAdminLogCache(adminLogCacheMaxEntries),
    logModalOpen: false,
    loginMessage: createMessage(""),
    loginPending: false,
    overview: createEmptyAdminOverview(),
    pending: false,
    providerDialogMode: "create",
    providerDialogMessage: createMessage(""),
    providerDialogOpen: false,
    providerDirty: false,
    providerDraft: null,
    providerSearch: "",
    selectedKeyRefs: [],
    selectedProviderName: "",
    tokenEstimationPending: false
  };
}

function createUnauthorizedState(
  previousState: AdminState,
  translate: (key: string, params?: Record<string, unknown>) => string
): AdminState {
  return {
    ...previousState,
    authenticated: false,
    checkedAuth: true,
    clockNow: Date.now(),
    clientKeysPending: false,
    flashMessage: createMessage(""),
    globalAdminKeyDirty: false,
    globalConfigLoaded: false,
    globalConfigPending: false,
    globalDraft: createGlobalDraft(null),
    globalSettingsDirty: false,
    keyImportDialogOpen: false,
    loadedAt: 0,
    logCache: createEmptyAdminLogCache(),
    logModalOpen: false,
    loginMessage: createMessage("error", translate("admin.unauthorized"), "admin.unauthorized"),
    loginPending: false,
    overview: createEmptyAdminOverview(),
    pending: false,
    providerDialogMessage: createMessage(""),
    providerDialogOpen: false,
    providerDirty: false,
    providerDraft: null,
    selectedKeyRefs: [],
    selectedProviderName: "",
    tokenEstimationPending: false
  };
}

export function useAdminOverview(
  translate: (key: string, params?: Record<string, unknown>) => string,
  language: "en" | "zh"
) {
  const [state, setState] = useState<AdminState>(createInitialAdminState);
  const stateRef = useRef(state);

  useEffect(function syncStateRef() {
    stateRef.current = state;
  }, [state]);

  useEffect(function syncLocalizedLoginMessage() {
    setState(function updateLocalizedLoginMessage(previousState) {
      if (!previousState.loginMessage.translationKey) {
        return previousState;
      }
      const nextText = resolveMessageText(previousState.loginMessage, translate);
      if (previousState.loginMessage.text === nextText) {
        return previousState;
      }
      return {
        ...previousState,
        loginMessage: {
          ...previousState.loginMessage,
          text: nextText
        }
      };
    });
  }, [translate]);

  const selectedProvider = useMemo(function computeSelectedProvider() {
    return getProviderByName(state.overview.providers || [], state.selectedProviderName);
  }, [state.overview.providers, state.selectedProviderName]);

  const visibleProviders = useMemo(function computeVisibleProviders() {
    return filterProvidersBySearch(state.overview.providers || [], state.providerSearch);
  }, [state.overview.providers, state.providerSearch]);

  const visibleKeys = useMemo(function computeVisibleKeys() {
    if (!selectedProvider) {
      return [];
    }
    return filterKeysBySearch(selectedProvider.keys || [], state.keySearch);
  }, [selectedProvider, state.keySearch]);

  const filteredLogs = useMemo(function computeFilteredLogs() {
    const sourceLogs = state.logCache.entries || [];
    if (!state.hidePanelLogs) {
      return sourceLogs;
    }
    return sourceLogs.filter(function keepVisibleLog(entry) {
      return !isPanelRequestLog(entry);
    });
  }, [state.hidePanelLogs, state.logCache.entries]);

  const selectedProviderStats = useMemo(function computeSelectedProviderStats() {
    if (!state.selectedProviderName) {
      return {};
    }
    return state.overview.provider_stats[state.selectedProviderName] || {};
  }, [state.overview.provider_stats, state.selectedProviderName]);

  const disableBounds = useMemo(function computeDisableBounds() {
    return getDisableBounds(state.providerDraft || selectedProvider);
  }, [selectedProvider, state.providerDraft]);

  const streamRef = useRef<{ close: () => void } | null>(null);
  const cursorRef = useRef(0);

  const closeStream = useCallback(function closeStream() {
    if (!streamRef.current) {
      return;
    }
    streamRef.current.close();
    streamRef.current = null;
  }, []);

  const loadOverview = useCallback(async function loadOverview(_forceRefresh = false, options?: OverviewStateOptions) {
    setState(function markPending(previousState) {
      return {
        ...previousState,
        globalConfigPending: true,
        pending: true
      };
    });

    try {
      const result = await fetchAdminBootstrap();
      const bootstrapSnapshot = createAdminLiveSnapshot(
        (result.data || createEmptyAdminOverview()) as Record<string, unknown>,
        stateRef.current.logCache,
        adminLogCacheMaxEntries
      );
      const nextNowMs = Date.now();
      const nextOverview = syncProviderKeyAvailability(bootstrapSnapshot.overview, Math.floor(nextNowMs / 1000));
      cursorRef.current = bootstrapSnapshot.cursor;
      persistAdminLogCache(bootstrapSnapshot.logCache);

      setState(function mergeOverview(previousState) {
        const providers = nextOverview.providers || [];
        const nextSelectedProviderName = chooseSelectedProviderName(
          previousState.selectedProviderName,
          providers,
          options?.preferredProviderName
        );
        const nextSelectedProvider = getProviderByName(providers, nextSelectedProviderName);
        const keepProviderDraft = previousState.providerDirty && previousState.selectedProviderName === nextSelectedProviderName;
        const replaceGlobalDraft = Boolean(options?.replaceGlobalDraft);

        return {
          ...previousState,
          authenticated: true,
          checkedAuth: true,
          clockNow: nextNowMs,
          globalConfigLoaded: true,
          globalConfigPending: false,
          globalDraft: mergeGlobalDraft(previousState.globalDraft, bootstrapSnapshot.overview.global_config, {
            keepExistingClientKeys: previousState.globalConfigLoaded,
            preserveAdminKey: replaceGlobalDraft ? false : previousState.globalAdminKeyDirty,
            preserveClientKeys: replaceGlobalDraft ? false : (previousState.globalSettingsDirty || previousState.clientKeysPending),
            preserveTokenEstimation: replaceGlobalDraft ? false : previousState.tokenEstimationPending
          }),
          loadedAt: nextNowMs,
          logCache: bootstrapSnapshot.logCache,
          overview: nextOverview,
          pending: false,
          providerDraft: keepProviderDraft ? previousState.providerDraft : createProviderDraftFromSnapshot(nextSelectedProvider),
          providerDirty: keepProviderDraft,
          selectedKeyRefs: filterSelectedRefs(previousState.selectedKeyRefs, nextSelectedProvider),
          selectedProviderName: nextSelectedProviderName
        };
      });

      closeStream();
      if (typeof window !== "undefined" && typeof window.EventSource === "function") {
        streamRef.current = openLiveStream(buildStreamURL("/api/admin/stream", bootstrapSnapshot.cursor), {
          eventNames: ["stats_delta", "log_append", "providers_changed", "global_config_changed", "resync_required"],
          onEvent(event) {
            setState(function applyLiveEvent(previousState) {
              const result = reduceAdminLiveEvent({
                cursor: cursorRef.current,
                logCache: previousState.logCache,
                overview: previousState.overview
              }, event, adminLogCacheMaxEntries);
              const nextNowMs = Date.now();
              const nextOverview = syncProviderKeyAvailability(result.snapshot.overview, Math.floor(nextNowMs / 1000));

              cursorRef.current = result.snapshot.cursor;
              if (event.type === "log_append") {
                persistAdminLogCache(result.snapshot.logCache);
              }
              if (result.requiresBootstrap) {
                closeStream();
                window.setTimeout(function reloadBootstrap() {
                  void loadOverview(true, {
                    preferredProviderName: stateRef.current.selectedProviderName,
                    replaceGlobalDraft: false
                  });
                }, 0);
                return previousState;
              }

              return {
                ...previousState,
                clockNow: nextNowMs,
                loadedAt: nextNowMs,
                logCache: result.snapshot.logCache,
                overview: nextOverview
              };
            });
          }
        });
      }
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) {
        clearPersistedAdminLogCache();
        closeStream();
        setState(function markUnauthorized(previousState) {
          return createUnauthorizedState(previousState, translate);
        });
        return;
      }

      setState(function markError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.overviewLoadFailed"))),
          globalConfigPending: false,
          pending: false
        };
      });
    }
  }, [closeStream, translate]);

  const loadGlobalConfig = useCallback(async function loadGlobalConfig(forceReplace = false) {
    await loadOverview(true, {
      preferredProviderName: stateRef.current.selectedProviderName,
      replaceGlobalDraft: forceReplace
    });
  }, [loadOverview]);

  useEffect(function probeBootstrapOnMount() {
    void loadOverview(false, {
      preferredProviderName: stateRef.current.selectedProviderName,
      replaceGlobalDraft: false
    });

    return function cleanupRealtimeStream() {
      closeStream();
    };
  }, [closeStream, loadOverview]);

  useEffect(function bindEscapeKey() {
    if (!state.logModalOpen && !state.providerDialogOpen && !state.keyImportDialogOpen) {
      return undefined;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      setState(function closeDialogs(previousState) {
        return {
          ...previousState,
          keyImportDialogOpen: false,
          logModalOpen: false,
          providerDialogOpen: false
        };
      });
    }

    window.addEventListener("keydown", handleEscape);
    return function cleanupEscapeKey() {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [state.keyImportDialogOpen, state.logModalOpen, state.providerDialogOpen]);

  useEffect(function refreshExpiredKeyAvailability() {
    if (!state.authenticated || !state.checkedAuth) {
      return undefined;
    }

    const nearestDisabledUntilMs = findNearestDisabledUntilMs(state.overview.providers || [], state.clockNow || Date.now());
    if (!nearestDisabledUntilMs) {
      return undefined;
    }

    const delayMs = Math.min(Math.max(0, nearestDisabledUntilMs - Date.now() + 250), 2147483647);
    const timerId = window.setTimeout(function syncExpiredKeyAvailability() {
      setState(function updateExpiredKeyAvailability(previousState) {
        const nextNowMs = Date.now();
        return {
          ...previousState,
          clockNow: nextNowMs,
          overview: syncProviderKeyAvailability(previousState.overview, Math.floor(nextNowMs / 1000))
        };
      });
    }, delayMs);

    return function cleanupExpiredKeyAvailabilityTimer() {
      window.clearTimeout(timerId);
    };
  }, [state.authenticated, state.checkedAuth, state.clockNow, state.overview.providers]);

  const setActiveTab = useCallback(function setActiveTab(activeTab: AdminTab) {
    setState(function updateActiveTab(previousState) {
      return {
        ...previousState,
        activeTab
      };
    });
  }, []);

  const selectProvider = useCallback(function selectProvider(providerName: string) {
    const currentState = stateRef.current;
    if (providerName === currentState.selectedProviderName) {
      return true;
    }
    if (currentState.providerDirty && !window.confirm(translate("admin.providerDiscardDraft"))) {
      return false;
    }
    const nextProvider = getProviderByName(currentState.overview.providers || [], providerName);
    setState(function updateSelectedProvider(previousState) {
      return {
        ...previousState,
        bulkSeconds: normalizeBulkSeconds(previousState.bulkSeconds, nextProvider),
        flashMessage: createMessage(""),
        importText: "",
        keySearch: "",
        providerDraft: createProviderDraftFromSnapshot(nextProvider),
        providerDirty: false,
        selectedKeyRefs: [],
        selectedProviderName: providerName
      };
    });
    return true;
  }, [translate]);

  const login = useCallback(async function login(adminKey: string) {
    setState(function markLoginPending(previousState) {
      return {
        ...previousState,
        loginMessage: createMessage(""),
        loginPending: true
      };
    });
    try {
      await loginAdmin(adminKey.trim());
      setState(function clearLoginState(previousState) {
        return {
          ...previousState,
          activeTab: "global",
          flashMessage: createMessage(""),
          loginMessage: createMessage(""),
          loginPending: false
        };
      });
      await loadOverview(true);
    } catch (error) {
      setState(function markLoginError(previousState) {
        return {
          ...previousState,
          loginMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.loginFailed"))),
          loginPending: false
        };
      });
    }
  }, [translate]);

  const logout = useCallback(async function logout() {
    try {
      await logoutAdmin();
    } catch (_error) {
    }
    closeStream();
    clearPersistedAdminLogCache();
    setState(createInitialAdminState());
  }, [closeStream]);

  const saveAdminKey = useCallback(async function saveAdminKey() {
    const currentState = stateRef.current;
    if (!String(currentState.globalDraft.admin_key || "").trim()) {
      return;
    }
    try {
      await saveGlobalConfig(buildAdminKeyPayload(currentState.globalDraft));
      setState(function markAdminKeySaved(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("ok", translate("admin.adminKeySaveSuccess")),
          globalAdminKeyDirty: false,
          globalDraft: {
            ...previousState.globalDraft,
            admin_key: ""
          }
        };
      });
      await loadOverview(true, {
        preferredProviderName: currentState.selectedProviderName,
        replaceGlobalDraft: true
      });
    } catch (error) {
      setState(function markAdminKeyError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.adminKeySaveFailed")))
        };
      });
    }
  }, [loadGlobalConfig, loadOverview, translate]);

  const saveGlobalSettings = useCallback(async function saveGlobalSettings() {
    const currentState = stateRef.current;
    if (currentState.clientKeysPending) {
      return;
    }
    setState(function markClientKeysPending(previousState) {
      return {
        ...previousState,
        clientKeysPending: true
      };
    });
    try {
      await saveGlobalConfig(buildClientKeysPayload(currentState.globalDraft));
      setState(function markGlobalSettingsSaved(previousState) {
        return {
          ...previousState,
          clientKeysPending: false,
          flashMessage: createMessage(""),
          globalSettingsDirty: false
        };
      });
      await loadOverview(true, {
        preferredProviderName: currentState.selectedProviderName,
        replaceGlobalDraft: true
      });
    } catch (error) {
      setState(function markGlobalSettingsError(previousState) {
        return {
          ...previousState,
          clientKeysPending: false,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.clientKeysSaveFailed"))),
          globalSettingsDirty: false
        };
      });
    }
  }, [loadGlobalConfig, loadOverview, translate]);

  useEffect(function autoSaveClientKeys() {
    if (
      !state.authenticated ||
      !state.checkedAuth ||
      !state.globalConfigLoaded ||
      !state.globalSettingsDirty ||
      state.clientKeysPending
    ) {
      return undefined;
    }

    const timerId = window.setTimeout(function triggerClientKeysAutoSave() {
      void saveGlobalSettings();
    }, 600);

    return function cleanupClientKeysAutoSave() {
      window.clearTimeout(timerId);
    };
  }, [
    saveGlobalSettings,
    state.authenticated,
    state.checkedAuth,
    state.clientKeysPending,
    state.globalConfigLoaded,
    state.globalSettingsDirty,
    state.globalDraft.client_keys
  ]);

  const createProvider = useCallback(async function createProvider() {
    const currentState = stateRef.current;
    try {
      const response = await saveProvider(buildProviderPayload(currentState.createProviderDraft));
      const nextProviderName = response.data && response.data.name ? String(response.data.name) : "";
      setState(function markProviderCreated(previousState) {
        return {
          ...previousState,
          activeTab: "providers",
          createProviderDraft: createDefaultProviderDraft(),
          flashMessage: createMessage("ok", translate("admin.providerCreateSuccess")),
          providerDialogOpen: false,
          providerDialogMessage: createMessage(""),
          providerDialogMode: "create"
        };
      });
      await loadOverview(true, { preferredProviderName: nextProviderName });
    } catch (error) {
      const messageText = normalizeProviderSaveErrorMessage(
        error,
        translate("admin.providerCreateFailed"),
        currentState.createProviderDraft,
        translate
      );
      setState(function markProviderCreateError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", messageText),
          providerDialogMessage: createMessage("error", messageText)
        };
      });
    }
  }, [loadOverview, translate]);

  const saveSelectedProvider = useCallback(async function saveSelectedProvider() {
    const currentState = stateRef.current;
    if (!currentState.providerDraft) {
      return;
    }
    try {
      await saveProvider(buildProviderPayload(currentState.providerDraft));
      setState(function markProviderSaved(previousState) {
        return {
          ...previousState,
          activeTab: "providers",
          flashMessage: createMessage("ok", translate("admin.providerSaveSuccess")),
          providerDialogOpen: false,
          providerDialogMessage: createMessage(""),
          providerDirty: false
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      const messageText = normalizeProviderSaveErrorMessage(
        error,
        translate("admin.providerSaveFailed"),
        currentState.providerDraft,
        translate
      );
      setState(function markProviderSaveError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", messageText),
          providerDialogMessage: createMessage("error", messageText)
        };
      });
    }
  }, [loadOverview, translate]);

  const fetchProviderKeyValue = useCallback(async function fetchProviderKeyValue(keyRef: string) {
    const currentState = stateRef.current;
    const providerName = currentState.selectedProviderName;
    if (!providerName || !keyRef) {
      return "";
    }
    try {
      const response = await fetchProviderKeySecret(providerName, keyRef);
      return String((response.data && response.data.raw_value) || "");
    } catch (error) {
      setState(function markProviderKeyLoadError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.keyEditLoadFailed")))
        };
      });
      return "";
    }
  }, [translate]);

  const saveProviderKeyValue = useCallback(async function saveProviderKeyValue(keyRef: string, nextValue: string) {
    const currentState = stateRef.current;
    const providerName = currentState.selectedProviderName;
    if (!providerName || !keyRef) {
      return false;
    }

    const trimmedValue = String(nextValue || "").trim();
    if (!trimmedValue) {
      setState(function markEmptyKeyError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", translate("admin.keyEditEmpty"))
        };
      });
      return false;
    }
    try {
      await updateProviderKeySecret(providerName, keyRef, trimmedValue);
      setState(function markProviderKeySaved(previousState) {
        return {
          ...previousState,
          activeTab: "keys",
          flashMessage: createMessage("ok", translate("admin.keyEditSaveSuccess"))
        };
      });
      await loadOverview(true, { preferredProviderName: providerName });
      return true;
    } catch (error) {
      setState(function markProviderKeySaveError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.keyEditSaveFailed")))
        };
      });
      return false;
    }
  }, [loadOverview, translate]);

  const deleteSelectedProvider = useCallback(async function deleteSelectedProvider() {
    const currentState = stateRef.current;
    if (!currentState.selectedProviderName) {
      return;
    }
    if (!window.confirm(translate("admin.providerDeleteConfirm"))) {
      return;
    }
    try {
      await deleteProvider(currentState.selectedProviderName);
      setState(function markProviderDeleted(previousState) {
        return {
          ...previousState,
          activeTab: "providers",
          flashMessage: createMessage("ok", translate("admin.providerDeleteSuccess")),
          importText: "",
          keySearch: "",
          providerDraft: null,
          providerDirty: false,
          selectedKeyRefs: [],
          selectedProviderName: ""
        };
      });
      await loadOverview(true, { preferredProviderName: "" });
    } catch (error) {
      setState(function markProviderDeleteError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.providerDeleteFailed")))
        };
      });
    }
  }, [loadOverview, translate]);

  const deleteProviderByName = useCallback(async function deleteProviderByName(providerName: string) {
    if (!selectProvider(providerName)) {
      return;
    }
    await deleteSelectedProvider();
  }, [deleteSelectedProvider, selectProvider]);

  const clearSelectedProviderCache = useCallback(async function clearSelectedProviderCache() {
    const currentState = stateRef.current;
    if (!currentState.selectedProviderName) {
      return;
    }
    if (!window.confirm(translate("admin.cacheClearConfirm"))) {
      return;
    }
    try {
      await clearProviderCache(currentState.selectedProviderName);
      setState(function markCacheCleared(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("ok", translate("admin.cacheClearSuccess"))
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      setState(function markCacheClearError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.cacheClearFailed")))
        };
      });
    }
  }, [loadOverview, translate]);

  const clearProviderCacheByName = useCallback(async function clearProviderCacheByName(providerName: string) {
    if (!selectProvider(providerName)) {
      return;
    }
    await clearSelectedProviderCache();
  }, [clearSelectedProviderCache, selectProvider]);

  const importKeys = useCallback(async function importKeys() {
    const currentState = stateRef.current;
    if (!currentState.selectedProviderName) {
      return;
    }
    try {
      const response = await importProviderKeys(currentState.selectedProviderName, parseImportedKeys(currentState.importText));
      const nextKeySnapshots = readKeySnapshotList(response.data);
      setState(function markImportSuccess(previousState) {
        const nextNowMs = Date.now();
        return {
          ...previousState,
          activeTab: "keys",
          clockNow: nextNowMs,
          flashMessage: createMessage("ok", translate("admin.importSuccess")),
          importText: "",
          keyImportDialogOpen: false,
          overview: nextKeySnapshots
            ? replaceProviderKeysInOverview(
              previousState.overview,
              currentState.selectedProviderName,
              nextKeySnapshots,
              Math.floor(nextNowMs / 1000)
            )
            : previousState.overview
        };
      });
    } catch (error) {
      setState(function markImportError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.importFailed")))
        };
      });
    }
  }, [loadOverview, translate]);

  const applyBulkAction = useCallback(async function applyBulkAction(
    actionName: "enable" | "disable" | "delete",
    payloadOverride?: Record<string, unknown>
  ) {
    const currentState = stateRef.current;
    if (!currentState.selectedProviderName || currentState.selectedKeyRefs.length === 0) {
      return;
    }
    if (actionName === "delete" && !window.confirm(translate("admin.bulkDeleteConfirm"))) {
      return;
    }

    const payload: Record<string, unknown> = {
      action: actionName,
      keys: currentState.selectedKeyRefs.slice()
    };

    if (actionName === "disable") {
      Object.assign(payload, payloadOverride || (
        currentState.bulkMode === "disable_forever"
          ? { action: "disable_forever" }
          : {
              action: "disable_until",
              disable_seconds: normalizeBulkSeconds(currentState.bulkSeconds, currentState.providerDraft || selectedProvider)
            }
      ));
    }

    try {
      const response = await applyProviderBulkAction(currentState.selectedProviderName, payload);
      const nextKeySnapshots = readKeySnapshotList(response.data);
      setState(function markBulkActionSuccess(previousState) {
        const nextNowMs = Date.now();
        return {
          ...previousState,
          activeTab: "keys",
          clockNow: nextNowMs,
          flashMessage: createMessage(""),
          overview: nextKeySnapshots
            ? replaceProviderKeysInOverview(
              previousState.overview,
              currentState.selectedProviderName,
              nextKeySnapshots,
              Math.floor(nextNowMs / 1000)
            )
            : previousState.overview,
          selectedKeyRefs: []
        };
      });
    } catch (error) {
      setState(function markBulkActionError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.bulkActionFailed")))
        };
      });
    }
  }, [selectedProvider, translate]);

  const deleteSingleKey = useCallback(async function deleteSingleKey(keyRef: string) {
    const currentState = stateRef.current;
    if (!currentState.selectedProviderName || !keyRef) {
      return;
    }
    if (!window.confirm(translate("admin.singleDeleteConfirm"))) {
      return;
    }
    try {
      await deleteProviderKey(currentState.selectedProviderName, keyRef);
      setState(function markDeleteSuccess(previousState) {
        const nextNowMs = Date.now();
        return {
          ...previousState,
          clockNow: nextNowMs,
          flashMessage: createMessage(""),
          overview: removeProviderKeyFromOverview(
            previousState.overview,
            currentState.selectedProviderName,
            keyRef,
            Math.floor(nextNowMs / 1000)
          ),
          selectedKeyRefs: previousState.selectedKeyRefs.filter(function keepRef(refValue) {
            return refValue !== keyRef;
          })
        };
      });
    } catch (error) {
      setState(function markDeleteError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.bulkActionFailed")))
        };
      });
    }
  }, [translate]);

  return {
    actions: {
      applyBulkAction,
      clearProviderCacheByName,
      clearSelectedProviderCache,
      clearSelectedKeys() {
        setState(function clearSelectedKeys(previousState) {
          return {
            ...previousState,
            selectedKeyRefs: []
          };
        });
      },
      closeDialogs() {
        setState(function closeDialogs(previousState) {
          return {
            ...previousState,
            keyImportDialogOpen: false,
            logModalOpen: false,
            providerDialogMessage: createMessage(""),
            providerDialogOpen: false
          };
        });
      },
      createProvider,
      deleteProviderByName,
      deleteSelectedProvider,
      deleteSingleKey,
      fetchProviderKeyValue,
      importKeys,
      loadGlobalConfig,
      loadOverview,
      login,
      logout,
      openImportDialog() {
        setState(function openImportDialog(previousState) {
          return {
            ...previousState,
            activeTab: "keys",
            keyImportDialogOpen: true
          };
        });
      },
      openLogsDialog() {
        setState(function openLogsDialog(previousState) {
          return {
            ...previousState,
            activeTab: "logs",
            logModalOpen: true
          };
        });
      },
      openProviderCreateDialog() {
        setState(function openProviderCreateDialog(previousState) {
          return {
            ...previousState,
            activeTab: "providers",
            createProviderDraft: createDefaultProviderDraft(),
            providerDialogMode: "create",
            providerDialogMessage: createMessage(""),
            providerDialogOpen: true
          };
        });
      },
      openProviderEditDialog(providerName: string) {
        if (!selectProvider(providerName)) {
          return;
        }
        setState(function openProviderEditDialog(previousState) {
          return {
            ...previousState,
            activeTab: "providers",
            providerDialogMode: "edit",
            providerDialogMessage: createMessage(""),
            providerDialogOpen: true
          };
        });
      },
      addClientKey() {
        setState(function addClientKey(previousState) {
          return {
            ...previousState,
            globalSettingsDirty: true,
            globalDraft: {
              ...previousState.globalDraft,
              client_keys: previousState.globalDraft.client_keys.concat([""])
            }
          };
        });
      },
      removeClientKey(index: number) {
        setState(function removeClientKey(previousState) {
          return {
            ...previousState,
            globalSettingsDirty: true,
            globalDraft: {
              ...previousState.globalDraft,
              client_keys: previousState.globalDraft.client_keys.filter(function keepClientKey(_keyValue, clientKeyIndex) {
                return clientKeyIndex !== index;
              })
            }
          };
        });
      },
      saveAdminKey,
      saveGlobalSettings,
      saveProviderKeyValue,
      saveSelectedProvider,
      selectProvider,
      setAdminKey(adminKey: string) {
        setState(function updateAdminKey(previousState) {
          return {
            ...previousState,
            globalAdminKeyDirty: true,
            globalDraft: {
              ...previousState.globalDraft,
              admin_key: adminKey
            }
          };
        });
      },
      setActiveTab,
      setBulkMode(bulkMode: BulkMode) {
        setState(function updateBulkMode(previousState) {
          return {
            ...previousState,
            activeTab: "keys",
            bulkMode
          };
        });
      },
      setBulkSeconds(value: number) {
        setState(function updateBulkSeconds(previousState) {
          return {
            ...previousState,
            activeTab: "keys",
            bulkSeconds: value
          };
        });
      },
      setCreateProviderField(fieldName: string, fieldValue: boolean | number | string) {
        setState(function updateCreateProviderDraft(previousState) {
          return {
            ...previousState,
            createProviderDraft: {
              ...previousState.createProviderDraft,
              [fieldName]: fieldValue
            }
          };
        });
      },
      setHidePanelLogs(hidePanelLogs: boolean) {
        setState(function updateHidePanelLogs(previousState) {
          return {
            ...previousState,
            hidePanelLogs
          };
        });
      },
      setImportText(importText: string) {
        setState(function updateImportText(previousState) {
          return {
            ...previousState,
            activeTab: "keys",
            importText
          };
        });
      },
      setKeySearch(keySearch: string) {
        setState(function updateKeySearch(previousState) {
          return {
            ...previousState,
            activeTab: "keys",
            keySearch
          };
        });
      },
      setProviderField(fieldName: string, fieldValue: boolean | number | string) {
        setState(function updateProviderDraft(previousState) {
          if (!previousState.providerDraft) {
            return previousState;
          }
          return {
            ...previousState,
            providerDirty: true,
            providerDraft: {
              ...previousState.providerDraft,
              [fieldName]: fieldValue
            }
          };
        });
      },
      setProviderSearch(providerSearch: string) {
        setState(function updateProviderSearch(previousState) {
          return {
            ...previousState,
            activeTab: "providers",
            providerSearch
          };
        });
      },
      setTokenEstimationEnabled(tokenEstimationEnabled: boolean) {
        if (stateRef.current.tokenEstimationPending) {
          return;
        }
        const previousTokenEstimationValue = Boolean(stateRef.current.globalDraft.token_estimation_enabled);
        setState(function updateTokenEstimation(previousState) {
          return {
            ...previousState,
            globalDraft: {
              ...previousState.globalDraft,
              token_estimation_enabled: tokenEstimationEnabled
            },
            tokenEstimationPending: true
          };
        });
        void (async function persistTokenEstimation() {
          try {
            await saveGlobalConfig(buildTokenEstimationPayload({
              token_estimation_enabled: tokenEstimationEnabled
            }));
            setState(function markTokenEstimationSaved(previousState) {
              return {
                ...previousState,
                flashMessage: createMessage(""),
                tokenEstimationPending: false
              };
            });
            await loadOverview(true, {
              preferredProviderName: stateRef.current.selectedProviderName,
              replaceGlobalDraft: true
            });
          } catch (error) {
            setState(function markTokenEstimationError(previousState) {
              return {
                ...previousState,
                flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.globalSaveFailed"))),
                globalDraft: {
                  ...previousState.globalDraft,
                  token_estimation_enabled: previousTokenEstimationValue
                },
                tokenEstimationPending: false
              };
            });
            await loadOverview(true, {
              preferredProviderName: stateRef.current.selectedProviderName,
              replaceGlobalDraft: true
            });
          }
        })();
      },
      updateClientKey(index: number, nextValue: string) {
        setState(function updateClientKey(previousState) {
          return {
            ...previousState,
            globalSettingsDirty: true,
            globalDraft: {
              ...previousState.globalDraft,
              client_keys: previousState.globalDraft.client_keys.map(function mapClientKey(clientKeyValue, clientKeyIndex) {
                return clientKeyIndex === index ? nextValue : clientKeyValue;
              })
            }
          };
        });
      },
      toggleKeySelection(keyRef: string, checked: boolean) {
        setState(function updateKeySelection(previousState) {
          const nextSelection = new Set(previousState.selectedKeyRefs);
          if (checked) {
            nextSelection.add(keyRef);
          } else {
            nextSelection.delete(keyRef);
          }
          return {
            ...previousState,
            selectedKeyRefs: Array.from(nextSelection)
          };
        });
      },
      toggleVisibleSelection() {
        const visibleRefs = visibleKeys.map(function mapVisibleKey(keySnapshot) {
          return String(keySnapshot.ref || "");
        });
        setState(function updateVisibleSelection(previousState) {
          return {
            ...previousState,
            selectedKeyRefs: visibleRefs
          };
        });
      }
    },
    derived: {
      disableBounds,
      filteredLogs,
      selectedProvider,
      selectedProviderStats,
      visibleKeys,
      visibleProviders
    },
    state
  };
}
