import { formatErrorRate, formatNumber, formatPercent, html, InlineMessage } from "../../shared/view_helpers.js";
import { ProviderFields } from "./provider_fields.js";

export function ProviderEditor(props) {
  if (!props.selectedProvider || !props.adminState.selectedProviderDraft) {
    return html`<article class="panel empty-panel">${props.translate("admin.providerWorkspaceEmpty")}</article>`;
  }

  return html`
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>${props.selectedProvider.name}</h2>
          <p>${props.translate("provider.stats")}</p>
        </div>
        <div class="toolbar-row">
          <button class="ghost-button" type="button" onClick=${props.onClearCache}>${props.translate("action.clearCache")}</button>
          <button class="danger-button" type="button" onClick=${props.onDeleteProvider}>${props.translate("action.delete")}</button>
        </div>
      </div>
      <div class="status-grid">
        <div class="status-stat">
          <span>${props.translate("status.successRate")}</span>
          <strong>${formatPercent(props.selectedProviderStats.success_count, props.selectedProviderStats.error_count)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.errorRate")}</span>
          <strong>${formatErrorRate(props.selectedProviderStats.success_count, props.selectedProviderStats.error_count)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.inputTokens")}</span>
          <strong>${formatNumber(props.selectedProviderStats.input_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.outputTokens")}</span>
          <strong>${formatNumber(props.selectedProviderStats.output_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.cacheHits")}</span>
          <strong>${formatNumber(props.selectedProviderStats.cache_hits)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.availableKeys")}</span>
          <strong>${props.translate("provider.availableKeys", {
            available: Number(props.selectedProviderStats.available_keys || 0),
            total: Number(props.selectedProviderStats.total_keys || 0)
          })}</strong>
        </div>
      </div>
      <form class="stack-form" onSubmit=${props.onSaveSelectedProvider}>
        <${ProviderFields}
          draft=${props.adminState.selectedProviderDraft}
          disableType=${true}
          onChange=${props.onSelectedProviderDraftChange}
          readOnlyName=${true}
          translate=${props.translate}
        />
        <button class="primary-button" type="submit" disabled=${!props.adminState.authenticated}>
          ${props.translate("action.save")}
        </button>
        <${InlineMessage} kind=${props.adminState.providerMessage.kind} text=${props.adminState.providerMessage.text} />
      </form>
    </article>
  `;
}
