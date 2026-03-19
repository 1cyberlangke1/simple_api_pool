import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildSystemPrefix, injectSystemPrompt } from "../src/core/system_prompt.js";
import type { PromptInjectConfig } from "../src/core/types.js";

/**
 * SystemPrompt 单元测试
 * @description 测试系统提示词注入功能
 */
describe("SystemPrompt", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  describe("buildSystemPrefix", () => {
    it("should return empty string when all features disabled", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toBe("");
    });

    it("should include timestamp when enabled", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toContain("system timestamp:");
    });

    it("should include lunar date when enabled", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: true,
        enableWeather: false,
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toContain("lunar date:");
    });

    it("should include both timestamp and lunar when both enabled", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: true,
        enableWeather: false,
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toContain("system timestamp:");
      expect(prefix).toContain("lunar date:");
    });

    it("should fetch weather when enabled", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            current_weather: { temperature: 25.5, windspeed: 10.2 },
          }),
      });
      global.fetch = mockFetch;

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 39.9,
          longitude: 116.4,
        },
      };

      const prefix = await buildSystemPrefix(config);
      expect(mockFetch).toHaveBeenCalled();
      expect(prefix).toContain("weather:");
      expect(prefix).toContain("25.5°C");
    });

    it("should handle weather fetch failure gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 39.9,
          longitude: 116.4,
        },
      };

      const prefix = await buildSystemPrefix(config);
      // 应该不抛错，返回空字符串
      expect(prefix).toBe("");
    });

    it("should handle missing weather data", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({}),
      });

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 39.9,
          longitude: 116.4,
        },
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toBe("");
    });
  });

  describe("injectSystemPrompt", () => {
    it("should return empty array for empty messages", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const result = await injectSystemPrompt([], config);
      expect(result).toEqual([]);
    });

    it("should insert system message when first message is not system", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [{ role: "user", content: "Hello" }];

      const result = await injectSystemPrompt(messages, config);

      expect(result[0].role).toBe("system");
      expect(result[0].content).toContain("system timestamp:");
      expect(result[1].role).toBe("user");
    });

    it("should prepend to existing system message", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [{ role: "system", content: "You are a helpful assistant." }];

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(1);
      expect(result[0].role).toBe("system");
      expect(result[0].content).toContain("system timestamp:");
      expect(result[0].content).toContain("You are a helpful assistant.");
    });

    it("should handle non-string content", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "user", content: { type: "text", text: "Hello" } },
      ];

      const result = await injectSystemPrompt(messages, config);

      expect(result[0].content).toBe('{"type":"text","text":"Hello"}');
    });

    it("should handle null content", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [{ role: "user", content: null }];

      const result = await injectSystemPrompt(messages, config);

      // null ?? "" 变成 ""，然后 JSON.stringify("") 返回 ""
      expect(result[0].content).toBe('""');
    });

    it("should preserve remaining messages", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ];

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(4); // system + 3 original
      expect(result[0].role).toBe("system");
      expect(result[1].role).toBe("user");
      expect(result[2].role).toBe("assistant");
      expect(result[3].role).toBe("user");
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("SystemPrompt - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  describe("buildSystemPrefix edge cases", () => {
    it("should handle all features enabled simultaneously", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            current_weather: { temperature: 20, windspeed: 5 },
          }),
      });
      global.fetch = mockFetch;

      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: true,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 0,
          longitude: 0,
        },
      };

      const prefix = await buildSystemPrefix(config);

      expect(prefix).toContain("system timestamp:");
      expect(prefix).toContain("lunar date:");
      expect(prefix).toContain("weather:");
    });

    it("should handle weather at extreme coordinates", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            current_weather: { temperature: -50, windspeed: 100 },
          }),
      });
      global.fetch = mockFetch;

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 90,  // North Pole
          longitude: 0,
        },
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toContain("-50°C");
    });

    it("should handle weather at negative coordinates", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            current_weather: { temperature: 15, windspeed: 10 },
          }),
      });
      global.fetch = mockFetch;

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: -33.8688,  // Sydney
          longitude: 151.2093,
        },
      };

      const prefix = await buildSystemPrefix(config);
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle weather with extreme temperature values", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            current_weather: { temperature: 56.7, windspeed: 0 },  // Death Valley record
          }),
      });
      global.fetch = mockFetch;

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 36.455,
          longitude: -116.866,
        },
      };

      const prefix = await buildSystemPrefix(config);
      expect(prefix).toContain("56.7°C");
    });

    it("should handle weather fetch timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timeout")), 5000);
          })
      );
      global.fetch = mockFetch;

      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: true,
        weather: {
          provider: "open-meteo",
          latitude: 0,
          longitude: 0,
        },
      };

      const prefixPromise = buildSystemPrefix(config);
      
      // 推进时间
      await vi.advanceTimersByTimeAsync(6000);

      const prefix = await prefixPromise;
      expect(prefix).toBe("");
    });

    it("should handle weather API returning malformed data", async () => {
      const testCases = [
        { current_weather: null },
        { current_weather: {} },
        { current_weather: { temperature: null } },
        { current_weather: { temperature: "not a number" } },
        { data: "wrong structure" },
        null,
        undefined,
      ];

      for (const responseData of testCases) {
        const mockFetch = vi.fn().mockResolvedValue({
          json: () => Promise.resolve(responseData),
        });
        global.fetch = mockFetch;

        const config: PromptInjectConfig = {
          enableTimestamp: false,
          enableLunar: false,
          enableWeather: true,
          weather: {
            provider: "open-meteo",
            latitude: 0,
            longitude: 0,
          },
        };

        const prefix = await buildSystemPrefix(config);
        // 应该优雅处理，不抛错
        expect(typeof prefix).toBe("string");
      }
    });

    it("should handle weather API returning HTTP errors", async () => {
      const errorStatuses = [400, 401, 403, 404, 429, 500, 502, 503];

      for (const status of errorStatuses) {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          statusText: `Error ${status}`,
        });
        global.fetch = mockFetch;

        const config: PromptInjectConfig = {
          enableTimestamp: false,
          enableLunar: false,
          enableWeather: true,
          weather: {
            provider: "open-meteo",
            latitude: 0,
            longitude: 0,
          },
        };

        // fetch 返回 ok: false 不会被当作错误，需要检查实际行为
        const prefix = await buildSystemPrefix(config);
        expect(typeof prefix).toBe("string");
      }
    });
  });

  describe("injectSystemPrompt edge cases", () => {
    it("should handle messages with only system messages", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "system", content: "System message 1" },
        { role: "system", content: "System message 2" },
      ];

      const result = await injectSystemPrompt(messages, config);

      // 只有第一条系统消息被修改
      expect(result.length).toBe(2);
      expect(result[0].content).toContain("system timestamp:");
    });

    it("should handle messages with mixed roles", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "user", content: "Q1" },
        { role: "assistant", content: "A1" },
        { role: "user", content: "Q2" },
        { role: "assistant", content: "A2" },
        { role: "user", content: "Q3" },
      ];

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(6);
      expect(result[0].role).toBe("system");
    });

    it("should handle empty config (all undefined)", async () => {
      const config: PromptInjectConfig = {};

      const messages = [{ role: "user", content: "Hello" }];
      const result = await injectSystemPrompt(messages, config);

      // 没有启用任何功能，应该不注入任何内容
      expect(result.length).toBe(1);
      expect(result[0].role).toBe("user");
    });

    it("should handle very long message content", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const longContent = "A".repeat(100000);
      const messages = [{ role: "user", content: longContent }];

      const result = await injectSystemPrompt(messages, config);

      // result[0] 是插入的 system message，result[1] 是 user message
      expect(result.length).toBe(2);
      expect(result[0].role).toBe("system");
      expect(result[0].content).toContain("system timestamp:");
      // user message 内容保持不变
      expect(result[1].content.length).toBe(100000);
      expect(result[1].content).toContain("A".repeat(100));
    });

    it("should handle message content with special characters", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const specialMessages = [
        { role: "user", content: "Message with \n\t\r newlines" },
        { role: "user", content: "Message with 中文 and 日本語 and 한국어" },
        { role: "user", content: "Message with emoji 🚀🎉🔥" },
        { role: "user", content: "Message with null\x00byte" },
        { role: "user", content: "'; DROP TABLE messages; --" },
      ];

      for (const msg of specialMessages) {
        const result = await injectSystemPrompt([msg], config);
        expect(result.length).toBe(1);
      }
    });

    it("should handle various content types", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const contentTypes = [
        { role: "user", content: 123 },
        { role: "user", content: true },
        { role: "user", content: false },
        { role: "user", content: null },
        { role: "user", content: undefined },
        { role: "user", content: [1, 2, 3] },
        { role: "user", content: { nested: { object: true } } },
      ];

      for (const msg of contentTypes) {
        const result = await injectSystemPrompt([msg], config);
        expect(result.length).toBe(1);
        expect(typeof result[0].content).toBe("string");
      }
    });

    it("should handle message with only whitespace content", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "user", content: "   " },
        { role: "user", content: "\n\t" },
        { role: "user", content: "" },
      ];

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(3);
    });

    it("should handle very large number of messages", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = Array.from({ length: 1000 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
      }));

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(1001); // 1000 + system message
    });

    it("should handle message with function role", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "What is weather?" },
        { role: "assistant", content: null, function_call: { name: "get_weather" } },
        { role: "function", content: '{"temp": 25}', name: "get_weather" },
      ];

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(4);
      expect(result[0].content).toContain("system timestamp:");
    });

    it("should handle tool message role", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      const messages = [
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: null, tool_calls: [{ id: "1", function: { name: "calc" } }] },
        { role: "tool", content: "4", tool_call_id: "1" },
      ];

      const result = await injectSystemPrompt(messages, config);

      expect(result.length).toBe(4); // system + 3 original
    });
  });

  describe("timestamp edge cases", () => {
    it("should handle different dates correctly", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: true,
        enableLunar: false,
        enableWeather: false,
      };

      // 测试不同时间点
      const testDates = [
        new Date("2024-01-01T00:00:00Z"),
        new Date("2024-12-31T23:59:59Z"),
        new Date("2000-02-29T12:00:00Z"),  // Leap year
        new Date("1970-01-01T00:00:00Z"),  // Unix epoch
      ];

      for (const date of testDates) {
        vi.setSystemTime(date);

        const prefix = await buildSystemPrefix(config);
        expect(prefix).toContain("system timestamp:");
        expect(prefix.length).toBeGreaterThan(0);
      }
    });
  });

  describe("lunar date edge cases", () => {
    it("should handle lunar date for various dates", async () => {
      const config: PromptInjectConfig = {
        enableTimestamp: false,
        enableLunar: true,
        enableWeather: false,
      };

      // 测试不同日期的农历转换
      const testDates = [
        new Date("2024-02-10"),  // Chinese New Year 2024
        new Date("2024-06-10"),
        new Date("2024-09-17"),  // Mid-Autumn Festival 2024
      ];

      for (const date of testDates) {
        vi.setSystemTime(date);

        const prefix = await buildSystemPrefix(config);
        expect(prefix).toContain("lunar date:");
      }
    });
  });
});