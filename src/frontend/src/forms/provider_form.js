import * as v from "valibot";

import { normalizeErrorMessage } from "../api.js";
import { toInteger } from "../api.js";

export const providerTypeValues = ["openai_chat", "openai_responses", "claude", "gemini"];
export const keyStrategyValues = ["round_robin", "fill"];

const providerPayloadSchema = v.object({
  base_url: v.pipe(v.string(), v.trim(), v.minLength(1)),
  cache_enabled: v.boolean(),
  cache_max_entries: v.pipe(v.number(), v.integer(), v.minValue(1)),
  fail_threshold: v.pipe(v.number(), v.integer(), v.minValue(1)),
  key_strategy: v.picklist(keyStrategyValues),
  keys: v.optional(v.array(v.pipe(v.string(), v.trim(), v.minLength(1)))),
  max_disable_secs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  min_disable_secs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  type: v.picklist(providerTypeValues)
});

const knownLocalHostNames = new Set(["localhost", "ip6-localhost"]);

function normalizeHostnameFromInput(rawValue) {
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return "";
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue) ? trimmedValue : `http://${trimmedValue}`;
  try {
    return new URL(withScheme).hostname.toLowerCase();
  } catch (_error) {
    return "";
  }
}

function isIPv4InRange(hostname, firstOctet, secondOctetMin, secondOctetMax) {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map(function toOctet(value) {
    return Number(value);
  });
  if (octets.some(function hasInvalidOctet(value) {
    return !Number.isInteger(value) || value < 0 || value > 255;
  })) {
    return false;
  }
  if (octets[0] !== firstOctet) {
    return false;
  }
  return octets[1] >= secondOctetMin && octets[1] <= secondOctetMax;
}

export function isPrivateOrLoopbackBaseURL(rawValue) {
  const hostname = normalizeHostnameFromInput(rawValue);
  if (!hostname) {
    return false;
  }
  if (knownLocalHostNames.has(hostname) || hostname === "::1" || hostname === "[::1]") {
    return true;
  }
  if (hostname.startsWith("127.")) {
    return true;
  }
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) {
    return true;
  }
  if (isIPv4InRange(hostname, 172, 16, 31)) {
    return true;
  }
  return false;
}

export function normalizeProviderBaseURLInput(rawValue) {
  const trimmedValue = String(rawValue || "").trim();
  if (!trimmedValue) {
    return "";
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }
  if (isPrivateOrLoopbackBaseURL(trimmedValue)) {
    return `http://${trimmedValue}`;
  }
  return trimmedValue;
}

export function normalizeProviderSaveErrorMessage(error, fallbackText, providerDraft, translate) {
  const normalizedMessage = normalizeErrorMessage(error, fallbackText);
  if (normalizedMessage !== "提供商配置无效") {
    return normalizedMessage;
  }
  if (!isPrivateOrLoopbackBaseURL(providerDraft?.base_url || "")) {
    return normalizedMessage;
  }
  return translate("provider.privateUpstreamBlocked");
}

export function createDefaultProviderDraft() {
  return {
    name: "",
    type: "openai_chat",
    base_url: "",
    cache_enabled: false,
    cache_max_entries: 1000,
    key_strategy: "round_robin",
    fail_threshold: 3,
    min_disable_secs: 30,
    max_disable_secs: 43200
  };
}

export function createProviderDraftFromSnapshot(providerSnapshot) {
  if (!providerSnapshot) {
    return null;
  }
  return {
    name: providerSnapshot.name || "",
    type: providerSnapshot.type || "openai_chat",
    base_url: providerSnapshot.base_url || "",
    cache_enabled: Boolean(providerSnapshot.cache_enabled),
    cache_max_entries: toInteger(providerSnapshot.cache_max_entries, 1000),
    key_strategy: providerSnapshot.key_strategy || "round_robin",
    fail_threshold: toInteger(providerSnapshot.fail_threshold, 3),
    min_disable_secs: toInteger(providerSnapshot.min_disable_secs, 30),
    max_disable_secs: toInteger(providerSnapshot.max_disable_secs, 43200)
  };
}

export function buildProviderPayload(providerDraft) {
  const nextDraft = providerDraft || createDefaultProviderDraft();
  const minDisableSecs = Math.max(1, toInteger(nextDraft.min_disable_secs, 30));
  const maxDisableSecs = Math.max(minDisableSecs, toInteger(nextDraft.max_disable_secs, 43200));
  const normalizedKeys = Array.isArray(nextDraft.keys)
    ? nextDraft.keys.map(function trimKey(keyValue) {
      return String(keyValue || "").trim();
    })
    : undefined;
  return v.parse(providerPayloadSchema, {
    base_url: normalizeProviderBaseURLInput(nextDraft.base_url),
    cache_enabled: Boolean(nextDraft.cache_enabled),
    cache_max_entries: Math.max(1, toInteger(nextDraft.cache_max_entries, 1000)),
    fail_threshold: Math.max(1, toInteger(nextDraft.fail_threshold, 3)),
    key_strategy: nextDraft.key_strategy || "round_robin",
    keys: normalizedKeys,
    max_disable_secs: maxDisableSecs,
    min_disable_secs: minDisableSecs,
    name: String(nextDraft.name || "").trim(),
    type: nextDraft.type || "openai_chat"
  });
}
