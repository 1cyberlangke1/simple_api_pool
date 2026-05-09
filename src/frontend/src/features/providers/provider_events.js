/* ---------- provider events ---------- */

async function handleProviderWorkspaceSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  event.preventDefault();

  try {
    if (form.classList.contains("provider-edit-form")) {
      const statusElement = form.querySelector('[data-role="provider-status"]');
      await saveProvider(form, statusElement);
    }
    if (form.classList.contains("provider-keys-form")) {
      const statusElement = form.querySelector('[data-role="keys-status"]');
      await importKeys(form, statusElement);
    }
  } catch (error) {
    const role = form.classList.contains("provider-edit-form") ? "provider-status" : "keys-status";
    const statusElement = form.querySelector('[data-role="' + role + '"]');
    setMessage(statusElement, error.message || t("error.action"), "error");
  }
}

function handleProviderSelectorSearchInput() {
  state.providerSearchQuery = refs.providerSelectorSearch.value.trim();
  if (state.providerSearchDebounceTimer !== null) {
    clearTimeout(state.providerSearchDebounceTimer);
  }
  state.providerSearchDebounceTimer = setTimeout(() => {
    state.providerSearchDebounceTimer = null;
    renderAdminWorkspaceProviders();
  }, 100);
}

function handleProviderWorkspaceInput(event) {
  syncProviderPanelDraftFromEvent(event);

  const keySearchInput = event.target.closest('input[data-role="key-search-input"]');
  if (keySearchInput) {
    state.keySearchQuery = keySearchInput.value.trim();
    const provider = getCurrentProvider();
    if (provider) {
      state.keyPageIndexByProvider[provider.name] = 0;
    }
    if (state.keySearchDebounceTimer !== null) {
      clearTimeout(state.keySearchDebounceTimer);
    }
    state.keySearchDebounceTimer = setTimeout(() => {
      state.keySearchDebounceTimer = null;
      renderAdminWorkspaceProviders();
    }, 120);
    return;
  }

  const bulkDisableSecondsInput = event.target.closest('input[data-role="bulk-disable-seconds"]');
  if (bulkDisableSecondsInput) {
    setBulkDisableSeconds(bulkDisableSecondsInput.dataset.provider, bulkDisableSecondsInput.value);
  }
}

function handleProviderWorkspaceChange(event) {
  syncProviderPanelDraftFromEvent(event);
  const disableModeSelect = event.target.closest('select[data-role="bulk-disable-mode"]');
  if (disableModeSelect) {
    setBulkDisableMode(disableModeSelect.dataset.provider, disableModeSelect.value);
    renderAdminWorkspaceProviders();
    return;
  }
  const checkbox = event.target.closest('input[data-role="key-selector"]');
  if (!checkbox) {
    return;
  }

  const providerName = checkbox.dataset.provider;
  const keyValue = checkbox.dataset.key;
  const selectedKeys = new Set(getSelectedKeys(providerName));
  if (checkbox.checked) {
    selectedKeys.add(keyValue);
  } else {
    selectedKeys.delete(keyValue);
  }
  setSelectedKeys(providerName, Array.from(selectedKeys));
  renderAdminWorkspaceProviders();
}

async function handleProviderWorkspaceClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const provider = button.dataset.provider;
  const key = button.dataset.key;
  const currentProvider = getCurrentProvider();

  try {
    const actionHandlers = {
      "toggle-import-keys": async () => {
        if (!currentProvider) {
          return;
        }
        state.providerImportExpandedByName[currentProvider.name] = !state.providerImportExpandedByName[currentProvider.name];
        renderAdminWorkspaceProviders();
      },
      "delete-provider": async () => deleteProvider(provider),
      "delete-key": async () => deleteKey(provider, key),
      "clear-cache": async () => clearProviderCache(provider),
      "prev-key-page": async () => {
        if (!currentProvider) {
          return;
        }
        setKeyPage(currentProvider.name, (state.keyPageIndexByProvider[currentProvider.name] || 0) - 1);
      },
      "next-key-page": async () => {
        if (!currentProvider) {
          return;
        }
        setKeyPage(currentProvider.name, (state.keyPageIndexByProvider[currentProvider.name] || 0) + 1);
      },
      "select-page-keys": async () => {
        if (!currentProvider) {
          return;
        }
        const filteredKeys = filterProviderKeys(currentProvider, state.keySearchQuery);
        const pageState = paginateProviderKeys(filteredKeys, currentProvider.name);
        const mergedKeys = new Set(getSelectedKeys(currentProvider.name).concat(pageState.pageKeys.map((item) => String(item.ref || item.value))));
        setSelectedKeys(currentProvider.name, Array.from(mergedKeys));
        renderAdminWorkspaceProviders();
      },
      "invert-page-keys": async () => {
        if (!currentProvider) {
          return;
        }
        const filteredKeys = filterProviderKeys(currentProvider, state.keySearchQuery);
        const pageState = paginateProviderKeys(filteredKeys, currentProvider.name);
        const nextSelectedKeys = new Set(getSelectedKeys(currentProvider.name));
        for (const pageKey of pageState.pageKeys) {
          const keyRef = String(pageKey.ref || pageKey.value);
          if (nextSelectedKeys.has(keyRef)) {
            nextSelectedKeys.delete(keyRef);
          } else {
            nextSelectedKeys.add(keyRef);
          }
        }
        setSelectedKeys(currentProvider.name, Array.from(nextSelectedKeys));
        renderAdminWorkspaceProviders();
      },
      "enable-selected-keys": async () => {
        if (currentProvider) {
          await applyBulkKeyAction(currentProvider.name, "enable");
        }
      },
      "disable-selected-keys": async () => {
        if (currentProvider) {
          await applyBulkKeyAction(currentProvider.name, "disable");
        }
      },
      "delete-selected-keys": async () => {
        if (currentProvider) {
          await applyBulkKeyAction(currentProvider.name, "delete");
        }
      }
    };
    const actionHandler = actionHandlers[action];
    if (actionHandler) {
      await actionHandler();
    }
  } catch (error) {
    setMessage(refs.adminActionStatus, error.message || t("error.action"), "error");
  }
}

function handleProviderSelectorClick(event) {
  const button = event.target.closest('button[data-role="provider-selector"]');
  if (!button) {
    return;
  }
  setProviderByName(button.dataset.provider);
}
