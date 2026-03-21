/**
 * useCurrency Composable 测试
 * @description 测试货币转换功能
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCurrency } from "./useCurrency";
import { getExchangeRate, setExchangeRate, type ExchangeRateData } from "@/api/types";

// Mock API
vi.mock("@/api/types", () => ({
  getExchangeRate: vi.fn(),
  setExchangeRate: vi.fn(),
}));

// Mock ElMessage
vi.mock("element-plus", () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

/** 创建模拟汇率数据 */
function createMockRate(rate: number, source: "online" | "fallback" = "online"): ExchangeRateData {
  return {
    base: "USD",
    target: "CNY",
    rate,
    source,
    updatedAt: Date.now(),
    nextUpdateAt: Date.now() + 86400000,
  };
}

describe("useCurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("初始状态", () => {
    it("showCNY 初始应为 false", () => {
      const { showCNY } = useCurrency();
      expect(showCNY.value).toBe(false);
    });

    it("exchangeRate 初始应为 null", () => {
      const { exchangeRate } = useCurrency();
      expect(exchangeRate.value).toBeNull();
    });

    it("loading 初始应为 false", () => {
      const { loading } = useCurrency();
      expect(loading.value).toBe(false);
    });
  });

  describe("toggleCurrency", () => {
    it("应该切换 showCNY 状态", () => {
      const { showCNY, toggleCurrency } = useCurrency();
      expect(showCNY.value).toBe(false);
      toggleCurrency();
      expect(showCNY.value).toBe(true);
      toggleCurrency();
      expect(showCNY.value).toBe(false);
    });
  });

  describe("formatPrice", () => {
    it("应该返回 '-' 对于无参数", () => {
      const { formatPrice } = useCurrency();
      expect(formatPrice()).toBe("-");
    });

    it("应该格式化美元价格", () => {
      const { formatPrice } = useCurrency();
      expect(formatPrice(0.5)).toBe("$0.500000");
    });

    it("应该格式化人民币价格当 showCNY 为 true 且有汇率", async () => {
      const { showCNY, exchangeRate, formatPrice } = useCurrency();
      
      // 设置汇率
      exchangeRate.value = createMockRate(7.2);
      showCNY.value = true;
      
      expect(formatPrice(1)).toBe("¥7.200000");
    });

    it("应该使用提供的人民币值", async () => {
      const { showCNY, exchangeRate, formatPrice } = useCurrency();
      
      exchangeRate.value = createMockRate(7.2);
      showCNY.value = true;
      
      expect(formatPrice(1, 10)).toBe("¥10.000000");
    });

    it("当 showCNY 为 false 时应该显示美元", async () => {
      const { showCNY, exchangeRate, formatPrice } = useCurrency();
      
      exchangeRate.value = createMockRate(7.2);
      showCNY.value = false;
      
      expect(formatPrice(1)).toBe("$1.000000");
    });
  });

  describe("toCNY", () => {
    it("没有汇率时应该返回原值", () => {
      const { toCNY } = useCurrency();
      expect(toCNY(100)).toBe(100);
    });

    it("有汇率时应该正确转换", () => {
      const { exchangeRate, toCNY } = useCurrency();
      exchangeRate.value = createMockRate(7.2);
      expect(toCNY(100)).toBe(720);
    });
  });

  describe("toUSD", () => {
    it("没有汇率时应该返回原值", () => {
      const { toUSD } = useCurrency();
      expect(toUSD(720)).toBe(720);
    });

    it("有汇率时应该正确转换", () => {
      const { exchangeRate, toUSD } = useCurrency();
      exchangeRate.value = createMockRate(7.2);
      expect(toUSD(720)).toBe(100);
    });
  });

  describe("fetchExchangeRate", () => {
    it("成功获取汇率", async () => {
      const mockData = createMockRate(7.2);
      vi.mocked(getExchangeRate).mockResolvedValue({ data: mockData } as any);
      
      const { exchangeRate, loading, fetchExchangeRate } = useCurrency();
      await fetchExchangeRate();
      
      expect(exchangeRate.value).toEqual(mockData);
      expect(loading.value).toBe(false);
    });

    it("获取失败时应该正常处理", async () => {
      vi.mocked(getExchangeRate).mockRejectedValue(new Error("Network error"));
      
      const { loading, fetchExchangeRate } = useCurrency();
      await fetchExchangeRate();
      
      expect(loading.value).toBe(false);
    });
  });

  describe("updateExchangeRate", () => {
    it("成功设置汇率", async () => {
      const mockData = createMockRate(7.5, "fallback");
      vi.mocked(setExchangeRate).mockResolvedValue({ data: mockData } as any);
      
      const { exchangeRate, loading, updateExchangeRate } = useCurrency();
      const result = await updateExchangeRate(7.5);
      
      expect(result).toBe(true);
      expect(exchangeRate.value).toEqual(mockData);
      expect(loading.value).toBe(false);
    });

    it("设置失败时应该返回 false", async () => {
      vi.mocked(setExchangeRate).mockRejectedValue(new Error("Network error"));
      
      const { updateExchangeRate } = useCurrency();
      const result = await updateExchangeRate(7.5);
      
      expect(result).toBe(false);
    });
  });
});
