import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CacheStore } from "../src/core/cache_store.js";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * CacheStore 单元测试
 * @description 测试缓存存储的所有功能
 */
describe("CacheStore", () => {
  let store: CacheStore;
  let testDbPath: string;

  beforeEach(() => {
    // 在临时目录创建测试数据库
    testDbPath = path.join(os.tmpdir(), `cache_test_${Date.now()}.sqlite`);
    store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
  });

  afterEach(() => {
    store.close();
    // 清理测试数据库
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("set and get", () => {
    it("should set and get a cache entry", () => {
      const data = { message: "hello", count: 42 };
      const key = "test-key";

      store.set(key, data);
      const result = store.get(key);

      expect(result).toEqual(data);
    });

    it("should return null for non-existent key", () => {
      const result = store.get("non-existent");
      expect(result).toBeNull();
    });

    it("should update existing key", () => {
      store.set("key1", { version: 1 });
      store.set("key1", { version: 2 });

      const result = store.get("key1");
      expect(result).toEqual({ version: 2 });
    });

    it("should handle complex nested objects", () => {
      const complex = {
        user: { name: "test", roles: ["admin", "user"] },
        meta: { created: Date.now() },
      };

      store.set("complex", complex);
      expect(store.get("complex")).toEqual(complex);
    });
  });

  describe("delete", () => {
    it("should delete an existing key", () => {
      store.set("key1", { data: "test" });
      const deleted = store.delete("key1");

      expect(deleted).toBe(true);
      expect(store.get("key1")).toBeNull();
    });

    it("should return false for non-existent key", () => {
      const deleted = store.delete("non-existent");
      expect(deleted).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all entries", () => {
      store.set("key1", { a: 1 });
      store.set("key2", { b: 2 });
      store.set("key3", { c: 3 });

      store.clear();

      expect(store.size()).toBe(0);
    });
  });

  describe("size", () => {
    it("should return correct size", () => {
      expect(store.size()).toBe(0);

      store.set("key1", { a: 1 });
      expect(store.size()).toBe(1);

      store.set("key2", { b: 2 });
      expect(store.size()).toBe(2);
    });
  });

  describe("maxEntries pruning", () => {
    it("should prune oldest entries when exceeding maxEntries", () => {
      // maxEntries = 5
      store.set("key1", { n: 1 });
      store.set("key2", { n: 2 });
      store.set("key3", { n: 3 });
      store.set("key4", { n: 4 });
      store.set("key5", { n: 5 });

      // 添加第6个，应该裁剪掉最少使用的
      store.set("key6", { n: 6 });

      expect(store.size()).toBe(5);
      // key1 应该被裁剪（最早添加且未被访问）
      expect(store.get("key1")).toBeNull();
    });

    it("should keep recently accessed entries", () => {
      store.set("key1", { n: 1 });
      store.set("key2", { n: 2 });
      store.set("key3", { n: 3 });
      store.set("key4", { n: 4 });
      store.set("key5", { n: 5 });

      // 访问 key1，更新其 last_access
      store.get("key1");

      // 添加新条目
      store.set("key6", { n: 6 });

      // key1 应该保留（因为刚被访问过）
      expect(store.get("key1")).toEqual({ n: 1 });
    });
  });

  describe("buildKey", () => {
    it("should generate consistent hash for same input", () => {
      const payload = { messages: [{ role: "user", content: "hello" }] };
      const key1 = CacheStore.buildKey(payload);
      const key2 = CacheStore.buildKey(payload);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64); // SHA-256 hex string length
    });

    it("should generate different hash for different input", () => {
      const key1 = CacheStore.buildKey({ a: 1 });
      const key2 = CacheStore.buildKey({ a: 2 });

      expect(key1).not.toBe(key2);
    });

    it("should handle key order consistently", () => {
      // 对象键顺序不同，但内容相同
      const key1 = CacheStore.buildKey({ a: 1, b: 2 });
      const key2 = CacheStore.buildKey({ b: 2, a: 1 });

      expect(key1).toBe(key2);
    });

    it("should handle arrays consistently", () => {
      const key1 = CacheStore.buildKey([1, 2, 3]);
      const key2 = CacheStore.buildKey([1, 2, 3]);

      expect(key1).toBe(key2);
    });

    it("should handle null", () => {
      const key = CacheStore.buildKey(null);
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
    });
  });

  describe("close", () => {
    it("should close database connection", () => {
      store.set("key1", { data: "test" });
      store.close();

      // 关闭后再次操作应该会抛错
      expect(() => store.get("key1")).toThrow();
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("CacheStore - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  let store: CacheStore;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `cache_test_${Date.now()}.sqlite`);
  });

  afterEach(() => {
    try {
      store.close();
    } catch {
      // ignore
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("key edge cases", () => {
    it("should handle empty string key", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      store.set("", { data: "test" });

      const result = store.get("");
      expect(result).toEqual({ data: "test" });
    });

    it("should handle very long key", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const longKey = "a".repeat(10000);
      store.set(longKey, { data: "test" });

      const result = store.get(longKey);
      expect(result).toEqual({ data: "test" });
    });

    it("should handle key with special characters", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const specialKeys = [
        "key with spaces",
        "key\twith\ttabs",
        "key\nwith\nnewlines",
        "key'with'quotes",
        'key"with"doublequotes',
        "key🚀emoji",
        "钥匙中文",
        "'; DROP TABLE cache; --",
        "<script>alert('xss')</script>",
      ];

      for (const key of specialKeys) {
        store.set(key, { test: key });
        expect(store.get(key)).toEqual({ test: key });
      }
    });

    it("should handle key that looks like SQL injection", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const maliciousKey = "'; DROP TABLE cache; --";
      store.set(maliciousKey, { safe: true });

      expect(store.get(maliciousKey)).toEqual({ safe: true });
      // 数据库应该仍然正常工作
      expect(store.size()).toBe(1);
    });
  });

  describe("value edge cases", () => {
    it("should handle empty object", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      store.set("key1", {});

      expect(store.get("key1")).toEqual({});
    });

    it("should handle nested empty objects", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const nested = { a: { b: { c: {} } } };
      store.set("key1", nested);

      expect(store.get("key1")).toEqual(nested);
    });

    it("should handle null values in object", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const withNull = { a: null, b: "value", c: null };
      store.set("key1", withNull);

      expect(store.get("key1")).toEqual(withNull);
    });

    it("should handle boolean values", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      store.set("key1", { true: true, false: false });

      expect(store.get("key1")).toEqual({ true: true, false: false });
    });

    it("should handle numeric values including edge cases", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const nums = {
        zero: 0,
        negative: -123,
        decimal: 3.14159,
        big: Number.MAX_SAFE_INTEGER,
        small: Number.MIN_SAFE_INTEGER,
        // 注意：JSON.stringify(Infinity) 返回 "null"，所以存储后读取会变成 null
      };
      store.set("nums", nums);

      const result = store.get("nums");
      expect(result).toEqual(nums);
    });

    it("should handle array values", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const arr = [1, "two", null, { nested: true }, [1, 2, 3]];
      store.set("arr", arr as unknown as Record<string, unknown>);

      expect(store.get("arr")).toEqual(arr);
    });

    it("should handle deeply nested objects", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      let deep: Record<string, unknown> = {};
      let current = deep;
      for (let i = 0; i < 100; i++) {
        current[`level${i}`] = {};
        current = current[`level${i}`] as Record<string, unknown>;
      }
      current["deepest"] = "found";

      store.set("deep", deep);
      expect(store.get("deep")).toEqual(deep);
    });

    it("should handle special string values", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const specialStrings = {
        empty: "",
        unicode: "你好世界🎉🚀",
        long: "a".repeat(10000),
        multiline: "line1\nline2\nline3",
        tabs: "col1\tcol2\tcol3",
        json: '{"nested": "json"}',
        html: "<div>test</div>",
        path: "C:\\Users\\test\\file.txt",
        url: "https://example.com?query=value&other=123",
      };
      store.set("strings", specialStrings);

      expect(store.get("strings")).toEqual(specialStrings);
    });
  });

  describe("maxEntries edge cases", () => {
    it("should handle maxEntries of 1", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 1 });

      store.set("key1", { n: 1 });
      expect(store.size()).toBe(1);

      store.set("key2", { n: 2 });
      expect(store.size()).toBe(1);
      expect(store.get("key1")).toBeNull();
      expect(store.get("key2")).toEqual({ n: 2 });
    });

    it("should handle maxEntries of 0 (should be treated as 1)", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 0 });

      store.set("key1", { n: 1 });
      expect(store.size()).toBe(1);

      store.set("key2", { n: 2 });
      expect(store.size()).toBe(1);
    });

    it("should handle very large maxEntries", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: Number.MAX_SAFE_INTEGER });

      for (let i = 0; i < 100; i++) {
        store.set(`key${i}`, { n: i });
      }

      expect(store.size()).toBe(100);
    });

    it("should prune correctly when exceeding limit", () => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 3 });

      store.set("key1", { n: 1 });
      store.set("key2", { n: 2 });
      store.set("key3", { n: 3 });

      // 访问 key1，更新 last_access
      store.get("key1");

      // 添加新条目，应该裁剪掉最久未访问的（key2 或 key3）
      store.set("key4", { n: 4 });

      expect(store.size()).toBe(3);
      // key1 应该保留（刚被访问过）
      expect(store.get("key1")).toEqual({ n: 1 });
    });
  });

  describe("buildKey edge cases", () => {
    it("should handle null input", () => {
      const key = CacheStore.buildKey(null);
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
    });

    it("should handle boolean input", () => {
      const keyTrue = CacheStore.buildKey(true);
      const keyFalse = CacheStore.buildKey(false);

      expect(keyTrue).toBeDefined();
      expect(keyFalse).toBeDefined();
      expect(keyTrue).not.toBe(keyFalse);
    });

    it("should handle number input", () => {
      const key0 = CacheStore.buildKey(0);
      const keyNeg = CacheStore.buildKey(-1);
      const keyFloat = CacheStore.buildKey(3.14159);
      const keyMax = CacheStore.buildKey(Number.MAX_SAFE_INTEGER);
      const keyInf = CacheStore.buildKey(Infinity);
      const keyNegInf = CacheStore.buildKey(-Infinity);

      // 普通数字应该产生不同的 key
      expect(key0).not.toBe(keyNeg);
      expect(key0).not.toBe(keyFloat);
      expect(keyNeg).not.toBe(keyFloat);

      // 注意：JSON.stringify(Infinity) 和 JSON.stringify(-Infinity) 都返回 "null"
      // 所以 Infinity 和 -Infinity 会产生相同的 key
      expect(keyInf).toBe(keyNegInf);
    });

    it("should handle array input", () => {
      const key1 = CacheStore.buildKey([1, 2, 3]);
      const key2 = CacheStore.buildKey([1, 2, 3]);
      const key3 = CacheStore.buildKey([3, 2, 1]);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it("should handle empty array", () => {
      const key = CacheStore.buildKey([]);
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
    });

    it("should handle empty object", () => {
      const key = CacheStore.buildKey({});
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
    });

    it("should handle nested arrays and objects", () => {
      const complex = {
        arr: [1, 2, { nested: true }],
        obj: { a: [1, 2], b: { c: 3 } },
      };

      const key1 = CacheStore.buildKey(complex);
      const key2 = CacheStore.buildKey(complex);

      expect(key1).toBe(key2);
    });

    it("should be consistent with different key order", () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, b: 2, a: 1 };

      const key1 = CacheStore.buildKey(obj1);
      const key2 = CacheStore.buildKey(obj2);

      expect(key1).toBe(key2);
    });

    it("should handle special numeric values", () => {
      // NaN 序列化为 null
      const keyNaN = CacheStore.buildKey({ val: NaN });
      const keyNull = CacheStore.buildKey({ val: null });

      // NaN 和 null 序列化结果相同
      expect(keyNaN).toBe(keyNull);
    });
  });

  describe("delete edge cases", () => {
    beforeEach(() => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
    });

    it("should handle deleting non-existent key", () => {
      expect(store.delete("non-existent")).toBe(false);
    });

    it("should handle deleting same key twice", () => {
      store.set("key1", { data: "test" });

      expect(store.delete("key1")).toBe(true);
      expect(store.delete("key1")).toBe(false);
    });

    it("should handle deleting with special characters", () => {
      const specialKey = "key🚀特殊字符'; DROP TABLE cache; --";
      store.set(specialKey, { data: "test" });

      expect(store.delete(specialKey)).toBe(true);
      expect(store.get(specialKey)).toBeNull();
    });
  });

  describe("clear edge cases", () => {
    beforeEach(() => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
    });

    it("should handle clearing empty cache", () => {
      store.clear();
      expect(store.size()).toBe(0);
    });

    it("should handle clearing cache with entries", () => {
      store.set("key1", { a: 1 });
      store.set("key2", { b: 2 });
      store.clear();

      expect(store.size()).toBe(0);
      expect(store.get("key1")).toBeNull();
      expect(store.get("key2")).toBeNull();
    });
  });

  describe("getStats edge cases", () => {
    beforeEach(() => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
    });

    it("should return correct stats after many operations", () => {
      // 多次命中和未命中
      store.set("key1", { data: "test" });

      for (let i = 0; i < 10; i++) {
        store.get("key1"); // 命中
        store.get(`non-existent-${i}`); // 未命中
      }

      const stats = store.getStats();
      expect(stats.hits).toBe(10);
      expect(stats.misses).toBe(10);
      expect(stats.hitRate).toBe(0.5);
    });

    it("should handle all misses", () => {
      for (let i = 0; i < 10; i++) {
        store.get(`non-existent-${i}`);
      }

      const stats = store.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(10);
      expect(stats.hitRate).toBe(0);
    });

    it("should handle all hits", () => {
      store.set("key1", { data: "test" });

      for (let i = 0; i < 10; i++) {
        store.get("key1");
      }

      const stats = store.getStats();
      expect(stats.hits).toBe(10);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1);
    });
  });

  describe("database file edge cases", () => {
    it("should create database file if not exists", () => {
      const newDbPath = path.join(os.tmpdir(), `new_cache_${Date.now()}.sqlite`);
      expect(fs.existsSync(newDbPath)).toBe(false);

      store = new CacheStore({ dbPath: newDbPath, maxEntries: 5 });
      store.set("key1", { data: "test" });

      expect(fs.existsSync(newDbPath)).toBe(true);

      store.close();
      fs.unlinkSync(newDbPath);
    });

    it("should handle existing database file", () => {
      // 创建第一个 store
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      store.set("key1", { data: "original" });
      store.close();

      // 创建第二个 store 使用相同的数据库文件
      const store2 = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      const result = store2.get("key1");

      expect(result).toEqual({ data: "original" });
      store2.close();
    });
  });

  describe("getStats edge cases", () => {
    beforeEach(() => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
    });

    it("should return correct stats after many operations", () => {
      store.set("key1", { data: "test1" });
      store.set("key2", { data: "test2" });

      const stats = store.getStats();

      expect(stats.entries).toBe(2);
      expect(stats.maxEntries).toBe(5);
      expect(stats.dbSizeBytes).toBeGreaterThan(0);
    });

    it("should track hits and misses", () => {
      store.set("key1", { data: "test" });

      // Hit
      store.get("key1");
      // Miss
      store.get("non-existent");

      const stats = store.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5);
    });

    it("should track 24h stats", () => {
      store.set("key1", { data: "test" });

      // Multiple hits and misses
      store.get("key1");
      store.get("key1");
      store.get("non-existent");

      const stats = store.getStats();

      expect(stats.hits24h).toBe(2);
      expect(stats.misses24h).toBe(1);
      expect(stats.hitRate24h).toBeCloseTo(0.667, 2);
    });

    it("should calculate correct hit rate", () => {
      store.set("key1", { data: "test" });

      // 3 hits, 1 miss
      store.get("key1");
      store.get("key1");
      store.get("key1");
      store.get("non-existent");

      const stats = store.getStats();

      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.75);
    });

    it("should return zero hit rate when no requests", () => {
      const stats = store.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe("TTL expiration", () => {
    beforeEach(() => {
      store = new CacheStore({ dbPath: testDbPath, maxEntries: 5, ttl: 1 }); // 1 秒过期
    });

    it("should return null for expired entry", async () => {
      store.set("key1", { data: "test" });

      // 立即获取应该命中
      expect(store.get("key1")).toEqual({ data: "test" });

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 过期后应该返回 null
      expect(store.get("key1")).toBeNull();
    });

    it("should track expired entries in stats", async () => {
      store.set("key1", { data: "test1" });
      store.set("key2", { data: "test2" });

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const stats = store.getStats();
      expect(stats.expiredEntries).toBe(2);
    });

    it("should return 0 expired entries when no TTL set", () => {
      const noTtlStore = new CacheStore({ dbPath: testDbPath, maxEntries: 5 });
      noTtlStore.set("key1", { data: "test" });

      const stats = noTtlStore.getStats();
      expect(stats.expiredEntries).toBe(0);

      noTtlStore.close();
    });

    it("should delete expired entry on get", async () => {
      store.set("key1", { data: "test" });

      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 获取过期条目应该删除它
      expect(store.get("key1")).toBeNull();
      expect(store.size()).toBe(0);
    });

    it("should not return expired entry after many gets", async () => {
      store.set("key1", { data: "test" });

      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 多次获取过期条目
      for (let i = 0; i < 5; i++) {
        expect(store.get("key1")).toBeNull();
      }

      // 未命中计数应该正确增加
      const stats = store.getStats();
      expect(stats.misses).toBe(5);
    });

    it("should handle TTL with update", async () => {
      store.set("key1", { data: "test1" });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // 更新条目，应该重置创建时间
      store.set("key1", { data: "test2" });

      await new Promise((resolve) => setTimeout(resolve, 600));

      // 总共 1.1 秒，但更新后只过了 0.6 秒，应该还能命中
      expect(store.get("key1")).toEqual({ data: "test2" });
    });

    it("should handle very short TTL", async () => {
      const shortTtlStore = new CacheStore({ dbPath: testDbPath, maxEntries: 5, ttl: 0.01 }); // 10ms

      shortTtlStore.set("key1", { data: "test" });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(shortTtlStore.get("key1")).toBeNull();
      shortTtlStore.close();
    });

    it("should handle very long TTL", () => {
      const longTtlStore = new CacheStore({ dbPath: testDbPath, maxEntries: 5, ttl: 86400 }); // 1 天

      longTtlStore.set("key1", { data: "test" });
      expect(longTtlStore.get("key1")).toEqual({ data: "test" });

      const stats = longTtlStore.getStats();
      expect(stats.expiredEntries).toBe(0);

      longTtlStore.close();
    });

    it("should increment miss count for expired entry", async () => {
      store.set("key1", { data: "test" });

      // 先命中一次
      store.get("key1");

      await new Promise((resolve) => setTimeout(resolve, 1100));

      // 过期后获取应该是未命中
      store.get("key1");

      const stats = store.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });
});
