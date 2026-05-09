import { html, InlineMessage } from "../../shared/view_helpers.js";
import { ProviderFields } from "./provider_fields.js";

export function ProviderSidebar(props) {
  return html`
    <aside class="provider-sidebar">
      <div class="panel-heading">
        <div>
          <h2>${props.translate("admin.providerListTitle")}</h2>
          <p>${props.translate("admin.providerWorkspace")}</p>
        </div>
        <button class="ghost-button" type="button" disabled=${!props.adminState.authenticated} onClick=${props.onOpenLogs}>
          ${props.translate("action.openLogs")}
        </button>
      </div>
      <label class="field">
        <span>${props.translate("admin.providerSearch")}</span>
        <input
          id="provider-selector-search"
          type="search"
          value=${props.adminState.providerSearch}
          placeholder=${props.translate("admin.providerSearchPlaceholder")}
          onInput=${function handleProviderSearchInput(event) {
            props.onProviderSearchChange(event.currentTarget.value);
          }}
        />
      </label>
      <div class="provider-selector-list">
        ${props.visibleProviders.length === 0
          ? html`<div class="empty-panel">${props.translate("admin.providerListEmpty")}</div>`
          : props.visibleProviders.map(function renderProviderSelector(providerSnapshot) {
              const providerStats = props.adminState.overview.provider_stats[providerSnapshot.name] || {};
              return html`
                <button
                  type="button"
                  class=${providerSnapshot.name === props.adminState.selectedProviderName ? "provider-selector-item active" : "provider-selector-item"}
                  onClick=${function selectProvider() {
                    props.onSelectProvider(providerSnapshot.name);
                  }}
                >
                  <strong>${providerSnapshot.name}</strong>
                  <span>${props.translate("provider.type." + providerSnapshot.type)}</span>
                  <span>${props.translate("provider.availableKeys", {
                    available: Number(providerStats.available_keys || 0),
                    total: Number(providerStats.total_keys || 0)
                  })}</span>
                </button>
              `;
            })}
      </div>

      <form class="stack-form create-provider-form" onSubmit=${props.onCreateProvider}>
        <div class="panel-heading compact">
          <div>
            <h3>${props.translate("admin.providerCreateTitle")}</h3>
          </div>
        </div>
        <${ProviderFields}
          draft=${props.adminState.createProviderDraft}
          disableType=${false}
          onChange=${props.onCreateProviderDraftChange}
          readOnlyName=${false}
          translate=${props.translate}
        />
        <button class="primary-button" type="submit" disabled=${!props.adminState.authenticated}>
          ${props.translate("action.createProvider")}
        </button>
        <${InlineMessage} kind=${props.adminState.createProviderMessage.kind} text=${props.adminState.createProviderMessage.text} />
      </form>
    </aside>
  `;
}
