/* ---------- status view ---------- */

    function applyHealthSnapshot(health) {
      const statusText = health && typeof health.status === "string" ? health.status.toLowerCase() : "";
      const normalizedStatus = statusText === "ok" || statusText === "error" ? statusText : "unknown";
      const healthy = normalizedStatus === "ok";
      const healthLabel = normalizedStatus === "unknown"
        ? t("metric.healthUnknown")
        : (healthy ? t("metric.healthOnline") : t("metric.healthError"));
      refs.serviceHealth.textContent = healthLabel;
      refs.serviceHealthNote.textContent = t("metric.healthNote", { status: normalizedStatus || "unknown" });
      refs.statusBadge.textContent = healthy ? t("status.updated") : t("status.failed");
      refs.statusBadge.className = healthy ? "status-badge ok" : "status-badge err";
    }

    function renderStatusCards(statsMap) {
      const entries = Object.entries(statsMap || {});
      state.stats = statsMap || {};
      refs.providerCount.textContent = String(entries.length);

      const totalSuccess = entries.reduce((sum, entry) => sum + (entry[1].success_count || 0), 0);
      const totalError = entries.reduce((sum, entry) => sum + (entry[1].error_count || 0), 0);
      refs.successTotal.textContent = String(totalSuccess);
      refs.errorTotal.textContent = String(totalError);

      if (!entries.length) {
        refs.statusList.innerHTML = '<div class="empty">' + escapeHTML(t("status.empty")) + "</div>";
        return;
      }

      refs.statusList.innerHTML = entries.map((entry) => {
        const name = entry[0];
        const item = entry[1];
        const success = item.success_count || 0;
        const error = item.error_count || 0;
        const total = success + error;
        const successRate = total ? ((success / total) * 100).toFixed(1) + "%" : t("provider.rateNone");
        const errorRate = total ? ((error / total) * 100).toFixed(1) + "%" : t("provider.rateNone");
        const availableKeys = item.available_keys || 0;
        const totalKeys = item.total_keys || 0;
        const errorTypes = Object.entries(item.error_types || {}).filter((errorTypeEntry) => Number(errorTypeEntry[1]) > 0);
        const errorTypeMarkup = errorTypes.length
          ? '\n            <div class="error-type-row">\n              <span class="tag muted">' + escapeHTML(t("provider.errorTypeTitle")) + '</span>\n              ' + errorTypes.map((errorTypeEntry) => '<span class="tag err">' + escapeHTML(errorTypeEntry[0] + " × " + errorTypeEntry[1]) + "</span>").join("") + "\n            </div>\n          "
          : "";

        return '\n          <article class="provider-card">\n            <div class="provider-head">\n              <div>\n                <h3 class="provider-name">' + escapeHTML(name) + '</h3>\n                <div class="tag-row">\n                  <span class="tag ok">' + escapeHTML(t("provider.tagSuccessRate", { n: successRate })) + '</span>\n                  <span class="tag err">' + escapeHTML(t("provider.tagErrorRate", { n: errorRate })) + '</span>\n                  <span class="tag muted">' + escapeHTML(t("provider.tagCacheHits", { n: item.cache_hits || 0 })) + '</span>\n                  <span class="tag">' + escapeHTML(t("provider.tagAvailableKeys", { available: availableKeys, total: totalKeys })) + "</span>\n                </div>\n              </div>\n            </div>\n            <div class=\"stats-grid\">\n              <div class=\"mini\"><strong>" + success + "</strong><span>" + escapeHTML(t("provider.statSuccess")) + "</span></div>\n              <div class=\"mini\"><strong>" + error + "</strong><span>" + escapeHTML(t("provider.statError")) + "</span></div>\n              <div class=\"mini\"><strong>" + (item.input_tokens || 0) + "</strong><span>" + escapeHTML(t("provider.statInputTokens")) + "</span></div>\n              <div class=\"mini\"><strong>" + (item.output_tokens || 0) + "</strong><span>" + escapeHTML(t("provider.statOutputTokens")) + "</span></div>\n              <div class=\"mini\"><strong>" + (item.cache_tokens || 0) + "</strong><span>" + escapeHTML(t("provider.statCacheTokens")) + "</span></div>\n              <div class=\"mini\"><strong>" + (item.cache_hits || 0) + "</strong><span>" + escapeHTML(t("provider.statCacheHits")) + "</span></div>\n            </div>\n            " + errorTypeMarkup + "\n          </article>\n        ";
      }).join("");
    }
