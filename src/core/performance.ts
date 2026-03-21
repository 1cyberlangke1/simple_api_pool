/**
 * 性能监控模块
 * @description 提供请求性能监控和指标收集功能
 * @module performance
 */

import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("performance");

// ============================================================
// 类型定义
// ============================================================

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  /** 总请求数 */
  totalRequests: number;
  /** 成功请求数 */
  successRequests: number;
  /** 失败请求数 */
  failedRequests: number;
  /** 平均响应时间（毫秒） */
  avgResponseTime: number;
  /** 最大响应时间（毫秒） */
  maxResponseTime: number;
  /** 最小响应时间（毫秒） */
  minResponseTime: number;
  /** P95 响应时间（毫秒） */
  p95ResponseTime: number;
  /** P99 响应时间（毫秒） */
  p99ResponseTime: number;
  /** 慢请求数量（超过阈值） */
  slowRequests: number;
  /** 慢请求阈值（毫秒） */
  slowRequestThreshold: number;
  /** 内存使用情况 */
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  /** 运行时间（秒） */
  uptime: number;
  /** 统计时间窗口（秒） */
  windowSeconds: number;
}

/**
 * 路由性能指标
 */
export interface RouteMetrics {
  /** 路由路径 */
  route: string;
  /** 请求方法 */
  method: string;
  /** 请求数量 */
  count: number;
  /** 平均响应时间 */
  avgTime: number;
  /** 最大响应时间 */
  maxTime: number;
  /** 错误数量 */
  errors: number;
}

/**
 * 性能监控器配置
 */
export interface PerformanceMonitorConfig {
  /** 慢请求阈值（毫秒，默认 1000） */
  slowRequestThreshold?: number;
  /** 统计时间窗口（秒，默认 60） */
  windowSeconds?: number;
  /** 最大保留的响应时间记录数（默认 1000） */
  maxRecords?: number;
  /** 是否启用慢请求日志 */
  logSlowRequests?: boolean;
}

/**
 * 请求记录
 */
interface RequestRecord {
  /** 响应时间（毫秒） */
  time: number;
  /** 时间戳 */
  timestamp: number;
  /** 是否成功 */
  success: boolean;
  /** 路由路径 */
  route: string;
  /** 请求方法 */
  method: string;
}

// ============================================================
// 性能监控器类
// ============================================================

/**
 * 性能监控器
 * @description 收集和分析请求性能指标
 */
export class PerformanceMonitor {
  private slowRequestThreshold: number;
  private windowSeconds: number;
  private maxRecords: number;
  private logSlowRequests: boolean;
  private records: RequestRecord[] = [];
  private startTime: number;

  constructor(config: PerformanceMonitorConfig = {}) {
    this.slowRequestThreshold = config.slowRequestThreshold ?? 1000;
    this.windowSeconds = config.windowSeconds ?? 60;
    this.maxRecords = config.maxRecords ?? 1000;
    this.logSlowRequests = config.logSlowRequests ?? true;
    this.startTime = Date.now();
  }

  /**
   * 记录请求
   * @param route 路由路径
   * @param method 请求方法
   * @param responseTime 响应时间（毫秒）
   * @param success 是否成功
   */
  recordRequest(route: string, method: string, responseTime: number, success: boolean): void {
    const record: RequestRecord = {
      time: responseTime,
      timestamp: Date.now(),
      success,
      route,
      method,
    };

    this.records.push(record);

    // 限制记录数量
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }

    // 慢请求告警
    if (this.logSlowRequests && responseTime > this.slowRequestThreshold) {
      log.warn(
        { route, method, responseTime, threshold: this.slowRequestThreshold },
        "Slow request detected"
      );
    }
  }

  /**
   * 获取性能指标
   */
  getMetrics(): PerformanceMetrics {
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;

    // 过滤时间窗口内的记录
    const windowRecords = this.records.filter((r) => r.timestamp >= windowStart);

    const totalRequests = windowRecords.length;
    const successRequests = windowRecords.filter((r) => r.success).length;
    const failedRequests = totalRequests - successRequests;

    const times = windowRecords.map((r) => r.time);
    const avgResponseTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const maxResponseTime = times.length > 0 ? Math.max(...times) : 0;
    const minResponseTime = times.length > 0 ? Math.min(...times) : 0;

    // 计算百分位
    const sortedTimes = [...times].sort((a, b) => a - b);
    const p95ResponseTime = this.percentile(sortedTimes, 95);
    const p99ResponseTime = this.percentile(sortedTimes, 99);

    const slowRequests = windowRecords.filter((r) => r.time > this.slowRequestThreshold).length;

    const memoryUsage = process.memoryUsage();

    return {
      totalRequests,
      successRequests,
      failedRequests,
      avgResponseTime: Math.round(avgResponseTime * 100) / 100,
      maxResponseTime,
      minResponseTime: totalRequests > 0 ? minResponseTime : 0,
      p95ResponseTime,
      p99ResponseTime,
      slowRequests,
      slowRequestThreshold: this.slowRequestThreshold,
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
      uptime: Math.floor((now - this.startTime) / 1000),
      windowSeconds: this.windowSeconds,
    };
  }

  /**
   * 获取路由性能指标
   */
  getRouteMetrics(): RouteMetrics[] {
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;
    const windowRecords = this.records.filter((r) => r.timestamp >= windowStart);

    // 按路由分组
    const routeMap = new Map<string, RouteMetrics>();

    for (const record of windowRecords) {
      const key = `${record.method} ${record.route}`;
      const existing = routeMap.get(key);

      if (existing) {
        existing.count++;
        existing.maxTime = Math.max(existing.maxTime, record.time);
        existing.avgTime = (existing.avgTime * (existing.count - 1) + record.time) / existing.count;
        if (!record.success) {
          existing.errors++;
        }
      } else {
        routeMap.set(key, {
          route: record.route,
          method: record.method,
          count: 1,
          avgTime: record.time,
          maxTime: record.time,
          errors: record.success ? 0 : 1,
        });
      }
    }

    return Array.from(routeMap.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.records = [];
    this.startTime = Date.now();
    log.info("Performance metrics reset");
  }

  /**
   * 计算百分位数
   * @param sorted 排序后的数组
   * @param percentile 百分位（0-100）
   */
  private percentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }
}

// ============================================================
// 单例实例
// ============================================================

let _instance: PerformanceMonitor | null = null;

/**
 * 获取性能监控器单例
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!_instance) {
    _instance = new PerformanceMonitor();
  }
  return _instance;
}

/**
 * 重置单例（用于测试）
 */
export function resetPerformanceMonitor(): void {
  _instance = null;
}
