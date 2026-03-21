import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PerformanceMonitor, getPerformanceMonitor, resetPerformanceMonitor } from "../src/core/performance.js";

/**
 * PerformanceMonitor 单元测试
 * @description 测试性能监控功能
 */
describe("PerformanceMonitor", () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    resetPerformanceMonitor();
    monitor = new PerformanceMonitor({
      slowRequestThreshold: 100,
      windowSeconds: 60,
      maxRecords: 100,
      logSlowRequests: false,
    });
  });

  afterEach(() => {
    resetPerformanceMonitor();
  });

  describe("recordRequest", () => {
    it("should record a request", () => {
      monitor.recordRequest("/test", "GET", 50, true);

      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
    });

    it("should record failed requests", () => {
      monitor.recordRequest("/test", "GET", 50, false);

      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.successRequests).toBe(0);
      expect(metrics.failedRequests).toBe(1);
    });

    it("should track slow requests", () => {
      monitor.recordRequest("/test", "GET", 150, true);

      const metrics = monitor.getMetrics();
      expect(metrics.slowRequests).toBe(1);
    });

    it("should limit records to maxRecords", () => {
      const smallMonitor = new PerformanceMonitor({ maxRecords: 5 });

      for (let i = 0; i < 10; i++) {
        smallMonitor.recordRequest("/test", "GET", 10, true);
      }

      const metrics = smallMonitor.getMetrics();
      expect(metrics.totalRequests).toBe(5);
    });
  });

  describe("getMetrics", () => {
    it("should return empty metrics initially", () => {
      const metrics = monitor.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.avgResponseTime).toBe(0);
      expect(metrics.maxResponseTime).toBe(0);
      expect(metrics.minResponseTime).toBe(0);
    });

    it("should calculate average response time", () => {
      monitor.recordRequest("/test", "GET", 100, true);
      monitor.recordRequest("/test", "GET", 200, true);
      monitor.recordRequest("/test", "GET", 300, true);

      const metrics = monitor.getMetrics();
      expect(metrics.avgResponseTime).toBe(200);
    });

    it("should track max and min response time", () => {
      monitor.recordRequest("/test", "GET", 100, true);
      monitor.recordRequest("/test", "GET", 500, true);
      monitor.recordRequest("/test", "GET", 200, true);

      const metrics = monitor.getMetrics();
      expect(metrics.maxResponseTime).toBe(500);
      expect(metrics.minResponseTime).toBe(100);
    });

    it("should calculate percentiles", () => {
      // 添加 100 个请求，响应时间从 1 到 100
      for (let i = 1; i <= 100; i++) {
        monitor.recordRequest("/test", "GET", i, true);
      }

      const metrics = monitor.getMetrics();
      expect(metrics.p95ResponseTime).toBeGreaterThanOrEqual(90);
      expect(metrics.p99ResponseTime).toBeGreaterThanOrEqual(95);
    });

    it("should include memory info", () => {
      const metrics = monitor.getMetrics();

      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.heapUsed).toBeGreaterThan(0);
      expect(metrics.memory.heapTotal).toBeGreaterThan(0);
    });

    it("should include uptime", () => {
      const metrics = monitor.getMetrics();

      expect(metrics.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getRouteMetrics", () => {
    it("should group by route", () => {
      monitor.recordRequest("/test1", "GET", 100, true);
      monitor.recordRequest("/test1", "GET", 200, true);
      monitor.recordRequest("/test2", "POST", 300, true);

      const routes = monitor.getRouteMetrics();

      expect(routes).toHaveLength(2);
      const test1Route = routes.find((r) => r.route === "/test1");
      expect(test1Route?.count).toBe(2);
    });

    it("should calculate route average time", () => {
      monitor.recordRequest("/test", "GET", 100, true);
      monitor.recordRequest("/test", "GET", 200, true);

      const routes = monitor.getRouteMetrics();
      const testRoute = routes.find((r) => r.route === "/test");

      expect(testRoute?.avgTime).toBe(150);
    });

    it("should track errors per route", () => {
      monitor.recordRequest("/test", "GET", 100, true);
      monitor.recordRequest("/test", "GET", 100, false);
      monitor.recordRequest("/test", "GET", 100, false);

      const routes = monitor.getRouteMetrics();
      const testRoute = routes.find((r) => r.route === "/test");

      expect(testRoute?.errors).toBe(2);
    });

    it("should sort by count descending", () => {
      monitor.recordRequest("/test1", "GET", 100, true);
      monitor.recordRequest("/test2", "GET", 100, true);
      monitor.recordRequest("/test2", "GET", 100, true);
      monitor.recordRequest("/test2", "GET", 100, true);

      const routes = monitor.getRouteMetrics();

      expect(routes[0]?.route).toBe("/test2");
      expect(routes[0]?.count).toBe(3);
    });
  });

  describe("reset", () => {
    it("should clear all records", () => {
      monitor.recordRequest("/test", "GET", 100, true);
      monitor.recordRequest("/test", "GET", 200, true);

      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(0);
    });
  });

  describe("time window", () => {
    it("should only count records within window", async () => {
      const shortWindowMonitor = new PerformanceMonitor({ windowSeconds: 0.1 });

      shortWindowMonitor.recordRequest("/test", "GET", 100, true);

      // 等待时间窗口过期
      await new Promise((resolve) => setTimeout(resolve, 150));

      const metrics = shortWindowMonitor.getMetrics();
      expect(metrics.totalRequests).toBe(0);
    });
  });
});

describe("getPerformanceMonitor", () => {
  beforeEach(() => {
    resetPerformanceMonitor();
  });

  afterEach(() => {
    resetPerformanceMonitor();
  });

  it("should return singleton instance", () => {
    const monitor1 = getPerformanceMonitor();
    const monitor2 = getPerformanceMonitor();

    expect(monitor1).toBe(monitor2);
  });

  it("should reset singleton", () => {
    const monitor1 = getPerformanceMonitor();
    resetPerformanceMonitor();
    const monitor2 = getPerformanceMonitor();

    expect(monitor1).not.toBe(monitor2);
  });
});
