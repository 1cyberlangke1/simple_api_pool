import { permanentDisabledUntilThreshold } from "@/lib/admin";

export function formatNumber(value: unknown) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

export function formatPercent(successCount: unknown, errorCount: unknown) {
  const success = Number(successCount || 0);
  const error = Number(errorCount || 0);
  const total = success + error;
  if (total <= 0) {
    return "0%";
  }
  return ((success / total) * 100).toFixed(1) + "%";
}

export function formatErrorRate(successCount: unknown, errorCount: unknown) {
  const success = Number(successCount || 0);
  const error = Number(errorCount || 0);
  const total = success + error;
  if (total <= 0) {
    return "0%";
  }
  return ((error / total) * 100).toFixed(1) + "%";
}

export function formatLocaleTime(rawValue: number, language: "en" | "zh") {
  if (!rawValue) {
    return "";
  }
  return new Date(rawValue).toLocaleTimeString(language === "en" ? "en-US" : "zh-CN", {
    hour12: false
  });
}

export function formatDateTime(rawValue: number | string, language: "en" | "zh") {
  const date = typeof rawValue === "number" ? new Date(rawValue) : new Date(String(rawValue || ""));
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(language === "en" ? "en-US" : "zh-CN", {
    hour12: false
  });
}

export function isPermanentDisableValue(rawValue: unknown) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return false;
  }
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return false;
  }
  return numericValue >= permanentDisabledUntilThreshold;
}

export function formatDisabledUntil(
  rawValue: unknown,
  language: "en" | "zh",
  translate: (key: string, params?: Record<string, unknown>) => string,
  nowMs = Date.now()
) {
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
  if (date.getTime() <= nowMs) {
    return translate("provider.notDisabled");
  }
  return date.toLocaleString(language === "en" ? "en-US" : "zh-CN", { hour12: false });
}

export function formatLogSummary(entry: { attrs?: Record<string, unknown> } | null | undefined) {
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
