import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { normalizeErrorMessage, parseImportedKeys } from "@/api.js";
import {
  applyProviderBulkAction,
  clearProviderCache,
  deleteProvider,
  deleteProviderKey,
  fetchAdminOverview,
  importProviderKeys,
  loginAdmin,
  logoutAdmin,
  saveGlobalConfig,
  saveProvider
} from "@/services/admin_service.js";
import { buildGlobalPayload, createGlobalDraft } from "@/forms/global_config_form.js";
import { buildProviderPayload, createDefaultProviderDraft, createProviderDraftFromSnapshot } from "@/forms/provider_form.js";
import {
  chooseSelectedProviderName,
  createEmptyAdminOverview,
  filterKeysBySearch,
  filterProvidersBySearch,
  filterSelectedRefs,
  getDisableBounds,
  getProviderByName,
  isPanelRequestLog,
  normalizeBulkSeconds,
  type AdminOverview,
  type AdminProviderSnapshot
} from "@/lib/admin";

export type AdminTab = "global" | "providers" | "keys" | "logs";
export type BulkMode = "disable_until" | "disable_forever";

interface MessageState {
  kind: "" | "ok" | "error";
  text: string;
}

interface AdminState {
  activeTab: AdminTab;
  authenticated: boolean;
  bulkMode: BulkMode;
  bulkSeconds: number;
  checkedAuth: boolean;
  createProviderDraft: ReturnType<typeof createDefaultProviderDraft>;
  flashMessage: MessageState;
  globalClientKeysDirty: boolean;
  globalDirty: boolean;
  globalDraft: ReturnType<typeof createGlobalDraft>;
  hidePanelLogs: boolean;
  importText: string;
  keyImportDialogOpen: boolean;
  keySearch: string;
  loadedAt: number;
  logModalOpen: boolean;
  loginMessage: MessageState;
  loginPending: boolean;
  overview: AdminOverview;
  pending: boolean;
  providerDialogMode: "create" | "edit";
  providerDialogOpen: boolean;
  providerDirty: boolean;
  providerDraft: ReturnType<typeof createDefaultProviderDraft> | null;
  providerSearch: string;
  selectedKeyRefs: string[];
  selectedProviderName: string;
}

interface OverviewStateOptions {
  preferredProviderName?: string;
}

const adminPollIntervalMs = 10000;

function createMessage(kind: MessageState["kind"], text = ""): MessageState {
  return { kind, text };
}

function createInitialAdminState(): AdminState {
  return {
    activeTab: "global",
    authenticated: false,
    bulkMode: "disable_until",
    bulkSeconds: 3600,
    checkedAuth: false,
    createProviderDraft: createDefaultProviderDraft(),
    flashMessage: createMessage(""),
    globalClientKeysDirty: false,
    globalDirty: false,
    globalDraft: createGlobalDraft(null),
    hidePanelLogs: true,
    importText: "",
    keyImportDialogOpen: false,
    keySearch: "",
    loadedAt: 0,
    logModalOpen: false,
    loginMessage: createMessage(""),
    loginPending: false,
    overview: createEmptyAdminOverview(),
    pending: false,
    providerDialogMode: "create",
    providerDialogOpen: false,
    providerDirty: false,
    providerDraft: null,
    providerSearch: "",
    selectedKeyRefs: [],
    selectedProviderName: ""
  };
}

