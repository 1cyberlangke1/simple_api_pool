import * as v from "valibot";

import { toInteger } from "../api.js";

export const groupTypeValues = ["openai_chat", "openai_responses", "claude", "gemini"];
export const groupStrategyValues = ["weighted_random", "failover"];

const groupEntrySchema = v.object({
  base_url: v.pipe(v.string(), v.trim(), v.minLength(1)),
  model: v.pipe(v.string(), v.trim(), v.minLength(1)),
  priority: v.pipe(v.number(), v.integer(), v.minValue(1)),
  provider: v.pipe(v.string(), v.trim(), v.minLength(1)),
  weight: v.pipe(v.number(), v.integer(), v.minValue(1))
});

const groupCollectionSchema = v.object({
  entries: v.pipe(v.array(groupEntrySchema), v.minLength(1)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  strategy: v.picklist(groupStrategyValues)
});

const groupPayloadSchema = v.object({
  cache_enabled: v.boolean(),
  cache_max_entries: v.pipe(v.number(), v.integer(), v.minValue(1)),
  collections: v.array(groupCollectionSchema),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  type: v.picklist(groupTypeValues)
});

export function createDefaultGroupDraft() {
  return {
    name: "",
    type: "openai_chat",
    cache_enabled: false,
    cache_max_entries: 1000,
    collections: []
  };
}

export function createDefaultGroupCollectionDraft() {
  return {
    name: "",
    strategy: "weighted_random",
    entries: []
  };
}

export function createDefaultGroupEntryDraft() {
  return {
    provider: "",
    model: "",
    base_url: "",
    weight: 1,
    priority: 1
  };
}

export function createGroupDraftFromSnapshot(groupSnapshot) {
  if (!groupSnapshot) {
    return null;
  }
  return {
    name: groupSnapshot.name || "",
    type: groupSnapshot.type || "openai_chat",
    cache_enabled: Boolean(groupSnapshot.cache_enabled),
    cache_max_entries: toInteger(groupSnapshot.cache_max_entries, 1000),
    collections: Array.isArray(groupSnapshot.collections)
      ? groupSnapshot.collections.map(function mapCollection(collectionSnapshot) {
        return {
          name: collectionSnapshot.name || "",
          strategy: collectionSnapshot.strategy || "weighted_random",
          entries: Array.isArray(collectionSnapshot.entries)
            ? collectionSnapshot.entries.map(function mapEntry(entrySnapshot) {
              return {
                provider: entrySnapshot.provider || "",
                model: entrySnapshot.model || "",
                base_url: entrySnapshot.base_url || "",
                weight: Math.max(1, toInteger(entrySnapshot.weight, 1)),
                priority: Math.max(1, toInteger(entrySnapshot.priority, 1))
              };
            })
            : []
        };
      })
      : []
  };
}

export function buildGroupPayload(groupDraft) {
  const nextDraft = groupDraft || createDefaultGroupDraft();
  return v.parse(groupPayloadSchema, {
    cache_enabled: Boolean(nextDraft.cache_enabled),
    cache_max_entries: Math.max(1, toInteger(nextDraft.cache_max_entries, 1000)),
    collections: Array.isArray(nextDraft.collections)
      ? nextDraft.collections.map(function mapCollection(collectionDraft) {
        return {
          name: String(collectionDraft?.name || "").trim(),
          strategy: collectionDraft?.strategy || "weighted_random",
          entries: Array.isArray(collectionDraft?.entries)
            ? collectionDraft.entries.map(function mapEntry(entryDraft, entryIndex) {
              return {
                provider: String(entryDraft?.provider || "").trim(),
                model: String(entryDraft?.model || "").trim(),
                base_url: String(entryDraft?.base_url || "").trim(),
                weight: Math.max(1, toInteger(entryDraft?.weight, 1)),
                priority: Math.max(1, toInteger(entryDraft?.priority, entryIndex + 1))
              };
            })
            : []
        };
      })
      : [],
    name: String(nextDraft.name || "").trim(),
    type: nextDraft.type || "openai_chat"
  });
}
