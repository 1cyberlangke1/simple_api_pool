import { describe, expect, it, beforeEach } from "vitest";
import { ModelPricingService } from "../src/core/model_pricing.js";

/**
 * ModelPricingService 单元测试
 * @description 测试模型价格服务的功能
 */
describe("ModelPricingService", () => {
  let service: ModelPricingService;

  beforeEach(() => {
    service = new ModelPricingService();
  });

  describe("getAllPrices", () => {
    it("returns all price data", () => {
      const prices = service.getAllPrices();
      expect(prices.length).toBeGreaterThan(0);

      // 检查数据结构
      const firstPrice = prices[0];
      expect(firstPrice).toHaveProperty("providerId");
      expect(firstPrice).toHaveProperty("modelId");
      expect(firstPrice).toHaveProperty("inputPricePer1M");
      expect(firstPrice).toHaveProperty("outputPricePer1M");
    });
  });

  describe("getSupportedProviders", () => {
    it("returns list of supported providers", () => {
      const providers = service.getSupportedProviders();

      expect(providers).toContain("openai");
      expect(providers).toContain("anthropic");
      expect(providers).toContain("google");
      expect(providers).toContain("deepseek");
    });
  });

  describe("queryPrice - exact matching", () => {
    it("finds exact model match with provider", () => {
      const results = service.queryPrice({ model: "gpt-4o", provider: "openai" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.matchType).toBe("exact");
      expect(results[0]!.price.providerId).toBe("openai");
      expect(results[0]!.price.modelId).toBe("gpt-4o");
    });

    it("finds exact model match without provider", () => {
      const results = service.queryPrice({ model: "claude-3-5-sonnet-20241022" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.matchType).toBe("exact");
      expect(results[0]!.price.providerId).toBe("anthropic");
    });

    it("returns empty array for non-existent model", () => {
      const results = service.queryPrice({ model: "nonexistent-model-xyz" });
      expect(results.length).toBe(0);
    });
  });

  describe("queryPrice - fuzzy matching", () => {
    it("finds model with partial name match", () => {
      const results = service.queryPrice({ model: "gpt-4o-mini" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.price.modelId).toContain("gpt-4o-mini");
    });

    it("finds model with date suffix stripped", () => {
      const results = service.queryPrice({ model: "claude-3-5-sonnet" });

      expect(results.length).toBeGreaterThan(0);
      // 应该能匹配到 claude-3-5-sonnet-20241022 或类似模型
      expect(results[0]!.price.modelId).toContain("claude-3-5-sonnet");
    });

    it("matches deepseek models", () => {
      const results = service.queryPrice({ model: "deepseek-chat" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.price.providerId).toBe("deepseek");
    });

    it("matches gemini models", () => {
      const results = service.queryPrice({ model: "gemini-1.5-pro" });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.price.providerId).toBe("google");
    });
  });

  describe("queryPrice - multi match", () => {
    it("returns multiple matches when requested", () => {
      const results = service.queryPrice({ model: "gpt", multiMatch: true, limit: 5 });

      expect(results.length).toBeGreaterThan(1);
      // 结果应按得分排序
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });

    it("respects limit parameter", () => {
      const results = service.queryPrice({ model: "llama", multiMatch: true, limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getBestMatch", () => {
    it("returns best match for known model", () => {
      const price = service.getBestMatch("gpt-4o", "openai");

      expect(price).not.toBeNull();
      expect(price!.providerId).toBe("openai");
      expect(price!.modelId).toBe("gpt-4o");
    });

    it("returns null for unknown model", () => {
      const price = service.getBestMatch("totally-unknown-model-xyz");
      expect(price).toBeNull();
    });
  });

  describe("toPricingConfig", () => {
    it("converts price per 1M to price per 1K", () => {
      const price = service.getBestMatch("gpt-4o", "openai");
      expect(price).not.toBeNull();

      const config = service.toPricingConfig(price!);

      // 每百万 tokens 的价格除以 1000 = 每千 tokens
      expect(config.promptPer1k).toBe(price!.inputPricePer1M / 1000);
      expect(config.completionPer1k).toBe(price!.outputPricePer1M / 1000);
    });
  });

  describe("provider name normalization", () => {
    it("normalizes provider aliases", () => {
      // google, gemini, googleai 都应该匹配 google
      const result1 = service.queryPrice({ model: "gemini-1.5-pro", provider: "google" });
      const result2 = service.queryPrice({ model: "gemini-1.5-pro", provider: "gemini" });
      const result3 = service.queryPrice({ model: "gemini-1.5-pro", provider: "googleai" });

      expect(result1.length).toBeGreaterThan(0);
      expect(result2.length).toBeGreaterThan(0);
      expect(result3.length).toBeGreaterThan(0);
    });

    it("handles chinese provider names", () => {
      const result = service.queryPrice({ model: "qwen-max", provider: "qwen" });
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("update mechanism", () => {
    it("checks if update is needed", () => {
      // 新创建的服务不应该需要更新
      expect(service.needsUpdate()).toBe(false);
    });

    it("marks as updated", () => {
      service.markUpdated();
      expect(service.needsUpdate()).toBe(false);
    });
  });
});
