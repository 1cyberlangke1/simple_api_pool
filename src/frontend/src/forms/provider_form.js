import * as v from "valibot";

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
    base_url: String(nextDraft.base_url || "").trim(),
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
