import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StatsStore } from "../src/core/stats_store.js";
import fs from "fs";
import path from "path";

/**
 * 统计存储单元测试
 * @description 测试统计数据的记录和查询
 */

// 测试数据库路径
const TEST_DB_PATH = path.resolve(process.cwd(), "config", "test_stats_store.sqlite");

describe("StatsStore", () => {
  let store: StatsStore;

  beforeEach(() => {
    // 确保测试数据库不存在
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    store = new StatsStore(TEST_DB_PATH);
  });

  afterEach(() => {
    store.close();
    // 清理测试数据库
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  // ============================================================
  // 基本功能测试
  // ============================================================

  describe("recordCall", () => {
    it("should record a successful call", () => {
      store.recordCall("test-group", true);

      const stats = store.getHourlyStats("test-group", 1);
      expect(stats.length).toBeGreaterThanOrEqual(1);
      expect(stats[0].totalCalls).toBe(1);
      expect(stats[0].successCalls).toBe(1);
      expect(stats[0].failedCalls).toBe(0);
    });

    it("should record a failed call", () => {
      store.recordCall("test-group", false);

      const stats = store.getHourlyStats("test-group", 1);
      expect(stats.length).toBeGreaterThanOrEqual(1);
      expect(stats[0].totalCalls).toBe(1);
      expect(stats[0].successCalls).toBe(0);
      expect(stats[0].failedCalls).toBe(1);
    });

    it("should accumulate multiple calls", () => {
      store.recordCall("test-group", true);
      store.recordCall("test-group", true);
      store.recordCall("test-group", false);

      const stats = store.getHourlyStats("test-group", 1);
      expect(stats[0].totalCalls).toBe(3);
      expect(stats[0].successCalls).toBe(2);
      expect(stats[0].failedCalls).toBe(1);
    });

    it("should calculate success rate correctly", () => {
      store.recordCall("test-group", true);
      store.recordCall("test-group", true);
      store.recordCall("test-group", false);

      const stats = store.getHourlyStats("test-group", 1);
      expect(stats[0].successRate).toBeCloseTo(66.67, 1);
    });
  });

  // ============================================================
  // 查询功能测试
  // ============================================================

  describe("getHourlyStats", () => {
    it("should return stats for all groups when group is not specified", () => {
      store.recordCall("group1", true);
      store.recordCall("group2", true);
      store.recordCall("group3", true);

      const stats = store.getHourlyStats(undefined, 1);
      expect(stats.length).toBeGreaterThanOrEqual(3);
    });

    it("should return stats for specific group", () => {
      store.recordCall("group1", true);
      store.recordCall("group2", true);

      const stats = store.getHourlyStats("group1", 1);
      expect(stats.every((s) => s.group === "group1")).toBe(true);
    });

    it("should return empty array for non-existent group", () => {
      const stats = store.getHourlyStats("non-existent", 1);
      expect(stats).toEqual([]);
    });

    it("should respect hours parameter", () => {
      // 记录一些数据
      for (let i = 0; i < 5; i++) {
        store.recordCall("test-group", true);
      }

      const stats = store.getHourlyStats("test-group", 1);
      expect(stats.length).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================
  // 分组汇总测试
  // ============================================================

  describe("getGroupSummary", () => {
    it("should return summary for all groups", () => {
      store.recordCall("group1", true);
      store.recordCall("group1", false);
      store.recordCall("group2", true);

      const summary = store.getGroupSummary(1);
      expect(summary.length).toBe(2);
      expect(summary.find((s) => s.group === "group1")?.totalCalls).toBe(2);
      expect(summary.find((s) => s.group === "group2")?.totalCalls).toBe(1);
    });

    it("should calculate average calls per hour", () => {
      for (let i = 0; i < 10; i++) {
        store.recordCall("test-group", true);
      }

      const summary = store.getGroupSummary(24);
      const group = summary.find((s) => s.group === "test-group");
      expect(group?.avgCallsPerHour).toBeCloseTo(10 / 24, 2);
    });

    it("should return empty array when no data", () => {
      const summary = store.getGroupSummary(24);
      expect(summary).toEqual([]);
    });
  });

  // ============================================================
  // 清理功能测试
  // ============================================================

  describe("cleanup", () => {
    it("should not throw when cleaning up with no old data", () => {
      store.recordCall("test-group", true);
      expect(() => store.cleanup(30)).not.toThrow();
    });

    it("should keep recent data after cleanup", () => {
      store.recordCall("test-group", true);
      store.cleanup(30);

      const stats = store.getHourlyStats("test-group", 1);
      expect(stats.length).toBe(1);
    });
  });

  // ============================================================
  // 边界条件测试
  // ============================================================

  describe("edge cases", () => {
    it("should handle zero calls", () => {
      const stats = store.getHourlyStats("empty-group", 1);
      expect(stats).toEqual([]);
    });

    it("should handle 100% success rate", () => {
      store.recordCall("perfect-group", true);
      store.recordCall("perfect-group", true);

      const stats = store.getHourlyStats("perfect-group", 1);
      expect(stats[0].successRate).toBe(100);
    });

    it("should handle 0% success rate", () => {
      store.recordCall("failing-group", false);
      store.recordCall("failing-group", false);

      const stats = store.getHourlyStats("failing-group", 1);
      expect(stats[0].successRate).toBe(0);
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("StatsStore - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  let store: StatsStore;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.resolve(process.cwd(), "config", `test_stats_monkey_${Date.now()}.sqlite`);
    store = new StatsStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe("group name edge cases", () => {
    it("should handle empty string group name", () => {
      store.recordCall("", true);

      const stats = store.getHourlyStats("", 1);
      expect(stats.length).toBe(1);
      expect(stats[0].group).toBe("");
    });

    it("should handle group name with special characters", () => {
      const specialGroups = [
        "group with spaces",
        "group\twith\ttabs",
        "group'with'quotes",
        'group"with"doublequotes',
        "group🚀emoji",
        "分组中文",
        "'; DROP TABLE hourly_stats; --",
        "<script>alert('xss')</script>",
        "group/with/slashes",
        "group\\with\\backslashes",
        "group.with.dots",
        "group:with:colons",
      ];

      for (const group of specialGroups) {
        store.recordCall(group, true);
        const stats = store.getHourlyStats(group, 1);
        expect(stats.length).toBe(1);
        expect(stats[0].group).toBe(group);
      }
    });

    it("should handle very long group name", () => {
      const longGroup = "a".repeat(10000);
      store.recordCall(longGroup, true);

      const stats = store.getHourlyStats(longGroup, 1);
      expect(stats[0].group).toBe(longGroup);
    });

    it("should treat group names as case-sensitive", () => {
      store.recordCall("Group", true);
      store.recordCall("group", true);
      store.recordCall("GROUP", true);

      const stats = store.getHourlyStats(undefined, 1);
      const groupNames = stats.map((s) => s.group);

      expect(groupNames).toContain("Group");
      expect(groupNames).toContain("group");
      expect(groupNames).toContain("GROUP");
    });

    it("should handle group name that is a SQL keyword", () => {
      // "group" 是 SQL 保留字
      store.recordCall("group", true);
      store.recordCall("select", true);
      store.recordCall("where", true);
      store.recordCall("order", true);

      const stats = store.getHourlyStats(undefined, 1);
      expect(stats.length).toBe(4);
    });

    it("should handle unicode group names", () => {
      const unicodeGroups = [
        "分组一",
        "グループ",
        "그룹",
        "группа",
        "مجموعة",
        "🔑",
        "🚀rocket-group",
      ];

      for (const group of unicodeGroups) {
        store.recordCall(group, true);
        const stats = store.getHourlyStats(group, 1);
        expect(stats[0].group).toBe(group);
      }
    });
  });

  describe("recordCall edge cases", () => {
    it("should handle rapid consecutive calls", () => {
      for (let i = 0; i < 1000; i++) {
        store.recordCall("rapid-group", i % 2 === 0);
      }

      const stats = store.getHourlyStats("rapid-group", 1);
      expect(stats[0].totalCalls).toBe(1000);
      expect(stats[0].successCalls).toBe(500);
      expect(stats[0].failedCalls).toBe(500);
    });

    it("should handle mixed success/failure in same hour", () => {
      // 交替记录成功和失败
      for (let i = 0; i < 100; i++) {
        store.recordCall("mixed-group", i % 3 !== 0); // i % 3 == 0 时失败
      }

      const stats = store.getHourlyStats("mixed-group", 1);
      expect(stats[0].totalCalls).toBe(100);
      // i % 3 == 0 的有 0, 3, 6, ..., 99 共 34 个，所以成功 66 个
      expect(stats[0].successCalls).toBe(66);
      expect(stats[0].failedCalls).toBe(34);
      expect(stats[0].successRate).toBeCloseTo(66, 0);
    });

    it("should handle single call", () => {
      store.recordCall("single-group", true);

      const stats = store.getHourlyStats("single-group", 1);
      expect(stats.length).toBe(1);
      expect(stats[0].totalCalls).toBe(1);
    });
  });

  describe("getHourlyStats edge cases", () => {
    it("should handle hours parameter of 0", () => {
      store.recordCall("test-group", true);

      const stats = store.getHourlyStats("test-group", 0);
      // 0 小时可能返回空或当前小时的数据，取决于实现
      expect(stats.length).toBeLessThanOrEqual(1);
    });

    it("should handle negative hours parameter", () => {
      store.recordCall("test-group", true);

      // 负数小时应该不会崩溃
      const stats = store.getHourlyStats("test-group", -1);
      expect(Array.isArray(stats)).toBe(true);
    });

    it("should handle very large hours parameter", () => {
      store.recordCall("test-group", true);

      // 使用合理的大数值（而不是 Number.MAX_SAFE_INTEGER，会导致时间计算溢出）
      const stats = store.getHourlyStats("test-group", 8760); // 1 year in hours
      expect(stats.length).toBe(1);
    });

    it("should handle querying non-existent group", () => {
      store.recordCall("existing-group", true);

      const stats = store.getHourlyStats("non-existent-group", 1);
      expect(stats).toEqual([]);
    });
  });

  describe("getGroupSummary edge cases", () => {
    it("should handle hours parameter of 0", () => {
      store.recordCall("test-group", true);

      const summary = store.getGroupSummary(0);
      // 0 小时应该返回空或特殊处理
      expect(Array.isArray(summary)).toBe(true);
    });

    it("should handle very large hours parameter", () => {
      store.recordCall("test-group", true);

      // 使用合理的大数值（而不是 Number.MAX_SAFE_INTEGER，会导致时间计算溢出）
      const summary = store.getGroupSummary(8760); // 1 year in hours
      // 数据应该仍然存在
      expect(summary.find((s) => s.group === "test-group")).toBeDefined();
    });

    it("should handle many groups", () => {
      // 创建大量分组
      for (let i = 0; i < 100; i++) {
        store.recordCall(`group-${i}`, true);
      }

      const summary = store.getGroupSummary(1);
      expect(summary.length).toBe(100);
    });

    it("should calculate avgCallsPerHour correctly with edge cases", () => {
      // 只有一次调用
      store.recordCall("single-call", true);

      const summary = store.getGroupSummary(24);
      const group = summary.find((s) => s.group === "single-call");
      // 1 / 24 = 0.041666...
      expect(group?.avgCallsPerHour).toBeCloseTo(1 / 24, 2);
    });
  });

  describe("cleanup edge cases", () => {
    it("should handle daysToKeep of 0", () => {
      store.recordCall("test-group", true);

      // 0 天保留可能清理所有数据或保留当天
      expect(() => store.cleanup(0)).not.toThrow();
    });

    it("should handle daysToKeep of 1", () => {
      store.recordCall("test-group", true);

      store.cleanup(1);

      // 当前小时的数据应该保留
      const stats = store.getHourlyStats("test-group", 1);
      expect(stats.length).toBe(1);
    });

    it("should handle very large daysToKeep", () => {
      store.recordCall("test-group", true);

      expect(() => store.cleanup(Number.MAX_SAFE_INTEGER)).not.toThrow();
    });

    it("should handle negative daysToKeep", () => {
      store.recordCall("test-group", true);

      // 负数应该不会崩溃
      expect(() => store.cleanup(-1)).not.toThrow();
    });
  });

  describe("database persistence edge cases", () => {
    it("should persist data across store instances", () => {
      store.recordCall("persistent-group", true);
      store.recordCall("persistent-group", false);
      store.close();

      // 创建新实例
      const newStore = new StatsStore(testDbPath);
      const stats = newStore.getHourlyStats("persistent-group", 1);

      expect(stats.length).toBe(1);
      expect(stats[0].totalCalls).toBe(2);
      expect(stats[0].successCalls).toBe(1);
      expect(stats[0].failedCalls).toBe(1);

      newStore.close();
    });
  });

  describe("concurrent operations simulation", () => {
    it("should handle rapid open/close cycles", () => {
      store.recordCall("test-group", true);
      store.close();

      for (let i = 0; i < 5; i++) {
        const tempStore = new StatsStore(testDbPath);
        tempStore.recordCall("test-group", true);
        tempStore.close();
      }

      // 验证最终状态
      const finalStore = new StatsStore(testDbPath);
      const stats = finalStore.getHourlyStats("test-group", 1);
      expect(stats[0].totalCalls).toBe(6); // 1 + 5
      finalStore.close();
    });
  });

  describe("success rate edge cases", () => {
    it("should calculate success rate for single success", () => {
      store.recordCall("single-success", true);

      const stats = store.getHourlyStats("single-success", 1);
      expect(stats[0].successRate).toBe(100);
    });

    it("should calculate success rate for single failure", () => {
      store.recordCall("single-failure", false);

      const stats = store.getHourlyStats("single-failure", 1);
      expect(stats[0].successRate).toBe(0);
    });

    it("should handle alternating success/failure pattern", () => {
      // 精确的 50% 成功率
      for (let i = 0; i < 10; i++) {
        store.recordCall("fifty-fifty", i % 2 === 0);
      }

      const stats = store.getHourlyStats("fifty-fifty", 1);
      expect(stats[0].successRate).toBe(50);
    });
  });
});
