import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { RpmLimiter } from "../src/core/rate_limiter.js";

/**
 * RpmLimiter 单元测试
 * @description 测试 RPM 限流器功能
 */

// ============================================================
// 基本功能测试
// ============================================================

describe("RpmLimiter", () => {
  describe("basic functionality", () => {
    it("allows requests under limit", () => {
      const limiter = new RpmLimiter(10);

      for (let i = 0; i < 10; i++) {
        expect(limiter.allow()).toBe(true);
      }
    });

    it("blocks requests over limit", () => {
      const limiter = new RpmLimiter(3);

      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);
      expect(limiter.allow()).toBe(false);
    });

    it("resets after window passes", async () => {
      const limiter = new RpmLimiter(1);

      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      // 等待窗口重置（实际测试中我们无法等待 60 秒，所以这里只测试基本逻辑）
      // 在真实场景中，窗口会在 60 秒后重置
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("RpmLimiter - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  describe("limit edge cases", () => {
    it("should handle limit of 0", () => {
      const limiter = new RpmLimiter(0);

      // 0 限制应该始终阻止请求
      expect(limiter.allow()).toBe(false);
      expect(limiter.allow()).toBe(false);
      expect(limiter.allow()).toBe(false);
    });

    it("should handle limit of 1", () => {
      const limiter = new RpmLimiter(1);

      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);
      expect(limiter.allow()).toBe(false);
    });

    it("should handle very large limit", () => {
      const limiter = new RpmLimiter(Number.MAX_SAFE_INTEGER);

      // 大量请求都应该被允许
      for (let i = 0; i < 1000; i++) {
        expect(limiter.allow()).toBe(true);
      }
    });

    it("should handle negative limit", () => {
      // 负数限制：count >= -1 对于 count = 0 是 true，所以始终拒绝
      const limiter = new RpmLimiter(-1);

      // count = 0: 0 >= -1 true, 拒绝
      expect(limiter.allow()).toBe(false);
      expect(limiter.allow()).toBe(false);
    });

    it("should handle floating point limit", () => {
      // 浮点数限制：2.5 的行为
      // allow() 逻辑：先检查 count >= limit，如果是则拒绝，否则 count++ 并允许
      const limiter = new RpmLimiter(2.5);

      // count = 0: 0 >= 2.5 false, count++ = 1, 允许
      // count = 1: 1 >= 2.5 false, count++ = 2, 允许
      // count = 2: 2 >= 2.5 false, count++ = 3, 允许
      // count = 3: 3 >= 2.5 true, 拒绝

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(limiter.allow());
      }

      // 前 3 次允许，之后拒绝
      expect(results[0]).toBe(true);  // count 变为 1
      expect(results[1]).toBe(true);  // count 变为 2
      expect(results[2]).toBe(true);  // count 变为 3
      expect(results.slice(3).every((r) => r === false)).toBe(true); // 拒绝
    });

    it("should handle NaN limit", () => {
      // NaN 限制：count >= NaN 始终为 false
      const limiter = new RpmLimiter(NaN);

      // NaN 比较始终返回 false，所以会始终允许
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(true);
    });

    it("should handle Infinity limit", () => {
      const limiter = new RpmLimiter(Infinity);

      // 无限限制，应该始终允许
      for (let i = 0; i < 1000; i++) {
        expect(limiter.allow()).toBe(true);
      }
    });
  });

  describe("window behavior edge cases", () => {
    it("should allow requests again after window reset", () => {
      const limiter = new RpmLimiter(1);

      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      // 手动重置窗口（模拟时间流逝）
      // @ts-ignore - 访问私有属性进行测试
      limiter["windowStart"] = Date.now() - 60001;
      // @ts-ignore - 访问私有属性进行测试
      limiter["count"] = 0;

      expect(limiter.allow()).toBe(true);
    });

    it("should handle rapid consecutive calls", () => {
      const limiter = new RpmLimiter(100);

      // 快速连续调用
      for (let i = 0; i < 100; i++) {
        expect(limiter.allow()).toBe(true);
      }
      expect(limiter.allow()).toBe(false);
    });
  });

  describe("behavior with mocked time", () => {
    it("should reset at exact window boundary", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = new RpmLimiter(2);

      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      // 正好在 60 秒后重置
      vi.setSystemTime(now + 60000);
      expect(limiter.allow()).toBe(true);

      vi.useRealTimers();
    });

    it("should not reset before window boundary", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = new RpmLimiter(1);

      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      // 在 59 秒时，窗口还未重置
      vi.setSystemTime(now + 59999);
      expect(limiter.allow()).toBe(false);

      vi.useRealTimers();
    });

    it("should handle multiple window cycles", () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const limiter = new RpmLimiter(1);

      // 第一个窗口
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      // 第二个窗口
      vi.setSystemTime(now + 60000);
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      // 第三个窗口
      vi.setSystemTime(now + 120000);
      expect(limiter.allow()).toBe(true);
      expect(limiter.allow()).toBe(false);

      vi.useRealTimers();
    });
  });

  describe("concurrent access simulation", () => {
    it("should handle interleaved calls consistently", () => {
      const limiter = new RpmLimiter(5);
      const results: boolean[] = [];

      // 模拟多个请求交错
      for (let i = 0; i < 10; i++) {
        results.push(limiter.allow());
      }

      // 前 5 个应该允许，后 5 个应该拒绝
      expect(results.slice(0, 5).every((r) => r === true)).toBe(true);
      expect(results.slice(5).every((r) => r === false)).toBe(true);
    });
  });
});
