/**
 * Key 管理路由
 * @description 提供 API Key 的增删改查和批量操作接口
 * @module routes/admin/keys_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { KeyConfig } from "../../core/types.js";
import { adminAuth } from "./auth.js";

/**
 * 注册 Key 管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerKeysRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 列出所有 Key
   * @route GET /api/keys
   * @returns Key 列表，包含别名、提供商、配额和使用情况
   */
  app.get(
    "/api/keys",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // 转换后端 KeyState 为前端期望的格式
      const keys = app.runtime.keyStore.listKeys().map((key) => ({
        alias: key.alias,
        provider: key.provider,
        key: key.key,
        model: key.model,
        quota: key.quota,
        usedToday: key.usage.dailyCount,
        remainingTotal:
          key.quota.type === "total" ? key.quota.limit - key.usage.totalCost : null,
      }));
      return reply.send(keys);
    }
  );

  /**
   * 添加 Key
   * @route POST /api/keys
   * @param body Key 配置对象
   * @returns 操作状态
   */
  app.post<{ Body: KeyConfig }>(
    "/api/keys",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: KeyConfig }>, reply: FastifyReply) => {
      app.runtime.keyStore.addKey(request.body);
      return reply.send({ status: "ok" });
    }
  );

  /**
   * 更新 Key
   * @route PUT /api/keys/:alias
   * @param alias Key 别名
   * @param body 新的 Key 配置
   * @returns 操作状态（ok 或 not_found）
   */
  app.put<{ Params: { alias: string }; Body: KeyConfig }>(
    "/api/keys/:alias",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { alias: string }; Body: KeyConfig }>, reply: FastifyReply) => {
      const ok = app.runtime.keyStore.updateKey(request.params.alias, request.body);
      return reply.send({ status: ok ? "ok" : "not_found" });
    }
  );

  /**
   * 删除 Key
   * @route DELETE /api/keys/:alias
   * @param alias Key 别名
   * @returns 操作状态（ok 或 not_found）
   */
  app.delete<{ Params: { alias: string } }>(
    "/api/keys/:alias",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { alias: string } }>, reply: FastifyReply) => {
      const ok = app.runtime.keyStore.deleteKey(request.params.alias);
      return reply.send({ status: ok ? "ok" : "not_found" });
    }
  );

  /**
   * 批量导入 Key
   * @route POST /api/keys/batch
   * @param body.provider 提供商名称
   * @param body.keys Key 字符串（用分隔符分隔）
   * @param body.delimiter 分隔符（默认换行）
   * @param body.quotaType 配额类型（infinite/daily/total）
   * @param body.quotaLimit 配额限制（daily/total 时需要）
   * @returns 导入结果统计
   */
  app.post<
    {
      Body: {
        provider: string;
        keys: string;
        delimiter: string;
        quotaType: "infinite" | "daily" | "total";
        quotaLimit?: number;
      };
    }
  >(
    "/api/keys/batch",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{
        Body: { provider: string; keys: string; delimiter: string; quotaType: "infinite" | "daily" | "total"; quotaLimit?: number };
      }>,
      reply: FastifyReply
    ) => {
      const { provider, keys, delimiter, quotaType, quotaLimit } = request.body;

      if (!provider || !keys) {
        return reply.status(400).send({ error: "provider and keys are required" });
      }

      // 分割 key 字符串
      const delimiterToUse = delimiter || "\n";
      const keyList = keys
        .split(delimiterToUse)
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

      if (keyList.length === 0) {
        return reply.status(400).send({ error: "No valid keys found" });
      }

      const results: { alias: string; status: "success" | "error"; error?: string }[] = [];

      for (let i = 0; i < keyList.length; i++) {
        const keyValue = keyList[i];
        const alias = `${provider}_key_${Date.now()}_${i}`;

        try {
          const quota =
            quotaType === "infinite"
              ? { type: "infinite" as const }
              : { type: quotaType, limit: quotaLimit || 100 };

          const config: KeyConfig = {
            alias,
            provider,
            key: keyValue,
            quota,
          };

          app.runtime.keyStore.addKey(config);
          results.push({ alias, status: "success" });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          results.push({ alias, status: "error", error: message });
        }
      }

      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({
        status: "ok",
        total: keyList.length,
        success: results.filter((r) => r.status === "success").length,
        results,
      });
    }
  );

  /**
   * 批量删除 Key
   * @route POST /api/keys/batch-delete
   * @param body.aliases 要删除的 Key 别名数组
   * @returns 删除结果统计
   */
  app.post<{ Body: { aliases: string[] } }>(
    "/api/keys/batch-delete",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: { aliases: string[] } }>, reply: FastifyReply) => {
      const { aliases } = request.body;

      if (!aliases || !Array.isArray(aliases) || aliases.length === 0) {
        return reply.status(400).send({ error: "aliases array is required" });
      }

      const results: { alias: string; status: "success" | "not_found" }[] = [];

      for (const alias of aliases) {
        const ok = app.runtime.keyStore.deleteKey(alias);
        results.push({ alias, status: ok ? "success" : "not_found" });
      }

      app.onConfigUpdate?.(app.runtime.config);
      return reply.send({
        status: "ok",
        total: aliases.length,
        deleted: results.filter((r) => r.status === "success").length,
        results,
      });
    }
  );
}
