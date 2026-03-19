/**
 * usePolling Composable 测试
 * @description 测试数据轮询功能
 */
import { describe, it, expect } from "vitest";
import { formatBytes, formatHitRate, formatNumber } from "./usePolling";

describe("usePolling 工具函数", () => {
  describe("formatBytes", () => {
    it("应该正确格式化 0 字节", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("应该正确格式化字节", () => {
      expect(formatBytes(512)).toBe("512.00 B");
    });

    it("应该正确格式化 KB", () => {
      expect(formatBytes(1024)).toBe("1.00 KB");
    });

    it("应该正确格式化 MB", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
    });

    it("应该正确格式化 GB", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    });

    it("应该正确格式化 TB", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB");
    });
  });

  describe("formatHitRate", () => {
    it("应该正确格式化 0 命中率", () => {
      expect(formatHitRate(0)).toBe("0.0%");
    });

    it("应该正确格式化 50% 命中率", () => {
      expect(formatHitRate(0.5)).toBe("50.0%");
    });

    it("应该正确格式化 100% 命中率", () => {
      expect(formatHitRate(1)).toBe("100.0%");
    });

    it("应该正确格式化小数命中率", () => {
      expect(formatHitRate(0.123)).toBe("12.3%");
    });
  });

  describe("formatNumber", () => {
    it("应该正确格式化小数字", () => {
      expect(formatNumber(100)).toBe("100");
    });

    it("应该添加千位分隔符", () => {
      expect(formatNumber(1000)).toBe("1,000");
    });

    it("应该正确格式化百万级数字", () => {
      expect(formatNumber(1000000)).toBe("1,000,000");
    });

    it("应该正确格式化 0", () => {
      expect(formatNumber(0)).toBe("0");
    });
  });
});
