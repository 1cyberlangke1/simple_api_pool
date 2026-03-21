/**
 * Key 使用状态存储测试
 * @description 测试 Key 使用状态的持久化和日期重置逻辑
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { KeyUsageStore, KeyUsageRecord } from "../src/core/key_usage_store.js";

describe("KeyUsageStore", () => {
  let tempDir: string;
  let dbPath: string;
  let store: KeyUsageStore;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `key-usage-store-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    dbPath = path.join(tempDir, "key_usage.sqlite");
    store = new KeyUsageStore(dbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("基本操作", () => {
    it("get 返回 null 对于不存在的 key", () => {
      const result = store.get("nonexistent");
      expect(result).toBeNull();
    });

    it("set 和 get 正常工作", () => {
      const data = {
        dailyCount: 5,
        dailyResetDate: getCurrentDate(),
        totalCost: 0.05,
      };

      store.set("my-key", data);
      const result = store.get("my-key");

      expect(result).not.toBeNull();
      expect(result?.alias).toBe("my-key");
      expect(result?.dailyCount).toBe(5);
      expect(result?.totalCost).toBe(0.05);
    });

    it("set 更新已存在的记录", () => {
      store.set("my-key", {
        dailyCount: 5,
        dailyResetDate: getCurrentDate(),
        totalCost: 0.05,
      });

      store.set("my-key", {
        dailyCount: 10,
        dailyResetDate: getCurrentDate(),
        totalCost: 0.10,
      });

      const result = store.get("my-key");
      expect(result?.dailyCount).toBe(10);
      expect(result?.totalCost).toBe(0.10);
    });

    it("delete 删除记录", () => {
      store.set("my-key", {
        dailyCount: 5,
        dailyResetDate: getCurrentDate(),
        totalCost: 0.05,
      });

      store.delete("my-key");
      const result = store.get("my-key");

      expect(result).toBeNull();
    });
  });

  describe("日期重置逻辑", () => {
    it("日期相同时返回存储的 dailyCount", () => {
      const today = getCurrentDate();
      store.set("my-key", {
        dailyCount: 10,
        dailyResetDate: today,
        totalCost: 0.05,
      });

      const result = store.get("my-key");
      expect(result?.dailyCount).toBe(10);
    });

    it("日期不同时重置 dailyCount 为 0", () => {
      // 使用一个过去的日期
      store.set("my-key", {
        dailyCount: 10,
        dailyResetDate: "2020-01-01", // 过去的日期
        totalCost: 0.05,
      });

      const result = store.get("my-key");
      expect(result?.dailyCount).toBe(0);
      expect(result?.dailyResetDate).toBe(getCurrentDate());
    });

    it("totalCost 在日期重置后保持不变", () => {
      store.set("my-key", {
        dailyCount: 10,
        dailyResetDate: "2020-01-01",
        totalCost: 0.50,
      });

      const result = store.get("my-key");
      expect(result?.totalCost).toBe(0.50);
    });
  });

  describe("getAll 操作", () => {
    it("getAll 返回空数组当没有记录", () => {
      const result = store.getAll();
      expect(result).toEqual([]);
    });

    it("getAll 返回所有记录", () => {
      const today = getCurrentDate();
      store.set("key1", { dailyCount: 1, dailyResetDate: today, totalCost: 0.01 });
      store.set("key2", { dailyCount: 2, dailyResetDate: today, totalCost: 0.02 });

      const result = store.getAll();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.alias)).toContain("key1");
      expect(result.map((r) => r.alias)).toContain("key2");
    });

    it("getAll 正确处理日期重置", () => {
      store.set("key1", {
        dailyCount: 100,
        dailyResetDate: "2020-01-01",
        totalCost: 1.00,
      });

      const result = store.getAll();

      expect(result[0].dailyCount).toBe(0);
      expect(result[0].totalCost).toBe(1.00);
    });
  });

  describe("持久化", () => {
    it("数据在重新打开后仍然存在", () => {
      const today = getCurrentDate();
      store.set("persist-key", {
        dailyCount: 42,
        dailyResetDate: today,
        totalCost: 0.42,
      });

      // 关闭并重新打开
      store.close();
      store = new KeyUsageStore(dbPath);

      const result = store.get("persist-key");
      expect(result?.dailyCount).toBe(42);
      expect(result?.totalCost).toBe(0.42);
    });
  });

  describe("边界条件", () => {
    it("处理零值", () => {
      store.set("zero-key", {
        dailyCount: 0,
        dailyResetDate: getCurrentDate(),
        totalCost: 0,
      });

      const result = store.get("zero-key");
      expect(result?.dailyCount).toBe(0);
      expect(result?.totalCost).toBe(0);
    });

    it("处理大数值", () => {
      store.set("big-key", {
        dailyCount: 1000000,
        dailyResetDate: getCurrentDate(),
        totalCost: 999999.99,
      });

      const result = store.get("big-key");
      expect(result?.dailyCount).toBe(1000000);
      expect(result?.totalCost).toBeCloseTo(999999.99);
    });

    it("处理特殊字符的 alias", () => {
      const alias = "key-with-special_chars.123";
      store.set(alias, {
        dailyCount: 5,
        dailyResetDate: getCurrentDate(),
        totalCost: 0.05,
      });

      const result = store.get(alias);
      expect(result?.alias).toBe(alias);
    });

    it("处理空 alias", () => {
      store.set("", {
        dailyCount: 5,
        dailyResetDate: getCurrentDate(),
        totalCost: 0.05,
      });

      const result = store.get("");
      expect(result?.alias).toBe("");
    });
  });
});

/**
 * 获取当前日期字符串
 * @returns YYYY-MM-DD 格式
 */
function getCurrentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
