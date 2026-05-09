import { formatDisabledUntil, formatNumber, html } from "../../shared/view_helpers.js";

export function KeyWorkspace(props) {
  if (!props.selectedProvider || !props.adminState.selectedProviderDraft) {
    return null;
  }

  return html`
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>${props.translate("provider.keys")}</h2>
          <p>${props.translate("provider.selectedCount", { count: props.adminState.selectedKeyRefs.length })}</p>
        </div>
        <div class="toolbar-row">
          <button class="ghost-button" type="button" onClick=${props.onToggleVisibleSelection}>${props.translate("action.selectVisible")}</button>
          <button class="ghost-button" type="button" onClick=${props.onClearSelection}>${props.translate("action.clearSelected")}</button>
        </div>
      </div>

      <div class="key-toolbar">
        <label class="field">
          <span>${props.translate("admin.keySearch")}</span>
          <input
            data-role="key-search-input"
            type="search"
            value=${props.adminState.keySearch}
            placeholder=${props.translate("admin.keySearchPlaceholder")}
            onInput=${function handleKeySearchInput(event) {
              props.onKeySearchChange(event.currentTarget.value);
            }}
          />
        </label>
        <label class="field">
          <span>${props.translate("admin.bulkMode")}</span>
          <select
            data-role="bulk-disable-mode"
            class="bulk-disable-mode"
            value=${props.adminState.bulkMode}
            onChange=${function handleBulkModeChange(event) {
              props.onBulkModeChange(event.currentTarget.value);
            }}
          >
            <option value="disable_until">${props.translate("admin.bulkModeTimed")}</option>
            <option value="disable_forever">${props.translate("admin.bulkModeForever")}</option>
          </select>
        </label>
        ${props.adminState.bulkMode === "disable_until"
          ? html`
              <label class="field">
                <span>${props.translate("admin.bulkDisableSeconds")}</span>
                <input
                  class="bulk-disable-seconds"
                  name="bulk-disable-seconds"
                  type="number"
                  min=${props.disableBounds.min}
                  max=${props.disableBounds.max}
                  value=${props.normalizeBulkSeconds(props.adminState.bulkSeconds, props.adminState.selectedProviderDraft)}
                  onInput=${function handleBulkSecondsInput(event) {
                    props.onBulkSecondsChange(event.currentTarget.value);
                  }}
                />
              </label>
            `
          : null}
      </div>
      <p class="hint">${props.translate("admin.bulkDisableRange", { min: props.disableBounds.min, max: props.disableBounds.max })}</p>
      <div class="toolbar-row wrap">
        <button class="ghost-button" type="button" onClick=${function enableSelected() {
          void props.onApplyBulkAction("enable");
        }}>
          ${props.translate("action.enableSelected")}
        </button>
        <button class="ghost-button" type="button" onClick=${function disableSelected() {
          void props.onApplyBulkAction("disable");
        }}>
          ${props.translate("action.disableSelected")}
        </button>
        <button class="danger-button" type="button" onClick=${function deleteSelected() {
          void props.onApplyBulkAction("delete");
        }}>
          ${props.translate("action.deleteSelected")}
        </button>
      </div>

      <form class="stack-form import-form" onSubmit=${props.onImportKeys}>
        <label class="field">
          <span>${props.translate("action.importKeys")}</span>
          <textarea
            placeholder=${props.translate("admin.importPlaceholder")}
            value=${props.adminState.importText}
            onInput=${function handleImportTextInput(event) {
              props.onImportTextChange(event.currentTarget.value);
            }}
          ></textarea>
        </label>
        <button class="primary-button" type="submit">${props.translate("action.importKeys")}</button>
      </form>

      ${props.visibleKeys.length === 0
        ? html`<div class="empty-panel">${props.translate("admin.noKeys")}</div>`
        : html`
            <div class="key-table-wrap">
              <table class="key-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>${props.translate("provider.maskedValue")}</th>
                    <th>${props.translate("provider.reference")}</th>
                    <th>${props.translate("provider.disabledUntil")}</th>
                    <th>${props.translate("provider.fails")}</th>
                    <th>${props.translate("action.delete")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.visibleKeys.map(function renderKeyRow(keySnapshot) {
                    const keyRef = String(keySnapshot.ref || "");
                    const checked = props.adminState.selectedKeyRefs.indexOf(keyRef) >= 0;
                    return html`
                      <tr>
                        <td>
                          <input
                            type="checkbox"
                            checked=${checked}
                            onChange=${function handleKeyCheckboxChange(event) {
                              props.onToggleKeySelection(keyRef, event.currentTarget.checked);
                            }}
                          />
                        </td>
                        <td>${keySnapshot.value}</td>
                        <td><code>${keyRef}</code></td>
                        <td>${formatDisabledUntil(keySnapshot.disabled_until, props.language, props.translate)}</td>
                        <td>${formatNumber(keySnapshot.consecutive_fails)}</td>
                        <td>
                          <button class="ghost-button" type="button" onClick=${function deleteSingleKey() {
                            void props.onDeleteSingleKey(keyRef);
                          }}>
                            ${props.translate("action.delete")}
                          </button>
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          `}
    </article>
  `;
}
