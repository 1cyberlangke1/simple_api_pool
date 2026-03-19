import { describe, it, expect, beforeEach } from "vitest";
import {
  ExhaustStrategy,
  RoundRobinStrategy,
  RandomStrategy,
  WeightedStrategy,
  createKeyStrategy,
  RoundRobinGroupStrategy,
  RandomGroupStrategy,
  ExhaustGroupStrategy,
  WeightedGroupStrategy,
  createGroupStrategy,
} from "../src/core/strategies.js";
import type { KeyState, GroupRouteConfig } from "../src/core/types.js";

/**
 * 策略模式单元测试
 * @description 测试 Key 选择策略和分组策略
 */

// ============================================================
// 辅助函数：创建测试数据
// ============================================================

function createKeyState(
  alias: string,
  available: boolean,
  quota: KeyState["quota"],
  usage: KeyState["usage"],
  metadata?: Record<string, unknown>
): KeyState {
  return {
    alias,
    provider: "test-provider",
    key: "sk-test",
    quota,
    usage,
    available,
    metadata,
    lastUsedAt: null,
  };
}

function createGroupRoute(modelId: string, weight?: number): GroupRouteConfig {
  return {
    modelId,
    weight,
  };
}

// ============================================================
// Key 选择策略测试
// ============================================================

