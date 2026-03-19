import { describe, expect, it, beforeEach } from "vitest";
import { KeyStore } from "../src/core/key_store.js";
import type { KeyConfig, KeyState } from "../src/core/types.js";

/**
 * KeyStore 单元测试
 * @description 测试 Key 管理器的增删改查和选择策略
 */

// ============================================================
// 辅助函数
// ============================================================

function createKeyConfig(
  alias: string,
  provider: string = "p",
  quota: KeyConfig["quota"] = { type: "infinite" }
): KeyConfig {
  return {
    alias,
    provider,
    key: `sk-${alias}`,
    quota,
  };
}

// ============================================================
// 基本功能测试
// ============================================================

describe("KeyStore - Basic Operations", () => {
  let store: KeyStore;

  beforeEach(() => {
    store = new KeyStore([]);
  });

  describe("addKey", () => {
    it("should add a key", () => {
      const config = createKeyConfig("key1");
      store.addKey(config);

      const keys = store.listKeys();
      expect(keys.length).toBe(1);
      expect(keys[0].alias).toBe("key1");
    });

    it("should maintain provider index", () => {
      store.addKey(createKeyConfig("key1", "provider-a"));
      store.addKey(createKeyConfig("key2", "provider-a"));
      store.addKey(createKeyConfig("key3", "provider-b"));

      const providerAKeys = store.listKeysByProvider("provider-a");
      expect(providerAKeys.length).toBe(2);

      const providerBKeys = store.listKeysByProvider("provider-b");
      expect(providerBKeys.length).toBe(1);
    });
  });

  describe("getKey", () => {
    it("should return key by alias", () => {
      store.addKey(createKeyConfig("key1"));
      const key = store.getKey("key1");
      expect(key?.alias).toBe("key1");
    });

    it("should return null for non-existent key", () => {
      const key = store.getKey("non-existent");
      expect(key).toBeNull();
    });
  });

  describe("updateKey", () => {
    it("should update key config", () => {
      store.addKey(createKeyConfig("key1", "provider-a"));
      store.updateKey("key1", createKeyConfig("key1", "provider-b"));

      const key = store.getKey("key1");
      expect(key?.provider).toBe("provider-b");
    });

    it("should preserve usage state", () => {
      store.addKey(createKeyConfig("key1", "p", { type: "daily", limit: 100 }));
      store.applyCost("key1", 0);

      const beforeUpdate = store.getKey("key1");
      expect(beforeUpdate?.usage.dailyCount).toBe(1);

      store.updateKey("key1", createKeyConfig("key1"));
      const afterUpdate = store.getKey("key1");
      expect(afterUpdate?.usage.dailyCount).toBe(1);
    });

    it("should return false for non-existent key", () => {
      const result = store.updateKey("non-existent", createKeyConfig("non-existent"));
      expect(result).toBe(false);
    });
  });

  describe("deleteKey", () => {
    it("should delete key", () => {
      store.addKey(createKeyConfig("key1"));
      const result = store.deleteKey("key1");
      expect(result).toBe(true);
      expect(store.listKeys().length).toBe(0);
    });

    it("should update provider index after deletion", () => {
      store.addKey(createKeyConfig("key1", "provider-a"));
      store.addKey(createKeyConfig("key2", "provider-a"));
      store.deleteKey("key1");

      const providerKeys = store.listKeysByProvider("provider-a");
      expect(providerKeys.length).toBe(1);
      expect(providerKeys[0].alias).toBe("key2");
    });

    it("should return false for non-existent key", () => {
      const result = store.deleteKey("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("resetDaily", () => {
    it("should reset daily count for all keys", () => {
      store.addKey(createKeyConfig("key1", "provider", { type: "daily", limit: 100 }));
      store.addKey(createKeyConfig("key2", "provider", { type: "daily", limit: 100 }));

      store.applyCost("key1", 0);
      store.applyCost("key2", 0);
      store.applyCost("key2", 0);

      store.resetDaily();

      const keys = store.listKeys();
      expect(keys.every((k) => k.usage.dailyCount === 0)).toBe(true);
    });
  });
});

// ============================================================
// 策略选择测试
// ============================================================

describe("KeyStore - Selection Strategies", () => {
  describe("exhaust strategy", () => {
    it("should use key until quota exhausted", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 1 }),
        createKeyConfig("key2", "p", { type: "daily", limit: 2 }),
      ]);

      const first = store.pickKey("p", "exhaust");
      expect(first?.alias).toBe("key1");
      store.applyCost("key1", 0);

      const second = store.pickKey("p", "exhaust");
      expect(second?.alias).toBe("key2");
    });

    it("should skip exhausted keys", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 1 }),
        createKeyConfig("key2", "p", { type: "infinite" }),
      ]);

      // 耗尽 key1
      store.applyCost("key1", 0);

      const selected = store.pickKey("p", "exhaust");
      expect(selected?.alias).toBe("key2");
    });
  });

  describe("round_robin strategy", () => {
    it("should cycle through keys", () => {
      const store = new KeyStore([
        createKeyConfig("key1"),
        createKeyConfig("key2"),
      ]);

      const first = store.pickKey("p", "round_robin");
      const second = store.pickKey("p", "round_robin");
      expect(first?.alias).not.toBe(second?.alias);
    });

    it("should skip unavailable keys", () => {
      const store = new KeyStore([
        createKeyConfig("key1"),
        createKeyConfig("key2"),
      ]);

      // 标记 key1 不可用
      const key1 = store.getKey("key1");
      if (key1) key1.available = false;

      const selected = store.pickKey("p", "round_robin");
      expect(selected?.alias).toBe("key2");
    });
  });

  describe("random strategy", () => {
    it("should return an available key", () => {
      const store = new KeyStore([
        createKeyConfig("key1"),
        createKeyConfig("key2"),
      ]);

      const selected = store.pickKey("p", "random");
      expect(["key1", "key2"]).toContain(selected?.alias);
    });

    it("should return null when no keys available", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 0 }),
      ]);

      const selected = store.pickKey("p", "random");
      expect(selected).toBeNull();
    });
  });
});

