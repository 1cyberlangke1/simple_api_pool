import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import { exchangeRateService } from "../../core/exchange_rate.js";

/**
 * 注册汇率相关路由
 */
export function registerExchangeRateRoutes(app: FastifyInstance, adminToken: string): void {
  // 获取汇率
  app.get<{ Querystring: { base?: string; target?: string } }>(
    "/api/exchange-rate",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Querystring: { base?: string; target?: string } }>,
      reply: FastifyReply
    ) => {
      const { base = "USD", target = "CNY" } = request.query;

      try {
        const rateData = await exchangeRateService.getRate(base, target);
        return reply.send(rateData);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown currency pair";
        return reply.status(400).send({ error: message });
      }
    }
  );

  // 手动设置汇率
  app.post<{ Body: { base?: string; target?: string; rate?: number } }>(
    "/api/exchange-rate",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Body: { base?: string; target?: string; rate?: number } }>,
      reply: FastifyReply
    ) => {
      const { base = "USD", target = "CNY", rate } = request.body;

      // 类型检查：rate 必须是正数
      if (typeof rate !== "number" || !rate || rate <= 0) {
        return reply.status(400).send({ error: "Invalid rate value: must be a positive number" });
      }

      exchangeRateService.setRate(base, target, rate);
      const rateData = await exchangeRateService.getRate(base, target);
      return reply.send(rateData);
    }
  );

  // 强制刷新汇率
  app.post(
    "/api/exchange-rate/refresh",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const success = await exchangeRateService.refresh();
      const rateData = await exchangeRateService.getUSDCNY();
      return reply.send({
        success,
        rate: rateData,
        cacheStatus: exchangeRateService.getCacheStatus(),
      });
    }
  );

  // 获取汇率缓存状态
  app.get(
    "/api/exchange-rate/status",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        cacheStatus: exchangeRateService.getCacheStatus(),
      });
    }
  );
}