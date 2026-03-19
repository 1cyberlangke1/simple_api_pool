import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callChatCompletion, applyOverrides } from "../src/core/openai_proxy.js";
import type { ProviderConfig, ModelConfig } from "../src/core/types.js";

/**
 * OpenAI Proxy 单元测试
 * @description 测试 OpenAI 兼容代理功能
 */

describe("OpenAI Proxy", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  describe("applyOverrides", () => {
    const baseRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.7,
    };

    it("should return original request when no overrides", () => {
      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect(result).toEqual(baseRequest);
    });

    it("should apply extraBody from provider", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        extraBody: { top_p: 0.9 },
      };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect(result.top_p).toBe(0.9);
      expect(result.model).toBe("gpt-4");
    });

    it("should apply extraBody from model", () => {
      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = {
        name: "gpt-4",
        provider: "test",
        model: "gpt-4",
        extraBody: { max_tokens: 1000 },
      };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect(result.max_tokens).toBe(1000);
    });

    it("should apply requestOverrides from provider", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        requestOverrides: { stream: true },
      };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect(result.stream).toBe(true);
    });

    it("should apply requestOverrides from model", () => {
      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = {
        name: "gpt-4",
        provider: "test",
        model: "gpt-4",
        requestOverrides: { temperature: 0.5 },
      };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect(result.temperature).toBe(0.5);
    });

    it("should apply all overrides in correct order", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        extraBody: { top_p: 0.9 },
        requestOverrides: { stream: true },
      };
      const model: ModelConfig = {
        name: "gpt-4",
        provider: "test",
        model: "gpt-4",
        extraBody: { max_tokens: 1000 },
        requestOverrides: { temperature: 0.3 },
      };
      const extraBody = { frequency_penalty: 0.5 };

      const result = applyOverrides(baseRequest, provider, model, extraBody);

      expect(result.top_p).toBe(0.9);
      expect(result.max_tokens).toBe(1000);
      expect(result.frequency_penalty).toBe(0.5);
      expect(result.stream).toBe(true);
      expect(result.temperature).toBe(0.3);
    });

    it("should give model overrides higher priority", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        requestOverrides: { temperature: 0.8 },
      };
      const model: ModelConfig = {
        name: "gpt-4",
        provider: "test",
        model: "gpt-4",
        requestOverrides: { temperature: 0.2 },
      };

      const result = applyOverrides(baseRequest, provider, model, {});

      // model 覆写应该优先生效
      expect(result.temperature).toBe(0.2);
    });
  });

  describe("callChatCompletion", () => {
    it("should call the correct URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com/v1",
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/v1/chat/completions",
        expect.any(Object)
      );
    });

    it("should include authorization header", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      await callChatCompletion(provider, "my-secret-key", { model: "gpt-4" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer my-secret-key",
          }),
        })
      );
    });

    it("should include custom headers from provider", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        headers: { "X-Custom": "value" },
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom": "value",
          }),
        })
      );
    });

    it("should return response on success", async () => {
      const mockResponse = {
        choices: [{ message: { content: "Hello!" } }],
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      expect(result).toEqual(mockResponse);
    });

    it("should throw on upstream error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limit exceeded"),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      await expect(callChatCompletion(provider, "sk-test", { model: "gpt-4" })).rejects.toThrow(
        "Upstream error: 429"
      );
    });

    it("should set timeout signal when timeoutMs specified", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        timeoutMs: 30000,
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.signal).toBeDefined();
    });

    it("should handle baseUrl with trailing slash", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com/",
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/chat/completions",
        expect.any(Object)
      );
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("OpenAI Proxy - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  describe("applyOverrides edge cases", () => {
    const baseRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };

    it("should handle empty request", () => {
      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides({}, provider, model, {});

      expect(result).toEqual({});
    });

    it("should handle extraBody with nested objects", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        extraBody: {
          nested: {
            deep: {
              value: 123,
            },
          },
          array: [1, 2, 3],
        },
      };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect((result as any).nested.deep.value).toBe(123);
      expect((result as any).array).toEqual([1, 2, 3]);
    });

    it("should handle extraBody with null values", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        extraBody: { nullable: null, defined: "value" },
      };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect((result as any).nullable).toBeNull();
      expect((result as any).defined).toBe("value");
    });

    it("should handle requestOverrides with various types", () => {
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        requestOverrides: {
          string: "value",
          number: 123,
          boolean: true,
          null: null,
          array: [1, 2, 3],
          object: { key: "value" },
        },
      };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(baseRequest, provider, model, {});

      expect((result as any).string).toBe("value");
      expect((result as any).number).toBe(123);
      expect((result as any).boolean).toBe(true);
      expect((result as any).null).toBeNull();
      expect((result as any).array).toEqual([1, 2, 3]);
      expect((result as any).object).toEqual({ key: "value" });
    });

    it("should handle extra body parameter with special values", () => {
      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const extraBody = {
        unicode: "中文日本語한국어",
        emoji: "🚀🎉🔥",
        special: "null\ttab\nnewline",
      };

      const result = applyOverrides(baseRequest, provider, model, extraBody);

      expect((result as any).unicode).toBe("中文日本語한국어");
      expect((result as any).emoji).toBe("🚀🎉🔥");
    });

    it("should handle conflicting overrides with correct priority", () => {
      // Priority: extraBody < provider.extraBody < model.extraBody < requestOverrides
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        extraBody: { value: "provider", shared: "provider-shared" },
        requestOverrides: { value: "provider-override" },
      };
      const model: ModelConfig = {
        name: "gpt-4",
        provider: "test",
        model: "gpt-4",
        extraBody: { value: "model", modelOnly: "from-model" },
        requestOverrides: { value: "model-override" },
      };

      const extraBody = { value: "call", callOnly: "from-call" };

      const result = applyOverrides(baseRequest, provider, model, extraBody);

      // requestOverrides from model has highest priority
      expect((result as any).value).toBe("model-override");
      expect((result as any).shared).toBe("provider-shared");
      expect((result as any).modelOnly).toBe("from-model");
      expect((result as any).callOnly).toBe("from-call");
    });

    it("should handle very large request object", () => {
      const largeRequest = {
        model: "gpt-4",
        messages: Array.from({ length: 1000 }, (_, i) => ({
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message ${i} with content `.repeat(100),
        })),
      };

      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(largeRequest, provider, model, {});

      expect((result.messages as Array<unknown>).length).toBe(1000);
    });

    it("should handle request with tools definition", () => {
      const requestWithTools = {
        model: "gpt-4",
        messages: [{ role: "user", content: "What is the weather?" }],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather info",
              parameters: { type: "object", properties: { location: { type: "string" } } },
            },
          },
        ],
      };

      const provider: ProviderConfig = { name: "test", baseUrl: "https://api.test.com" };
      const model: ModelConfig = { name: "gpt-4", provider: "test", model: "gpt-4" };

      const result = applyOverrides(requestWithTools, provider, model, {});

      expect((result as any).tools).toBeDefined();
      expect((result as any).tools[0].function.name).toBe("get_weather");
    });
  });

  describe("callChatCompletion edge cases", () => {
    it("should handle various HTTP status codes", async () => {
      const statusCodes = [400, 401, 403, 404, 429, 500, 502, 503, 504];

      for (const status of statusCodes) {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          text: () => Promise.resolve(`Error ${status}`),
        });
        global.fetch = mockFetch;

        const provider: ProviderConfig = {
          name: "test",
          baseUrl: "https://api.test.com",
        };

        await expect(callChatCompletion(provider, "sk-test", { model: "gpt-4" })).rejects.toThrow(
          `Upstream error: ${status}`
        );
      }
    });

    it("should handle network errors", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      await expect(callChatCompletion(provider, "sk-test", { model: "gpt-4" })).rejects.toThrow(
        "Network error"
      );
    });

    it("should handle timeout", async () => {
      // 直接模拟 AbortError
      const mockFetch = vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      );
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        timeoutMs: 50,
      };

      await expect(callChatCompletion(provider, "sk-test", { model: "gpt-4" })).rejects.toThrow();
    });

    it("should handle malformed JSON response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      await expect(callChatCompletion(provider, "sk-test", { model: "gpt-4" })).rejects.toThrow(
        "Invalid JSON"
      );
    });

    it("should handle empty response body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await callChatCompletion(provider, "sk-test", { model: "gpt-4" });
      expect(result).toEqual({});
    });

    it("should handle very large response", async () => {
      const largeResponse = {
        choices: [
          {
            message: {
              content: "A".repeat(100000),
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(largeResponse),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await callChatCompletion(provider, "sk-test", { model: "gpt-4" });
      expect(((result.choices as Array<{message: {content: string}}>)[0].message.content.length)).toBe(100000);
    });

    it("should handle API key with special characters", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const specialKeys = [
        "sk-test_with_underscore",
        "sk-test-with-dash",
        "sk-test.with.dots",
        "sk-测试密钥",
        "sk-日本語キー",
      ];

      for (const key of specialKeys) {
        await callChatCompletion(provider, key, { model: "gpt-4" });
      }

      expect(mockFetch).toHaveBeenCalledTimes(specialKeys.length);
    });

    it("should handle baseUrl with various formats", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const baseUrlFormats = [
        "https://api.test.com",
        "https://api.test.com/",
        "https://api.test.com/v1",
        "https://api.test.com/v1/",
        "https://api.test.com:8080",
        "https://api.test.com:8080/v1/",
        "http://localhost:3000",
        "http://localhost:3000/v1",
      ];

      for (const baseUrl of baseUrlFormats) {
        const provider: ProviderConfig = {
          name: "test",
          baseUrl,
        };

        await callChatCompletion(provider, "sk-test", { model: "gpt-4" });
      }

      expect(mockFetch).toHaveBeenCalledTimes(baseUrlFormats.length);
    });

    it("should handle custom headers with special values", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
        headers: {
          "X-Custom-Header": "value with spaces and\ttabs",
          "X-Unicode": "中文Header日本語",
          "X-Emoji": "🚀🎉",
          "X-Special": "null\nnewline",
        },
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers["X-Unicode"]).toBe("中文Header日本語");
      expect(callArgs.headers["X-Emoji"]).toBe("🚀🎉");
    });

    it("should handle request with streaming", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      await callChatCompletion(provider, "sk-test", {
        model: "gpt-4",
        stream: true,
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.stream).toBe(true);
    });

    it("should handle request with function calling", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const requestWithFunctions = {
        model: "gpt-4",
        messages: [{ role: "user", content: "What is the weather?" }],
        functions: [
          {
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object" },
          },
        ],
        function_call: "auto",
      };

      await callChatCompletion(provider, "sk-test", requestWithFunctions);

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.functions).toBeDefined();
      expect(body.function_call).toBe("auto");
    });

    it("should handle concurrent requests", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const promises = Array.from({ length: 50 }, (_, i) =>
        callChatCompletion(provider, "sk-test", { model: `model-${i}` })
      );

      await Promise.all(promises);

      expect(mockFetch).toHaveBeenCalledTimes(50);
    });
  });

  describe("baseUrl construction edge cases", () => {
    it("should handle baseUrl without protocol", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      // 没有 protocol 的 URL 可能会失败，但这是预期行为
      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "api.test.com",
      };

      // 实际行为取决于 fetch 实现
      try {
        await callChatCompletion(provider, "sk-test", { model: "gpt-4" });
      } catch {
        // 预期可能失败
      }
    });

    it("should handle baseUrl with IP address", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "http://192.168.1.1:8080/v1",
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://192.168.1.1:8080/v1/chat/completions",
        expect.any(Object)
      );
    });

    it("should handle baseUrl with localhost", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "http://localhost:3000",
      };

      await callChatCompletion(provider, "sk-test", { model: "gpt-4" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/chat/completions",
        expect.any(Object)
      );
    });
  });
});

// ============================================================
// 流式响应测试
// ============================================================

import {
  callChatCompletionStream,
  collectStreamToNonStream,
} from "../src/core/openai_proxy.js";

describe("Stream Functions", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("callChatCompletionStream", () => {
    it("should yield parsed chunks from stream", async () => {
      const streamData = [
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"1","choices":[{"delta":{"content":" world"}}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const chunks = [];
      for await (const chunk of callChatCompletionStream(provider, "sk-test", {
        model: "gpt-4",
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe("Hello");
      expect(chunks[1].choices[0].delta.content).toBe(" world");
    });

    it("should throw on upstream error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal error"),
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const generator = callChatCompletionStream(provider, "sk-test", { model: "gpt-4" });
      await expect(generator.next()).rejects.toThrow("Upstream error: 500");
    });

    it("should throw when no response body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const generator = callChatCompletionStream(provider, "sk-test", { model: "gpt-4" });
      await expect(generator.next()).rejects.toThrow("No response body");
    });

    it("should handle malformed JSON in stream", async () => {
      const streamData = [
        'data: {"id":"1","choices":[{"delta":{"content":"valid"}}]}\n\n',
        "data: {invalid json}\n\n",
        "data: [DONE]\n\n",
      ].join("");

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const chunks = [];
      for await (const chunk of callChatCompletionStream(provider, "sk-test", {
        model: "gpt-4",
      })) {
        chunks.push(chunk);
      }

      // 只有有效的 JSON 应该被解析
      expect(chunks).toHaveLength(1);
      expect(chunks[0].choices[0].delta.content).toBe("valid");
    });

    it("should handle tool calls in stream", async () => {
      const streamData = [
        'data: {"id":"1","choices":[{"delta":{"tool_calls":[{"id":"tc1","type":"function","function":{"name":"get_weather","arguments":"{\\"loc"}}]}}]}\n\n',
        'data: {"id":"1","choices":[{"delta":{"tool_calls":[{"id":"tc1","type":"function","function":{"name":"","arguments":"ation\\": \\"NY\\"}"}}]}}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const chunks = [];
      for await (const chunk of callChatCompletionStream(provider, "sk-test", {
        model: "gpt-4",
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.tool_calls).toBeDefined();
    });
  });

  describe("collectStreamToNonStream", () => {
    it("should collect stream into non-stream response", async () => {
      const streamData = [
        'data: {"id":"chat-1","model":"gpt-4","created":1234567890,"choices":[{"delta":{"role":"assistant","content":"Hello"}}]}\n\n',
        'data: {"id":"chat-1","model":"gpt-4","created":1234567890,"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"id":"chat-1","model":"gpt-4","choices":[{"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await collectStreamToNonStream(provider, "sk-test", {
        model: "gpt-4",
      });

      expect(result.id).toBe("chat-1");
      expect(result.model).toBe("gpt-4");
      expect((result as any).choices[0].message.content).toBe("Hello world");
      expect((result as any).choices[0].finish_reason).toBe("stop");
    });

    it("should handle usage in stream", async () => {
      const streamData = [
        'data: {"id":"chat-1","model":"gpt-4","choices":[{"delta":{"content":"test"}}]}\n\n',
        'data: {"id":"chat-1","model":"gpt-4","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await collectStreamToNonStream(provider, "sk-test", {
        model: "gpt-4",
      });

      expect((result as any).usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it("should handle empty stream", async () => {
      const streamData = "data: [DONE]\n\n";

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await collectStreamToNonStream(provider, "sk-test", {
        model: "gpt-4",
      });

      expect(result.id).toBeDefined();
      expect((result as any).choices[0].message.content).toBeUndefined();
    });

    it("should collect tool calls from stream", async () => {
      const streamData = [
        'data: {"id":"chat-1","choices":[{"delta":{"tool_calls":[{"id":"tc1","type":"function","function":{"name":"get_weather","arguments":"{\\"ci"}}]}}]}\n\n',
        'data: {"id":"chat-1","choices":[{"delta":{"tool_calls":[{"id":"tc1","type":"function","function":{"name":"","arguments":"ty\\": \\"NY\\"}"}}]}}]}\n\n',
        'data: {"id":"chat-1","choices":[{"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      global.fetch = mockFetch;

      const provider: ProviderConfig = {
        name: "test",
        baseUrl: "https://api.test.com",
      };

      const result = await collectStreamToNonStream(provider, "sk-test", {
        model: "gpt-4",
      });

      const toolCalls = (result as any).choices[0].message.tool_calls;
      expect(toolCalls).toBeDefined();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].function.name).toBe("get_weather");
      expect(toolCalls[0].function.arguments).toBe('{"city": "NY"}');
    });
  });
});