// ============================================================
// 配额测试
// ============================================================

describe("KeyStore - Quota Management", () => {
  describe("daily quota", () => {
    it("should increment daily count", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 10 }),
      ]);

      store.applyCost("key1", 0);
      store.applyCost("key1", 0);

      const key = store.getKey("key1");
      expect(key?.usage.dailyCount).toBe(2);
    });

    it("should block key when daily quota exhausted", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 2 }),
      ]);

      store.applyCost("key1", 0);
      store.applyCost("key1", 0);

      const selected = store.pickKey("p", "exhaust");
      expect(selected).toBeNull();
    });
  });

  describe("total quota", () => {
    it("should accumulate total cost", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: 100 }),
      ]);

      store.applyCost("key1", 10);
      store.applyCost("key1", 20);

      const key = store.getKey("key1");
      expect(key?.usage.totalCost).toBe(30);
    });

    it("should delete key when total quota exhausted", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: 10 }),
      ]);

      store.applyCost("key1", 15);

      const key = store.getKey("key1");
      expect(key).toBeNull();
    });
  });

  describe("infinite quota", () => {
    it("should never block", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "infinite" }),
      ]);

      for (let i = 0; i < 100; i++) {
        store.applyCost("key1", 0);
      }

      const selected = store.pickKey("p", "exhaust");
      expect(selected?.alias).toBe("key1");
    });
  });
});

// ============================================================
// 模型过滤测试
// ============================================================

describe("KeyStore - Model Filtering", () => {
  it("should filter keys by model", () => {
    const store = new KeyStore([
      { alias: "key1", provider: "p", key: "k1", quota: { type: "infinite" }, model: "model-a" },
      { alias: "key2", provider: "p", key: "k2", quota: { type: "infinite" }, model: "model-b" },
    ]);

    const selected = store.pickKey("p", "exhaust", "model-a");
    expect(selected?.alias).toBe("key1");
  });

  it("should select keys without model restriction when model not specified", () => {
    const store = new KeyStore([
      { alias: "key1", provider: "p", key: "k1", quota: { type: "infinite" } },
      { alias: "key2", provider: "p", key: "k2", quota: { type: "infinite" }, model: "model-a" },
    ]);

    const selected = store.pickKey("p", "exhaust");
    expect(selected?.alias).toBe("key1");
  });
});

// ============================================================
// 统计功能测试
// ============================================================

