/**
 * 提供商管理路由
 * @description 提供提供商的增删改查接口，支持级联删除和获取上游模型列表
 * @module routes/admin/providers_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ProviderConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";
import { createModuleLogger, type Logger } from "../../core/logger.js";

const log: Logger = createModuleLogger("providers");

/**
 * 注册提供商管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerProvidersRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 列出所有提供商
   * @route GET /api/providers
   * @returns 提供商配置数组
   */
  app.get(
    "/api/providers",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(app.runtime.config.providers);
    }
  );

  /**
   * 添加提供商
   * @route POST /api/providers
   * @param body 提供商配置
   * @returns 操作状态
   * @throws 400 如果提供商已存在
   */
  app.post<{ Body: ProviderConfig }>(
    "/api/providers",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: ProviderConfig }>, reply: FastifyReply) => {
      const existing = app.runtime.config.providers.find((p) => p.name === request.body.name);
      if (existing) {
        log.warn({ providerName: request.body.name }, "Provider already exists");
        return reply.status(400).send({ error: "provider already exists" });
      }
      app.runtime.config.providers.push(request.body);
      try {
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:provider:changed", { action: "add", name: request.body.name });
        log.info({ providerName: request.body.name, baseUrl: request.body.baseUrl }, "Provider added");
        return reply.send({ status: "ok" });
      } catch (err) {
        // 回滚：从数组中移除
        const idx = app.runtime.config.providers.findIndex((p) => p.name === request.body.name);
        if (idx !== -1) {
          app.runtime.config.providers.splice(idx, 1);
        }
        log.error({ providerName: request.body.name, error: err instanceof Error ? err.message : String(err) }, "Failed to add provider");
        return reply.status(400).send({ error: err instanceof Error ? err.message : "Validation failed" });
      }
    }
  );

  /**
   * 更新提供商
   * @route PUT /api/providers/:name
   * @param name 提供商名称
   * @param body 新的提供商配置
   * @returns 操作状态
   * @throws 404 如果提供商不存在
   */
  app.put<{ Params: { name: string }; Body: ProviderConfig }>(
    "/api/providers/:name",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string }; Body: ProviderConfig }>, reply: FastifyReply) => {
      const idx = app.runtime.config.providers.findIndex((p) => p.name === request.params.name);
      if (idx === -1) {
        log.warn({ providerName: request.params.name }, "Provider not found for update");
        return reply.status(404).send({ error: "provider not found" });
      }
      const oldConfig = app.runtime.config.providers[idx];
      app.runtime.config.providers[idx] = request.body;
      try {
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:provider:changed", { action: "update", name: request.params.name });
        log.info({ providerName: request.params.name, baseUrl: request.body.baseUrl }, "Provider updated");
        return reply.send({ status: "ok" });
      } catch (err) {
        // 回滚：恢复旧配置
        app.runtime.config.providers[idx] = oldConfig;
        log.error({ providerName: request.params.name, error: err instanceof Error ? err.message : String(err) }, "Failed to update provider");
        return reply.status(400).send({ error: err instanceof Error ? err.message : "Validation failed" });
      }
    }
  );

  /**
   * 删除提供商（级联删除）
   * @route DELETE /api/providers/:name
   * @param name 提供商名称
   * @returns 操作状态和删除统计
   * @behavior
   * - 删除提供商配置
   * - 级联删除关联的模型配置
   * - 级联删除关联的 Key
   * - 清理分组中引用该提供商模型的路由
   */
  app.delete<{ Params: { name: string } }>(
    "/api/providers/:name",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const providerName = request.params.name;
      const idx = app.runtime.config.providers.findIndex((p) => p.name === providerName);
      if (idx === -1) {
        log.warn({ providerName }, "Provider not found for deletion");
        return reply.status(404).send({ error: "provider not found" });
      }
      // 删除提供商
      app.runtime.config.providers.splice(idx, 1);
      // 级联删除关联的模型（先计算要删除的数量）
      const deletedModelsCount = app.runtime.config.models.filter((m) => m.provider === providerName).length;
      app.runtime.config.models = app.runtime.config.models.filter((m) => m.provider !== providerName);
      // 级联删除关联的 Key
      const keysToDelete = app.runtime.keyStore.listKeys().filter((k) => k.provider === providerName);
      for (const key of keysToDelete) {
        app.runtime.keyStore.deleteKey(key.alias);
      }
      // 从配置中也移除这些 Key
      app.runtime.config.keys = app.runtime.config.keys.filter((k) => k.provider !== providerName);
      // 清理分组中引用该提供商模型的路由
      let deletedGroupRoutes = 0;
      for (const group of app.runtime.config.groups) {
        const originalLength = group.routes.length;
        group.routes = group.routes.filter((r) => !r.modelId.startsWith(`${providerName}/`));
        deletedGroupRoutes += originalLength - group.routes.length;
      }
      // 删除空的分组（路由全部被清理）
      const deletedGroups = app.runtime.config.groups.filter((g) => g.routes.length === 0).length;
      app.runtime.config.groups = app.runtime.config.groups.filter((g) => g.routes.length > 0);
      try {
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:provider:changed", { action: "delete", name: providerName });
        if (deletedModelsCount > 0) {
          app.runtime.eventEmitter.emit("config:model:changed", { action: "delete", count: deletedModelsCount });
        }
        if (keysToDelete.length > 0) {
          app.runtime.eventEmitter.emit("config:key:changed", { action: "delete", count: keysToDelete.length });
        }
        if (deletedGroupRoutes > 0 || deletedGroups > 0) {
          app.runtime.eventEmitter.emit("config:group:changed", { action: "update", deletedRoutes: deletedGroupRoutes, deletedGroups });
        }
        log.info(
          { providerName, deletedModels: deletedModelsCount, deletedKeys: keysToDelete.length, deletedGroupRoutes, deletedGroups },
          "Provider deleted"
        );
        return reply.send({
          status: "ok",
          deletedModels: deletedModelsCount,
          deletedKeys: keysToDelete.length,
          deletedGroupRoutes,
          deletedGroups,
        });
      } catch (err) {
        log.error({ providerName, error: err instanceof Error ? err.message : String(err) }, "Failed to reset after provider deletion");
        // 即使验证失败，提供商也已从内存删除，返回成功
        return reply.send({
          status: "ok",
          deletedModels: deletedModelsCount,
          deletedKeys: keysToDelete.length,
          deletedGroupRoutes,
          deletedGroups,
        });
      }
    }
  );

  /**
   * 获取上游提供商的模型列表
   * @route GET /api/providers/:name/upstream-models
   * @param name 提供商名称
   * @returns 上游支持的模型列表
   * @throws 404 如果提供商不存在
   * @throws 400 如果没有可用的 Key
   * @behavior 使用该提供商的 Key 调用上游 /models 端点获取模型列表
   */
  app.get<{ Params: { name: string } }>(
    "/api/providers/:name/upstream-models",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const providerName = request.params.name;
      const provider = app.runtime.config.providers.find((p) => p.name === providerName);
      if (!provider) {
        return reply.status(404).send({ error: "provider not found" });
      }

      try {
        // 获取该提供商的可用 Key
        const keyState = app.runtime.keyStore.pickKey(providerName, "round_robin");
        if (!keyState) {
          return reply.status(400).send({ error: "No available key for this provider" });
        }

        // 调用上游 /models 端点
        const response = await fetch(`${provider.baseUrl}/models`, {
          headers: {
            Authorization: `Bearer ${keyState.key}`,
          },
        });

        if (!response.ok) {
          return reply.status(response.status).send({ error: `Upstream error: ${response.statusText}` });
        }

        const data = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> };
        const models = (data.data || []).map((m) => ({
          id: m.id,
          owned_by: m.owned_by,
        }));

        return reply.send({ models });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return reply.status(500).send({ error: message });
      }
    }
  );
}
