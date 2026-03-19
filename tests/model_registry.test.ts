import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ModelRegistry } from "../src/core/model_registry.js";
import type { ProviderConfig, ModelConfig, GroupConfig, GroupRouteConfig } from "../src/core/types.js";

/**
 * ModelRegistry 单元测试
 * @description 测试模型注册表的功能
 */
describe("ModelRegistry", () => {
  let registry: ModelRegistry;

  const providers: ProviderConfig[] = [
    { name: "openai", baseUrl: "https://api.openai.com/v1", strategy: "round_robin" },
    { name: "anthropic", baseUrl: "https://api.anthropic.com/v1", strategy: "round_robin" },
  ];

  const models: ModelConfig[] = [
    { name: "gpt-4o", provider: "openai", model: "gpt-4o", supportsTools: true },
    { name: "gpt-4o-mini", provider: "openai", model: "gpt-4o-mini", supportsTools: true },
    { name: "claude-3-opus", provider: "anthropic", model: "claude-3-opus-20240229", supportsTools: true },
  ];

  const groups: GroupConfig[] = [
    {
      name: "default",
      strategy: "round_robin",
      routes: [
        { modelId: "openai/gpt-4o", temperature: 0.7 },
        { modelId: "openai/gpt-4o-mini", temperature: 0.7 },
      ],
    },
    {
      name: "random-group",
      strategy: "random",
      routes: [{ modelId: "anthropic/claude-3-opus" }],
    },
  ];

  beforeEach(() => {
    registry = new ModelRegistry(providers, models, groups);
  });

  it("lists all model IDs including groups", () => {
    const ids = registry.listAllModelIds();
    expect(ids).toContain("openai/gpt-4o");
    expect(ids).toContain("openai/gpt-4o-mini");
    expect(ids).toContain("anthropic/claude-3-opus");
    expect(ids).toContain("group/default");
    expect(ids).toContain("group/random-group");
    // 现在包含 -cache 变体
    expect(ids).toContain("group/default-cache");
    expect(ids).toContain("group/random-group-cache");
    expect(ids.length).toBe(7);
  });

  it("returns correct model config", () => {
    const model = registry.getModel("openai/gpt-4o");
    expect(model).toBeDefined();
    expect(model?.name).toBe("gpt-4o");
    expect(model?.provider).toBe("openai");
  });

  it("returns null for non-existent model", () => {
    const model = registry.getModel("nonexistent/model");
    expect(model).toBeNull();
  });

  it("returns correct provider config", () => {
    const provider = registry.getProvider("openai");
    expect(provider).toBeDefined();
    expect(provider?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("identifies group models correctly", () => {
    expect(registry.isGroup("group/default")).toBe(true);
    expect(registry.isGroup("openai/gpt-4o")).toBe(false);
  });

  it("picks group route with round_robin strategy", () => {
    const route1 = registry.pickGroupRoute("group/default");
    const route2 = registry.pickGroupRoute("group/default");

    // round_robin should cycle through routes
    expect(route1?.modelId).toBe("openai/gpt-4o");
    expect(route2?.modelId).toBe("openai/gpt-4o-mini");
  });

  it("picks group route with random strategy", () => {
    // For single route, should always return it
    const route = registry.pickGroupRoute("group/random-group");
    expect(route?.modelId).toBe("anthropic/claude-3-opus");
  });

  it("returns null for non-existent group route", () => {
    const route = registry.pickGroupRoute("group/nonexistent");
    expect(route).toBeNull();
  });

  // ============================================================
  // -cache 后缀支持
  // ============================================================

  it("identifies group with -cache suffix", () => {
    expect(registry.isGroup("group/default-cache")).toBe(true);
    expect(registry.isGroup("group/random-group-cache")).toBe(true);
    expect(registry.isGroup("group/nonexistent-cache")).toBe(false);
  });

  it("gets group config with -cache suffix", () => {
    const group = registry.getGroup("group/default-cache");
    expect(group).toBeDefined();
    expect(group?.name).toBe("default");
  });

  it("picks route from group with -cache suffix", () => {
    const route = registry.pickGroupRoute("group/default-cache");
    expect(route).toBeDefined();
    expect(["openai/gpt-4o", "openai/gpt-4o-mini"]).toContain(route?.modelId);
  });

  it("lists -cache variants when requested", () => {
    const idsWithCache = registry.listAllModelIds(true);
    const idsWithoutCache = registry.listAllModelIds(false);

    expect(idsWithCache).toContain("group/default-cache");
    expect(idsWithCache).toContain("group/random-group-cache");
    expect(idsWithoutCache).not.toContain("group/default-cache");
  });

  // ============================================================
  // weighted 策略
  // ============================================================

  it("selects route based on weights with weighted strategy", () => {
    const weightedGroups: GroupConfig[] = [
      {
        name: "weighted",
        strategy: "weighted",
        routes: [
          { modelId: "test/light", weight: 1 },
          { modelId: "test/heavy", weight: 100 },
        ],
      },
    ];

    const weightedRegistry = new ModelRegistry(
      [{ name: "test", baseUrl: "https://api.test.com" }],
      [
        { name: "light", provider: "test", model: "light" },
        { name: "heavy", provider: "test", model: "heavy" },
      ],
      weightedGroups
    );

    // 运行多次，heavy 应该被选中更多次
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const route = weightedRegistry.pickGroupRoute("group/weighted");
      if (route) {
        counts[route.modelId] = (counts[route.modelId] || 0) + 1;
      }
    }

    // heavy 权重更高，应该被选中更多次
    expect(counts["test/heavy"]).toBeGreaterThan(counts["test/light"] ?? 0);
  });

  it("uses default weight of 1 when not specified", () => {
    const noWeightGroups: GroupConfig[] = [
      {
        name: "no-weight",
        strategy: "weighted",
        routes: [{ modelId: "test/a" }, { modelId: "test/b" }],
      },
    ];

    const noWeightRegistry = new ModelRegistry(
      [{ name: "test", baseUrl: "https://api.test.com" }],
      [
        { name: "a", provider: "test", model: "a" },
        { name: "b", provider: "test", model: "b" },
      ],
      noWeightGroups
    );

    // 没有权重时应该均匀分布
    const counts: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const route = noWeightRegistry.pickGroupRoute("group/no-weight");
      if (route) {
        counts[route.modelId] = (counts[route.modelId] || 0) + 1;
      }
    }

    // 两个都应该被选中一些次数
    expect(counts["test/a"]).toBeGreaterThan(0);
    expect(counts["test/b"]).toBeGreaterThan(0);
  });

  it("handles zero weights in weighted strategy", () => {
    const zeroWeightGroups: GroupConfig[] = [
      {
        name: "zero",
        strategy: "weighted",
        routes: [
          { modelId: "test/a", weight: 0 },
          { modelId: "test/b", weight: 0 },
        ],
      },
    ];

    const zeroWeightRegistry = new ModelRegistry(
      [{ name: "test", baseUrl: "https://api.test.com" }],
      [
        { name: "a", provider: "test", model: "a" },
        { name: "b", provider: "test", model: "b" },
      ],
      zeroWeightGroups
    );

    // 所有权重为 0 时应该使用默认权重
    const route = zeroWeightRegistry.pickGroupRoute("group/zero");
    expect(route).toBeDefined();
  });

  it("handles negative weights in weighted strategy", () => {
    const negativeWeightGroups: GroupConfig[] = [
      {
        name: "negative",
        strategy: "weighted",
        routes: [
          { modelId: "test/a", weight: -10 },
          { modelId: "test/b", weight: 10 },
        ],
      },
    ];

    const negativeWeightRegistry = new ModelRegistry(
      [{ name: "test", baseUrl: "https://api.test.com" }],
      [
        { name: "a", provider: "test", model: "a" },
        { name: "b", provider: "test", model: "b" },
      ],
      negativeWeightGroups
    );

    // 负权重应该被当作 0 处理
    const route = negativeWeightRegistry.pickGroupRoute("group/negative");
    expect(route?.modelId).toBe("test/b");
  });

  // ============================================================
  // 路由状态管理
  // ============================================================

  it("resets route state for specific group", () => {
    const route1 = registry.pickGroupRoute("group/default");
    const route2 = registry.pickGroupRoute("group/default");
    expect(route1?.modelId).not.toBe(route2?.modelId);

    registry.resetRouteState("group/default");

    const route3 = registry.pickGroupRoute("group/default");
    expect(route3?.modelId).toBe("openai/gpt-4o");
  });

  it("resets all route state", () => {
    registry.pickGroupRoute("group/default");
    registry.pickGroupRoute("group/default");

    registry.resetRouteState();

    const route = registry.pickGroupRoute("group/default");
    expect(route?.modelId).toBe("openai/gpt-4o");
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("ModelRegistry - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  describe("empty inputs", () => {
    it("should handle empty providers array", () => {
      const registry = new ModelRegistry([], [], []);
      expect(registry.listAllModelIds()).toEqual([]);
      expect(registry.getProvider("any")).toBeNull();
    });

    it("should handle empty models array", () => {
      const registry = new ModelRegistry([{ name: "test", baseUrl: "https://api.test.com" }], [], []);
      expect(registry.listAllModelIds()).toEqual([]);
      expect(registry.getModel("test/model")).toBeNull();
    });

    it("should handle empty groups array", () => {
      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        [{ name: "model", provider: "test", model: "model" }],
        []
      );
      expect(registry.isGroup("group/any")).toBe(false);
      expect(registry.pickGroupRoute("group/any")).toBeNull();
    });
  });

  describe("model and provider name edge cases", () => {
    it("should handle provider names with special characters", () => {
      const specialProviders: ProviderConfig[] = [
        { name: "provider-with-dash", baseUrl: "https://api.test.com" },
        { name: "provider_with_underscore", baseUrl: "https://api.test.com" },
        { name: "provider.with.dots", baseUrl: "https://api.test.com" },
        { name: "测试提供商", baseUrl: "https://api.test.com" },
        { name: "日本語プロバイダー", baseUrl: "https://api.test.com" },
      ];

      const specialModels: ModelConfig[] = specialProviders.map((p) => ({
        name: "model",
        provider: p.name,
        model: "model",
      }));

      const registry = new ModelRegistry(specialProviders, specialModels, []);

      expect(registry.getProvider("provider-with-dash")).toBeDefined();
      expect(registry.getProvider("测试提供商")).toBeDefined();
      expect(registry.getModel("provider.with.dots/model")).toBeDefined();
    });

    it("should handle model names with special characters", () => {
      const specialModels: ModelConfig[] = [
        { name: "model-with-dash", provider: "test", model: "model-with-dash" },
        { name: "model/with/slash", provider: "test", model: "model/with/slash" },
        { name: "模型名称", provider: "test", model: "模型名称" },
        { name: "gpt-4-0125-preview", provider: "test", model: "gpt-4-0125-preview" },
        { name: "claude-3-opus-20240229", provider: "test", model: "claude-3-opus-20240229" },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        specialModels,
        []
      );

      expect(registry.getModel("test/model-with-dash")).toBeDefined();
      expect(registry.getModel("test/model/with/slash")).toBeDefined();
      expect(registry.getModel("test/模型名称")).toBeDefined();
    });

    it("should handle duplicate provider names (last wins)", () => {
      const duplicateProviders: ProviderConfig[] = [
        { name: "dup", baseUrl: "https://first.com" },
        { name: "dup", baseUrl: "https://second.com" },
      ];

      const registry = new ModelRegistry(duplicateProviders, [], []);
      const provider = registry.getProvider("dup");

      // 最后一个应该覆盖
      expect(provider?.baseUrl).toBe("https://second.com");
    });

    it("should handle duplicate model IDs (last wins)", () => {
      const duplicateModels: ModelConfig[] = [
        { name: "same", provider: "test", model: "model-a" },
        { name: "same", provider: "test", model: "model-b" },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        duplicateModels,
        []
      );

      const model = registry.getModel("test/same");
      expect(model?.model).toBe("model-b");
    });
  });

  describe("group edge cases", () => {
    it("should handle group with single route", () => {
      const singleRouteGroups: GroupConfig[] = [
        {
          name: "single",
          strategy: "round_robin",
          routes: [{ modelId: "test/model" }],
        },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        [{ name: "model", provider: "test", model: "model" }],
        singleRouteGroups
      );

      // 多次调用应该返回同一个路由
      const route1 = registry.pickGroupRoute("group/single");
      const route2 = registry.pickGroupRoute("group/single");
      const route3 = registry.pickGroupRoute("group/single");

      expect(route1?.modelId).toBe("test/model");
      expect(route2?.modelId).toBe("test/model");
      expect(route3?.modelId).toBe("test/model");
    });

    it("should handle group with many routes", () => {
      const manyRoutes: GroupRouteConfig[] = Array.from({ length: 100 }, (_, i) => ({
        modelId: `test/model-${i}`,
      }));

      const manyGroups: GroupConfig[] = [
        {
          name: "many",
          strategy: "round_robin",
          routes: manyRoutes,
        },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        manyRoutes.map((r) => ({
          name: r.modelId.split("/")[1],
          provider: "test",
          model: r.modelId.split("/")[1],
        })),
        manyGroups
      );

      // 循环遍历所有路由
      for (let i = 0; i < 100; i++) {
        const route = registry.pickGroupRoute("group/many");
        expect(route?.modelId).toBe(`test/model-${i}`);
      }

      // 循环回第一个
      const route101 = registry.pickGroupRoute("group/many");
      expect(route101?.modelId).toBe("test/model-0");
    });

    it("should handle group with empty routes array", () => {
      const emptyRoutesGroups: GroupConfig[] = [
        {
          name: "empty",
          strategy: "round_robin",
          routes: [],
        },
      ];

      const registry = new ModelRegistry([], [], emptyRoutesGroups);

      expect(registry.pickGroupRoute("group/empty")).toBeNull();
    });

    it("should handle group with exhaust strategy", () => {
      const exhaustGroups: GroupConfig[] = [
        {
          name: "exhaust",
          strategy: "exhaust",
          routes: [
            { modelId: "test/model-a" },
            { modelId: "test/model-b" },
          ],
        },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        [
          { name: "model-a", provider: "test", model: "model-a" },
          { name: "model-b", provider: "test", model: "model-b" },
        ],
        exhaustGroups
      );

      // exhaust 策略应该持续返回第一个路由
      const route1 = registry.pickGroupRoute("group/exhaust");
      const route2 = registry.pickGroupRoute("group/exhaust");
      const route3 = registry.pickGroupRoute("group/exhaust");

      expect(route1?.modelId).toBe("test/model-a");
      expect(route2?.modelId).toBe("test/model-a");
      expect(route3?.modelId).toBe("test/model-a");
    });

    it("should handle group names with special characters", () => {
      const specialGroups: GroupConfig[] = [
        { name: "group-with-dash", strategy: "round_robin", routes: [{ modelId: "test/model" }] },
        { name: "group_with_underscore", strategy: "round_robin", routes: [{ modelId: "test/model" }] },
        { name: "分组名称", strategy: "round_robin", routes: [{ modelId: "test/model" }] },
        { name: "日本語グループ", strategy: "round_robin", routes: [{ modelId: "test/model" }] },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        [{ name: "model", provider: "test", model: "model" }],
        specialGroups
      );

      expect(registry.isGroup("group/group-with-dash")).toBe(true);
      expect(registry.isGroup("group/group_with_underscore")).toBe(true);
      expect(registry.isGroup("group/分组名称")).toBe(true);
      expect(registry.isGroup("group/日本語グループ")).toBe(true);

      expect(registry.pickGroupRoute("group/分组名称")?.modelId).toBe("test/model");
    });
  });

  describe("getGroup edge cases", () => {
    it("should return null for non-existent group", () => {
      const registry = new ModelRegistry([], [], []);
      expect(registry.getGroup("group/nonexistent")).toBeNull();
    });

    it("should return correct group config", () => {
      const groups: GroupConfig[] = [
        {
          name: "test-group",
          strategy: "random",
          routes: [{ modelId: "test/model", temperature: 0.8 }],
        },
      ];

      const registry = new ModelRegistry([], [], groups);
      const group = registry.getGroup("group/test-group");

      expect(group).toBeDefined();
      expect(group?.strategy).toBe("random");
      expect(group?.routes[0].temperature).toBe(0.8);
    });
  });

  describe("random strategy edge cases", () => {
    it("should always return valid route from random strategy", () => {
      const groups: GroupConfig[] = [
        {
          name: "random",
          strategy: "random",
          routes: [
            { modelId: "test/a" },
            { modelId: "test/b" },
            { modelId: "test/c" },
          ],
        },
      ];

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        [
          { name: "a", provider: "test", model: "a" },
          { name: "b", provider: "test", model: "b" },
          { name: "c", provider: "test", model: "c" },
        ],
        groups
      );

      // 多次调用应该返回有效路由
      const validIds = ["test/a", "test/b", "test/c"];
      for (let i = 0; i < 50; i++) {
        const route = registry.pickGroupRoute("group/random");
        expect(validIds).toContain(route?.modelId);
      }
    });
  });

  describe("model ID format edge cases", () => {
    it("should handle model ID with provider containing slash", () => {
      // 注意：这可能不是预期的行为，但测试实际行为
      const models: ModelConfig[] = [
        { name: "model", provider: "test/provider", model: "model" },
      ];

      const registry = new ModelRegistry(
        [{ name: "test/provider", baseUrl: "https://api.test.com" }],
        models,
        []
      );

      // model ID 会是 "test/provider/model"
      const model = registry.getModel("test/provider/model");
      expect(model).toBeDefined();
    });

    it("should handle model ID lookup with incorrect format", () => {
      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        [{ name: "model", provider: "test", model: "model" }],
        []
      );

      // 没有 provider 前缀
      expect(registry.getModel("model")).toBeNull();
      // 空字符串
      expect(registry.getModel("")).toBeNull();
      // 只有 provider
      expect(registry.getModel("test/")).toBeNull();
    });
  });

  describe("large registry", () => {
    it("should handle many providers", () => {
      const manyProviders: ProviderConfig[] = Array.from({ length: 1000 }, (_, i) => ({
        name: `provider-${i}`,
        baseUrl: `https://api.provider${i}.com`,
      }));

      const registry = new ModelRegistry(manyProviders, [], []);

      expect(registry.getProvider("provider-0")).toBeDefined();
      expect(registry.getProvider("provider-999")).toBeDefined();
      expect(registry.getProvider("provider-1000")).toBeNull();
    });

    it("should handle many models", () => {
      const manyModels: ModelConfig[] = Array.from({ length: 1000 }, (_, i) => ({
        name: `model-${i}`,
        provider: "test",
        model: `model-${i}`,
      }));

      const registry = new ModelRegistry(
        [{ name: "test", baseUrl: "https://api.test.com" }],
        manyModels,
        []
      );

      expect(registry.getModel("test/model-0")).toBeDefined();
      expect(registry.getModel("test/model-999")).toBeDefined();
      expect(registry.getModel("test/model-1000")).toBeNull();
      expect(registry.listAllModelIds().length).toBe(1000);
    });
  });
});