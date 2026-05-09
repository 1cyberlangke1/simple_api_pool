/* ---------- provider renderer ---------- */

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

function renderProviderWorkbench(provider, stats, keySummary, draftProvider) {
  return `
    <article class="provider-card provider-workbench-card provider-single-panel">
      ${renderProviderOverview(provider, stats, keySummary)}
      <div class="provider-workbench-grid">
        <section class="provider-primary-column">
          ${renderProviderKeysSection(provider)}
        </section>
        ${renderProviderConfigSidebar(provider, draftProvider)}
      </div>
    </article>
  `;
}
