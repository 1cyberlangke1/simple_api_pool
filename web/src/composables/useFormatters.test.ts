/**
 * useFormatters Composable 测试
 * @description 测试格式化工具函数
 */
import { describe, it, expect } from "vitest";
import { useFormatters, formatBytes, formatHitRate, formatNumber, formatHour } from "./useFormatters";

describe("useFormatters", () => {
  const { formatBytes, formatHitRate, formatNumber, formatHour } = useFormatters();

  describe("formatBytes", () => {
    it("应该返回 '0 B' 对于 0 字节", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("应该正确格式化字节", () => {
      expect(formatBytes(500)).toBe("500.00 B");
    });

    it("应该正确格式化 KB", () => {
      expect(formatBytes(1024)).toBe("1.00 KB");
    });

    it("应该正确格式化 MB", () => {
      expect(formatBytes(1048576)).toBe("1.00 MB");
    });

    it("应该正确格式化 GB", () => {
      expect(formatBytes(1073741824)).toBe("1.00 GB");
    });

    it("应该正确格式化 TB", () => {
      expect(formatBytes(1099511627776)).toBe("1.00 TB");
    });

    it("应该处理非整数", () => {
      expect(formatBytes(1536)).toBe("1.50 KB");
    });
  });

  describe("formatHitRate", () => {
    it("应该格式化 0 命中率", () => {
      expect(formatHitRate(0)).toBe("0.0%");
    });

    it("应该格式化 1 命中率", () => {
      expect(formatHitRate(1)).toBe("100.0%");
    });

    it("应该格式化小数命中率", () => {
      expect(formatHitRate(0.5)).toBe("50.0%");
    });

    it("应该格式化 0.75 命中率", () => {
      expect(formatHitRate(0.75)).toBe("75.0%");
    });
  });

  describe("formatNumber", () => {
    it("应该格式化小数字", () => {
      expect(formatNumber(100)).toBe("100");
    });

    it("应该格式化千位数", () => {
      expect(formatNumber(1000)).toBe("1,000");
    });

    it("应该格式化百万位数", () => {
      expect(formatNumber(1000000)).toBe("1,000,000");
    });
  });

  describe("formatHour", () => {
    it("应该提取小时部分", () => {
      expect(formatHour("2024-01-15T10")).toBe("10:00");
    });

    it("应该提取单数字小时", () => {
      expect(formatHour("2024-01-15T09")).toBe("09:00");
    });

    it("应该处理无效格式", () => {
      expect(formatHour("invalid")).toBe("invalid");
    });

    it("应该处理午夜", () => {
      expect(formatHour("2024-01-15T00")).toBe("00:00");
    });

    it("应该处理 23 点", () => {
      expect(formatHour("2024-01-15T23")).toBe("23:00");
    });
  });
});

describe("独立函数导出", () => {
  it("formatBytes 应该独立工作", () => {
    expect(formatBytes(1024)).toBe("1.00 KB");
  });

  it("formatHitRate 应该独立工作", () => {
    expect(formatHitRate(0.5)).toBe("50.0%");
  });

  it("formatNumber 应该独立工作", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("formatHour 应该独立工作", () => {
    expect(formatHour("2024-01-15T10")).toBe("10:00");
  });
});
