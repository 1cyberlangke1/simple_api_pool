/* ---------- provider form state ---------- */

function syncGlobalConfigDraftFromForm(event) {
  state.globalConfigDraft = {
    admin_key: refs.globalAdminKey.value,
    token_estimation_enabled: refs.globalTokenEstimation.checked,
    client_keys: refs.globalClientKeys.value,
    admin_key_configured: Boolean(refs.globalAdminKey.value.trim()) || Boolean(state.globalConfigDraft && state.globalConfigDraft.admin_key_configured),
    client_key_count: countClientKeysInDraft(refs.globalClientKeys.value)
  };
  state.globalConfigDirty = true;
  if (event.target === refs.globalAdminKey) {
    state.globalAdminKeyDirty = true;
  }
  if (event.target === refs.globalClientKeys) {
    state.globalClientKeysDirty = true;
  }
  renderGlobalConfigSummary();
}

function syncCreateProviderDraftFromForm() {
  state.createProviderDraft = readProviderPayload(refs.createForm);
  state.createProviderDirty = true;
}

function syncProviderPanelDraftFromEvent(event) {
  const form = event.target.closest("form");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  if (form.classList.contains("provider-edit-form")) {
    const providerName = form.dataset.provider;
    state.providerDraftsByName[providerName] = readProviderPayload(form);
    state.providerDraftDirtyByName[providerName] = true;
  }
  if (form.classList.contains("provider-keys-form")) {
    const providerName = form.dataset.provider;
    state.providerImportDraftsByName[providerName] = String(new FormData(form).get("keys") || "");
    state.providerImportDirtyByName[providerName] = true;
  }
}

