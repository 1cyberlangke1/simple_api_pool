/**
 * useQuota Composable 测试
 * @description 测试配额管理功能
 */
import { describe, it, expect } from "vitest";
import { useQuota } from "./useQuota";
import type { QuotaConfig } from "@/api/types";

describe("useQuota", () => {
  const { getQuotaLabel, getQuotaTagType, getQuotaPercentage, isQuotaExhausted } = useQuota();

  describe("getQuotaLabel", () => {
    it("应该返回 '无限' 对于 infinite 类型", () => {
      const quota: QuotaConfig = { type: "infinite" };
      expect(getQuotaLabel(quota)).toBe("无限");
    });

    it("应该返回 'X 次/日' 对于 daily 类型", () => {
      const quota: QuotaConfig = { type: "daily", limit: 500 };
      expect(getQuotaLabel(quota)).toBe("500 次/日");
    });

    it("应该返回 '$X' 对于 total 类型", () => {
      const quota: QuotaConfig = { type: "total", limit: 100 };
      expect(getQuotaLabel(quota)).toBe("$100");
    });
  });

  describe("getQuotaTagType", () => {
    it("应该返回 'success' 对于 infinite 类型", () => {
      expect(getQuotaTagType("infinite")).toBe("success");
    });

    it("应该返回 'warning' 对于 daily 类型", () => {
      expect(getQuotaTagType("daily")).toBe("warning");
    });

    it("应该返回 'danger' 对于 total 类型", () => {
      expect(getQuotaTagType("total")).toBe("danger");
    });

    it("应该返回 'info' 对于未知类型", () => {
      expect(getQuotaTagType("unknown")).toBe("info");
    });
  });

  describe("getQuotaPercentage", () => {
    it("应该返回 0 对于 infinite 类型", () => {
      const quota: QuotaConfig = { type: "infinite" };
      expect(getQuotaPercentage(quota, 100)).toBe(0);
    });

    it("应该正确计算百分比", () => {
      const quota: QuotaConfig = { type: "daily", limit: 100 };
      expect(getQuotaPercentage(quota, 50)).toBe(50);
    });

    it("应该限制最大值为 100", () => {
      const quota: QuotaConfig = { type: "daily", limit: 100 };
      expect(getQuotaPercentage(quota, 150)).toBe(100);
    });

    it("应该处理 0 limit 的情况", () => {
      const quota: QuotaConfig = { type: "daily", limit: 0 };
      expect(getQuotaPercentage(quota, 50)).toBe(0);
    });
  });

  describe("isQuotaExhausted", () => {
    it("应该返回 false 对于 infinite 类型", () => {
      const quota: QuotaConfig = { type: "infinite" };
      expect(isQuotaExhausted(quota, 100)).toBe(false);
    });

    it("应该返回 false 当使用量小于限制", () => {
      const quota: QuotaConfig = { type: "daily", limit: 100 };
      expect(isQuotaExhausted(quota, 50)).toBe(false);
    });

    it("应该返回 true 当使用量等于限制", () => {
      const quota: QuotaConfig = { type: "daily", limit: 100 };
      expect(isQuotaExhausted(quota, 100)).toBe(true);
    });

    it("应该返回 true 当使用量超过限制", () => {
      const quota: QuotaConfig = { type: "daily", limit: 100 };
      expect(isQuotaExhausted(quota, 150)).toBe(true);
    });
  });
});
