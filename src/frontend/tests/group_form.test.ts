import { describe, expect, it } from "vitest";

import {
  buildGroupPayload,
  createDefaultGroupDraft,
  createGroupDraftFromSnapshot,
  moveGroupEntry,
  shouldShowPriorityField,
  shouldShowWeightField
} from "@/forms/group_form.js";
import { filterGroupsBySearch, getGroupByName } from "@/lib/admin";

describe("group form helpers", function () {
  it("会创建带默认集合策略的分组草稿", function () {
    const draft = createDefaultGroupDraft();

    expect(draft.type).toBe("openai_chat");
    expect(draft.cache_enabled).toBe(false);
    expect(draft.collections).toEqual([]);
  });

  it("会把分组快照转换为可编辑草稿", function () {
    const draft = createGroupDraftFromSnapshot({
      cache_enabled: true,
      cache_max_entries: 120,
      collections: [{
        entries: [{
          model: "gpt-4.1-mini",
          priority: 2,
          provider: "openai-b",
          weight: 1
        }, {
          model: "gpt-4.1",
          priority: 1,
          provider: "openai-a",
          weight: 3
        }],
        name: "chat-router",
        strategy: "failover"
      }],
      name: "router",
      type: "openai_chat"
    });

    expect(draft?.name).toBe("router");
    expect(draft?.collections[0].strategy).toBe("failover");
    expect(draft?.collections[0].entries[0].provider).toBe("openai-a");
    expect(draft?.collections[0].entries[1].provider).toBe("openai-b");
  });

  it("会把条目权重和优先级规整到合法整数", function () {
    const payload = buildGroupPayload({
      cache_enabled: true,
      cache_max_entries: 0,
      collections: [{
        entries: [{
          model: "gpt-4.1",
          priority: 0,
          provider: "openai-a",
          weight: 0
        }],
        name: "chat-router",
        strategy: "weighted_random"
      }],
      name: "router",
      type: "openai_chat"
    });

    expect(payload.cache_max_entries).toBe(1);
    expect(payload.collections[0].entries[0].weight).toBe(1);
    expect(payload.collections[0].entries[0].priority).toBe(1);
    expect("base_url" in payload.collections[0].entries[0]).toBe(false);
  });

  it("故障转移策略会按面板顺序重写优先级", function () {
    const payload = buildGroupPayload({
      cache_enabled: true,
      cache_max_entries: 10,
      collections: [{
        entries: [{
          model: "model-b",
          priority: 99,
          provider: "openai-b",
          weight: 1
        }, {
          model: "model-a",
          priority: 3,
          provider: "openai-a",
          weight: 2
        }],
        name: "chat-router",
        strategy: "failover"
      }],
      name: "router",
      type: "openai_chat"
    });

    expect(payload.collections[0].entries[0].priority).toBe(1);
    expect(payload.collections[0].entries[1].priority).toBe(2);
  });

  it("会按策略决定显示权重还是优先级字段", function () {
    expect(shouldShowWeightField("weighted_random")).toBe(true);
    expect(shouldShowWeightField("failover")).toBe(false);
    expect(shouldShowPriorityField("weighted_random")).toBe(false);
    expect(shouldShowPriorityField("failover")).toBe(true);
  });

  it("故障转移条目支持按上下顺序重排，并同步优先级", function () {
    const movedUp = moveGroupEntry([
      { model: "model-a", priority: 1, provider: "openai-a", weight: 1 },
      { model: "model-b", priority: 2, provider: "openai-b", weight: 1 },
      { model: "model-c", priority: 3, provider: "openai-c", weight: 1 }
    ], 2, "up");

    expect(movedUp.map(function mapEntry(entry) {
      return entry.provider;
    })).toEqual(["openai-a", "openai-c", "openai-b"]);
    expect(movedUp.map(function mapPriority(entry) {
      return entry.priority;
    })).toEqual([1, 2, 3]);
  });
});

describe("group admin helpers", function () {
  const groups = [{
    cache_enabled: true,
    cache_max_entries: 100,
    collections: [],
    name: "router-alpha",
    type: "openai_chat"
  }, {
    cache_enabled: false,
    cache_max_entries: 50,
    collections: [],
    name: "gemini-router",
    type: "gemini"
  }];

  it("会按名称查找分组", function () {
    expect(getGroupByName(groups, "gemini-router")?.type).toBe("gemini");
    expect(getGroupByName(groups, "missing")).toBeNull();
  });

  it("会按搜索词筛选分组", function () {
    expect(filterGroupsBySearch(groups, "router")).toHaveLength(2);
    expect(filterGroupsBySearch(groups, "gemini")).toEqual([groups[1]]);
  });
});
