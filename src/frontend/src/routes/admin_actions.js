import { normalizeErrorMessage, parseImportedKeys } from "../api.js";
import { buildGlobalPayload } from "../forms/global_config_form.js";
import { buildProviderPayload, createDefaultProviderDraft, createProviderDraftFromSnapshot } from "../forms/provider_form.js";
import { adminState, getProviderByName, normalizeBulkSeconds, resetAdminState, setAdminState } from "../stores/admin_store.js";
import {
  applyProviderBulkAction,
  clearProviderCache,
  deleteProvider,
  deleteProviderKey,
  importProviderKeys,
  loginAdmin,
  logoutAdmin,
  saveGlobalConfig,
  saveProvider
} from "../services/admin_service.js";
import { loadAdminOverview } from "./admin_polling.js";

export function createAdminActions(translate) {
  function handleGlobalDraftChange(fieldName, fieldValue) {
    setAdminState(function updateGlobalDraft(currentState) {
      return {
        ...currentState,
        globalClientKeysDirty: fieldName === "client_keys_text" ? true : currentState.globalClientKeysDirty,
        globalDirty: true,
        globalDraft: {
          ...currentState.globalDraft,
          [fieldName]: fieldValue
        }
      };
    });
  }

  function handleCreateProviderDraftChange(fieldName, fieldValue) {
    setAdminState(function updateCreateDraft(currentState) {
      return {
        ...currentState,
        createProviderDraft: {
          ...currentState.createProviderDraft,
          [fieldName]: fieldValue
        }
      };
    });
  }

  function handleSelectedProviderDraftChange(fieldName, fieldValue) {
    setAdminState(function updateSelectedDraft(currentState) {
      if (!currentState.selectedProviderDraft) {
        return currentState;
      }
      return {
        ...currentState,
        selectedProviderDirty: true,
        selectedProviderDraft: {
          ...currentState.selectedProviderDraft,
          [fieldName]: fieldValue
        }
      };
    });
  }

  function handleSelectProvider(providerName) {
    if (providerName === adminState.value.selectedProviderName) {
      return;
    }
    if (adminState.value.selectedProviderDirty && !window.confirm(translate("admin.providerDiscardDraft"))) {
      return;
    }
    const nextProvider = getProviderByName(adminState.value.overview.providers || [], providerName);
    setAdminState(function setSelectedProvider(currentState) {
      return {
        ...currentState,
        actionMessage: { kind: "", text: "" },
        bulkSeconds: normalizeBulkSeconds(currentState.bulkSeconds, nextProvider),
        importText: "",
        keySearch: "",
        providerMessage: { kind: "", text: "" },
        selectedKeyRefs: [],
        selectedProviderDraft: createProviderDraftFromSnapshot(nextProvider),
        selectedProviderDirty: false,
        selectedProviderName: providerName
      };
    });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const adminKey = String(event.currentTarget.admin_key.value || "").trim();
    setAdminState(function markLoginPending(currentState) {
      return {
        ...currentState,
        loginMessage: { kind: "", text: "" },
        loginPending: true
      };
    });
    try {
      await loginAdmin(adminKey);
      setAdminState(function setLoginSuccess(currentState) {
        return {
          ...currentState,
          checkedAuth: false,
          loginMessage: { kind: "ok", text: "" },
          loginPending: false
        };
      });
      await loadAdminOverview(translate, true, {
        preserveGlobalDraft: false,
        preserveProviderDraft: false,
        resetProviderPanel: true
      });
    } catch (error) {
      setAdminState(function setLoginFailure(currentState) {
        return {
          ...currentState,
          loginMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.loginFailed")) },
          loginPending: false
        };
      });
    }
  }

  async function handleLogout() {
    try {
      await logoutAdmin();
    } catch (_error) {
    }
    resetAdminState();
  }

  async function handleGlobalSave(event) {
    event.preventDefault();
    try {
      await saveGlobalConfig(buildGlobalPayload(adminState.value.globalDraft, adminState.value.globalClientKeysDirty));
      setAdminState(function markGlobalSaved(currentState) {
        return {
          ...currentState,
          globalClientKeysDirty: false,
          globalDirty: false,
          globalMessage: { kind: "ok", text: translate("admin.globalSaveSuccess") }
        };
      });
      await loadAdminOverview(translate, true, {
        preserveGlobalDraft: false,
        preserveProviderDraft: true
      });
    } catch (error) {
      setAdminState(function setGlobalSaveError(currentState) {
        return {
          ...currentState,
          globalMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.globalSaveFailed")) }
        };
      });
    }
  }

  async function handleCreateProvider(event) {
    event.preventDefault();
    try {
      const response = await saveProvider(buildProviderPayload(adminState.value.createProviderDraft));
      const nextProviderName = response.data && response.data.name ? response.data.name : "";
      setAdminState(function markProviderCreated(currentState) {
        return {
          ...currentState,
          createProviderDraft: createDefaultProviderDraft(),
          createProviderMessage: { kind: "ok", text: translate("admin.providerCreateSuccess") }
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: nextProviderName,
        preserveGlobalDraft: true,
        preserveProviderDraft: false,
        resetProviderPanel: true
      });
    } catch (error) {
      setAdminState(function setCreateProviderError(currentState) {
        return {
          ...currentState,
          createProviderMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.providerCreateFailed")) }
        };
      });
    }
  }

  async function handleSaveSelectedProvider(event) {
    event.preventDefault();
    if (!adminState.value.selectedProviderDraft) {
      return;
    }
    try {
      await saveProvider(buildProviderPayload(adminState.value.selectedProviderDraft));
      setAdminState(function markProviderSaved(currentState) {
        return {
          ...currentState,
          providerMessage: { kind: "ok", text: translate("admin.providerSaveSuccess") }
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: adminState.value.selectedProviderName,
        preserveGlobalDraft: true,
        preserveProviderDraft: false
      });
    } catch (error) {
      setAdminState(function setSaveProviderError(currentState) {
        return {
          ...currentState,
          providerMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.providerSaveFailed")) }
        };
      });
    }
  }

  async function handleDeleteProvider() {
    if (!adminState.value.selectedProviderName) {
      return;
    }
    if (!window.confirm(translate("admin.providerDeleteConfirm"))) {
      return;
    }
    try {
      await deleteProvider(adminState.value.selectedProviderName);
      setAdminState(function markProviderDeleted(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "ok", text: translate("admin.providerDeleteSuccess") }
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: "",
        preserveGlobalDraft: true,
        preserveProviderDraft: false,
        resetProviderPanel: true
      });
    } catch (error) {
      setAdminState(function setDeleteProviderError(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.providerDeleteFailed")) }
        };
      });
    }
  }

  async function handleClearCache() {
    if (!adminState.value.selectedProviderName) {
      return;
    }
    if (!window.confirm(translate("admin.cacheClearConfirm"))) {
      return;
    }
    try {
      await clearProviderCache(adminState.value.selectedProviderName);
      setAdminState(function markCacheCleared(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "ok", text: translate("admin.cacheClearSuccess") }
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: adminState.value.selectedProviderName,
        preserveGlobalDraft: true,
        preserveProviderDraft: true
      });
    } catch (error) {
      setAdminState(function setClearCacheError(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.cacheClearFailed")) }
        };
      });
    }
  }

  async function handleImportKeys(event) {
    event.preventDefault();
    if (!adminState.value.selectedProviderName) {
      return;
    }
    try {
      await importProviderKeys(adminState.value.selectedProviderName, parseImportedKeys(adminState.value.importText));
      setAdminState(function markImportSuccess(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "ok", text: translate("admin.importSuccess") },
          importText: ""
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: adminState.value.selectedProviderName,
        preserveGlobalDraft: true,
        preserveProviderDraft: true
      });
    } catch (error) {
      setAdminState(function setImportError(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.importFailed")) }
        };
      });
    }
  }

  async function applyBulkAction(actionName) {
    if (!adminState.value.selectedProviderName || adminState.value.selectedKeyRefs.length === 0) {
      return;
    }
    if (actionName === "delete" && !window.confirm(translate("admin.bulkDeleteConfirm"))) {
      return;
    }
    const requestBody = {
      action: actionName,
      keys: adminState.value.selectedKeyRefs.slice()
    };
    if (actionName === "disable") {
      if (adminState.value.bulkMode === "disable_forever") {
        requestBody.action = "disable_forever";
      } else {
        requestBody.action = "disable_until";
        requestBody.disable_seconds = normalizeBulkSeconds(adminState.value.bulkSeconds, adminState.value.selectedProviderDraft);
      }
    }
    try {
      await applyProviderBulkAction(adminState.value.selectedProviderName, requestBody);
      setAdminState(function markBulkActionSuccess(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "ok", text: translate("admin.bulkActionSuccess") },
          selectedKeyRefs: []
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: adminState.value.selectedProviderName,
        preserveGlobalDraft: true,
        preserveProviderDraft: true
      });
    } catch (error) {
      setAdminState(function setBulkActionError(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.bulkActionFailed")) }
        };
      });
    }
  }

  async function handleDeleteSingleKey(keyRef) {
    if (!adminState.value.selectedProviderName || !keyRef) {
      return;
    }
    if (!window.confirm(translate("admin.singleDeleteConfirm"))) {
      return;
    }
    try {
      await deleteProviderKey(adminState.value.selectedProviderName, keyRef);
      setAdminState(function markSingleDelete(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "ok", text: translate("admin.bulkActionSuccess") }
        };
      });
      await loadAdminOverview(translate, true, {
        preferredProviderName: adminState.value.selectedProviderName,
        preserveGlobalDraft: true,
        preserveProviderDraft: true
      });
    } catch (error) {
      setAdminState(function setSingleDeleteError(currentState) {
        return {
          ...currentState,
          actionMessage: { kind: "error", text: normalizeErrorMessage(error, translate("admin.bulkActionFailed")) }
        };
      });
    }
  }

  return {
    applyBulkAction,
    handleClearCache,
    handleCreateProvider,
    handleCreateProviderDraftChange,
    handleDeleteProvider,
    handleDeleteSingleKey,
    handleGlobalDraftChange,
    handleGlobalSave,
    handleImportKeys,
    handleLoginSubmit,
    handleLogout,
    handleSaveSelectedProvider,
    handleSelectProvider,
    handleSelectedProviderDraftChange
  };
}