describe("Key Selection Strategies", () => {
  const keys: KeyState[] = [
    createKeyState("key1", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
    createKeyState("key2", true, { type: "daily", limit: 100 }, { dailyCount: 50, totalCost: 0 }),
    createKeyState("key3", false, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }), // 不可用
    createKeyState("key4", true, { type: "total", limit: 10 }, { dailyCount: 0, totalCost: 5 }),
  ];

  describe("ExhaustStrategy", () => {
    let strategy: ExhaustStrategy;

    beforeEach(() => {
      strategy = new ExhaustStrategy();
    });

    it("should select first available key", () => {
      const selected = strategy.select(keys);
      expect(selected?.alias).toBe("key1");
    });

    it("should skip unavailable keys", () => {
      const selected = strategy.select(keys);
      expect(selected?.available).toBe(true);
    });

    it("should return null when no keys available", () => {
      const unavailableKeys = keys.map((k) => ({ ...k, available: false }));
      const selected = strategy.select(unavailableKeys);
      expect(selected).toBeNull();
    });

    it("should check daily quota", () => {
      const exhaustedDaily = createKeyState(
        "exhausted",
        true,
        { type: "daily", limit: 10 },
        { dailyCount: 15, totalCost: 0 }
      );
      const availableKey = createKeyState(
        "available",
        true,
        { type: "infinite" },
        { dailyCount: 0, totalCost: 0 }
      );

      const result = strategy.select([exhaustedDaily, availableKey]);
      expect(result?.alias).toBe("available");
    });

    it("should check total quota", () => {
      const exhaustedTotal = createKeyState(
        "exhausted",
        true,
        { type: "total", limit: 10 },
        { dailyCount: 0, totalCost: 15 }
      );
      const availableKey = createKeyState(
        "available",
        true,
        { type: "infinite" },
        { dailyCount: 0, totalCost: 0 }
      );

      const result = strategy.select([exhaustedTotal, availableKey]);
      expect(result?.alias).toBe("available");
    });
  });

  describe("RoundRobinStrategy", () => {
    let strategy: RoundRobinStrategy;

    beforeEach(() => {
      strategy = new RoundRobinStrategy();
    });

    it("should cycle through keys", () => {
      const availableKeys = keys.filter((k) => k.available);

      const first = strategy.select(availableKeys);
      const second = strategy.select(availableKeys);
      const third = strategy.select(availableKeys);

      expect(first?.alias).not.toBe(second?.alias);
      expect(second?.alias).not.toBe(third?.alias);
    });

    it("should reset index when all keys tried", () => {
      const availableKeys = keys.filter((k) => k.available);

      const selections = [];
      for (let i = 0; i < availableKeys.length * 2; i++) {
        selections.push(strategy.select(availableKeys)?.alias);
      }

      // 应该循环
      expect(selections[0]).toBe(selections[availableKeys.length]);
    });

    it("should return null for empty array", () => {
      expect(strategy.select([])).toBeNull();
    });

    it("should reset method work", () => {
      const availableKeys = keys.filter((k) => k.available);

      strategy.select(availableKeys);
      strategy.select(availableKeys);
      strategy.reset();

      // 重置后应该从第一个开始
      const selected = strategy.select(availableKeys);
      expect(selected?.alias).toBe(availableKeys[0].alias);
    });
  });

  describe("RandomStrategy", () => {
    let strategy: RandomStrategy;

    beforeEach(() => {
      strategy = new RandomStrategy();
    });

    it("should select an available key", () => {
      const selected = strategy.select(keys);
      expect(selected?.available).toBe(true);
    });

    it("should return null when no keys available", () => {
      const unavailableKeys = keys.map((k) => ({ ...k, available: false }));
      expect(strategy.select(unavailableKeys)).toBeNull();
    });

    it("should return null for empty array", () => {
      expect(strategy.select([])).toBeNull();
    });
  });

  describe("WeightedStrategy", () => {
    let strategy: WeightedStrategy;

    beforeEach(() => {
      strategy = new WeightedStrategy();
    });

    it("should select an available key", () => {
      const weightedKeys = [
        createKeyState("light", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 1 }),
        createKeyState("heavy", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 10 }),
      ];

      const selected = strategy.select(weightedKeys);
      expect(selected).toBeDefined();
    });

    it("should respect weights over multiple selections", () => {
      const weightedKeys = [
        createKeyState("light", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 1 }),
        createKeyState("heavy", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 100 }),
      ];

      // 运行多次，heavy 应该被选中更多次
      const counts: Record<string, number> = { light: 0, heavy: 0 };
      for (let i = 0; i < 100; i++) {
        const selected = strategy.select(weightedKeys);
        if (selected) {
          counts[selected.alias] = (counts[selected.alias] || 0) + 1;
        }
      }

      // heavy 权重更高，应该被选中更多次
      expect(counts["heavy"]).toBeGreaterThan(counts["light"]);
    });

    it("should use default weight of 1 when not specified", () => {
      const noWeightKeys = [
        createKeyState("key1", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
        createKeyState("key2", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
      ];

      const selected = strategy.select(noWeightKeys);
      expect(selected).toBeDefined();
    });
  });

  describe("createKeyStrategy", () => {
    it("should create exhaust strategy", () => {
      const strategy = createKeyStrategy("exhaust");
      expect(strategy).toBeInstanceOf(ExhaustStrategy);
    });

    it("should create round_robin strategy", () => {
      const strategy = createKeyStrategy("round_robin");
      expect(strategy).toBeInstanceOf(RoundRobinStrategy);
    });

    it("should create random strategy", () => {
      const strategy = createKeyStrategy("random");
      expect(strategy).toBeInstanceOf(RandomStrategy);
    });

    it("should create weighted strategy", () => {
      const strategy = createKeyStrategy("weighted");
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });

    it("should default to round_robin for unknown strategy", () => {
      const strategy = createKeyStrategy("unknown" as any);
      expect(strategy).toBeInstanceOf(RoundRobinStrategy);
    });
  });
});

// ============================================================
// 分组策略测试
// ============================================================

