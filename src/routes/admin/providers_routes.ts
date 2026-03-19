/**
 * 提供商管理路由
 * @description 提供提供商的增删改查接口，支持级联删除和获取上游模型列表
 * @module routes/admin/providers_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ProviderConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";

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
        return reply.status(400).send({ error: "provider already exists" });
      }
      app.runtime.config.providers.push(request.body);
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({ status: "ok" });
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
        return reply.status(404).send({ error: "provider not found" });
      }
      app.runtime.config.providers[idx] = request.body;
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({ status: "ok" });
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
   */
  app.delete<{ Params: { name: string } }>(
    "/api/providers/:name",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const providerName = request.params.name;
      const idx = app.runtime.config.providers.findIndex((p) => p.name === providerName);
      if (idx === -1) {
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
      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({
        status: "ok",
        deletedModels: deletedModelsCount,
        deletedKeys: keysToDelete.length,
      });
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
