/**
 * 分组管理路由
 * @description 提供模型分组的增删改查接口，分组用于实现模型池和负载均衡
 * @module routes/admin/groups_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GroupConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";
import { createModuleLogger, type Logger } from "../../core/logger.js";

const log: Logger = createModuleLogger("groups");

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
        log.warn({ groupName: request.body.name }, "Group already exists");
        return reply.status(400).send({ error: "group already exists" });
      }
      app.runtime.config.groups.push(request.body);

      try {
        // 刷新运行时以更新 modelRegistry
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:group:changed", { action: "add", name: request.body.name });
      } catch (err) {
        // reset 失败时回滚并记录错误
        app.runtime.config.groups.pop();
        log.error({ err, groupName: request.body.name }, "Failed to reset runtime after adding group");
        return reply.status(400).send({ error: err instanceof Error ? err.message : "Validation failed" });
      }

      log.info(
        { groupName: request.body.name, strategy: request.body.strategy, routesCount: request.body.routes.length },
        "Group added"
      );
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
        log.warn({ groupName: request.params.name }, "Group not found for update");
        return reply.status(404).send({ error: "group not found" });
      }

      const oldGroup = app.runtime.config.groups[idx];
      app.runtime.config.groups[idx] = request.body;

      try {
        // 刷新运行时以更新 modelRegistry
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:group:changed", { action: "update", name: request.params.name });
      } catch (err) {
        // reset 失败时回滚
        app.runtime.config.groups[idx] = oldGroup;
        log.error({ err, groupName: request.params.name }, "Failed to reset runtime after updating group");
        return reply.status(400).send({ error: err instanceof Error ? err.message : "Validation failed" });
      }

      log.info(
        { groupName: request.params.name, strategy: request.body.strategy, routesCount: request.body.routes.length },
        "Group updated"
      );
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
        log.warn({ groupName: request.params.name }, "Group not found for deletion");
        return reply.status(404).send({ error: "group not found" });
      }

      app.runtime.config.groups.splice(idx, 1);

      try {
        // 刷新运行时以更新 modelRegistry
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:group:changed", { action: "delete", name: request.params.name });
      } catch (err) {
        // reset 失败时记录错误但仍返回成功（分组已从内存中删除）
        log.error({ err, groupName: request.params.name }, "Failed to reset runtime after deleting group");
      }

      log.info({ groupName: request.params.name }, "Group deleted");
      return reply.send({ status: "ok" });
    }
  );
}
