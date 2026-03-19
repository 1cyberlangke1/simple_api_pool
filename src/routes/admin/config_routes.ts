/**
 * 配置管理路由
 * @description 提供配置的查询和更新接口
 * @module routes/admin/config_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AppConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";

/**
 * 注册配置相关路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerConfigRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 获取当前配置
   * @route GET /api/config
   * @returns 完整的应用配置对象
   */
  app.get(
    "/api/config",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(app.runtime.config);
    }
  );

  /**
   * 更新配置
   * @route PUT /api/config
   * @param body 新的配置对象
   * @returns 更新状态
   * @behavior
   * - 重置运行时状态
   * - 重新加载工具
   * - 触发配置更新回调
   */
  app.put<{ Body: AppConfig }>(
    "/api/config",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: AppConfig }>, reply: FastifyReply) => {
      app.runtime.reset(request.body);
      await app.runtime.loadTools();
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({ status: "ok" });
    }
  );
}
