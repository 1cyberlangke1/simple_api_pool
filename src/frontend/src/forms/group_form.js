import * as v from "valibot";

import { toInteger } from "../api.js";

export const groupTypeValues = ["openai_chat", "openai_responses", "claude", "gemini"];
export const groupStrategyValues = ["weighted_random", "failover"];

const groupEntrySchema = v.object({
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
    weight: 1,
    priority: 1
  };
}

export function shouldShowWeightField(strategy) {
  return String(strategy || "weighted_random") === "weighted_random";
}

export function shouldShowPriorityField(strategy) {
  return String(strategy || "") === "failover";
}

function normalizeEntryDraft(entrySnapshot, fallbackPriority) {
  return {
    provider: entrySnapshot.provider || "",
    model: entrySnapshot.model || "",
    weight: Math.max(1, toInteger(entrySnapshot.weight, 1)),
    priority: Math.max(1, toInteger(entrySnapshot.priority, fallbackPriority))
  };
}

function normalizeEntriesForStrategy(entries, strategy) {
  const nextEntries = Array.isArray(entries) ? entries.slice() : [];
  if (shouldShowPriorityField(strategy)) {
    return nextEntries.map(function normalizeEntry(entryDraft, entryIndex) {
      return {
        ...normalizeEntryDraft(entryDraft || {}, entryIndex + 1),
        priority: entryIndex + 1
      };
    });
  }
  return nextEntries.map(function normalizeEntry(entryDraft, entryIndex) {
    return normalizeEntryDraft(entryDraft || {}, entryIndex + 1);
  });
}

export function moveGroupEntry(entries, entryIndex, direction) {
  const nextEntries = Array.isArray(entries) ? entries.slice() : [];
  if (entryIndex < 0 || entryIndex >= nextEntries.length) {
    return normalizeEntriesForStrategy(nextEntries, "failover");
  }

  const targetIndex = direction === "up" ? entryIndex - 1 : direction === "down" ? entryIndex + 1 : entryIndex;
  if (targetIndex < 0 || targetIndex >= nextEntries.length || targetIndex === entryIndex) {
    return normalizeEntriesForStrategy(nextEntries, "failover");
  }

  const movedEntry = nextEntries[entryIndex];
  nextEntries[entryIndex] = nextEntries[targetIndex];
  nextEntries[targetIndex] = movedEntry;
  return normalizeEntriesForStrategy(nextEntries, "failover");
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
        const strategy = collectionSnapshot.strategy || "weighted_random";
        const rawEntries = Array.isArray(collectionSnapshot.entries)
          ? collectionSnapshot.entries.map(function mapEntry(entrySnapshot, entryIndex) {
            return normalizeEntryDraft(entrySnapshot || {}, entryIndex + 1);
          })
          : [];
        const entries = shouldShowPriorityField(strategy)
          ? rawEntries
            .slice()
            .sort(function compareEntries(leftEntry, rightEntry) {
              if (leftEntry.priority !== rightEntry.priority) {
                return leftEntry.priority - rightEntry.priority;
              }
              return String(leftEntry.provider || "").localeCompare(String(rightEntry.provider || ""), "en");
            })
          : rawEntries;
        return {
          name: collectionSnapshot.name || "",
          strategy,
          entries: normalizeEntriesForStrategy(entries, strategy)
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
        const strategy = collectionDraft?.strategy || "weighted_random";
        const entries = Array.isArray(collectionDraft?.entries)
          ? collectionDraft.entries.map(function mapEntry(entryDraft, entryIndex) {
            return normalizeEntryDraft(entryDraft || {}, entryIndex + 1);
          })
          : [];
        return {
          name: String(collectionDraft?.name || "").trim(),
          strategy,
          entries: normalizeEntriesForStrategy(entries, strategy).map(function mapEntry(entryDraft) {
            return {
              provider: String(entryDraft.provider || "").trim(),
              model: String(entryDraft.model || "").trim(),
              weight: entryDraft.weight,
              priority: entryDraft.priority
            };
          })
        };
      })
      : [],
    name: String(nextDraft.name || "").trim(),
    type: nextDraft.type || "openai_chat"
  });
}
