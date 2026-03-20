/**
 * 模型管理路由
 * @description 提供模型的增删改查接口，支持获取模型能力和价格
 * @module routes/admin/models_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { ModelConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";
import { modelPricingService } from "../../core/model_pricing.js";
import { createModuleLogger, type Logger } from "../../core/logger.js";

const log: Logger = createModuleLogger("models");

/**
 * 注册模型管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerModelsRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 列出所有模型
   * @route GET /api/models
   * @returns 模型配置数组
   */
  app.get(
    "/api/models",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(app.runtime.config.models);
    }
  );

  /**
   * 添加模型
   * @route POST /api/models
   * @param body 模型配置
   * @returns 操作状态
   * @throws 400 如果模型已存在
   */
  app.post<{ Body: ModelConfig }>(
    "/api/models",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: ModelConfig }>, reply: FastifyReply) => {
      const existing = app.runtime.config.models.find(
        (m) => m.name === request.body.name && m.provider === request.body.provider
      );
      if (existing) {
        log.warn({ modelName: request.body.name, provider: request.body.provider }, "Model already exists");
        return reply.status(400).send({ error: "model already exists" });
      }
      app.runtime.config.models.push(request.body);
      try {
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:model:changed", { action: "add", name: request.body.name, provider: request.body.provider });
        log.info({ modelName: request.body.name, provider: request.body.provider, model: request.body.model }, "Model added");
        return reply.send({ status: "ok" });
      } catch (err) {
        // 回滚：从数组中移除
        const idx = app.runtime.config.models.findIndex(
          (m) => m.name === request.body.name && m.provider === request.body.provider
        );
        if (idx !== -1) {
          app.runtime.config.models.splice(idx, 1);
        }
        log.error({ modelName: request.body.name, provider: request.body.provider, error: err instanceof Error ? err.message : String(err) }, "Failed to add model");
        return reply.status(400).send({ error: err instanceof Error ? err.message : "Validation failed" });
      }
    }
  );

  /**
   * 更新模型
   * @route PUT /api/models/:provider/:name
   * @param provider 提供商名称
   * @param name 模型名称
   * @param body 新的模型配置
   * @returns 操作状态
   * @throws 404 如果模型不存在
   */
  app.put<{ Params: { provider: string; name: string }; Body: ModelConfig }>(
    "/api/models/:provider/:name",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Params: { provider: string; name: string }; Body: ModelConfig }>,
      reply: FastifyReply
    ) => {
      const idx = app.runtime.config.models.findIndex(
        (m) => m.name === request.params.name && m.provider === request.params.provider
      );
      if (idx === -1) {
        log.warn({ modelName: request.params.name, provider: request.params.provider }, "Model not found for update");
        return reply.status(404).send({ error: "model not found" });
      }
      const oldModel = app.runtime.config.models[idx];
      app.runtime.config.models[idx] = request.body;
      try {
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:model:changed", { action: "update", name: request.params.name, provider: request.params.provider });
        log.info({ modelName: request.params.name, provider: request.params.provider, newModel: request.body.model }, "Model updated");
        return reply.send({ status: "ok" });
      } catch (err) {
        // 回滚：恢复旧配置
        app.runtime.config.models[idx] = oldModel;
        log.error({ modelName: request.params.name, provider: request.params.provider, error: err instanceof Error ? err.message : String(err) }, "Failed to update model");
        return reply.status(400).send({ error: err instanceof Error ? err.message : "Validation failed" });
      }
    }
  );

  /**
   * 删除模型
   * @route DELETE /api/models/:provider/:name
   * @param provider 提供商名称
   * @param name 模型名称
   * @returns 操作状态
   * @throws 404 如果模型不存在
   * @throws 400 如果是最后一个模型
   * @behavior 同时清理分组中引用该模型的路由
   */
  app.delete<{ Params: { provider: string; name: string } }>(
    "/api/models/:provider/:name",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Params: { provider: string; name: string } }>,
      reply: FastifyReply
    ) => {
      const modelId = `${request.params.provider}/${request.params.name}`;
      const idx = app.runtime.config.models.findIndex(
        (m) => m.name === request.params.name && m.provider === request.params.provider
      );
      if (idx === -1) {
        log.warn({ modelId }, "Model not found for deletion");
        return reply.status(404).send({ error: "model not found" });
      }
      
      // 检查是否为最后一个模型
      if (app.runtime.config.models.length === 1) {
        log.warn({ modelId }, "Cannot delete the last model");
        return reply.status(400).send({ error: "Cannot delete the last model" });
      }

      // 先删除模型
      app.runtime.config.models.splice(idx, 1);
      
      // 清理分组中引用该模型的路由
      let deletedGroupRoutes = 0;
      for (const group of app.runtime.config.groups) {
        const originalLength = group.routes.length;
        group.routes = group.routes.filter((r) => r.modelId !== modelId);
        deletedGroupRoutes += originalLength - group.routes.length;
      }
      
      // 删除空的分组（路由全部被清理）
      const deletedGroups = app.runtime.config.groups.filter((g) => g.routes.length === 0).length;
      app.runtime.config.groups = app.runtime.config.groups.filter((g) => g.routes.length > 0);

      try {
        // 刷新运行时以更新 modelRegistry
        app.runtime.reset(app.runtime.config);
        app.onConfigUpdate?.(app.runtime.config);
        // 发射配置变更事件，通知前端刷新
        app.runtime.eventEmitter.emit("config:model:changed", { action: "delete", name: request.params.name, provider: request.params.provider });
        if (deletedGroupRoutes > 0 || deletedGroups > 0) {
          app.runtime.eventEmitter.emit("config:group:changed", { action: "update", deletedRoutes: deletedGroupRoutes, deletedGroups });
        }
        log.info({ modelId, deletedGroupRoutes, deletedGroups }, "Model deleted");
      } catch (err) {
        // reset 失败时记录错误但仍然返回成功（模型已从内存中删除）
        log.error({ modelId, error: err instanceof Error ? err.message : String(err) }, "Failed to reset runtime after model deletion");
      }
      
      return reply.send({ status: "ok", deletedGroupRoutes, deletedGroups });
    }
  );

  /**
   * 获取模型能力和价格
   * @route GET /api/models/capabilities
   * @query model 模型名称（必填）
   * @query provider 提供商名称（可选，用于精确匹配）
   * @returns 模型能力（是否支持工具调用）和价格信息
   * @behavior 从价格数据库查询模型能力，支持模糊匹配
   */
  app.get<{ Querystring: { model: string; provider?: string } }>(
    "/api/models/capabilities",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Querystring: { model: string; provider?: string } }>,
      reply: FastifyReply
    ) => {
      const { model, provider } = request.query;

      if (!model) {
        return reply.status(400).send({ error: "model parameter is required" });
      }

      // 从价格数据库查询模型能力
      const priceData = modelPricingService.getBestMatch(model, provider);

      if (!priceData) {
        return reply.send({
          found: false,
          model,
          provider,
        });
      }

      return reply.send({
        found: true,
        model,
        provider,
        capabilities: {
          supportsTools: priceData.supportsTools ?? true,
        },
        pricing: {
          promptPer1k: priceData.inputPricePer1M / 1000,
          completionPer1k: priceData.outputPricePer1M / 1000,
        },
        contextWindow: priceData.contextWindow,
        displayName: priceData.displayName,
      });
    }
  );
}
