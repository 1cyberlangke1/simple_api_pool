/**
 * GroupCacheManager 单元测试
 * @description 测试分组缓存管理功能
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { GroupCacheManager, type GroupCacheConfig } from "../src/core/group_cache.js";

const TEST_DB_PATH = path.join(__dirname, "test_group_cache.sqlite");

function createManager(): GroupCacheManager {
  return new GroupCacheManager(TEST_DB_PATH, { maxEntries: 100 });
}

function cleanup() {
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  } catch {
    // ignore
  }
}

describe("GroupCacheManager", () => {
  let manager: GroupCacheManager;

  beforeEach(() => {
    cleanup();
    manager = createManager();
  });

  afterEach(() => {
    manager.close();
    cleanup();
  });

  describe("registerGroup", () => {
    it("should register a group with config", () => {
      const config: GroupCacheConfig = { maxEntries: 50, ttl: 3600 };
      manager.registerGroup("test-group", config);

      const retrieved = manager.getConfig("test-group");
      expect(retrieved.maxEntries).toBe(50);
      expect(retrieved.ttl).toBe(3600);
    });

    it("should return default config for unregistered group", () => {
      const config = manager.getConfig("unknown-group");
      expect(config.maxEntries).toBe(100); // default
    });
  });

  describe("buildKey", () => {
    it("should generate consistent key for same payload", () => {
      const payload = { model: "gpt-4", messages: [{ role: "user", content: "hello" }] };
      const key1 = manager.buildKey("group1", payload);
      const key2 = manager.buildKey("group1", payload);
      expect(key1).toBe(key2);
    });

    it("should generate different keys for different groups", () => {
      const payload = { model: "gpt-4" };
      const key1 = manager.buildKey("group1", payload);
      const key2 = manager.buildKey("group2", payload);
      expect(key1).not.toBe(key2);
      expect(key1.startsWith("group1:")).toBe(true);
      expect(key2.startsWith("group2:")).toBe(true);
    });

    it("should generate different keys for different payloads", () => {
      const payload1 = { model: "gpt-4" };
      const payload2 = { model: "gpt-3.5" };
      const key1 = manager.buildKey("group1", payload1);
      const key2 = manager.buildKey("group1", payload2);
      expect(key1).not.toBe(key2);
    });
  });

  describe("set and get", () => {
    it("should store and retrieve cache entry", () => {
      manager.registerGroup("test-group", { maxEntries: 100 });

      const key = manager.buildKey("test-group", { prompt: "hello" });
      const data = { response: "world", tokens: 10 };

      manager.set("test-group", key, data);
      const retrieved = manager.get("test-group", key);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.response).toBe("world");
      expect(retrieved?.tokens).toBe(10);
    });

    it("should return null for non-existent key", () => {
      manager.registerGroup("test-group", { maxEntries: 100 });
      const retrieved = manager.get("test-group", "non-existent-key");
      expect(retrieved).toBeNull();
    });

    it("should track hit and miss stats", () => {
      manager.registerGroup("test-group", { maxEntries: 100 });

      const key = manager.buildKey("test-group", { prompt: "test" });
      manager.set("test-group", key, { data: "test" });

      // Hit
      manager.get("test-group", key);
      // Miss
      manager.get("test-group", "non-existent");

      const stats = manager.getStats("test-group");
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe("TTL expiration", () => {
    it("should expire entries after TTL", async () => {
      manager.registerGroup("test-group", { maxEntries: 100, ttl: 1 }); // 1 second TTL

      const key = manager.buildKey("test-group", { prompt: "test" });
      manager.set("test-group", key, { data: "test" });

      // Should exist immediately
      expect(manager.get("test-group", key)).not.toBeNull();

      // Wait for TTL
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be expired
      expect(manager.get("test-group", key)).toBeNull();
    });

    it("should count expired entries", async () => {
      manager.registerGroup("test-group", { maxEntries: 100, ttl: 1 });

      const key = manager.buildKey("test-group", { prompt: "test" });
      manager.set("test-group", key, { data: "test" });

      // Wait for TTL
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const stats = manager.getStats("test-group");
      expect(stats.expiredEntries).toBe(1);
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used entries when maxEntries exceeded", () => {
      manager.registerGroup("test-group", { maxEntries: 3 });

      // Add 3 entries
      for (let i = 0; i < 3; i++) {
        const key = manager.buildKey("test-group", { index: i });
        manager.set("test-group", key, { data: i });
      }

      expect(manager.size("test-group")).toBe(3);

      // Access first entry (makes it recently used)
      const key0 = manager.buildKey("test-group", { index: 0 });
      manager.get("test-group", key0);

      // Add 4th entry, should evict the least recently used
      const key3 = manager.buildKey("test-group", { index: 3 });
      manager.set("test-group", key3, { data: 3 });

      expect(manager.size("test-group")).toBe(3);

      // Entry 0 should still exist (was accessed)
      expect(manager.get("test-group", key0)).not.toBeNull();
    });
  });

  describe("clearGroup", () => {
    it("should clear only the specified group", () => {
      manager.registerGroup("group1", { maxEntries: 100 });
      manager.registerGroup("group2", { maxEntries: 100 });

      const key1 = manager.buildKey("group1", { test: 1 });
      const key2 = manager.buildKey("group2", { test: 1 });

      manager.set("group1", key1, { data: 1 });
      manager.set("group2", key2, { data: 2 });

      manager.clearGroup("group1");

      expect(manager.size("group1")).toBe(0);
      expect(manager.size("group2")).toBe(1);
    });
  });

  describe("clearAll", () => {
    it("should clear all groups", () => {
      manager.registerGroup("group1", { maxEntries: 100 });
      manager.registerGroup("group2", { maxEntries: 100 });

      manager.set("group1", manager.buildKey("group1", { test: 1 }), { data: 1 });
      manager.set("group2", manager.buildKey("group2", { test: 2 }), { data: 2 });

      manager.clearAll();

      expect(manager.size("group1")).toBe(0);
      expect(manager.size("group2")).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should return stats for registered group", () => {
      manager.registerGroup("test-group", { maxEntries: 50, ttl: 3600 });

      const key = manager.buildKey("test-group", { test: 1 });
      manager.set("test-group", key, { data: 1 });

      const stats = manager.getStats("test-group");

      expect(stats.groupName).toBe("test-group");
      expect(stats.entries).toBe(1);
      expect(stats.maxEntries).toBe(50);
      expect(stats.ttl).toBe(3600);
    });
  });

  describe("getAllStats", () => {
    it("should return stats for all registered groups", () => {
      manager.registerGroup("group1", { maxEntries: 10 });
      manager.registerGroup("group2", { maxEntries: 20 });

      manager.set("group1", manager.buildKey("group1", { test: 1 }), { data: 1 });
      manager.set("group2", manager.buildKey("group2", { test: 2 }), { data: 2 });

      const allStats = manager.getAllStats();

      expect(allStats).toHaveLength(2);
      expect(allStats.find((s) => s.groupName === "group1")?.maxEntries).toBe(10);
      expect(allStats.find((s) => s.groupName === "group2")?.maxEntries).toBe(20);
    });
  });

  describe("persistence", () => {
    it("should persist data across manager instances", () => {
      manager.registerGroup("test-group", { maxEntries: 100 });

      const key = manager.buildKey("test-group", { test: "persist" });
      manager.set("test-group", key, { data: "persistent" });
      manager.close();

      // Create new manager with same DB
      const manager2 = createManager();
      manager2.registerGroup("test-group", { maxEntries: 100 });

      const retrieved = manager2.get("test-group", key);
      expect(retrieved?.data).toBe("persistent");

      manager2.close();
    });
  });
});