describe("KeyStore - Statistics", () => {
  it("should return correct stats", () => {
    const store = new KeyStore([
      createKeyConfig("key1", "provider-a"),
      createKeyConfig("key2", "provider-a"),
      createKeyConfig("key3", "provider-b"),
    ]);

    const stats = store.getStats();
    expect(stats.total).toBe(3);
    expect(stats.available).toBe(3);
    expect(stats.byProvider["provider-a"]).toBe(2);
    expect(stats.byProvider["provider-b"]).toBe(1);
  });

  it("should count available keys correctly", () => {
    const store = new KeyStore([
      createKeyConfig("key1", "p", { type: "daily", limit: 1 }),
      createKeyConfig("key2", "p", { type: "infinite" }),
    ]);

    // 耗尽 key1
    store.applyCost("key1", 0);

    const stats = store.getStats();
    expect(stats.total).toBe(2);
    expect(stats.available).toBe(1);
  });
});

// ============================================================
// 边界条件测试
// ============================================================

describe("KeyStore - Edge Cases", () => {
  it("should return null for empty store", () => {
    const store = new KeyStore([]);
    const selected = store.pickKey("p", "exhaust");
    expect(selected).toBeNull();
  });

  it("should return null for non-existent provider", () => {
    const store = new KeyStore([
      createKeyConfig("key1", "provider-a"),
    ]);

    const selected = store.pickKey("provider-b", "exhaust");
    expect(selected).toBeNull();
  });

  it("should handle all keys unavailable", () => {
    const store = new KeyStore([
      createKeyConfig("key1", "p", { type: "daily", limit: 0 }),
    ]);

    const selected = store.pickKey("p", "exhaust");
    expect(selected).toBeNull();
  });

  it("should handle lastUsedAt update", () => {
    const store = new KeyStore([
      createKeyConfig("key1"),
    ]);

    const before = store.getKey("key1");
    expect(before?.lastUsedAt).toBeNull();

    store.applyCost("key1", 0);

    const after = store.getKey("key1");
    expect(after?.lastUsedAt).not.toBeNull();
  });
});

// ============================================================
// 随机猴子测试 - 异常输入和边界条件
// ============================================================

