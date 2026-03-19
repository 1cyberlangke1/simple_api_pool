import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import { modelPricingService } from "../../core/model_pricing.js";
import { exchangeRateService } from "../../core/exchange_rate.js";

/**
 * 注册模型价格相关路由
 */
export function registerPricingRoutes(app: FastifyInstance, adminToken: string): void {
  // 查询模型价格（支持模糊匹配）
  app.get<{ Querystring: { model: string; provider?: string; limit?: number } }>(
    "/api/pricing/query",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Querystring: { model: string; provider?: string; limit?: number } }>,
      reply: FastifyReply
    ) => {
      const { model, provider, limit = 5 } = request.query;

      if (!model) {
        return reply.status(400).send({ error: "model parameter is required" });
      }

      const results = modelPricingService.queryPrice({
        model,
        provider,
        multiMatch: true,
        limit,
      });

      // 获取当前汇率并转换为人民币
      const rateData = await exchangeRateService.getUSDCNY();

      const enrichedResults = results.map((r) => ({
        ...r,
        price: {
          ...r.price,
          // 每千 tokens 价格（美元）
          promptPer1k: r.price.inputPricePer1M / 1000,
          completionPer1k: r.price.outputPricePer1M / 1000,
          // 每千 tokens 价格（人民币）
          promptPer1kCNY: (r.price.inputPricePer1M / 1000) * rateData.rate,
          completionPer1kCNY: (r.price.outputPricePer1M / 1000) * rateData.rate,
        },
      }));

      return reply.send({
        results: enrichedResults,
        exchangeRate: rateData,
      });
    }
  );

  // 获取所有支持的模型价格
  app.get(
    "/api/pricing/all",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const prices = modelPricingService.getAllPrices();
      const rateData = await exchangeRateService.getUSDCNY();

      const enrichedPrices = prices.map((p) => ({
        ...p,
        // 每千 tokens 价格
        promptPer1k: p.inputPricePer1M / 1000,
        completionPer1k: p.outputPricePer1M / 1000,
        promptPer1kCNY: (p.inputPricePer1M / 1000) * rateData.rate,
        completionPer1kCNY: (p.outputPricePer1M / 1000) * rateData.rate,
      }));

      return reply.send({
        prices: enrichedPrices,
        providers: modelPricingService.getSupportedProviders(),
        exchangeRate: rateData,
      });
    }
  );
}
