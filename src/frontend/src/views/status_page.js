import { html, InlineMessage, MetricCard, StatusProviderCard } from "../shared/view_helpers.js";
import { normalizeHealthStatus } from "../stores/status_store.js";

export function StatusPage(props) {
  const providerStats = props.statusState.overview.provider_stats || {};
  return html`
    <main class="status-page">
      <section class="summary-grid">
        <${MetricCard}
          label=${props.translate("status.health")}
          value=${normalizeHealthStatus(props.statusState.overview.health && props.statusState.overview.health.status)}
          note=${props.statusState.loading ? props.translate("status.loading") : props.translate("status.reloadFailed")}
        />
        <${MetricCard}
          label=${props.translate("status.providers")}
          value=${props.formatNumber(props.statusSummary.providerCount)}
          note=${props.translate("status.availableKeys")}
        />
        <${MetricCard}
          label=${props.translate("status.success")}
          value=${props.formatNumber(props.statusSummary.successCount)}
          note=${props.translate("status.successRate") + " " + props.formatPercent(props.statusSummary.successCount, props.statusSummary.errorCount)}
        />
        <${MetricCard}
          label=${props.translate("status.error")}
          value=${props.formatNumber(props.statusSummary.errorCount)}
          note=${props.translate("status.errorRate") + " " + props.formatErrorRate(props.statusSummary.successCount, props.statusSummary.errorCount)}
        />
      </section>

      ${props.statusState.error ? html`<${InlineMessage} kind="error" text=${props.statusState.error} />` : null}

      <section class="provider-card-list">
        ${Object.entries(providerStats).length === 0
          ? html`<article class="panel empty-panel">${props.translate("status.empty")}</article>`
          : Object.entries(providerStats).map(function renderStatusCard(entry) {
              return html`
                <${StatusProviderCard}
                  name=${entry[0]}
                  snapshot=${entry[1]}
                  health=${props.statusState.overview.health && props.statusState.overview.health.status}
                  translate=${props.translate}
                />
              `;
            })}
      </section>
    </main>
  `;
}
