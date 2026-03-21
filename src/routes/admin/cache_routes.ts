/**
 * 缓存管理路由
 * @description 提供分组级别的缓存统计和管理接口
 * @module routes/admin/cache_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";

/**
 * 注册缓存统计相关路由
 */
export function registerCacheRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 获取所有分组缓存统计信息
   * @route GET /api/cache/stats
   * @returns 缓存统计数组
   */
  app.get(
    "/api/cache/stats",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = app.runtime.groupCacheManager.getAllStats();
      const dbSize = app.runtime.groupCacheManager.getDbSize();
      return reply.send({
        enabled: true,
        dbSizeBytes: dbSize,
        stats,
      });
    }
  );

  /**
   * 获取单个分组缓存统计信息
   * @route GET /api/cache/stats/:groupName
   * @returns 缓存统计
   */
  app.get<{ Params: { groupName: string } }>(
    "/api/cache/stats/:groupName",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { groupName: string } }>, reply: FastifyReply) => {
      const { groupName } = request.params;
      
      // 检查分组是否启用了缓存
      const group = app.runtime.config.groups.find((g: { name: string; features?: { cache?: { enable: boolean } } }) => g.name === groupName);
      const cacheConfig = group?.features?.cache;

      if (!cacheConfig?.enable) {
        return reply.send({
          enabled: false,
          groupName,
          stats: null,
        });
      }

      // 确保分组已注册
      app.runtime.ensureGroupCacheRegistered(groupName);
      const stats = app.runtime.groupCacheManager.getStats(groupName);
      
      return reply.send({
        enabled: true,
        stats,
      });
    }
  );

  /**
   * 清空所有缓存
   * @route DELETE /api/cache
   * @returns 操作状态
   */
  app.delete(
    "/api/cache",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      app.runtime.groupCacheManager.clearAll();
      return reply.send({ status: "ok", message: "All caches cleared" });
    }
  );

  /**
   * 清空指定分组缓存
   * @route DELETE /api/cache/:groupName
   * @returns 操作状态
   */
  app.delete<{ Params: { groupName: string } }>(
    "/api/cache/:groupName",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { groupName: string } }>, reply: FastifyReply) => {
      const { groupName } = request.params;
      
      app.runtime.groupCacheManager.clearGroup(groupName);
      return reply.send({ status: "ok", message: `Cache for group "${groupName}" cleared` });
    }
  );
}
