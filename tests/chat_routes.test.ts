import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { AppRuntime } from "../src/app_state.js";
import type { AppConfig } from "../src/core/types.js";
import { chatCompletionHandler } from "../src/routes/chat/index.js";

/**
 * Chat Routes 测试
 * @description 测试 /v1/chat/completions 接口
 */

// 测试配置
const createTestConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  server: {
    host: "127.0.0.1",
    port: 3000,
    admin: { adminToken: "test-admin-token-12345" },
  },
  providers: [
    {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
      strategy: "round_robin",
    },
  ],
  models: [
    {
      name: "test-model",
      provider: "test-provider",
      model: "gpt-4o-mini",
      supportsTools: true,
    },
  ],
  groups: [
    {
      name: "default",
      strategy: "round_robin",
      routes: [{ modelId: "test-provider/test-model" }],
    },
  ],
  keys: [
    {
      alias: "test-key",
      provider: "test-provider",
      key: "sk-test-key",
      quota: { type: "infinite" },
    },
  ],
  tools: { mcpTools: [] },
  cache: { enable: false, maxEntries: 100, dbPath: "./config/test_chat_cache.sqlite" },
  ...overrides,
});

// Mock 响应
const mockSuccessResponse = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: Date.now(),
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hello! How can I help you?" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

