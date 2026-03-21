/**
 * format 工具函数测试
 * @description 测试字符串截断和 JSON 格式化功能
 */
import { describe, it, expect } from "vitest";
import {
  truncateLongStrings,
  formatJsonWithTruncate,
  TRUNCATE_THRESHOLD,
  TRUNCATE_SHOW_LENGTH,
} from "./format";

describe("format utils", () => {
  describe("常量", () => {
    it("TRUNCATE_THRESHOLD 应该是 200", () => {
      expect(TRUNCATE_THRESHOLD).toBe(200);
    });

    it("TRUNCATE_SHOW_LENGTH 应该是 50", () => {
      expect(TRUNCATE_SHOW_LENGTH).toBe(50);
    });
  });

  describe("truncateLongStrings", () => {
    describe("字符串处理", () => {
      it("应该返回短字符串原样", () => {
        const shortString = "hello world";
        expect(truncateLongStrings(shortString)).toBe(shortString);
      });

      it("应该截断超过阈值的长字符串", () => {
        const longString = "a".repeat(300);
        const result = truncateLongStrings(longString) as string;

        expect(result).toContain("a".repeat(50));
        expect(result).toContain("[已截断");
        expect(result).toContain("300 字符");
      });

      it("应该正确处理刚好等于阈值长度的字符串", () => {
        const exactString = "a".repeat(TRUNCATE_THRESHOLD);
        expect(truncateLongStrings(exactString)).toBe(exactString);
      });

      it("应该正确处理刚超过阈值长度的字符串", () => {
        const slightlyLongString = "a".repeat(TRUNCATE_THRESHOLD + 1);
        const result = truncateLongStrings(slightlyLongString) as string;

        expect(result).toContain("[已截断");
      });

      it("应该处理空字符串", () => {
        expect(truncateLongStrings("")).toBe("");
      });
    });

    describe("数组处理", () => {
      it("应该递归处理数组中的字符串", () => {
        const input = ["short", "a".repeat(300), "another short"];
        const result = truncateLongStrings(input) as string[];

        expect(result[0]).toBe("short");
        expect(result[1]).toContain("[已截断");
        expect(result[2]).toBe("another short");
      });

      it("应该处理嵌套数组", () => {
        const input = [["a".repeat(300)], ["short"]];
        const result = truncateLongStrings(input) as string[][];

        expect(result[0][0]).toContain("[已截断");
        expect(result[1][0]).toBe("short");
      });

      it("应该返回空数组原样", () => {
        expect(truncateLongStrings([])).toEqual([]);
      });
    });

    describe("对象处理", () => {
      it("应该递归处理对象中的字符串值", () => {
        const input = {
          short: "hello",
          long: "a".repeat(300),
        };
        const result = truncateLongStrings(input) as Record<string, string>;

        expect(result.short).toBe("hello");
        expect(result.long).toContain("[已截断");
      });

      it("应该处理嵌套对象", () => {
        const input = {
          level1: {
            level2: {
              longValue: "a".repeat(300),
            },
          },
        };
        const result = truncateLongStrings(input) as {
          level1: { level2: { longValue: string } };
        };

        expect(result.level1.level2.longValue).toContain("[已截断");
      });

      it("应该处理混合类型的对象", () => {
        const input = {
          string: "hello",
          number: 123,
          boolean: true,
          null: null,
          array: ["a".repeat(300)],
          nested: { key: "value" },
        };
        const result = truncateLongStrings(input) as Record<string, unknown>;

        expect(result.string).toBe("hello");
        expect(result.number).toBe(123);
        expect(result.boolean).toBe(true);
        expect(result.null).toBeNull();
        expect((result.array as string[])[0]).toContain("[已截断");
        expect((result.nested as Record<string, string>).key).toBe("value");
      });

      it("应该返回空对象原样", () => {
        expect(truncateLongStrings({})).toEqual({});
      });
    });

    describe("原始类型处理", () => {
      it("应该返回数字原样", () => {
        expect(truncateLongStrings(123)).toBe(123);
      });

      it("应该返回布尔值原样", () => {
        expect(truncateLongStrings(true)).toBe(true);
        expect(truncateLongStrings(false)).toBe(false);
      });

      it("应该返回 null 原样", () => {
        expect(truncateLongStrings(null)).toBeNull();
      });

      it("应该返回 undefined 原样", () => {
        expect(truncateLongStrings(undefined)).toBeUndefined();
      });
    });

    describe("边界情况", () => {
      it("应该处理包含特殊字符的字符串", () => {
        const specialString = "特殊字符 🎉 \n\t".repeat(50);
        const result = truncateLongStrings(specialString) as string;

        expect(result).toContain("特殊字符");
      });

      it("应该处理非常深的嵌套结构", () => {
        let input: Record<string, unknown> = { value: "a".repeat(300) };
        for (let i = 0; i < 10; i++) {
          input = { nested: input };
        }

        const result = truncateLongStrings(input);

        // 验证最深层被处理
        let current = result as Record<string, unknown>;
        for (let i = 0; i < 10; i++) {
          current = current.nested as Record<string, unknown>;
        }
        expect((current as { value: string }).value).toContain("[已截断");
      });
    });
  });

  describe("formatJsonWithTruncate", () => {
    it("应该格式化并截断长字符串", () => {
      const input = { message: "a".repeat(300) };
      const result = formatJsonWithTruncate(input);

      expect(result).toContain("[已截断");
      expect(result).toContain('"message"');
    });

    it("应该正确格式化缩进", () => {
      const input = { key: "value" };
      const result = formatJsonWithTruncate(input);

      expect(result).toContain('  "key"');
      expect(result).toContain('"value"');
    });

    it("应该处理原始类型", () => {
      expect(formatJsonWithTruncate("hello")).toBe('"hello"');
      expect(formatJsonWithTruncate(123)).toBe("123");
      expect(formatJsonWithTruncate(true)).toBe("true");
      expect(formatJsonWithTruncate(null)).toBe("null");
    });

    it("应该处理数组", () => {
      const input = ["a".repeat(300), "short"];
      const result = formatJsonWithTruncate(input);

      expect(result).toContain("[已截断");
      expect(result).toContain("short");
    });
  });
});
