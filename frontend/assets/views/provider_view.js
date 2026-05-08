/* ---------- provider view ---------- */

    function providerTypeOptions(selected) {
      const options = [
        ["openai_chat", "OpenAI Chat"],
        ["openai_responses", "OpenAI Responses"],
        ["claude", "Claude"],
        ["gemini", "Gemini"]
      ];
      return options.map((option) => `<option value="${option[0]}" ${selected === option[0] ? "selected" : ""}>${option[1]}</option>`).join("");
    }

    function providerStrategyOptions(selected) {
      const options = [
        ["round_robin", t("strategy.roundRobin")],
        ["fill", t("strategy.fill")]
      ];
      return options.map((option) => `<option value="${option[0]}" ${selected === option[0] ? "selected" : ""}>${escapeHTML(option[1])}</option>`).join("");
    }

    function providerStrategyLabel(value) {
      return value === "fill" ? t("strategy.fill") : t("strategy.roundRobin");
    }

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

    function renderProviderOverview(provider, stats, keySummary) {
      const totalKeys = (provider.keys || []).length;
      const upstreamLabel = provider.base_url || t("provider.defaultUpstream");

      return `
        <section class="provider-overview" data-role="provider-overview">
          <div class="provider-overview-top">
            <div class="provider-overview-heading">
              <h3 class="provider-name">${escapeHTML(provider.name)}</h3>
              <div class="provider-meta">${escapeHTML(provider.type)} · ${escapeHTML(upstreamLabel)}</div>
            </div>
            <div class="provider-overview-actions">
              <span class="tag ${provider.cache_enabled ? "ok" : "muted"}">${escapeHTML(t(provider.cache_enabled ? "provider.tagCacheOn" : "provider.tagCacheOff"))}</span>
              <span class="tag muted">${escapeHTML(providerStrategyLabel(provider.key_strategy))}</span>
              <button class="secondary" type="button" data-action="delete-provider" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("provider.delete"))}</button>
            </div>
          </div>
          <div class="tag-row provider-overview-tags">
            <span class="tag ok">${escapeHTML(t("provider.tagSuccess", { n: stats.success_count || 0 }))}</span>
            <span class="tag err">${escapeHTML(t("provider.tagError", { n: stats.error_count || 0 }))}</span>
            <span class="tag muted">${escapeHTML(t("provider.tagCacheHits", { n: stats.cache_hits || 0 }))}</span>
            <span class="tag">${escapeHTML(t("provider.tagAvailableKeys", { available: keySummary.available, total: totalKeys }))}</span>
            <span class="tag err">${escapeHTML(t("provider.tagDisabled", { n: keySummary.disabled }))}</span>
          </div>
          <div class="provider-quick-stats">
            <div class="mini"><strong>${stats.success_count || 0}</strong><span>${escapeHTML(t("provider.statSuccess"))}</span></div>
            <div class="mini"><strong>${stats.error_count || 0}</strong><span>${escapeHTML(t("provider.statError"))}</span></div>
            <div class="mini"><strong>${stats.input_tokens || 0}</strong><span>${escapeHTML(t("provider.statInputTokens"))}</span></div>
            <div class="mini"><strong>${stats.output_tokens || 0}</strong><span>${escapeHTML(t("provider.statOutputTokens"))}</span></div>
            <div class="mini"><strong>${stats.cache_tokens || 0}</strong><span>${escapeHTML(t("provider.statCacheTokens"))}</span></div>
            <div class="mini"><strong>${stats.cache_hits || 0}</strong><span>${escapeHTML(t("provider.statCacheHits"))}</span></div>
          </div>
        </section>
      `;
    }

    function renderKeyList(provider, pageKeys, selectedKeys) {
      if (!pageKeys.length) {
        return `<div class="empty">${escapeHTML(t("provider.noKeys"))}</div>`;
      }

      return `
        <div class="key-list key-workspace-list">
          ${pageKeys.map((key) => {
            const isDisabled = Number(key.disabled_until || 0) * 1000 > Date.now();
            const keyRef = String(key.ref || key.value || "");
            const checked = selectedKeys.has(keyRef) ? "checked" : "";
            const stateText = isDisabled
              ? t("provider.disabledUntil", { time: formatTimestamp(key.disabled_until) })
              : t("provider.usable");

            return `
              <div class="key-item key-workspace-item">
                <label class="checkbox key-selector-checkbox">
                  <input type="checkbox" data-role="key-selector" data-provider="${escapeHTML(provider.name)}" data-key="${escapeHTML(keyRef)}" ${checked}>
                </label>
                <div class="key-workspace-main">
                  <code>${escapeHTML(key.value)}</code>
                  <div class="key-workspace-meta">
                    <span class="tag ${isDisabled ? "err" : "ok"}">${escapeHTML(stateText)}</span>
                    <span class="provider-meta">${escapeHTML(t("provider.fails", { n: key.consecutive_fails || 0 }))}</span>
                  </div>
                </div>
                <button class="secondary" type="button" data-action="delete-key" data-provider="${escapeHTML(provider.name)}" data-key="${escapeHTML(keyRef)}">${escapeHTML(t("provider.delete"))}</button>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }

    function renderProviderKeysSection(provider) {
      const filteredKeys = filterProviderKeys(provider, state.keySearchQuery);
      const pageState = paginateProviderKeys(filteredKeys, provider.name);
      const pageKeys = pageState.pageKeys;
      const currentPageIndex = pageState.currentPageIndex;
      const totalPages = pageState.totalPages;
      const selectedKeys = new Set(getSelectedKeys(provider.name));
      const selectionSummary = t("admin.keySelectionSummary", {
        selected: selectedKeys.size,
        page: pageKeys.length,
        total: filteredKeys.length
      });
      const importDraftValue = state.providerImportDraftsByName[provider.name] || "";
      const importExpanded = Boolean(state.providerImportExpandedByName[provider.name]);

      return `
        <section class="provider-column-panel key-workspace-panel">
          <div class="provider-workspace-title-row">
            <div>
              <div class="provider-column-title">${escapeHTML(t("provider.upstreamKeys"))}</div>
              <div class="provider-meta">${escapeHTML(selectionSummary)}</div>
            </div>
          </div>

          <div class="key-workspace-toolbar">
            <div class="workspace-search-stack">
              <label class="search-label workspace-search">
                <span>${escapeHTML(t("admin.keySearch"))}</span>
                <input id="key-search" data-role="key-search-input" type="search" value="${escapeHTML(state.keySearchQuery)}" placeholder="${escapeHTML(t("admin.keySearchPlaceholder"))}">
              </label>
              <button class="secondary workspace-import-toggle" type="button" data-action="toggle-import-keys" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t(importExpanded ? "admin.hideImportKeys" : "admin.importKeys"))}</button>
            </div>
            <div class="workspace-action-stack">
              <div class="key-list-summary">
                <span>${escapeHTML(selectionSummary)}</span>
                <span>${escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages }))}</span>
              </div>
              <div class="key-bulk-actions">
                <button class="secondary" type="button" data-action="select-page-keys">${escapeHTML(t("admin.selectPageKeys"))}</button>
                <button class="secondary" type="button" data-action="invert-page-keys">${escapeHTML(t("admin.invertPageKeys"))}</button>
                <button class="secondary" type="button" data-action="enable-selected-keys">${escapeHTML(t("admin.enableSelectedKeys"))}</button>
                <button class="secondary" type="button" data-action="disable-selected-keys">${escapeHTML(t("admin.disableSelectedKeys"))}</button>
                <button class="secondary" type="button" data-action="delete-selected-keys">${escapeHTML(t("admin.deleteSelectedKeys"))}</button>
              </div>
            </div>
          </div>

          ${importExpanded ? `
            <form class="provider-keys-form key-import-form" data-provider="${escapeHTML(provider.name)}">
              <label>
                ${escapeHTML(t("provider.batchImport"))}
                <textarea name="keys" placeholder="${escapeHTML(t("admin.keysPlaceholder"))}">${escapeHTML(importDraftValue)}</textarea>
              </label>
              <div class="actions key-import-actions">
                <button class="primary" type="submit">${escapeHTML(t("provider.import"))}</button>
              </div>
              <div class="inline-status" data-role="keys-status"></div>
            </form>
          ` : ""}

          ${renderKeyList(provider, pageKeys, selectedKeys)}

          <div class="key-pager">
            <button class="secondary" type="button" data-action="prev-key-page" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("admin.keyPagePrev"))}</button>
            <span class="key-pager-indicator">${escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages }))}</span>
            <button class="secondary" type="button" data-action="next-key-page" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("admin.keyPageNext"))}</button>
          </div>
        </section>
      `;
    }

    function renderProviderConfigSection(provider, draftProvider) {
      return `
        <aside class="provider-column-panel provider-config-sidebar">
          <div class="provider-column-title">${escapeHTML(t("provider.configTitle"))}</div>
          <form class="provider-edit-form" data-provider="${escapeHTML(provider.name)}">
            <div class="provider-form-section">
              <h4 class="provider-form-section-title">${escapeHTML(t("provider.connectionSectionTitle"))}</h4>
              <div class="form-grid">
                <label>
                  ${escapeHTML(t("provider.name"))}
                  <input name="name" type="text" value="${escapeHTML(provider.name)}" readonly>
                </label>
                <label>
                  ${escapeHTML(t("provider.type"))}
                  <select name="type">${providerTypeOptions(draftProvider.type)}</select>
                </label>
              </div>
              <div class="form-grid">
                <label>
                  ${escapeHTML(t("provider.baseUrl"))}
                  <input name="base_url" type="text" value="${escapeHTML(draftProvider.base_url || "")}">
                </label>
                <label>
                  ${escapeHTML(t("provider.strategy"))}
                  <select name="key_strategy">${providerStrategyOptions(draftProvider.key_strategy)}</select>
                </label>
              </div>
            </div>

            <div class="provider-form-section">
              <h4 class="provider-form-section-title">${escapeHTML(t("provider.disablePolicyTitle"))}</h4>
              <p class="provider-form-section-note">${escapeHTML(t("provider.disablePolicyNote"))}</p>
              <div class="form-grid provider-compact-fields">
                <label>
                  ${escapeHTML(t("provider.failThreshold"))}
                  <input name="fail_threshold" type="number" min="1" value="${Number(draftProvider.fail_threshold || 3)}">
                </label>
                <label>
                  ${escapeHTML(t("provider.minDisable"))}
                  <input name="min_disable_secs" type="number" min="1" value="${Number(draftProvider.min_disable_secs || 30)}">
                </label>
                <label>
                  ${escapeHTML(t("provider.maxDisable"))}
                  <input name="max_disable_secs" type="number" min="1" value="${draftProvider.max_disable_secs !== undefined ? draftProvider.max_disable_secs : Number(provider.max_disable_secs || 43200)}">
                </label>
              </div>
            </div>

            <div class="provider-form-section">
              <h4 class="provider-form-section-title">${escapeHTML(t("provider.cacheSectionTitle"))}</h4>
              <div class="form-grid provider-threshold-fields">
                <label class="checkbox">
                  <input name="cache_enabled" type="checkbox" ${draftProvider.cache_enabled ? "checked" : ""}>
                  <span>${escapeHTML(t("provider.cacheEnabled"))}</span>
                </label>
                <label>
                  ${escapeHTML(t("provider.cacheMax"))}
                  <input name="cache_max_entries" type="number" min="1" value="${Number(draftProvider.cache_max_entries || 1000)}">
                </label>
              </div>
            </div>

            <div class="actions provider-config-actions">
              <button class="primary" type="submit">${escapeHTML(t("provider.save"))}</button>
              <button class="secondary" type="button" data-action="clear-cache" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("provider.clearCache"))}</button>
            </div>
            <div class="inline-status" data-role="provider-status"></div>
          </form>
        </aside>
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

      refs.providerList.innerHTML = `
        <article class="provider-card provider-workbench-card provider-single-panel">
          ${renderProviderOverview(provider, stats, keySummary)}
          <div class="provider-workbench-grid">
            <section class="provider-primary-column">
              ${renderProviderKeysSection(provider)}
            </section>
            ${renderProviderConfigSection(provider, draftProvider)}
          </div>
        </article>
      `;
    }

    function readProviderPayload(form) {
      const formData = new FormData(form);
      return {
        name: String(formData.get("name") || "").trim(),
        type: String(formData.get("type") || "").trim(),
        base_url: String(formData.get("base_url") || "").trim(),
        key_strategy: String(formData.get("key_strategy") || "").trim(),
        fail_threshold: Number(formData.get("fail_threshold") || 3),
        min_disable_secs: Number(formData.get("min_disable_secs") || 30),
        max_disable_secs: Number(formData.get("max_disable_secs") || 43200),
        cache_enabled: form.querySelector('[name="cache_enabled"]').checked,
        cache_max_entries: Number(formData.get("cache_max_entries") || 1000)
      };
    }

    function parseImportedKeysInput(rawValue) {
      const seenKeys = new Set();
      const parsedKeys = [];
      String(rawValue || "")
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          if (seenKeys.has(item)) {
            return;
          }
          seenKeys.add(item);
          parsedKeys.push(item);
        });
      return parsedKeys;
    }

    function confirmAction(message) {
      return window.confirm(message);
    }
