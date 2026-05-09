/* ---------- config panel view ---------- */

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
          <button class="secondary" type="button" data-action="delete-provider" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t("provider.delete"))}</button>
        </div>
        <div class="inline-status" data-role="provider-status"></div>
      </form>
    </aside>
  `;
}

function renderProviderConfigSidebar(provider, draftProvider) {
  return renderProviderConfigSection(provider, draftProvider);
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