describe("KeyStore - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  describe("alias edge cases", () => {
    it("should handle empty string alias", () => {
      const store = new KeyStore([]);
      store.addKey(createKeyConfig(""));

      const key = store.getKey("");
      expect(key?.alias).toBe("");
    });

    it("should handle alias with special characters", () => {
      const store = new KeyStore([]);
      const specialAliases = [
        "key with spaces",
        "key\twith\ttabs",
        "key\nwith\nnewlines",
        "key/with/slashes",
        "key\\with\\backslashes",
        "key'with'quotes",
        'key"with"doublequotes',
        "key`with`backticks",
        "key$with$dollar",
        "key@with@at",
        "key#with#hash",
        "key%with%percent",
        "key^with^caret",
        "key&with&ampersand",
        "key*with*asterisk",
        "key(with)parentheses",
        "key[with]brackets",
        "key{with}braces",
        "key|with|pipe",
        "key;with;semicolon",
        "key:with:colon",
        "key,with,comma",
        "key.with.dot",
        "key<>with<>angles",
        "key~with~tilde",
        "key`with`backtick",
      ];

      for (const alias of specialAliases) {
        store.addKey(createKeyConfig(alias));
        const key = store.getKey(alias);
        expect(key?.alias).toBe(alias);
      }
    });

    it("should handle alias with unicode characters", () => {
      const store = new KeyStore([]);
      const unicodeAliases = [
        "钥匙1",
        "🔑",
        "🚀rocket",
        "key🎉emoji",
        "ключ",
        "鍵",
        "αβγδ",
        "العربية",
        "עברית",
        "日本語キー",
        "한국어",
      ];

      for (const alias of unicodeAliases) {
        store.addKey(createKeyConfig(alias));
        const key = store.getKey(alias);
        expect(key?.alias).toBe(alias);
      }
    });

    it("should handle very long alias", () => {
      const store = new KeyStore([]);
      const longAlias = "a".repeat(10000);
      store.addKey(createKeyConfig(longAlias));

      const key = store.getKey(longAlias);
      expect(key?.alias).toBe(longAlias);
    });

    it("should handle alias that looks like SQL injection", () => {
      const store = new KeyStore([]);
      const maliciousAliases = [
        "'; DROP TABLE keys; --",
        "1; DELETE FROM keys WHERE 1=1",
        "' OR '1'='1",
        "<script>alert('xss')</script>",
        "${process.env.SECRET}",
        "{{constructor.constructor('return this')()}}",
      ];

      for (const alias of maliciousAliases) {
        store.addKey(createKeyConfig(alias));
        const key = store.getKey(alias);
        expect(key?.alias).toBe(alias);
      }
    });

    it("should overwrite key when adding duplicate alias", () => {
      const store = new KeyStore([]);
      store.addKey(createKeyConfig("key1", "provider-a"));
      store.addKey(createKeyConfig("key1", "provider-b"));

      const key = store.getKey("key1");
      expect(key?.provider).toBe("provider-b");
      expect(store.listKeys().length).toBe(1);
    });
  });

  describe("provider edge cases", () => {
    it("should handle empty string provider", () => {
      const store = new KeyStore([]);
      store.addKey(createKeyConfig("key1", ""));

      const keys = store.listKeysByProvider("");
      expect(keys.length).toBe(1);
    });

    it("should treat provider names as case-sensitive", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "Provider"),
        createKeyConfig("key2", "provider"),
        createKeyConfig("key3", "PROVIDER"),
      ]);

      expect(store.listKeysByProvider("Provider").length).toBe(1);
      expect(store.listKeysByProvider("provider").length).toBe(1);
      expect(store.listKeysByProvider("PROVIDER").length).toBe(1);
    });

    it("should handle provider with unicode name", () => {
      const store = new KeyStore([]);
      store.addKey(createKeyConfig("key1", "提供商🚀"));

      const selected = store.pickKey("提供商🚀", "exhaust");
      expect(selected?.alias).toBe("key1");
    });
  });

  describe("quota edge cases", () => {
    it("should handle zero limit daily quota", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 0 }),
      ]);

      // 零配额的 key 应该不可用
      const selected = store.pickKey("p", "exhaust");
      expect(selected).toBeNull();
    });

    it("should handle zero limit total quota", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: 0 }),
      ]);

      // 零配额的 key 应该不可用
      const selected = store.pickKey("p", "exhaust");
      expect(selected).toBeNull();
    });

    it("should handle very large quota limit", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: Number.MAX_SAFE_INTEGER }),
      ]);

      store.applyCost("key1", 1000000);
      const key = store.getKey("key1");
      expect(key).not.toBeNull();
    });

    it("should handle quota limit of 1", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 1 }),
      ]);

      // 第一次应该可用
      expect(store.pickKey("p", "exhaust")).not.toBeNull();
      store.applyCost("key1", 0);

      // 用完后应该不可用
      expect(store.pickKey("p", "exhaust")).toBeNull();
    });
  });

  describe("applyCost edge cases", () => {
    it("should handle negative cost", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: 100 }),
      ]);

      store.applyCost("key1", -50);
      const key = store.getKey("key1");
      // 负数 cost 会减少 totalCost（这可能是 bug，但测试当前行为）
      expect(key?.usage.totalCost).toBe(-50);
    });

    it("should handle zero cost", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: 100 }),
      ]);

      store.applyCost("key1", 0);
      const key = store.getKey("key1");
      expect(key?.usage.totalCost).toBe(0);
    });

    it("should handle very small cost", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "total", limit: 100 }),
      ]);

      store.applyCost("key1", 0.000001);
      const key = store.getKey("key1");
      expect(key?.usage.totalCost).toBeCloseTo(0.000001);
    });

    it("should handle non-existent key silently", () => {
      const store = new KeyStore([]);

      // 不应该抛出错误
      expect(() => store.applyCost("non-existent", 100)).not.toThrow();
    });

    it("should update lastUsedAt on applyCost", () => {
      const store = new KeyStore([createKeyConfig("key1")]);

      const before = store.getKey("key1")!.lastUsedAt;
      store.applyCost("key1", 0);
      const after = store.getKey("key1")!.lastUsedAt;

      expect(after).toBeGreaterThanOrEqual(before ?? 0);
    });
  });

  describe("model filtering edge cases", () => {
    it("should handle empty string model filter", () => {
      const store = new KeyStore([
        { alias: "key1", provider: "p", key: "k1", quota: { type: "infinite" }, model: "" },
        { alias: "key2", provider: "p", key: "k2", quota: { type: "infinite" }, model: "model-a" },
      ]);

      // 空字符串模型应该匹配
      const selected = store.pickKey("p", "exhaust", "");
      expect(selected?.alias).toBe("key1");
    });

    it("should handle model with special characters", () => {
      const store = new KeyStore([
        { alias: "key1", provider: "p", key: "k1", quota: { type: "infinite" }, model: "gpt-4-0125-preview" },
        { alias: "key2", provider: "p", key: "k2", quota: { type: "infinite" }, model: "claude-3-opus-20240229" },
      ]);

      const selected = store.pickKey("p", "exhaust", "gpt-4-0125-preview");
      expect(selected?.alias).toBe("key1");
    });

    it("should return null when no key matches model", () => {
      const store = new KeyStore([
        { alias: "key1", provider: "p", key: "k1", quota: { type: "infinite" }, model: "model-a" },
      ]);

      const selected = store.pickKey("p", "exhaust", "model-b");
      expect(selected).toBeNull();
    });
  });

  describe("strategy edge cases", () => {
    it("should throw for invalid strategy name", () => {
      const store = new KeyStore([createKeyConfig("key1")]);

      // 无效策略名应该抛出错误
      expect(() => store.pickKey("p", "invalid_strategy")).toThrow("Unknown strategy");
    });

    it("should handle custom registered strategy", () => {
      const store = new KeyStore([createKeyConfig("key1")]);

      store.registerStrategy({
        name: "custom",
        select: (keys) => keys[0] ?? null,
      });

      const selected = store.pickKey("p", "custom");
      expect(selected?.alias).toBe("key1");
    });
  });

  describe("concurrent modification simulation", () => {
    it("should handle addKey during iteration", () => {
      const store = new KeyStore([
        createKeyConfig("key1"),
        createKeyConfig("key2"),
      ]);

      // 模拟在遍历过程中添加新 key
      const keys = store.listKeys();
      store.addKey(createKeyConfig("key3"));

      expect(keys.length).toBe(2);
      expect(store.listKeys().length).toBe(3);
    });

    it("should handle deleteKey during iteration", () => {
      const store = new KeyStore([
        createKeyConfig("key1"),
        createKeyConfig("key2"),
      ]);

      const keys = store.listKeys();
      store.deleteKey("key1");

      expect(keys.length).toBe(2);
      expect(store.listKeys().length).toBe(1);
    });
  });

  describe("updateKey edge cases", () => {
    it("should handle provider change", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "provider-a"),
      ]);

      store.updateKey("key1", createKeyConfig("key1", "provider-b"));

      expect(store.listKeysByProvider("provider-a").length).toBe(0);
      expect(store.listKeysByProvider("provider-b").length).toBe(1);
    });

    it("should handle updating non-existent key", () => {
      const store = new KeyStore([]);
      const result = store.updateKey("non-existent", createKeyConfig("non-existent"));
      expect(result).toBe(false);
    });

    it("should preserve usage when updating to different quota type", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 100 }),
      ]);

      store.applyCost("key1", 0);
      expect(store.getKey("key1")?.usage.dailyCount).toBe(1);

      // 更新为不同配额类型
      store.updateKey("key1", createKeyConfig("key1", "p", { type: "total", limit: 1000 }));

      // usage 应该被保留（虽然配额类型变了，但 usage 结构是通用的）
      const key = store.getKey("key1");
      expect(key?.usage.dailyCount).toBe(1);
    });
  });

  describe("key value edge cases", () => {
    it("should handle empty string key value", () => {
      const store = new KeyStore([]);
      store.addKey({ alias: "key1", provider: "p", key: "", quota: { type: "infinite" } });

      const key = store.getKey("key1");
      expect(key?.key).toBe("");
    });

    it("should handle very long key value", () => {
      const store = new KeyStore([]);
      const longKey = "sk-" + "a".repeat(10000);
      store.addKey({ alias: "key1", provider: "p", key: longKey, quota: { type: "infinite" } });

      const key = store.getKey("key1");
      expect(key?.key).toBe(longKey);
    });
  });

  describe("statistics edge cases", () => {
    it("should handle getStats on empty store", () => {
      const store = new KeyStore([]);
      const stats = store.getStats();

      expect(stats.total).toBe(0);
      expect(stats.available).toBe(0);
      expect(Object.keys(stats.byProvider).length).toBe(0);
    });

    it("should handle getStats with all keys unavailable", () => {
      const store = new KeyStore([
        createKeyConfig("key1", "p", { type: "daily", limit: 0 }),
        createKeyConfig("key2", "p", { type: "daily", limit: 0 }),
      ]);

      const stats = store.getStats();
      expect(stats.total).toBe(2);
      expect(stats.available).toBe(0);
    });
  });
});