export function useAdminOverview(
  translate: (key: string, params?: Record<string, unknown>) => string,
  language: "en" | "zh"
) {
  const [state, setState] = useState<AdminState>(createInitialAdminState);
  const stateRef = useRef(state);
  const etagRef = useRef("");

  useEffect(function syncStateRef() {
    stateRef.current = state;
  }, [state]);

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
    const sourceLogs = state.overview.recent_logs || [];
    if (!state.hidePanelLogs) {
      return sourceLogs;
    }
    return sourceLogs.filter(function keepVisibleLog(entry) {
      return !isPanelRequestLog(entry);
    });
  }, [state.hidePanelLogs, state.overview.recent_logs]);

  const selectedProviderStats = useMemo(function computeSelectedProviderStats() {
    if (!state.selectedProviderName) {
      return {};
    }
    return state.overview.provider_stats[state.selectedProviderName] || {};
  }, [state.overview.provider_stats, state.selectedProviderName]);

  const disableBounds = useMemo(function computeDisableBounds() {
    return getDisableBounds(state.providerDraft || selectedProvider);
  }, [selectedProvider, state.providerDraft]);

  const loadOverview = useCallback(async function loadOverview(forceRefresh = false, options?: OverviewStateOptions) {
    setState(function markPending(previousState) {
      return {
        ...previousState,
        pending: true
      };
    });

    try {
      const result = await fetchAdminOverview({
        etag: etagRef.current,
        forceRefresh
      });

      if (result.notModified) {
        setState(function markReady(previousState) {
          return {
            ...previousState,
            authenticated: true,
            checkedAuth: true,
            loadedAt: Date.now(),
            pending: false
          };
        });
        return;
      }

      etagRef.current = result.etag || "";
      const nextOverview = (result.data || createEmptyAdminOverview()) as AdminOverview;

      setState(function mergeOverview(previousState) {
        const providers = nextOverview.providers || [];
        const nextSelectedProviderName = chooseSelectedProviderName(
          previousState.selectedProviderName,
          providers,
          options?.preferredProviderName
        );
        const nextSelectedProvider = getProviderByName(providers, nextSelectedProviderName);
        const keepGlobalDraft = previousState.globalDirty;
        const keepProviderDraft = previousState.providerDirty && previousState.selectedProviderName === nextSelectedProviderName;

        return {
          ...previousState,
          authenticated: true,
          checkedAuth: true,
          globalClientKeysDirty: keepGlobalDraft ? previousState.globalClientKeysDirty : false,
          globalDirty: keepGlobalDraft,
          globalDraft: keepGlobalDraft ? previousState.globalDraft : createGlobalDraft(nextOverview.global_config),
          loadedAt: Date.now(),
          overview: nextOverview,
          pending: false,
          providerDraft: keepProviderDraft ? previousState.providerDraft : createProviderDraftFromSnapshot(nextSelectedProvider),
          providerDirty: keepProviderDraft,
          selectedKeyRefs: filterSelectedRefs(previousState.selectedKeyRefs, nextSelectedProvider),
          selectedProviderName: nextSelectedProviderName
        };
      });
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) {
        etagRef.current = "";
        setState(function markUnauthorized(previousState) {
          return {
            ...previousState,
            authenticated: false,
            checkedAuth: true,
            flashMessage: createMessage(""),
            loadedAt: 0,
            loginMessage: createMessage("error", translate("admin.unauthorized")),
            overview: createEmptyAdminOverview(),
            pending: false,
            providerDraft: null,
            selectedKeyRefs: [],
            selectedProviderName: ""
          };
        });
        return;
      }

      setState(function markError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.overviewLoadFailed"))),
          pending: false
        };
      });
    }
  }, [translate]);

  useEffect(function probeAndPollOverview() {
    let timerId = 0;
    const shouldProbeAuth = !state.checkedAuth;
    const shouldPoll = state.authenticated;

    if (shouldProbeAuth || shouldPoll) {
      void loadOverview(false);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !stateRef.current.authenticated) {
        return;
      }
      void loadOverview(true);
    }

    if (shouldPoll) {
      timerId = window.setInterval(function pollOverview() {
        if (document.visibilityState === "hidden" || !stateRef.current.authenticated) {
          return;
        }
        void loadOverview(false);
      }, adminPollIntervalMs);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return function cleanupPolling() {
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadOverview, state.authenticated, state.checkedAuth]);

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
  }, [loadOverview, translate]);

  const logout = useCallback(async function logout() {
    try {
      await logoutAdmin();
    } catch (_error) {
    }
    etagRef.current = "";
    setState(createInitialAdminState());
  }, []);

  const saveGlobal = useCallback(async function saveGlobal() {
    const currentState = stateRef.current;
    try {
      await saveGlobalConfig(buildGlobalPayload(currentState.globalDraft, currentState.globalClientKeysDirty));
      setState(function markGlobalSaved(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("ok", translate("admin.globalSaveSuccess")),
          globalClientKeysDirty: false,
          globalDirty: false
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      setState(function markGlobalError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.globalSaveFailed")))
        };
      });
    }
  }, [loadOverview, translate]);

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
          providerDialogMode: "create"
        };
      });
      await loadOverview(true, { preferredProviderName: nextProviderName });
    } catch (error) {
      setState(function markProviderCreateError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.providerCreateFailed")))
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
          providerDirty: false
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      setState(function markProviderSaveError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.providerSaveFailed")))
        };
      });
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
      await importProviderKeys(currentState.selectedProviderName, parseImportedKeys(currentState.importText));
      setState(function markImportSuccess(previousState) {
        return {
          ...previousState,
          activeTab: "keys",
          flashMessage: createMessage("ok", translate("admin.importSuccess")),
          importText: "",
          keyImportDialogOpen: false
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      setState(function markImportError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.importFailed")))
        };
      });
    }
  }, [loadOverview, translate]);

  const applyBulkAction = useCallback(async function applyBulkAction(actionName: "enable" | "disable" | "delete") {
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
      if (currentState.bulkMode === "disable_forever") {
        payload.action = "disable_forever";
      } else {
        payload.action = "disable_until";
        payload.disable_seconds = normalizeBulkSeconds(currentState.bulkSeconds, currentState.providerDraft || selectedProvider);
      }
    }

    try {
      await applyProviderBulkAction(currentState.selectedProviderName, payload);
      setState(function markBulkActionSuccess(previousState) {
        return {
          ...previousState,
          activeTab: "keys",
          flashMessage: createMessage("ok", translate("admin.bulkActionSuccess")),
          selectedKeyRefs: []
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      setState(function markBulkActionError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.bulkActionFailed")))
        };
      });
    }
  }, [loadOverview, selectedProvider, translate]);

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
        return {
          ...previousState,
          flashMessage: createMessage("ok", translate("admin.bulkActionSuccess")),
          selectedKeyRefs: previousState.selectedKeyRefs.filter(function keepRef(refValue) {
            return refValue !== keyRef;
          })
        };
      });
      await loadOverview(true, { preferredProviderName: currentState.selectedProviderName });
    } catch (error) {
      setState(function markDeleteError(previousState) {
        return {
          ...previousState,
          flashMessage: createMessage("error", normalizeErrorMessage(error, translate("admin.bulkActionFailed")))
        };
      });
    }
  }, [loadOverview, translate]);

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
            providerDialogOpen: false
          };
        });
      },
      createProvider,
      deleteProviderByName,
      deleteSelectedProvider,
      deleteSingleKey,
      importKeys,
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
            providerDialogOpen: true
          };
        });
      },
      saveGlobal,
      saveSelectedProvider,
      selectProvider,
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
      setGlobalField(fieldName: string, fieldValue: boolean | number | string) {
        setState(function updateGlobalDraft(previousState) {
          return {
            ...previousState,
            globalClientKeysDirty: fieldName === "client_keys_text" ? true : previousState.globalClientKeysDirty,
            globalDirty: true,
            globalDraft: {
              ...previousState.globalDraft,
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
