import { h } from "preact";
import htm from "htm";

import { normalizeHealthStatus } from "../stores/status_store.js";

export const html = htm.bind(h);

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function formatPercent(successCount, errorCount) {
  const success = Number(successCount || 0);
  const error = Number(errorCount || 0);
  const total = success + error;
  if (total <= 0) {
    return "0%";
  }
  return ((success / total) * 100).toFixed(1) + "%";
}

export function formatErrorRate(successCount, errorCount) {
  const success = Number(successCount || 0);
  const error = Number(errorCount || 0);
  const total = success + error;
  if (total <= 0) {
    return "0%";
  }
  return ((error / total) * 100).toFixed(1) + "%";
}

export function isPermanentDisableValue(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return false;
  }
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return false;
  }
  return numericValue >= 32503680000;
}

export function formatDisabledUntil(rawValue, language, translate) {
  if (rawValue === null || rawValue === undefined || rawValue === "" || Number(rawValue) <= 0) {
    return translate("provider.notDisabled");
  }
  if (isPermanentDisableValue(rawValue)) {
    return translate("provider.permanent");
  }
  const date = new Date(Number(rawValue) * 1000);
  if (Number.isNaN(date.getTime())) {
    return translate("provider.invalidDisabledUntil");
  }
  return date.toLocaleString(language === "en" ? "en-US" : "zh-CN", { hour12: false });
}

export function getEntryAttr(entry, attrName) {
  if (!entry || !entry.attrs || typeof entry.attrs !== "object") {
    return "";
  }
  const value = entry.attrs[attrName];
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function isPanelRequestLog(entry) {
  if (!entry || entry.msg !== "http_request") {
    return false;
  }
  const path = getEntryAttr(entry, "path");
  if (path === "/favicon.ico" || path === "/favicon.svg" || path === "/api/health") {
    return true;
  }
  return path.indexOf("/api/admin") === 0 || path.indexOf("/api/status") === 0;
}

export function formatLogSummary(entry) {
  if (!entry || !entry.attrs || typeof entry.attrs !== "object") {
    return "";
  }
  const entries = Object.entries(entry.attrs);
  if (entries.length === 0) {
    return "";
  }
  return entries
    .map(function formatPair(pair) {
      return pair[0] + "=" + String(pair[1]);
    })
    .join(" · ");
}

export function formatLogTime(rawTime, language) {
  const date = new Date(String(rawTime || ""));
  if (Number.isNaN(date.getTime())) {
    return String(rawTime || "");
  }
  return date.toLocaleString(language === "en" ? "en-US" : "zh-CN", { hour12: false });
}

export function InlineMessage(props) {
  if (!props.text) {
    return null;
  }
  return html`<p class=${"inline-message " + (props.kind || "")}>${props.text}</p>`;
}

export function MetricCard(props) {
  return html`
    <article class="metric-card">
      <span class="metric-label">${props.label}</span>
      <strong class="metric-value">${props.value}</strong>
      <span class="metric-note">${props.note}</span>
    </article>
  `;
}

export function StatusProviderCard(props) {
  const snapshot = props.snapshot || {};
  const successCount = Number(snapshot.success_count || 0);
  const errorCount = Number(snapshot.error_count || 0);
  return html`
    <article class="panel provider-status-card">
      <div class="provider-status-header">
        <div>
          <h3>${props.name}</h3>
          <p>${props.translate("provider.availableKeys", { available: Number(snapshot.available_keys || 0), total: Number(snapshot.total_keys || 0) })}</p>
        </div>
        <span class="status-pill ${normalizeHealthStatus(props.health)}">${normalizeHealthStatus(props.health)}</span>
      </div>
      <div class="status-grid">
        <div class="status-stat">
          <span>${props.translate("status.successRate")}</span>
          <strong>${formatPercent(successCount, errorCount)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.errorRate")}</span>
          <strong>${formatErrorRate(successCount, errorCount)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.inputTokens")}</span>
          <strong>${formatNumber(snapshot.input_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.outputTokens")}</span>
          <strong>${formatNumber(snapshot.output_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.cacheTokens")}</span>
          <strong>${formatNumber(snapshot.cache_tokens)}</strong>
        </div>
        <div class="status-stat">
          <span>${props.translate("status.cacheHits")}</span>
          <strong>${formatNumber(snapshot.cache_hits)}</strong>
        </div>
      </div>
    </article>
  `;
}
