/**
 * Chat 路由集成测试
 * @description 测试 JS 工具、MCP 工具、混合调用、提示词注入、截断检测
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import fs from "fs";
import { AppRuntime } from "../src/app_state.js";
import type { AppConfig } from "../src/core/types.js";
import { chatCompletionHandler } from "../src/routes/chat/index.js";
import { ToolRegistry } from "../src/core/tool_registry.js";
import { JsSandbox } from "../src/core/js_sandbox.js";
import { addTruncationPrompt, stripTruncationSuffix } from "../src/core/truncation.js";
import { injectSystemPrompt } from "../src/core/system_prompt.js";

// ============================================================
// 测试配置工厂
// ============================================================

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
  cache: { enable: false, maxEntries: 100, dbPath: "./config/test_integration_cache.sqlite" },
  ...overrides,
});

// ============================================================
// Mock 响应
// ============================================================

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

// 带工具调用的响应
const mockToolCallResponse = (toolName: string, args: Record<string, unknown> = {}) => ({
  id: "chatcmpl-tool",
  object: "chat.completion",
  created: Date.now(),
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-123",
            type: "function",
            function: { name: toolName, arguments: JSON.stringify(args) },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

// 后续响应（工具执行后）
const mockFollowUpResponse = (content: string) => ({
  id: "chatcmpl-followup",
  object: "chat.completion",
  created: Date.now(),
  model: "gpt-4o-mini",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
});

// ============================================================
// 测试套件
// ============================================================

describe("Chat Integration Tests", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    runtime = new AppRuntime(createTestConfig());

    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);

    app.post("/v1/chat/completions", chatCompletionHandler);
  });

  afterEach(async () => {
    await app.close();
    runtime.statsStore.close();
    runtime.groupCacheManager.close();
    global.fetch = originalFetch;
  });

  // ============================================================
  // 1. JS 工具调用测试
  // ============================================================
  describe("JS Tool Invocation", () => {
    it("should execute JS tool and return follow-up response", async () => {
      // 创建带有工具配置的 runtime
      const toolConfig = createTestConfig({
        groups: [
          {
            name: "js-tool-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              tools: ["calculator"],
              toolRoutingStrategy: "local_first",
            },
          },
        ],
      });
      const toolRuntime = new AppRuntime(toolConfig);
      const sandbox = new JsSandbox();

      // 注册 JS 工具到 toolRegistry
      toolRuntime.toolRegistry.register(
        {
          name: "calculator",
          description: "Simple calculator",
          inputSchema: {
            type: "object",
            properties: {
              expression: { type: "string" },
            },
            required: ["expression"],
          },
        },
        async (args) => {
          const result = await sandbox.execute(
            `return eval(args.expression);`,
            { args }
          );
          return result.result;
        }
      );

      const toolApp = Fastify({ logger: false });
      toolApp.decorate("runtime", toolRuntime);
      toolApp.post("/v1/chat/completions", chatCompletionHandler);

      // 模拟第一次返回工具调用，第二次返回最终响应
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: () => Promise.resolve(mockToolCallResponse("calculator", { expression: "2+2" })),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve(mockFollowUpResponse("The result of 2+2 is 4.")),
        };
      });
      global.fetch = mockFetch;

      const response = await toolApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/js-tool-group",
          messages: [{ role: "user", content: "Calculate 2+2" }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await toolApp.close();
      toolRuntime.statsStore.close();
      toolRuntime.groupCacheManager.close();
    });

    it("should handle JS tool execution error gracefully", async () => {
      const toolConfig = createTestConfig({
        groups: [
          {
            name: "error-tool-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              tools: ["error_tool"],
              toolRoutingStrategy: "local_first",
            },
          },
        ],
      });
      const toolRuntime = new AppRuntime(toolConfig);

      toolRuntime.toolRegistry.register(
        {
          name: "error_tool",
          description: "A tool that throws error",
          inputSchema: { type: "object", properties: {} },
        },
        async () => {
          throw new Error("Tool execution failed");
        }
      );

      const toolApp = Fastify({ logger: false });
      toolApp.decorate("runtime", toolRuntime);
      toolApp.post("/v1/chat/completions", chatCompletionHandler);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: () => Promise.resolve(mockToolCallResponse("error_tool", {})),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve(mockFollowUpResponse("Tool failed but continuing")),
        };
      });
      global.fetch = mockFetch;

      const response = await toolApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/error-tool-group",
          messages: [{ role: "user", content: "Test error" }],
        },
      });

      expect(response.statusCode).toBe(200);

      await toolApp.close();
      toolRuntime.statsStore.close();
      toolRuntime.groupCacheManager.close();
    });
  });

  // ============================================================
  // 2. MCP 工具调用测试（模拟）
  // ============================================================
  describe("MCP Tool Invocation (Mocked)", () => {
    it("should call MCP tool through toolRegistry", async () => {
      // 创建带有工具配置的 runtime
      const mcpConfig = createTestConfig({
        groups: [
          {
            name: "mcp-tool-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              tools: ["mcp_weather"],
              toolRoutingStrategy: "local_first",
            },
          },
        ],
      });
      const mcpRuntime = new AppRuntime(mcpConfig);

      // 模拟 MCP 工具
      mcpRuntime.toolRegistry.register(
        {
          name: "mcp_weather",
          description: "Get weather from MCP server",
          inputSchema: {
            type: "object",
            properties: {
              city: { type: "string" },
            },
            required: ["city"],
          },
        },
        async (args) => {
          // 模拟 MCP 工具响应
          return { temperature: 25, city: (args as { city: string }).city };
        }
      );

      const mcpApp = Fastify({ logger: false });
      mcpApp.decorate("runtime", mcpRuntime);
      mcpApp.post("/v1/chat/completions", chatCompletionHandler);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: () => Promise.resolve(mockToolCallResponse("mcp_weather", { city: "Beijing" })),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve(mockFollowUpResponse("Beijing temperature is 25°C")),
        };
      });
      global.fetch = mockFetch;

      const response = await mcpApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/mcp-tool-group",
          messages: [{ role: "user", content: "What's the weather in Beijing?" }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // 验证工具结果被传递到后续请求
      const secondCall = mockFetch.mock.calls[1];
      const secondBody = JSON.parse(secondCall[1].body);
      const toolMessage = secondBody.messages.find((m: { role: string }) => m.role === "tool");
      expect(toolMessage).toBeDefined();
      const toolContent = JSON.parse(toolMessage.content);
      expect(toolContent.temperature).toBe(25);

      await mcpApp.close();
      mcpRuntime.statsStore.close();
      mcpRuntime.groupCacheManager.close();
    });

    it("should handle multiple MCP tool calls in sequence", async () => {
      const mcpConfig = createTestConfig({
        groups: [
          {
            name: "multi-mcp-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              tools: ["mcp_search"],
              toolRoutingStrategy: "local_first",
            },
          },
        ],
      });
      const mcpRuntime = new AppRuntime(mcpConfig);

      mcpRuntime.toolRegistry.register(
        {
          name: "mcp_search",
          description: "Search the web",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
        async (args) => ({ results: [`Result for ${(args as { query: string }).query}`] })
      );

      const mcpApp = Fastify({ logger: false });
      mcpApp.decorate("runtime", mcpRuntime);
      mcpApp.post("/v1/chat/completions", chatCompletionHandler);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                id: "chatcmpl-multi",
                object: "chat.completion",
                created: Date.now(),
                model: "gpt-4o-mini",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call-1",
                          type: "function",
                          function: { name: "mcp_search", arguments: '{"query":"cats"}' },
                        },
                        {
                          id: "call-2",
                          type: "function",
                          function: { name: "mcp_search", arguments: '{"query":"dogs"}' },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
              }),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve(mockFollowUpResponse("Found results for both cats and dogs")),
        };
      });
      global.fetch = mockFetch;

      const response = await mcpApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/multi-mcp-group",
          messages: [{ role: "user", content: "Search for cats and dogs" }],
        },
      });

      expect(response.statusCode).toBe(200);

      await mcpApp.close();
      mcpRuntime.statsStore.close();
      mcpRuntime.groupCacheManager.close();
    });
  });

  // ============================================================
  // 3. JS + MCP 混合调用测试
  // ============================================================
  describe("Mixed JS and MCP Tool Calls", () => {
    it("should execute both JS and MCP tools in same request", async () => {
      const sandbox = new JsSandbox();

      const mixedConfig = createTestConfig({
        groups: [
          {
            name: "mixed-tool-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              tools: ["js_calculator", "mcp_weather"],
              toolRoutingStrategy: "local_first",
            },
          },
        ],
      });
      const mixedRuntime = new AppRuntime(mixedConfig);

      // 注册 JS 工具
      mixedRuntime.toolRegistry.register(
        {
          name: "js_calculator",
          description: "JS Calculator",
          inputSchema: { type: "object", properties: { expr: { type: "string" } } },
        },
        async (args) => {
          const result = await sandbox.execute(
            `return eval(args.expr);`,
            { args }
          );
          return { result: result.result };
        }
      );

      // 注册 MCP 工具
      mixedRuntime.toolRegistry.register(
        {
          name: "mcp_weather",
          description: "MCP Weather",
          inputSchema: { type: "object", properties: { city: { type: "string" } } },
        },
        async (args) => ({ temp: 20, city: (args as { city: string }).city })
      );

      const mixedApp = Fastify({ logger: false });
      mixedApp.decorate("runtime", mixedRuntime);
      mixedApp.post("/v1/chat/completions", chatCompletionHandler);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                id: "chatcmpl-mixed",
                object: "chat.completion",
                created: Date.now(),
                model: "gpt-4o-mini",
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call-1",
                          type: "function",
                          function: { name: "js_calculator", arguments: '{"expr":"10*5"}' },
                        },
                        {
                          id: "call-2",
                          type: "function",
                          function: { name: "mcp_weather", arguments: '{"city":"Tokyo"}' },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
                usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
              }),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve(mockFollowUpResponse("Calculated 50 and Tokyo temp is 20°C")),
        };
      });
      global.fetch = mockFetch;

      const response = await mixedApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/mixed-tool-group",
          messages: [{ role: "user", content: "Calculate 10*5 and check Tokyo weather" }],
        },
      });

      expect(response.statusCode).toBe(200);

      // 验证两个工具都被执行
      const secondCall = mockFetch.mock.calls[1];
      expect(secondCall).toBeDefined();
      const secondBody = JSON.parse(secondCall[1].body);
      const toolMessages = secondBody.messages.filter((m: { role: string }) => m.role === "tool");
      expect(toolMessages).toHaveLength(2);

      await mixedApp.close();
      mixedRuntime.statsStore.close();
      mixedRuntime.groupCacheManager.close();
    });
  });

  // ============================================================
  // 4. 下游工具传递测试 (passthrough)
  // ============================================================
  describe("Downstream Tool Passthrough", () => {
    it("should pass through unknown tools to downstream with passthrough strategy", async () => {
      // 创建 passthrough 策略的配置
      const passthroughConfig = createTestConfig({
        groups: [
          {
            name: "passthrough-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              toolRoutingStrategy: "passthrough",
            },
          },
        ],
      });

      const passthroughRuntime = new AppRuntime(passthroughConfig);
      const passthroughApp = Fastify({ logger: false });
      passthroughApp.decorate("runtime", passthroughRuntime);
      passthroughApp.post("/v1/chat/completions", chatCompletionHandler);

      // 下游工具（不在本地注册）
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "chatcmpl-downstream",
            object: "chat.completion",
            created: Date.now(),
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: { name: "downstream_function", arguments: '{"param":"value"}' },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          }),
      });
      global.fetch = mockFetch;

      const response = await passthroughApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/passthrough-group",
          messages: [{ role: "user", content: "Use downstream function" }],
        },
      });

      // passthrough 策略下，工具调用应该直接返回给客户端
      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.choices[0].message.tool_calls).toBeDefined();
      expect(data.choices[0].message.tool_calls[0].function.name).toBe("downstream_function");

      await passthroughApp.close();
      passthroughRuntime.statsStore.close();
      passthroughRuntime.groupCacheManager.close();
    });

    it("should reject unknown tools with local_only strategy", async () => {
      const localOnlyConfig = createTestConfig({
        groups: [
          {
            name: "local-only-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              toolRoutingStrategy: "local_only",
              tools: ["known_tool"], // 分组配置了工具
            },
          },
        ],
      });

      const localOnlyRuntime = new AppRuntime(localOnlyConfig);
      
      // 注册一个已知的工具
      localOnlyRuntime.toolRegistry.register(
        {
          name: "known_tool",
          description: "A known tool",
          inputSchema: { type: "object", properties: {} },
        },
        async () => ({ result: "ok" })
      );

      const localOnlyApp = Fastify({ logger: false });
      localOnlyApp.decorate("runtime", localOnlyRuntime);
      localOnlyApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockToolCallResponse("unknown_tool", {})),
      });
      global.fetch = mockFetch;

      const response = await localOnlyApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/local-only-group",
          messages: [{ role: "user", content: "Test" }],
        },
      });

      // local_only 策略下，未知工具应该返回错误
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Tool(s) not found");

      await localOnlyApp.close();
      localOnlyRuntime.statsStore.close();
      localOnlyRuntime.groupCacheManager.close();
    });
  });

  // ============================================================
  // 5. 提示词注入测试
  // ============================================================
  describe("Prompt Injection", () => {
    it("should inject system prompt when configured", async () => {
      const injectConfig = createTestConfig({
        groups: [
          {
            name: "inject-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              promptInject: {
                enableTimestamp: true,
                enableLunar: false,
                enableWeather: false,
              },
            },
          },
        ],
      });

      const injectRuntime = new AppRuntime(injectConfig);
      const injectApp = Fastify({ logger: false });
      injectApp.decorate("runtime", injectRuntime);
      injectApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await injectApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/inject-group",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      // 验证消息被注入了时间戳
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const systemMessage = body.messages.find(
        (m: { role: string; content: string }) => m.role === "system" && m.content.includes("system timestamp")
      );
      expect(systemMessage).toBeDefined();

      await injectApp.close();
      injectRuntime.statsStore.close();
      injectRuntime.groupCacheManager.close();
    });

    it("should not inject when promptInject is disabled", async () => {
      const noInjectConfig = createTestConfig({
        groups: [
          {
            name: "no-inject-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              promptInject: {
                enableTimestamp: false,
                enableLunar: false,
                enableWeather: false,
              },
            },
          },
        ],
      });

      const noInjectRuntime = new AppRuntime(noInjectConfig);
      const noInjectApp = Fastify({ logger: false });
      noInjectApp.decorate("runtime", noInjectRuntime);
      noInjectApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await noInjectApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/no-inject-group",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      // 验证没有注入系统消息
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const systemMessage = body.messages.find(
        (m: { role: string; content: string }) => m.role === "system" && m.content.includes("system timestamp")
      );
      expect(systemMessage).toBeUndefined();

      await noInjectApp.close();
      noInjectRuntime.statsStore.close();
      noInjectRuntime.groupCacheManager.close();
    });
  });

  // ============================================================
  // 6. 截断检测测试
  // ============================================================
  describe("Truncation Detection", () => {
    it("should inject truncation prompt when enabled", async () => {
      const truncConfig = createTestConfig({
        groups: [
          {
            name: "trunc-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              truncation: {
                enable: true,
                suffix: "__END__",
                prompt: "End with {suffix}",
              },
            },
          },
        ],
      });

      const truncRuntime = new AppRuntime(truncConfig);
      const truncApp = Fastify({ logger: false });
      truncApp.decorate("runtime", truncRuntime);
      truncApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      await truncApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/trunc-group",
          messages: [{ role: "user", content: "Write a long story" }],
        },
      });

      // 验证用户消息被注入了截断提示
      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      const lastUserMessage = body.messages.filter((m: { role: string }) => m.role === "user").at(-1);
      expect(lastUserMessage.content).toContain("__END__");

      await truncApp.close();
      truncRuntime.statsStore.close();
      truncRuntime.groupCacheManager.close();
    });

    it("should strip truncation suffix from response", async () => {
      const truncConfig = createTestConfig({
        groups: [
          {
            name: "strip-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              truncation: {
                enable: true,
                suffix: "__END__",
              },
            },
          },
        ],
      });

      const truncRuntime = new AppRuntime(truncConfig);
      const truncApp = Fastify({ logger: false });
      truncApp.decorate("runtime", truncRuntime);
      truncApp.post("/v1/chat/completions", chatCompletionHandler);

      // 模拟返回带截断后缀的响应
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "chatcmpl-trunc",
            object: "chat.completion",
            created: Date.now(),
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "This is a response that was truncated__END__",
                },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
      });
      global.fetch = mockFetch;

      const response = await truncApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/strip-group",
          messages: [{ role: "user", content: "Write" }],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      // 截断后缀应该被移除
      expect(data.choices[0].message.content).toBe("This is a response that was truncated");

      await truncApp.close();
      truncRuntime.statsStore.close();
      truncRuntime.groupCacheManager.close();
    });

    it("should not modify response without truncation suffix", async () => {
      const truncConfig = createTestConfig({
        groups: [
          {
            name: "no-suffix-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              truncation: {
                enable: true,
                suffix: "__END__",
              },
            },
          },
        ],
      });

      const truncRuntime = new AppRuntime(truncConfig);
      const truncApp = Fastify({ logger: false });
      truncApp.decorate("runtime", truncRuntime);
      truncApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "chatcmpl-no-suffix",
            object: "chat.completion",
            created: Date.now(),
            model: "gpt-4o-mini",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Complete response without truncation" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
      });
      global.fetch = mockFetch;

      const response = await truncApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/no-suffix-group",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.choices[0].message.content).toBe("Complete response without truncation");

      await truncApp.close();
      truncRuntime.statsStore.close();
      truncRuntime.groupCacheManager.close();
    });
  });

  // ============================================================
  // 7. 综合场景测试
  // ============================================================
  describe("Complex Scenarios", () => {
    it("should handle tool calls with prompt injection together", async () => {
      const complexConfig = createTestConfig({
        groups: [
          {
            name: "complex-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              promptInject: {
                enableTimestamp: true,
                enableLunar: false,
                enableWeather: false,
              },
              toolRoutingStrategy: "local_first",
            },
          },
        ],
      });

      const complexRuntime = new AppRuntime(complexConfig);

      // 注册工具
      complexRuntime.toolRegistry.register(
        {
          name: "get_time",
          description: "Get current time",
          inputSchema: { type: "object", properties: {} },
        },
        async () => ({ time: new Date().toISOString() })
      );

      const complexApp = Fastify({ logger: false });
      complexApp.decorate("runtime", complexRuntime);
      complexApp.post("/v1/chat/completions", chatCompletionHandler);

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            json: () => Promise.resolve(mockToolCallResponse("get_time", {})),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve(mockFollowUpResponse("Current time retrieved")),
        };
      });
      global.fetch = mockFetch;

      const response = await complexApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/complex-group",
          messages: [{ role: "user", content: "What time is it?" }],
        },
      });

      expect(response.statusCode).toBe(200);

      // 验证提示词注入
      const firstCall = mockFetch.mock.calls[0];
      const firstBody = JSON.parse(firstCall[1].body);
      const systemMessage = firstBody.messages.find(
        (m: { role: string; content: string }) => m.role === "system"
      );
      expect(systemMessage).toBeDefined();

      await complexApp.close();
      complexRuntime.statsStore.close();
      complexRuntime.groupCacheManager.close();
    });

    it("should handle cache with tool calls", async () => {
      // 使用唯一的缓存路径避免测试干扰
      const uniqueCachePath = `./config/test_cache_tool_${Date.now()}.sqlite`;
      
      const cacheConfig = createTestConfig({
        cache: { enable: true, maxEntries: 100, dbPath: uniqueCachePath },
        groups: [
          {
            name: "cache-tool-group",
            strategy: "round_robin",
            routes: [{ modelId: "test-provider/test-model" }],
            features: {
              cache: {
                enable: true,
                maxEntries: 100,
              },
            },
          },
        ],
      });

      const cacheRuntime = new AppRuntime(cacheConfig);
      const cacheApp = Fastify({ logger: false });
      cacheApp.decorate("runtime", cacheRuntime);
      cacheApp.post("/v1/chat/completions", chatCompletionHandler);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockSuccessResponse),
      });
      global.fetch = mockFetch;

      // 第一次请求
      const response1 = await cacheApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/cache-tool-group",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 第一次请求应该调用 fetch

      // 第二次相同请求应该命中缓存
      const response2 = await cacheApp.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "group/cache-tool-group",
          messages: [{ role: "user", content: "Hello" }],
        },
      });

      expect(response2.statusCode).toBe(200);
      // 缓存命中时 fetch 不应该再被调用（仍然是 1 次）
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await cacheApp.close();
      cacheRuntime.statsStore.close();
      cacheRuntime.groupCacheManager.close();
      
      // 清理测试文件
      try {
        fs.unlinkSync(uniqueCachePath);
      } catch {
        // 忽略清理失败
      }
    });
  });
});

// ============================================================
// 单元测试：截断辅助函数
// ============================================================
describe("Truncation Helper Functions", () => {
  describe("addTruncationPrompt", () => {
    it("should add truncation prompt to content", () => {
      const result = addTruncationPrompt("Write a story", "__END__", "End with {suffix}");
      expect(result).toContain("Write a story");
      expect(result).toContain("__END__");
    });

    it("should use default values", () => {
      const result = addTruncationPrompt("Test content");
      expect(result).toContain("Test content");
      expect(result).toContain("__END_OF_RESPONSE__");
    });
  });

  describe("stripTruncationSuffix", () => {
    it("should strip suffix from content", () => {
      const result = stripTruncationSuffix("Story content__END__", "__END__");
      expect(result).toBe("Story content");
    });

    it("should throw error if suffix not found", () => {
      // 当 suffix 未找到时，函数抛出 TRUNCATED 错误
      expect(() => stripTruncationSuffix("Story content", "__END__")).toThrow("TRUNCATED");
    });

    it("should handle multiple occurrences", () => {
      const result = stripTruncationSuffix("Story__END__ more__END__", "__END__");
      // 只移除最后一个
      expect(result).toBe("Story__END__ more");
    });
  });
});

// ============================================================
// 单元测试：提示词注入
// ============================================================
describe("System Prompt Injection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should inject timestamp into messages", async () => {
    const messages = [{ role: "user", content: "Hello" }];

    const config = {
      enableTimestamp: true,
      enableLunar: false,
      enableWeather: false,
    };

    const result = await injectSystemPrompt(messages, config);

    // 应该添加系统消息
    expect(result.length).toBe(2);
    expect(result[0].role).toBe("system");
    expect(result[0].content).toContain("system timestamp");
  });

  it("should preserve existing messages", async () => {
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hello" },
    ];

    const config = {
      enableTimestamp: true,
      enableLunar: false,
      enableWeather: false,
    };

    const result = await injectSystemPrompt(messages, config);

    // 应该保留原有系统消息并添加新内容
    expect(result.length).toBe(2);
    expect(result[0].role).toBe("system");
  });
});
