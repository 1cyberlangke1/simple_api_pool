/**
 * 仪表盘数据管理
 * @description 封装仪表盘的数据获取和状态管理
 */

import { ref, reactive, type Ref } from "vue";
import axios from "axios";
import {
  getKeys,
  getCacheStats,
  getStatsChart,
  getConfig,
  type KeyState,
  type CacheStatsResponse,
  type ChartData,
} from "@/api/types";

/**
 * 统计数据
 */
export interface StatsData {
  providers: number;
  models: number;
  keys: number;
  groups: number;
}

/**
 * 健康状态数据
 */
export interface HealthData {
  status: string;
  timestamp: string;
  startTime: string;
  groups: string[];
}

/**
 * 仪表盘数据返回类型
 */
export interface UseDashboardDataReturn {
  stats: StatsData;
  health: HealthData;
  keys: Ref<KeyState[]>;
  cacheStats: Ref<CacheStatsResponse>;
  chartData: Ref<ChartData>;
  chartHours: Ref<number>;
  fetchHealth: () => Promise<void>;
  fetchKeys: () => Promise<void>;
  fetchCacheStats: () => Promise<void>;
  fetchChartStats: () => Promise<void>;
  fetchConfig: () => Promise<void>;
  fetchAll: () => Promise<void>;
}

/**
 * 仪表盘数据管理 Composable
 * @description 管理仪表盘所需的所有数据获取和状态
 * @returns 数据状态和获取方法
 */
export function useDashboardData(): UseDashboardDataReturn {
  // 统计数据
  const stats = reactive<StatsData>({
    providers: 0,
    models: 0,
    keys: 0,
    groups: 0,
  });

  // 健康状态
  const health = reactive<HealthData>({
    status: "ok",
    timestamp: "",
    startTime: "",
    groups: [],
  });

  // Key 列表
  const keys = ref<KeyState[]>([]);

  // 缓存统计
  const cacheStats = ref<CacheStatsResponse>({
    enabled: false,
    stats: [],
    dbSizeBytes: 0,
  });

  // 图表数据
  const chartHours = ref(24);
  const chartData = ref<ChartData>({
    timeline: [],
    groups: [],
    groupData: {},
    summary: [],
  });

  /**
   * 获取健康状态
   * @description 通过 /health 端点获取服务健康状态
   */
  async function fetchHealth(): Promise<void> {
    try {
      const { data } = await axios.get("/health");
      health.status = data.status ?? "ok";
      health.timestamp = data.timestamp ?? "";
      health.startTime = data.startTime ?? "";
      health.groups = data.groups ?? [];
      // 同步更新统计
      stats.groups = health.groups.length;
    } catch {
      health.status = "error";
    }
  }

  /**
   * 获取 Key 列表
   */
  async function fetchKeys(): Promise<void> {
    try {
      const response = await getKeys();
      keys.value = response.data;
    } catch {
      keys.value = [];
    }
  }

  /**
   * 获取缓存统计
   */
  async function fetchCacheStats(): Promise<void> {
    try {
      const response = await getCacheStats();
      cacheStats.value = response.data;
    } catch {
      cacheStats.value = { enabled: false, stats: [], dbSizeBytes: 0 };
    }
  }

  /**
   * 获取图表数据
   */
  async function fetchChartStats(): Promise<void> {
    try {
      const response = await getStatsChart(chartHours.value);
      chartData.value = response.data;
    } catch {
      chartData.value = { timeline: [], groups: [], groupData: {}, summary: [] };
    }
  }

  /**
   * 获取配置（更新统计）
   */
  async function fetchConfig(): Promise<void> {
    try {
      const response = await getConfig();
      const config = response.data;
      stats.providers = config.providers?.length ?? 0;
      stats.models = config.models?.length ?? 0;
      stats.keys = config.keys?.length ?? 0;
      stats.groups = config.groups?.length ?? 0;
    } catch {
      // 忽略错误
    }
  }

  /**
   * 获取所有数据
   */
  async function fetchAll(): Promise<void> {
    await Promise.all([
      fetchHealth(),
      fetchKeys(),
      fetchCacheStats(),
      fetchChartStats(),
      fetchConfig(),
    ]);
  }

  return {
    stats,
    health,
    keys,
    cacheStats,
    chartData,
    chartHours,
    fetchHealth,
    fetchKeys,
    fetchCacheStats,
    fetchChartStats,
    fetchConfig,
    fetchAll,
  };
}