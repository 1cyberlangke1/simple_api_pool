import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";

/**
 * 注册缓存统计相关路由
 */
export function registerCacheRoutes(app: FastifyInstance, adminToken: string): void {
  // 获取缓存统计信息
  app.get(
    "/api/cache/stats",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!app.runtime.cacheStore) {
        return reply.send({
          enabled: false,
          stats: null,
        });
      }

      const stats = app.runtime.cacheStore.getStats();
      return reply.send({
        enabled: true,
        stats,
      });
    }
  );

  // 清空缓存
  app.delete(
    "/api/cache",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!app.runtime.cacheStore) {
        return reply.status(400).send({ error: "Cache is not enabled" });
      }

      app.runtime.cacheStore.clear();
      return reply.send({ status: "ok", message: "Cache cleared" });
    }
  );
}
