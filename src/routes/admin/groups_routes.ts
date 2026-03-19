/**
 * 分组管理路由
 * @description 提供模型分组的增删改查接口，分组用于实现模型池和负载均衡
 * @module routes/admin/groups_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GroupConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";

/**
 * 注册分组管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerGroupsRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 列出所有分组
   * @route GET /api/groups
   * @returns 分组配置数组
   */
  app.get(
    "/api/groups",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(app.runtime.config.groups);
    }
  );

  /**
   * 添加分组
   * @route POST /api/groups
   * @param body 分组配置
   * @returns 操作状态
   * @throws 400 如果分组已存在
   */
  app.post<{ Body: GroupConfig }>(
    "/api/groups",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: GroupConfig }>, reply: FastifyReply) => {
      const existing = app.runtime.config.groups.find((g) => g.name === request.body.name);
      if (existing) {
        return reply.status(400).send({ error: "group already exists" });
      }
      app.runtime.config.groups.push(request.body);
      // 刷新运行时以更新 modelRegistry
      app.runtime.reset(app.runtime.config);
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({ status: "ok" });
    }
  );

  /**
   * 更新分组
   * @route PUT /api/groups/:name
   * @param name 分组名称
   * @param body 新的分组配置
   * @returns 操作状态
   * @throws 404 如果分组不存在
   */
  app.put<{ Params: { name: string }; Body: GroupConfig }>(
    "/api/groups/:name",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string }; Body: GroupConfig }>, reply: FastifyReply) => {
      const idx = app.runtime.config.groups.findIndex((g) => g.name === request.params.name);
      if (idx === -1) {
        return reply.status(404).send({ error: "group not found" });
      }
      app.runtime.config.groups[idx] = request.body;
      // 刷新运行时以更新 modelRegistry
      app.runtime.reset(app.runtime.config);
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({ status: "ok" });
    }
  );

  /**
   * 删除分组
   * @route DELETE /api/groups/:name
   * @param name 分组名称
   * @returns 操作状态
   * @throws 404 如果分组不存在
   */
  app.delete<{ Params: { name: string } }>(
    "/api/groups/:name",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const idx = app.runtime.config.groups.findIndex((g) => g.name === request.params.name);
      if (idx === -1) {
        return reply.status(404).send({ error: "group not found" });
      }
      app.runtime.config.groups.splice(idx, 1);
      // 刷新运行时以更新 modelRegistry
      app.runtime.reset(app.runtime.config);
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({ status: "ok" });
    }
  );
}
