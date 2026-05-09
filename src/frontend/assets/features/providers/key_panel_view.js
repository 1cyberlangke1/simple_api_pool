/* ---------- key panel view ---------- */

function renderBulkDisableControls(provider) {
  const providerName = provider.name;
  const disableMode = getBulkDisableMode(providerName);
  const disableSeconds = getBulkDisableSeconds(providerName);
  const bounds = getBulkDisableBounds(providerName);
  const isTimedDisable = disableMode === "disable_until";

  return `
    <div class="bulk-disable-controls">
      <label class="bulk-disable-control">
        <span>${escapeHTML(t("admin.bulkDisableMode"))}</span>
        <select data-role="bulk-disable-mode" data-provider="${escapeHTML(providerName)}">
          <option value="disable_until" ${disableMode === "disable_until" ? "selected" : ""}>${escapeHTML(t("admin.bulkDisableModeUntil"))}</option>
          <option value="disable_forever" ${disableMode === "disable_forever" ? "selected" : ""}>${escapeHTML(t("admin.bulkDisableModeForever"))}</option>
        </select>
      </label>
      <label class="bulk-disable-control">
        <span>${escapeHTML(t("admin.bulkDisableSeconds"))}</span>
        <input
          data-role="bulk-disable-seconds"
          data-provider="${escapeHTML(providerName)}"
          type="number"
          min="${escapeHTML(String(bounds.minimumSeconds))}"
          max="${escapeHTML(String(bounds.maximumSeconds))}"
          value="${escapeHTML(String(disableSeconds))}"
          ${isTimedDisable ? "" : "disabled"}
        >
        <span class="provider-meta">${escapeHTML(t("admin.bulkDisableRange", { min: bounds.minimumSeconds, max: bounds.maximumSeconds }))}</span>
      </label>
    </div>
  `;
}

function renderKeyList(provider, pageKeys, selectedKeys) {
  if (!pageKeys.length) {
    return `<div class="empty">${escapeHTML(t("provider.noKeys"))}</div>`;
  }

  return `
    <div class="key-table">
      <div class="key-table-head">
        <span>${escapeHTML(t("provider.keyColumnRef"))}</span>
        <span>${escapeHTML(t("provider.keyColumnStatus"))}</span>
        <span>${escapeHTML(t("provider.keyColumnFails"))}</span>
        <span>${escapeHTML(t("provider.keyColumnDisabledUntil"))}</span>
        <span>${escapeHTML(t("provider.keyColumnActions"))}</span>
      </div>
      <div class="key-list key-workspace-list">
      ${pageKeys.map((key) => {
        const isDisabled = Number(key.disabled_until || 0) * 1000 > Date.now();
        const keyRef = String(key.ref || key.value || "");
        const checked = selectedKeys.has(keyRef) ? "checked" : "";
        const stateText = isDisabled
          ? t("provider.disabledUntil", { time: formatTimestamp(key.disabled_until) })
          : t("provider.usable");
        const disabledUntilText = isDisabled
          ? formatTimestamp(key.disabled_until)
          : t("provider.notDisabled");
        const maskedValue = key.value && key.value !== keyRef ? String(key.value) : "";

        return `
          <div class="key-table-row">
            <div class="key-table-key">
              <label class="checkbox key-selector-checkbox">
                <input type="checkbox" data-role="key-selector" data-provider="${escapeHTML(provider.name)}" data-key="${escapeHTML(keyRef)}" ${checked}>
              </label>
              <div class="key-workspace-main">
                <code>${escapeHTML(keyRef)}</code>
                ${maskedValue ? `<span class="provider-meta">${escapeHTML(maskedValue)}</span>` : ""}
              </div>
            </div>
            <div class="key-table-cell">
              <span class="tag ${isDisabled ? "err" : "ok"}">${escapeHTML(stateText)}</span>
            </div>
            <div class="key-table-cell">
              <span class="provider-meta">${escapeHTML(String(key.consecutive_fails || 0))}</span>
            </div>
            <div class="key-table-cell">
              <span class="provider-meta">${escapeHTML(disabledUntilText)}</span>
            </div>
            <div class="key-table-cell key-table-actions">
              <button class="secondary" type="button" data-action="delete-key" data-provider="${escapeHTML(provider.name)}" data-key="${escapeHTML(keyRef)}">${escapeHTML(t("provider.delete"))}</button>
            </div>
          </div>
        `;
      }).join("")}
      </div>
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
    result: filteredKeys.length,
    total: (provider.keys || []).length
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
        <label class="search-label workspace-search">
          <span>${escapeHTML(t("admin.keySearch"))}</span>
          <div class="key-workspace-search-row">
            <input id="key-search" data-role="key-search-input" type="search" value="${escapeHTML(state.keySearchQuery)}" placeholder="${escapeHTML(t("admin.keySearchPlaceholder"))}">
            <button class="secondary workspace-import-toggle" type="button" data-action="toggle-import-keys" data-provider="${escapeHTML(provider.name)}">${escapeHTML(t(importExpanded ? "admin.hideImportKeys" : "admin.importKeys"))}</button>
          </div>
        </label>
        <div class="workspace-action-stack">
          <div class="key-list-summary">
            <span>${escapeHTML(selectionSummary)}</span>
            <span>${escapeHTML(t("admin.keyPageIndicator", { current: currentPageIndex + 1, total: totalPages }))}</span>
          </div>
          ${renderBulkDisableControls(provider)}
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
