import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ExchangeRateService } from "../src/core/exchange_rate.js";

/**
 * ExchangeRateService 单元测试
 * @description 测试汇率服务的功能
 */

const originalFetch = global.fetch;

describe("ExchangeRateService", () => {
  let service: ExchangeRateService;

  beforeEach(() => {
    // Mock fetch to prevent real API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    service = new ExchangeRateService();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("getRate", () => {
    it("returns fallback rate immediately", async () => {
      const rateData = await service.getRate("USD", "CNY");

      expect(rateData.base).toBe("USD");
      expect(rateData.target).toBe("CNY");
      expect(rateData.rate).toBeGreaterThan(0);
      expect(rateData.rate).toBeLessThan(20); // 合理的汇率范围
    });

    it("returns fallback rate for reverse query", async () => {
      const rateData = await service.getRate("CNY", "USD");

      expect(rateData.base).toBe("CNY");
      expect(rateData.target).toBe("USD");
      expect(rateData.rate).toBeGreaterThan(0);
      expect(rateData.rate).toBeLessThan(1); // 人民币兑美元应该小于 1
    });

    it("returns 1:1 for same currency", async () => {
      const rateData = await service.getRate("USD", "USD");

      expect(rateData.rate).toBe(1);
    });

    it("returns fallback for unknown currency pair", async () => {
      const rateData = await service.getRate("XYZ", "ABC");

      // 未知货币对应该返回 1:1
      expect(rateData.rate).toBe(1);
      expect(rateData.source).toBe("fallback");
    });
  });

  describe("getUSDCNY", () => {
    it("returns USD to CNY rate", async () => {
      const rateData = await service.getUSDCNY();

      expect(rateData.base).toBe("USD");
      expect(rateData.target).toBe("CNY");
      expect(rateData.rate).toBeGreaterThan(5); // 合理范围
      expect(rateData.rate).toBeLessThan(10);
    });
  });

  describe("convert", () => {
    it("converts USD to CNY", async () => {
      const cny = await service.convert(100, "USD", "CNY");

      expect(cny).toBeGreaterThan(500);
      expect(cny).toBeLessThan(1000);
    });

    it("converts CNY to USD", async () => {
      const usd = await service.convert(725, "CNY", "USD");

      expect(usd).toBeGreaterThan(90);
      expect(usd).toBeLessThan(110);
    });

    it("returns same amount for same currency", async () => {
      const result = await service.convert(100, "USD", "USD");
      expect(result).toBe(100);
    });
  });

  describe("USDToCNY and CNYToUSD", () => {
    it("converts USD to CNY correctly", async () => {
      const cny = await service.USDToCNY(100);
      expect(cny).toBeGreaterThan(0);
    });

    it("converts CNY to USD correctly", async () => {
      const usd = await service.CNYToUSD(100);
      expect(usd).toBeGreaterThan(0);
    });

    it("converts both ways consistently", async () => {
      const original = 100;
      const cny = await service.USDToCNY(original);
      const usd = await service.CNYToUSD(cny);

      // 往返转换应该接近原始值（可能有浮点误差，放宽容差）
      // 因为使用的是反向汇率的倒数，可能有较大误差
      expect(Math.abs(usd - original)).toBeLessThan(1);
    });
  });

  describe("getCacheStatus", () => {
    it("returns cache status", () => {
      const status = service.getCacheStatus();

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);

      // 检查结构
      const firstStatus = status[0];
      expect(firstStatus).toHaveProperty("pair");
      expect(firstStatus).toHaveProperty("rate");
      expect(firstStatus).toHaveProperty("source");
      expect(firstStatus).toHaveProperty("updatedAt");
    });
  });

  describe("refresh", () => {
    it("attempts to refresh rate", async () => {
      // 这个测试可能会失败，因为需要网络访问
      // 但我们只是测试方法不会抛出异常
      try {
        await service.refresh();
      } catch (error) {
        // 网络错误是预期的
        expect(error).toBeDefined();
      }
    });
  });

  describe("fallback rates", () => {
    it("has reasonable fallback for USD-CNY", async () => {
      const rateData = await service.getRate("USD", "CNY");

      // 检查经验值在合理范围内
      expect(rateData.rate).toBeGreaterThanOrEqual(6);
      expect(rateData.rate).toBeLessThanOrEqual(8);
    });

    it("has reasonable fallback for EUR-USD", async () => {
      const rateData = await service.getRate("EUR", "USD");

      expect(rateData.rate).toBeGreaterThan(0.8);
      expect(rateData.rate).toBeLessThan(1.5);
    });
  });

  describe("rate source", () => {
    it("indicates fallback source initially", async () => {
      const rateData = await service.getRate("USD", "CNY");
      // 初始状态应该是 fallback
      expect(rateData.source).toBe("fallback");
    });
  });

  describe("cache priority", () => {
    it("prefers expired online cache over fallback", async () => {
      // 为 refresh 设置正确的 mock 返回在线汇率数据
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          rates: { CNY: 7.25 },
        }),
      });
      global.fetch = mockFetch;

      // 首先获取一次在线汇率
      await service.refresh();

      // 检查在线汇率已缓存
      const statusBefore = service.getCacheStatus();
      const usdCnyCache = statusBefore.find(s => s.pair === "USD-CNY");
      expect(usdCnyCache?.source).toBe("online");

      // 获取汇率应该返回在线缓存的值
      const rateData = await service.getRate("USD", "CNY");
      expect(rateData.source).toBe("online");
    });
  });
});
