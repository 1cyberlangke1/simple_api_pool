/**
 * useKey Composable 测试
 * @description 测试 Key 工具函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useKey } from "./useKey";

describe("useKey", () => {
  const { maskKey, isValidKey, generateAlias } = useKey();

  describe("maskKey", () => {
    it("应该返回 '****' 对于短于等于8个字符的 Key", () => {
      expect(maskKey("")).toBe("****");
      expect(maskKey("abc")).toBe("****");
      expect(maskKey("12345678")).toBe("****");
    });

    it("应该正确遮蔽长 Key", () => {
      expect(maskKey("sk-1234567890abcdef")).toBe("sk-1****cdef");
    });

    it("应该正确遮蔽刚好9个字符的 Key", () => {
      expect(maskKey("123456789")).toBe("1234****6789");
    });

    it("应该正确遮蔽长 API Key", () => {
      const longKey = "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890";
      expect(maskKey(longKey)).toBe("sk-p****7890");
    });
  });

  describe("isValidKey", () => {
    it("应该返回 false 对于短于8个字符的 Key", () => {
      expect(isValidKey("")).toBe(false);
      expect(isValidKey("abc")).toBe(false);
      expect(isValidKey("1234567")).toBe(false);
    });

    it("应该返回 false 对于超过200个字符的 Key", () => {
      const longKey = "a".repeat(201);
      expect(isValidKey(longKey)).toBe(false);
    });

    it("应该返回 true 对于8到200个字符的 Key", () => {
      expect(isValidKey("12345678")).toBe(true);
      expect(isValidKey("sk-1234567890abcdef")).toBe(true);
      expect(isValidKey("a".repeat(200))).toBe(true);
    });
  });

  describe("generateAlias", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("应该生成包含提供商名称的别名", () => {
      vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
      const alias = generateAlias("openai");
      expect(alias).toBe("openai_key_1705312800000");
    });

    it("应该为不同提供商生成不同别名", () => {
      vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
      expect(generateAlias("openai")).toBe("openai_key_1705312800000");
      expect(generateAlias("anthropic")).toBe("anthropic_key_1705312800000");
    });

    it("应该使用当前时间戳", () => {
      const timestamp = 1705312800000;
      vi.setSystemTime(new Date(timestamp));
      const alias = generateAlias("test");
      expect(alias).toContain(timestamp.toString());
    });
  });
});
