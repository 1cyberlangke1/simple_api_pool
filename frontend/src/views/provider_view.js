/* ---------- provider view ---------- */

    function renderProviderPager(providers) {
      const totalProviders = providers.length;
      const currentProvider = getCurrentProvider();
      const currentNumber = totalProviders ? state.providerPageIndex + 1 : 0;

      refs.providerPagePrev.disabled = currentNumber <= 1;
      refs.providerPageNext.disabled = !totalProviders || currentNumber >= totalProviders;
      refs.keySearchInput.disabled = totalProviders === 0;
      refs.providerPageIndicator.textContent = totalProviders
        ? currentNumber + " / " + totalProviders + " · " + currentProvider.name
        : "-";
    }

    function providerTypeOptions(selected) {
      const options = [
        ["openai_chat", "OpenAI Chat"],
        ["openai_responses", "OpenAI Responses"],
        ["claude", "Claude"],
        ["gemini", "Gemini"]
      ];
      return options.map((option) => '<option value="' + option[0] + '" ' + (selected === option[0] ? "selected" : "") + ">" + option[1] + "</option>").join("");
    }

    function providerStrategyOptions(selected) {
      const options = [
        ["round_robin", t("strategy.roundRobin")],
        ["fill", t("strategy.fill")]
      ];
      return options.map((option) => '<option value="' + option[0] + '" ' + (selected === option[0] ? "selected" : "") + ">" + option[1] + "</option>").join("");
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

      const keyListMarkup = pageKeys.length
        ? '<div class="key-list">' + pageKeys.map((key) => {
            const isDisabled = Number(key.disabled_until || 0) * 1000 > Date.now();
            const stateText = isDisabled
              ? t("provider.disabledUntil", { time: formatTimestamp(key.disabled_until) })
              : t("provider.usable");
            const keyRef = String(key.ref || key.value || "");
            const checked = selectedKeys.has(keyRef) ? "checked" : "";
            return '\n              <div class="key-item">\n                <label class="checkbox key-selector-checkbox">\n                  <input type="checkbox" data-role="key-selector" data-provider="' + escapeHTML(provider.name) + '" data-key="' + escapeHTML(keyRef) + '" ' + checked + ">\n                </label>\n                <div>\n                  <code>" + escapeHTML(key.value) + "</code>\n                  <div class=\"provider-meta\">" + escapeHTML(t("provider.fails", { n: key.consecutive_fails || 0 })) + " · " + escapeHTML(stateText) + "</div>\n                </div>\n                <button class=\"secondary\" type=\"button\" data-action=\"delete-key\" data-provider=\"" + escapeHTML(provider.name) + "\" data-key=\"" + escapeHTML(keyRef) + "\">" + escapeHTML(t("provider.delete")) + "</button>\n              </div>\n            ";
          }).join("") + "</div>"
        : '<div class="empty">' + escapeHTML(t("provider.noKeys")) + "</div>";

      return '\n        <div class="key-list-summary">\n          <span>' + escapeHTML(selectionSummary) + '</span>\n          <span>' + escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages })) + '</span>\n        </div>\n        ' + keyListMarkup + '\n        <div class="key-pager">\n          <button class="secondary" type="button" data-action="prev-key-page" data-provider="' + escapeHTML(provider.name) + '">' + escapeHTML(t("admin.keyPagePrev")) + '</button>\n          <span class="key-pager-indicator">' + escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages })) + '</span>\n          <button class="secondary" type="button" data-action="next-key-page" data-provider="' + escapeHTML(provider.name) + '">' + escapeHTML(t("admin.keyPageNext")) + "</button>\n        </div>\n      ";
    }

    function renderProviders(providers) {
      normalizeProviderWorkspaceState();
      renderProviderPager(providers);
      syncKeySearchInput();

      if (!providers.length) {
        const emptyText = state.adminAuthenticated ? t("provider.empty") : t("admin.loginToLoad");
        refs.providerList.innerHTML = '<div class="empty">' + escapeHTML(emptyText) + "</div>";
        return;
      }

      const provider = getCurrentProvider();
      const stats = state.stats[provider.name] || {};
      const keys = provider.keys || [];
      const keySummary = summarizeProviderKeys(keys);
      syncProviderDraft(provider);
      syncProviderImportDraft(provider.name);
      const draftProvider = state.providerDraftsByName[provider.name] || createProviderDraftFromSnapshot(provider);
      const importDraftValue = state.providerImportDraftsByName[provider.name] || "";
      const clearCacheActionAttr = 'data-action="clear-cache"';

      refs.providerList.innerHTML = '\n        <article class="provider-card provider-single-panel">\n          <div class="provider-head">\n            <div>\n              <h3 class="provider-name">' + escapeHTML(provider.name) + '</h3>\n              <div class="provider-meta">' + escapeHTML(provider.type) + " · " + escapeHTML(provider.base_url || t("provider.defaultUpstream")) + '</div>\n              <div class="tag-row">\n                <span class="tag ok">' + escapeHTML(t("provider.tagSuccess", { n: stats.success_count || 0 })) + '</span>\n                <span class="tag err">' + escapeHTML(t("provider.tagError", { n: stats.error_count || 0 })) + '</span>\n                <span class="tag muted">' + escapeHTML(t("provider.tagCacheHits", { n: stats.cache_hits || 0 })) + '</span>\n                <span class="tag">' + escapeHTML(t("provider.tagKeys", { n: keys.length })) + '</span>\n                <span class="tag ok">' + escapeHTML(t("provider.tagAvailable", { n: keySummary.available })) + '</span>\n                <span class="tag err">' + escapeHTML(t("provider.tagDisabled", { n: keySummary.disabled })) + '</span>\n                <span class="tag ' + (provider.cache_enabled ? "ok" : "muted") + '">' + escapeHTML(t(provider.cache_enabled ? "provider.tagCacheOn" : "provider.tagCacheOff")) + '</span>\n              </div>\n            </div>\n            <button class="secondary" type="button" data-action="delete-provider" data-provider="' + escapeHTML(provider.name) + '">' + escapeHTML(t("provider.delete")) + "</button>\n          </div>\n\n          <div class=\"stats-grid\">\n            <div class=\"mini\"><strong>" + (stats.success_count || 0) + "</strong><span>" + escapeHTML(t("provider.statSuccess")) + "</span></div>\n            <div class=\"mini\"><strong>" + (stats.error_count || 0) + "</strong><span>" + escapeHTML(t("provider.statError")) + "</span></div>\n            <div class=\"mini\"><strong>" + (stats.input_tokens || 0) + "</strong><span>" + escapeHTML(t("provider.statInputTokens")) + "</span></div>\n            <div class=\"mini\"><strong>" + (stats.output_tokens || 0) + "</strong><span>" + escapeHTML(t("provider.statOutputTokens")) + "</span></div>\n            <div class=\"mini\"><strong>" + (stats.cache_tokens || 0) + "</strong><span>" + escapeHTML(t("provider.statCacheTokens")) + "</span></div>\n            <div class=\"mini\"><strong>" + (stats.cache_hits || 0) + "</strong><span>" + escapeHTML(t("provider.statCacheHits")) + "</span></div>\n          </div>\n\n          <hr class=\"divider\">\n\n          <div class=\"provider-body-grid\">\n            <div class=\"provider-config-column\">\n              <div class=\"provider-column-panel\">\n                <div class=\"provider-column-title\">Provider Config</div>\n                <form class=\"provider-edit-form\" data-provider=\"" + escapeHTML(provider.name) + "\">\n                  <div class=\"provider-form-section\">\n                    <h4 class=\"provider-form-section-title\">基础连接</h4>\n                    <div class=\"form-grid\">\n                      <label>\n                        " + escapeHTML(t("provider.name")) + '\n                        <input name="name" type="text" value="' + escapeHTML(provider.name) + "\" readonly>\n                      </label>\n                      <label>\n                        " + escapeHTML(t("provider.type")) + '\n                        <select name="type">' + providerTypeOptions(draftProvider.type) + "</select>\n                      </label>\n                    </div>\n                    <div class=\"form-grid\">\n                      <label>\n                        " + escapeHTML(t("provider.baseUrl")) + '\n                        <input name="base_url" type="text" value="' + escapeHTML(draftProvider.base_url || "") + "\">\n                      </label>\n                      <label>\n                        " + escapeHTML(t("provider.strategy")) + '\n                        <select name="key_strategy">' + providerStrategyOptions(draftProvider.key_strategy) + "</select>\n                      </label>\n                    </div>\n                  </div>\n\n                  <div class=\"provider-form-section\">\n                    <h4 class=\"provider-form-section-title\">禁用策略</h4>\n                    <p class=\"provider-form-section-note\">控制失败阈值、禁用窗口和恢复上限。</p>\n                    <div class=\"form-grid provider-compact-fields\">\n                      <label>\n                        " + escapeHTML(t("provider.failThreshold")) + '\n                        <input name="fail_threshold" type="number" min="1" value="' + Number(draftProvider.fail_threshold || 3) + "\">\n                      </label>\n                      <label>\n                        " + escapeHTML(t("provider.minDisable")) + '\n                        <input name="min_disable_secs" type="number" min="1" value="' + Number(draftProvider.min_disable_secs || 30) + "\">\n                      </label>\n                      <label>\n                        " + escapeHTML(t("provider.maxDisable")) + '\n                        <input name="max_disable_secs" type="number" min="1" value="' + (draftProvider.max_disable_secs !== undefined ? draftProvider.max_disable_secs : Number(provider.max_disable_secs || 43200)) + "\">\n                      </label>\n                    </div>\n                  </div>\n\n                  <div class=\"provider-form-section\">\n                    <h4 class=\"provider-form-section-title\">缓存设置</h4>\n                    <div class=\"form-grid provider-threshold-fields\">\n                      <label class=\"checkbox\">\n                        <input name=\"cache_enabled\" type=\"checkbox\" " + (draftProvider.cache_enabled ? "checked" : "") + ">\n                        <span>" + escapeHTML(t("provider.cacheEnabled")) + "</span>\n                      </label>\n                      <label>\n                        " + escapeHTML(t("provider.cacheMax")) + '\n                        <input name="cache_max_entries" type="number" min="1" value="' + Number(draftProvider.cache_max_entries || 1000) + "\">\n                      </label>\n                    </div>\n                  </div>\n\n                  <div class=\"actions\">\n                    <button class=\"primary\" type=\"submit\">" + escapeHTML(t("provider.save")) + "</button>\n                    <button class=\"secondary\" type=\"button\" ' + clearCacheActionAttr + ' data-provider=\"" + escapeHTML(provider.name) + "\">" + escapeHTML(t("provider.clearCache")) + "</button>\n                  </div>\n                  <div class=\"inline-status\" data-role=\"provider-status\"></div>\n                </form>\n              </div>\n            </div>\n\n            <div class=\"provider-key-column\">\n              <div class=\"provider-column-panel\">\n                <div class=\"provider-column-title\">" + escapeHTML(t("provider.upstreamKeys")) + "</div>\n                <form class=\"provider-keys-form\" data-provider=\"" + escapeHTML(provider.name) + "\">\n                  <label>\n                    " + escapeHTML(t("provider.batchImport")) + '\n                    <textarea name="keys" placeholder="' + escapeHTML(t("admin.keysPlaceholder")) + '">' + escapeHTML(importDraftValue) + "</textarea>\n                  </label>\n                  <div class=\"actions\">\n                    <button class=\"primary\" type=\"submit\">" + escapeHTML(t("provider.import")) + "</button>\n                  </div>\n                  <div class=\"inline-status\" data-role=\"keys-status\"></div>\n                </form>\n              </div>\n              <div class=\"provider-column-panel\">\n                " + renderProviderKeysSection(provider) + "\n              </div>\n            </div>\n          </div>\n        </article>\n      ";
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
