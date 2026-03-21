/**
 * useDashboardData 测试
 * @description 测试仪表盘数据管理 Composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";
import axios from "axios";
import {
  getKeys,
  getCacheStats,
  getStatsChart,
  getConfig,
} from "@/api/types";
import { useDashboardData } from "./useDashboardData";

// Mock axios
vi.mock("axios");

// Mock API 函数
vi.mock("@/api/types", () => ({
  getKeys: vi.fn(),
  getCacheStats: vi.fn(),
  getStatsChart: vi.fn(),
  getConfig: vi.fn(),
}));

describe("useDashboardData", () => {
  let dashboardData: ReturnType<typeof useDashboardData>;

  beforeEach(() => {
    vi.clearAllMocks();
    dashboardData = useDashboardData();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("初始状态", () => {
    it("stats 初始值应为零", () => {
      expect(dashboardData.stats.providers).toBe(0);
      expect(dashboardData.stats.models).toBe(0);
      expect(dashboardData.stats.keys).toBe(0);
      expect(dashboardData.stats.groups).toBe(0);
    });

    it("health 初始状态应为 ok", () => {
      expect(dashboardData.health.status).toBe("ok");
      expect(dashboardData.health.timestamp).toBe("");
      expect(dashboardData.health.startTime).toBe("");
      expect(dashboardData.health.groups).toEqual([]);
    });

    it("keys 初始应为空数组", () => {
      expect(dashboardData.keys.value).toEqual([]);
    });

    it("cacheStats 初始值应正确", () => {
      expect(dashboardData.cacheStats.value.enabled).toBe(false);
      expect(dashboardData.cacheStats.value.stats).toEqual([]);
      expect(dashboardData.cacheStats.value.dbSizeBytes).toBe(0);
    });

    it("chartHours 初始应为 24", () => {
      expect(dashboardData.chartHours.value).toBe(24);
    });
  });

  describe("fetchHealth", () => {
    it("应该正确获取健康状态数据", async () => {
      const mockData = {
        status: "healthy",
        timestamp: "2024-01-15T10:00:00Z",
        startTime: "2024-01-15T08:00:00Z",
        groups: ["group1", "group2"],
      };
      vi.mocked(axios.get).mockResolvedValueOnce({ data: mockData });

      await dashboardData.fetchHealth();

      expect(axios.get).toHaveBeenCalledWith("/health");
      expect(dashboardData.health.status).toBe("healthy");
      expect(dashboardData.health.timestamp).toBe("2024-01-15T10:00:00Z");
      expect(dashboardData.health.startTime).toBe("2024-01-15T08:00:00Z");
      expect(dashboardData.health.groups).toEqual(["group1", "group2"]);
      expect(dashboardData.stats.groups).toBe(2);
    });

    it("应该处理缺少字段的情况", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });

      await dashboardData.fetchHealth();

      expect(dashboardData.health.status).toBe("ok");
      expect(dashboardData.health.timestamp).toBe("");
      expect(dashboardData.health.groups).toEqual([]);
    });

    it("应该处理请求错误", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network error"));

      await dashboardData.fetchHealth();

      expect(dashboardData.health.status).toBe("error");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("fetchKeys", () => {
    it("应该正确获取 Key 列表", async () => {
      const mockKeys = [
        { alias: "key1", provider: "openai", key: "sk-xxx", usedToday: 10, remainingTotal: null },
      ];
      vi.mocked(getKeys).mockResolvedValueOnce({ data: mockKeys } as any);

      await dashboardData.fetchKeys();

      expect(getKeys).toHaveBeenCalled();
      expect(dashboardData.keys.value).toEqual(mockKeys);
    });

    it("应该处理请求错误", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(getKeys).mockRejectedValueOnce(new Error("API error"));

      await dashboardData.fetchKeys();

      expect(dashboardData.keys.value).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("fetchCacheStats", () => {
    it("应该正确获取缓存统计", async () => {
      const mockStats = {
        enabled: true,
        stats: [{ groupName: "default", entries: 100 }],
        dbSizeBytes: 1024,
      };
      vi.mocked(getCacheStats).mockResolvedValueOnce({ data: mockStats } as any);

      await dashboardData.fetchCacheStats();

      expect(getCacheStats).toHaveBeenCalled();
      expect(dashboardData.cacheStats.value).toEqual(mockStats);
    });

    it("应该处理请求错误", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(getCacheStats).mockRejectedValueOnce(new Error("API error"));

      await dashboardData.fetchCacheStats();

      expect(dashboardData.cacheStats.value).toEqual({
        enabled: false,
        stats: [],
        dbSizeBytes: 0,
      });
      consoleSpy.mockRestore();
    });
  });

  describe("fetchChartStats", () => {
    it("应该正确获取图表数据", async () => {
      const mockChartData = {
        timeline: ["10:00", "11:00"],
        groups: ["group1"],
        groupData: {},
        summary: [],
      };
      vi.mocked(getStatsChart).mockResolvedValueOnce({ data: mockChartData } as any);

      await dashboardData.fetchChartStats();

      expect(getStatsChart).toHaveBeenCalledWith(24);
      expect(dashboardData.chartData.value).toEqual(mockChartData);
    });

    it("应该使用 chartHours 值查询", async () => {
      dashboardData.chartHours.value = 48;
      vi.mocked(getStatsChart).mockResolvedValueOnce({ data: {} } as any);

      await dashboardData.fetchChartStats();

      expect(getStatsChart).toHaveBeenCalledWith(48);
    });

    it("应该处理请求错误", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(getStatsChart).mockRejectedValueOnce(new Error("API error"));

      await dashboardData.fetchChartStats();

      expect(dashboardData.chartData.value).toEqual({
        timeline: [],
        groups: [],
        groupData: {},
        summary: [],
      });
      consoleSpy.mockRestore();
    });
  });

  describe("fetchConfig", () => {
    it("应该正确更新统计数据", async () => {
      const mockConfig = {
        providers: [{ name: "openai" }],
        models: [{ name: "gpt-4" }, { name: "gpt-3.5" }],
        keys: [{ alias: "key1" }],
        groups: [{ name: "default" }],
      };
      vi.mocked(getConfig).mockResolvedValueOnce({ data: mockConfig } as any);

      await dashboardData.fetchConfig();

      expect(dashboardData.stats.providers).toBe(1);
      expect(dashboardData.stats.models).toBe(2);
      expect(dashboardData.stats.keys).toBe(1);
      expect(dashboardData.stats.groups).toBe(1);
    });

    it("应该处理空配置", async () => {
      vi.mocked(getConfig).mockResolvedValueOnce({ data: {} } as any);

      await dashboardData.fetchConfig();

      expect(dashboardData.stats.providers).toBe(0);
      expect(dashboardData.stats.models).toBe(0);
      expect(dashboardData.stats.keys).toBe(0);
      expect(dashboardData.stats.groups).toBe(0);
    });

    it("应该处理请求错误", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(getConfig).mockRejectedValueOnce(new Error("API error"));

      await dashboardData.fetchConfig();

      // 状态应保持不变
      expect(dashboardData.stats.providers).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  describe("fetchAll", () => {
    it("应该并发调用所有获取方法", async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: {} });
      vi.mocked(getKeys).mockResolvedValueOnce({ data: [] } as any);
      vi.mocked(getCacheStats).mockResolvedValueOnce({ data: { enabled: false, stats: [], dbSizeBytes: 0 } } as any);
      vi.mocked(getStatsChart).mockResolvedValueOnce({ data: {} } as any);
      vi.mocked(getConfig).mockResolvedValueOnce({ data: {} } as any);

      await dashboardData.fetchAll();

      expect(axios.get).toHaveBeenCalledWith("/health");
      expect(getKeys).toHaveBeenCalled();
      expect(getCacheStats).toHaveBeenCalled();
      expect(getStatsChart).toHaveBeenCalled();
      expect(getConfig).toHaveBeenCalled();
    });
  });
});
