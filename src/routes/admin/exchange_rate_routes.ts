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