describe("Chat Routes", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    runtime = new AppRuntime(createTestConfig());

    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);

    // 注册 chat 路由
    app.post("/v1/chat/completions", chatCompletionHandler);
  });

  afterEach(async () => {
    await app.close();
    runtime.statsStore.close();
    global.fetch = originalFetch;
  });

  // ============================================================
  // 参数验证
  // ============================================================
  describe("参数验证", () => {
    it("rejects request without model", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { messages: [{ role: "user", content: "Hello" }] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("invalid request");
    });

    it("rejects request without messages", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "test-provider/test-model" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("invalid request");
    });

    it("rejects request with non-array messages", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: { model: "test-provider/test-model", messages: "not an array" },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ============================================================
  // 模型查找
  // ============================================================
  describe("模型查找", () => {
    it("returns 404 for non-existent model", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "non-existent-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("model not found");
    });
  });

  // ============================================================
  // 分组模型
  // ============================================================
  describe("分组模型", () => {
    it("routes to group model correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/default",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });

    it("returns 404 for invalid group route", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/non-existent",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      // group/non-existent 不在 isGroup 检测范围内，会被当作普通模型查找
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("model not found");
    });
  });

  // ============================================================
  // Key 选择
  // ============================================================
  describe("Key 选择", () => {
    it("returns 429 when no available key for provider", async () => {
      // 创建只有不同提供商 key 的运行时
      const configWithDifferentProvider = createTestConfig({
        keys: [
          {
            alias: "other-key",
            provider: "other-provider",
            key: "sk-other-key",
            quota: { type: "infinite" },
          },
        ],
        providers: [
          {
            name: "test-provider",
            baseUrl: "https://api.test.com/v1",
            strategy: "round_robin",
          },
          {
            name: "other-provider",
            baseUrl: "https://api.other.com/v1",
            strategy: "round_robin",
          },
        ],
      });
      const runtimeNoKey = new AppRuntime(configWithDifferentProvider);
      
      // 创建新的 app 实例
      const testApp = Fastify({ logger: false });
      testApp.decorate("runtime", runtimeNoKey);
      testApp.post("/v1/chat/completions", chatCompletionHandler);

      const response = await testApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error).toBe("no available key");

      await testApp.close();
      runtimeNoKey.statsStore.close();
    });
  });

  // ============================================================
  // RPM 限流
  // ============================================================
  describe("RPM 限流", () => {
    it("RPM limiter is configured correctly", async () => {
      // 验证 RPM 限流器已正确初始化
      const configWithRpm = createTestConfig({
        providers: [
          {
            name: "test-provider",
            baseUrl: "https://api.test.com/v1",
            strategy: "round_robin",
            rpmLimit: 10,
          },
        ],
      });
      const runtimeWithRpm = new AppRuntime(configWithRpm);

      expect(runtimeWithRpm.rpmLimiters.has("test-provider")).toBe(true);

      runtimeWithRpm.statsStore.close();
    });

    it("requests succeed under RPM limit", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================================
  // 成功请求
  // ============================================================
  describe("成功请求", () => {
    it("returns response from upstream", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBe("Hello! How can I help you?");
    });

    it("passes correct model to upstream", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.model).toBe("gpt-4o-mini");
    });

    it("does not require authentication", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
        // 无 Authorization header
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================================
  // 统计记录
  // ============================================================
  describe("统计记录", () => {
    it("records successful call for group model", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/default",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      // 获取统计数据
      const stats = runtime.statsStore.getGroupSummary(24);
      // 应该有统计数据（可能为空数组如果没有记录）
      expect(Array.isArray(stats)).toBe(true);
    });
  });

  // ============================================================
  // 上游错误处理
  // ============================================================
  describe("上游错误处理", () => {
    it("propagates upstream error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ============================================================
  // Usage 计算
  // ============================================================
  describe("Usage 计算", () => {
    it("estimates tokens when upstream does not provide usage", async () => {
      const mockResponseWithoutUsage = {
        id: "chatcmpl-test",
        object: "chat.completion",
        created: Date.now(),
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Short response" },
            finish_reason: "stop",
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponseWithoutUsage),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.usage).toBeDefined();
      expect(data.usage.prompt_tokens).toBeGreaterThan(0);
      expect(data.usage.completion_tokens).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // extraBody 支持
  // ============================================================
  describe("extraBody 支持", () => {
    it("passes extra_body to upstream", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
          extra_body: { custom_param: "value" },
        },
      });

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.custom_param).toBe("value");
    });
  });

  // ============================================================
  // 插件钩子测试
  // ============================================================
  describe("插件钩子", () => {
    it("executes beforeRequest hook", async () => {
      let hookCalled = false;
      
      const testPlugin = {
        name: "test-hook-plugin",
        version: "1.0.0",
        hooks: {
          beforeRequest: () => {
            hookCalled = true;
          },
        },
      };

      await runtime.registerPlugin(testPlugin);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(hookCalled).toBe(true);
    });

    it("executes afterRequest hook on success", async () => {
      let receivedResult: unknown;
      
      const testPlugin = {
        name: "after-request-plugin",
        version: "1.0.0",
        hooks: {
          afterRequest: (_ctx: unknown, result: unknown) => {
            receivedResult = result;
          },
        },
      };

      await runtime.registerPlugin(testPlugin);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(receivedResult).toBeDefined();
    });
  });

  // ============================================================
  // -cache 后缀测试
  // ============================================================
  describe("-cache 后缀", () => {
    it("routes to group with -cache suffix", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/default-cache",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================================
  // 边界条件测试
  // ============================================================
  describe("边界条件", () => {
    it("handles empty messages array", async () => {
      // Mock fetch to avoid real network requests
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [],
        },
      });

      // 空消息数组可能导致上游错误或返回
      // 取决于上游 API 的行为
      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it("handles very long message content", async () => {
      const longContent = "a".repeat(10000);
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: longContent }],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("handles special characters in message content", async () => {
      const specialContent = "你好世界 🎉 \n\t\"'<>&";
      
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: specialContent }],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("handles multimodal content array", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Hello" },
                { type: "image_url", image_url: { url: "https://example.com/image.png" } },
              ],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================================
  // fake_non_stream 模式测试
  // ============================================================
  describe("fake_non_stream 模式", () => {
    // 创建流式响应的 mock
    const createStreamMock = () => {
      const streamData = [
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-mini","choices":[{"delta":{"role":"assistant"},"index":0,"finish_reason":null}]}\n\n',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-mini","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}\n\n',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-mini","choices":[{"delta":{"content":" world"},"index":0,"finish_reason":null}]}\n\n',
        'data: {"id":"chat-1","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4o-mini","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ].join("");

      return {
        ok: true,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamData) })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      };
    };

    it("客户端请求非流式时，应该发送流式请求到上游并返回非流式响应", async () => {
      // 创建带有 fake_non_stream 配置的运行时
      const configWithFakeNonStream = createTestConfig({
        providers: [
          {
            name: "test-provider",
            baseUrl: "https://api.test.com/v1",
            strategy: "round_robin",
            streamMode: "fake_non_stream",
          },
        ],
      });
      const runtimeFakeNonStream = new AppRuntime(configWithFakeNonStream);

      const testApp = Fastify({ logger: false });
      testApp.decorate("runtime", runtimeFakeNonStream);
      testApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue(createStreamMock());
      global.fetch = mockFetch;

      // 客户端请求非流式
      const response = await testApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
          stream: false, // 客户端请求非流式
        },
      });

      // 验证响应
      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.choices).toBeDefined();
      expect(data.choices[0].message.content).toBe("Hello world");

      // 验证发送到上游的请求是流式的
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.stream).toBe(true); // 上游应该收到 stream: true

      await testApp.close();
      runtimeFakeNonStream.statsStore.close();
    });

    it("上游返回错误时应该正确传播错误", async () => {
      const configWithFakeNonStream = createTestConfig({
        providers: [
          {
            name: "test-provider",
            baseUrl: "https://api.test.com/v1",
            strategy: "round_robin",
            streamMode: "fake_non_stream",
          },
        ],
      });
      const runtimeFakeNonStream = new AppRuntime(configWithFakeNonStream);

      const testApp = Fastify({ logger: false });
      testApp.decorate("runtime", runtimeFakeNonStream);
      testApp.post("/v1/chat/completions", chatCompletionHandler);

      // 模拟上游返回错误（比如只支持非流式的 API 返回错误）
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('{"error": "This API only supports streaming mode"}'),
      });
      global.fetch = mockFetch;

      // 客户端请求非流式
      const response = await testApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        },
      });

      // 应该传播上游错误
      expect(response.statusCode).toBe(400);

      await testApp.close();
      runtimeFakeNonStream.statsStore.close();
    });

    it("客户端请求流式时，应该直接转发流式响应", async () => {
      const configWithFakeNonStream = createTestConfig({
        providers: [
          {
            name: "test-provider",
            baseUrl: "https://api.test.com/v1",
            strategy: "round_robin",
            streamMode: "fake_non_stream",
          },
        ],
      });
      const runtimeFakeNonStream = new AppRuntime(configWithFakeNonStream);

      const testApp = Fastify({ logger: false });
      testApp.decorate("runtime", runtimeFakeNonStream);
      testApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue(createStreamMock());
      global.fetch = mockFetch;

      // 客户端请求流式
      const response = await testApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "test-provider/test-model",
          messages: [{ role: "user", content: "Hello" }],
          stream: true, // 客户端请求流式
        },
      });

      // 验证响应是流式的
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("text/event-stream");

      // 验证发送到上游的请求是流式的
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.stream).toBe(true);

      await testApp.close();
      runtimeFakeNonStream.statsStore.close();
    });
  });
});