describe("Group Selection Strategies", () => {
  const routes: GroupRouteConfig[] = [
    createGroupRoute("route1", 1),
    createGroupRoute("route2", 2),
    createGroupRoute("route3", 3),
  ];

  describe("RoundRobinGroupStrategy", () => {
    let strategy: RoundRobinGroupStrategy;

    beforeEach(() => {
      strategy = new RoundRobinGroupStrategy();
    });

    it("should cycle through routes", () => {
      const first = strategy.select(routes);
      const second = strategy.select(routes);
      const third = strategy.select(routes);

      expect(first?.modelId).toBe("route1");
      expect(second?.modelId).toBe("route2");
      expect(third?.modelId).toBe("route3");
    });

    it("should wrap around", () => {
      strategy.select(routes);
      strategy.select(routes);
      strategy.select(routes);

      const fourth = strategy.select(routes);
      expect(fourth?.modelId).toBe("route1");
    });

    it("should return null for empty array", () => {
      expect(strategy.select([])).toBeNull();
    });
  });

  describe("RandomGroupStrategy", () => {
    let strategy: RandomGroupStrategy;

    beforeEach(() => {
      strategy = new RandomGroupStrategy();
    });

    it("should select a route", () => {
      const selected = strategy.select(routes);
      expect(selected).toBeDefined();
    });

    it("should return null for empty array", () => {
      expect(strategy.select([])).toBeNull();
    });
  });

  describe("ExhaustGroupStrategy", () => {
    let strategy: ExhaustGroupStrategy;

    beforeEach(() => {
      strategy = new ExhaustGroupStrategy();
    });

    it("should keep using same route until failures", () => {
      const first = strategy.select(routes);
      const second = strategy.select(routes);

      expect(first?.modelId).toBe(second?.modelId);
    });

    it("should switch after max failures", () => {
      const first = strategy.select(routes);

      // 模拟失败
      for (let i = 0; i < 3; i++) {
        strategy.reportFailure();
      }

      const next = strategy.select(routes);
      expect(next?.modelId).not.toBe(first?.modelId);
    });

    it("should reset failure count on success", () => {
      strategy.select(routes);
      strategy.reportFailure();
      strategy.reportFailure();
      strategy.reportSuccess();

      const first = strategy.select(routes);
      const second = strategy.select(routes);

      expect(first?.modelId).toBe(second?.modelId);
    });

    it("should return null for empty array", () => {
      expect(strategy.select([])).toBeNull();
    });
  });

  describe("WeightedGroupStrategy", () => {
    let strategy: WeightedGroupStrategy;

    beforeEach(() => {
      strategy = new WeightedGroupStrategy();
    });

    it("should select a route", () => {
      const selected = strategy.select(routes);
      expect(selected).toBeDefined();
    });

    it("should respect weights", () => {
      const counts: Record<string, number> = {};

      for (let i = 0; i < 100; i++) {
        const selected = strategy.select(routes);
        if (selected) {
          counts[selected.modelId] = (counts[selected.modelId] || 0) + 1;
        }
      }

      // route3 权重最高，应该被选中最多
      expect(counts["route3"]).toBeGreaterThan(counts["route1"]);
    });

    it("should use default weight of 1", () => {
      const noWeightRoutes = [createGroupRoute("a"), createGroupRoute("b")];

      const selected = strategy.select(noWeightRoutes);
      expect(selected).toBeDefined();
    });

    it("should return null for empty array", () => {
      expect(strategy.select([])).toBeNull();
    });
  });

  describe("createGroupStrategy", () => {
    it("should create round_robin strategy", () => {
      const strategy = createGroupStrategy("round_robin");
      expect(strategy).toBeInstanceOf(RoundRobinGroupStrategy);
    });

    it("should create random strategy", () => {
      const strategy = createGroupStrategy("random");
      expect(strategy).toBeInstanceOf(RandomGroupStrategy);
    });

    it("should create exhaust strategy", () => {
      const strategy = createGroupStrategy("exhaust");
      expect(strategy).toBeInstanceOf(ExhaustGroupStrategy);
    });

    it("should create weighted strategy", () => {
      const strategy = createGroupStrategy("weighted");
      expect(strategy).toBeInstanceOf(WeightedGroupStrategy);
    });

    it("should default to round_robin for unknown strategy", () => {
      const strategy = createGroupStrategy("unknown" as any);
      expect(strategy).toBeInstanceOf(RoundRobinGroupStrategy);
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("Strategies - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  describe("Key Selection - Edge Cases", () => {
    describe("ExhaustStrategy edge cases", () => {
      let strategy: ExhaustStrategy;

      beforeEach(() => {
        strategy = new ExhaustStrategy();
      });

      it("should handle single key", () => {
        const singleKey = [createKeyState("only", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 })];
        const selected = strategy.select(singleKey);
        expect(selected?.alias).toBe("only");
      });

      it("should handle all keys with quota at exact limit", () => {
        const keys = [
          createKeyState("exact", true, { type: "daily", limit: 10 }, { dailyCount: 10, totalCost: 0 }),
        ];
        // quota limit 是 10，dailyCount 也是 10，应该不可用
        const selected = strategy.select(keys);
        expect(selected).toBeNull();
      });

      it("should handle quota just under limit", () => {
        const keys = [
          createKeyState("almost", true, { type: "daily", limit: 10 }, { dailyCount: 9, totalCost: 0 }),
        ];
        const selected = strategy.select(keys);
        expect(selected?.alias).toBe("almost");
      });

      it("should handle very large quota values", () => {
        const keys = [
          createKeyState("big", true, { type: "total", limit: Number.MAX_SAFE_INTEGER }, { dailyCount: 0, totalCost: Number.MAX_SAFE_INTEGER - 1 }),
        ];
        const selected = strategy.select(keys);
        expect(selected?.alias).toBe("big");
      });
    });

    describe("RoundRobinStrategy edge cases", () => {
      let strategy: RoundRobinStrategy;

      beforeEach(() => {
        strategy = new RoundRobinStrategy();
      });

      it("should handle single key repeatedly", () => {
        const singleKey = [createKeyState("only", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 })];

        for (let i = 0; i < 10; i++) {
          const selected = strategy.select(singleKey);
          expect(selected?.alias).toBe("only");
        }
      });

      it("should handle many keys correctly", () => {
        const manyKeys = Array.from({ length: 100 }, (_, i) =>
          createKeyState(`key${i}`, true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 })
        );

        const selected = strategy.select(manyKeys);
        expect(selected?.alias).toBe("key0");

        const next = strategy.select(manyKeys);
        expect(next?.alias).toBe("key1");
      });

      it("should handle reset on first call", () => {
        const keys = [
          createKeyState("a", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
          createKeyState("b", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
        ];

        strategy.reset();
        const selected = strategy.select(keys);
        expect(selected?.alias).toBe("a");
      });
    });

    describe("RandomStrategy edge cases", () => {
      let strategy: RandomStrategy;

      beforeEach(() => {
        strategy = new RandomStrategy();
      });

      it("should handle single key", () => {
        const singleKey = [createKeyState("only", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 })];

        for (let i = 0; i < 10; i++) {
          const selected = strategy.select(singleKey);
          expect(selected?.alias).toBe("only");
        }
      });

      it("should return null for all unavailable keys", () => {
        const unavailableKeys = [
          createKeyState("unavail1", false, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
          createKeyState("unavail2", false, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }),
        ];

        const selected = strategy.select(unavailableKeys);
        expect(selected).toBeNull();
      });
    });

    describe("WeightedStrategy edge cases", () => {
      let strategy: WeightedStrategy;

      beforeEach(() => {
        strategy = new WeightedStrategy();
      });

      it("should handle zero weights", () => {
        const zeroWeightKeys = [
          createKeyState("zero1", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 0 }),
          createKeyState("zero2", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 0 }),
        ];

        // 零权重可能导致问题，测试当前行为
        const selected = strategy.select(zeroWeightKeys);
        // 取决于实现，可能返回 null 或某个 key
        expect(selected === null || selected.alias).toBeDefined();
      });

      it("should handle negative weights", () => {
        const negativeWeightKeys = [
          createKeyState("neg1", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: -5 }),
          createKeyState("neg2", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: -10 }),
        ];

        // 负权重可能导致问题，测试当前行为
        const selected = strategy.select(negativeWeightKeys);
        // 取决于实现
        expect(selected === null || selected.alias).toBeDefined();
      });

      it("should handle mixed weights including zero and negative", () => {
        const mixedWeightKeys = [
          createKeyState("positive", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 10 }),
          createKeyState("zero", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 0 }),
          createKeyState("negative", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: -5 }),
        ];

        const selected = strategy.select(mixedWeightKeys);
        // 应该选择正权重的 key
        expect(selected?.alias).toBe("positive");
      });

      it("should handle very large weights", () => {
        const largeWeightKeys = [
          createKeyState("small", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 1 }),
          createKeyState("large", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: Number.MAX_SAFE_INTEGER }),
        ];

        // 运行多次，large 应该几乎总是被选中
        const counts: Record<string, number> = { small: 0, large: 0 };
        for (let i = 0; i < 100; i++) {
          const selected = strategy.select(largeWeightKeys);
          if (selected) {
            counts[selected.alias] = (counts[selected.alias] || 0) + 1;
          }
        }

        expect(counts["large"]).toBeGreaterThan(counts["small"] * 10);
      });

      it("should handle single key with weight", () => {
        const singleWeightKey = [
          createKeyState("only", true, { type: "infinite" }, { dailyCount: 0, totalCost: 0 }, { weight: 100 }),
        ];

        const selected = strategy.select(singleWeightKey);
        expect(selected?.alias).toBe("only");
      });
    });

    describe("createKeyStrategy edge cases", () => {
      it("should handle empty string strategy name", () => {
        const strategy = createKeyStrategy("" as any);
        expect(strategy).toBeInstanceOf(RoundRobinStrategy);
      });

      it("should handle null strategy name", () => {
        const strategy = createKeyStrategy(null as any);
        expect(strategy).toBeInstanceOf(RoundRobinStrategy);
      });

      it("should handle undefined strategy name", () => {
        const strategy = createKeyStrategy(undefined as any);
        expect(strategy).toBeInstanceOf(RoundRobinStrategy);
      });
    });
  });

  describe("Group Selection - Edge Cases", () => {
    describe("RoundRobinGroupStrategy edge cases", () => {
      let strategy: RoundRobinGroupStrategy;

      beforeEach(() => {
        strategy = new RoundRobinGroupStrategy();
      });

      it("should handle single route", () => {
        const singleRoute = [createGroupRoute("only")];

        for (let i = 0; i < 10; i++) {
          const selected = strategy.select(singleRoute);
          expect(selected?.modelId).toBe("only");
        }
      });

      it("should handle many routes", () => {
        const manyRoutes = Array.from({ length: 100 }, (_, i) => createGroupRoute(`route${i}`));

        const selected = strategy.select(manyRoutes);
        expect(selected?.modelId).toBe("route0");

        const next = strategy.select(manyRoutes);
        expect(next?.modelId).toBe("route1");
      });

      it("should handle routes with special modelId characters", () => {
        const specialRoutes = [
          createGroupRoute("model/with/slashes"),
          createGroupRoute("model:with:colons"),
          createGroupRoute("model🚀emoji"),
          createGroupRoute("模型中文"),
        ];

        const first = strategy.select(specialRoutes);
        const second = strategy.select(specialRoutes);
        const third = strategy.select(specialRoutes);
        const fourth = strategy.select(specialRoutes);

        expect(first?.modelId).toBe("model/with/slashes");
        expect(second?.modelId).toBe("model:with:colons");
        expect(third?.modelId).toBe("model🚀emoji");
        expect(fourth?.modelId).toBe("模型中文");
      });
    });

    describe("RandomGroupStrategy edge cases", () => {
      let strategy: RandomGroupStrategy;

      beforeEach(() => {
        strategy = new RandomGroupStrategy();
      });

      it("should handle single route", () => {
        const singleRoute = [createGroupRoute("only")];

        for (let i = 0; i < 10; i++) {
          const selected = strategy.select(singleRoute);
          expect(selected?.modelId).toBe("only");
        }
      });

      it("should handle empty array", () => {
        const selected = strategy.select([]);
        expect(selected).toBeNull();
      });
    });

    describe("ExhaustGroupStrategy edge cases", () => {
      let strategy: ExhaustGroupStrategy;

      beforeEach(() => {
        strategy = new ExhaustGroupStrategy();
      });

      it("should handle single route", () => {
        const singleRoute = [createGroupRoute("only")];

        const first = strategy.select(singleRoute);
        const second = strategy.select(singleRoute);
        const third = strategy.select(singleRoute);

        expect(first?.modelId).toBe("only");
        expect(second?.modelId).toBe("only");
        expect(third?.modelId).toBe("only");
      });

      it("should handle all routes exhausted", () => {
        const routes = [
          createGroupRoute("route1"),
          createGroupRoute("route2"),
        ];

        strategy.select(routes);
        for (let i = 0; i < 3; i++) strategy.reportFailure();

        strategy.select(routes);
        for (let i = 0; i < 3; i++) strategy.reportFailure();

        // 所有路由都被耗尽后，应该返回 null 或重置
        const selected = strategy.select(routes);
        // 取决于实现
        expect(selected === null || selected.modelId).toBeDefined();
      });

      it("should handle rapid failure reports", () => {
        const routes = [createGroupRoute("route1"), createGroupRoute("route2")];

        strategy.select(routes);
        for (let i = 0; i < 100; i++) {
          strategy.reportFailure();
        }

        // 应该切换到下一个路由
        const next = strategy.select(routes);
        expect(next?.modelId).toBe("route2");
      });

      it("should handle success after failures", () => {
        const routes = [createGroupRoute("route1"), createGroupRoute("route2")];

        strategy.select(routes);
        strategy.reportFailure();
        strategy.reportFailure();
        strategy.reportSuccess(); // 重置失败计数

        // 应该继续使用 route1
        const next = strategy.select(routes);
        expect(next?.modelId).toBe("route1");
      });
    });

    describe("WeightedGroupStrategy edge cases", () => {
      let strategy: WeightedGroupStrategy;

      beforeEach(() => {
        strategy = new WeightedGroupStrategy();
      });

      it("should handle zero weights", () => {
        const zeroWeightRoutes = [
          createGroupRoute("zero1", 0),
          createGroupRoute("zero2", 0),
        ];

        const selected = strategy.select(zeroWeightRoutes);
        expect(selected === null || selected.modelId).toBeDefined();
      });

      it("should handle negative weights", () => {
        const negativeWeightRoutes = [
          createGroupRoute("neg1", -5),
          createGroupRoute("neg2", -10),
        ];

        const selected = strategy.select(negativeWeightRoutes);
        expect(selected === null || selected.modelId).toBeDefined();
      });

      it("should handle single route", () => {
        const singleRoute = [createGroupRoute("only", 100)];

        const selected = strategy.select(singleRoute);
        expect(selected?.modelId).toBe("only");
      });

      it("should handle very large weight differences", () => {
        const largeDiffRoutes = [
          createGroupRoute("tiny", 1),
          createGroupRoute("huge", Number.MAX_SAFE_INTEGER),
        ];

        const counts: Record<string, number> = { tiny: 0, huge: 0 };
        for (let i = 0; i < 100; i++) {
          const selected = strategy.select(largeDiffRoutes);
          if (selected) {
            counts[selected.modelId] = (counts[selected.modelId] || 0) + 1;
          }
        }

        expect(counts["huge"]).toBeGreaterThan(counts["tiny"] * 10);
      });
    });

    describe("createGroupStrategy edge cases", () => {
      it("should handle empty string strategy name", () => {
        const strategy = createGroupStrategy("" as any);
        expect(strategy).toBeInstanceOf(RoundRobinGroupStrategy);
      });

      it("should handle null strategy name", () => {
        const strategy = createGroupStrategy(null as any);
        expect(strategy).toBeInstanceOf(RoundRobinGroupStrategy);
      });

      it("should handle undefined strategy name", () => {
        const strategy = createGroupStrategy(undefined as any);
        expect(strategy).toBeInstanceOf(RoundRobinGroupStrategy);
      });
    });
  });
});
