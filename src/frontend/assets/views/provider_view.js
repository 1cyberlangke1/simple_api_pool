/* ---------- provider view ---------- */

    function renderProviderSelector(providers) {
      syncProviderSearchInput();
      if (!refs.providerSelectorList) {
        return;
      }
      if (!providers.length) {
        refs.providerSelectorList.innerHTML = `<div class="empty">${escapeHTML(state.providerSearchQuery ? t("admin.providerSelectorEmpty") : t("admin.loginToLoad"))}</div>`;
        return;
      }

      const currentProvider = getCurrentProvider();
      refs.providerSelectorList.innerHTML = `
        <div class="provider-selector-stack">
          ${providers.map((provider) => {
            const stats = state.stats[provider.name] || {};
            const keySummary = summarizeProviderKeys(provider.keys || []);
            const isActive = currentProvider && currentProvider.name === provider.name;
            return `
              <button class="provider-selector-item${isActive ? " active" : ""}" type="button" data-role="provider-selector" data-provider="${escapeHTML(provider.name)}">
                <span class="provider-selector-name-row">
                  <span class="provider-selector-name">${escapeHTML(provider.name)}</span>
                  <span class="provider-selector-type">${escapeHTML(provider.type)}</span>
                </span>
                <span class="provider-selector-meta">
                  <span>${escapeHTML(t("provider.tagSuccess", { n: stats.success_count || 0 }))}</span>
                  <span>${escapeHTML(t("provider.tagAvailableKeys", { available: keySummary.available, total: (provider.keys || []).length }))}</span>
                  ${isActive ? `<span>${escapeHTML(t("provider.selected"))}</span>` : ""}
                </span>
              </button>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderProviders(providers) {
      normalizeProviderWorkspaceState();
      syncKeySearchInput();
      const visibleProviders = filterProviders(state.providerSearchQuery);

      if (!providers.length) {
        const emptyText = state.adminAuthenticated ? t("provider.empty") : t("admin.loginToLoad");
        refs.providerList.innerHTML = `<div class="empty">${escapeHTML(emptyText)}</div>`;
        return;
      }
      if (state.providerSearchQuery && !visibleProviders.length) {
        refs.providerList.innerHTML = `<div class="empty">${escapeHTML(t("admin.providerSelectorEmpty"))}</div>`;
        return;
      }

      const provider = getCurrentProvider();
      if (!provider) {
        refs.providerList.innerHTML = `<div class="empty">${escapeHTML(t("admin.providerSelectorEmpty"))}</div>`;
        return;
      }
      const stats = state.stats[provider.name] || {};
      const keys = provider.keys || [];
      const keySummary = summarizeProviderKeys(keys);
      syncProviderDraft(provider);
      syncProviderImportDraft(provider.name);
      const draftProvider = state.providerDraftsByName[provider.name] || createProviderDraftFromSnapshot(provider);

      refs.providerList.innerHTML = renderProviderWorkbench(provider, stats, keySummary, draftProvider);
    }

    function confirmAction(message) {
      return window.confirm(message);
    }
