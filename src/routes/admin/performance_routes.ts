/**
 * 性能监控路由
 * @description 提供性能指标查询 API
 */

import type { FastifyInstance } from "fastify";
import { getPerformanceMonitor } from "../../core/performance.js";

/**
 * 注册性能监控路由
 * @param app Fastify 实例
 * @param _adminToken 管理员令牌（暂不使用）
 */
export function registerPerformanceRoutes(app: FastifyInstance, _adminToken: string): void {
  const monitor = getPerformanceMonitor();

  /**
   * 获取性能指标
   */
  app.get("/api/performance/metrics", async (_request, reply) => {
    const metrics = monitor.getMetrics();
    return reply.send({
      success: true,
      data: metrics,
    });
  });

  /**
   * 获取路由性能指标
   */
  app.get("/api/performance/routes", async (_request, reply) => {
    const routes = monitor.getRouteMetrics();
    return reply.send({
      success: true,
      data: routes,
    });
  });

  /**
   * 重置性能统计
   */
  app.post("/api/performance/reset", async (_request, reply) => {
    monitor.reset();
    return reply.send({
      success: true,
      message: "Performance metrics reset",
    });
  });
}
