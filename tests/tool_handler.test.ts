import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  classifyToolCalls,
  executeLocalTools,
  handleToolCalls,
  type ToolCallItem,
  type ToolHandlerContext,
} from "../src/routes/chat/tool_handler.js";
import type { IToolLookup, IToolExecutor, IToolRegistry, ToolRoutingStrategy } from "../src/core/types.js";
import type { OpenAIResponse } from "../src/routes/chat/types.js";

/**
 * 工具调用处理单元测试
 * @description 测试工具调用的分类和执行功能
 */

// Mock 工具注册表
function createMockToolRegistry(
  tools: Record<string, { exists: boolean; result?: unknown; error?: string }> = {}
): IToolRegistry {
  return {
    has: vi.fn((name: string) => tools[name]?.exists ?? false),
    call: vi.fn(async (name: string, _args: unknown) => {
      const tool = tools[name];
      if (!tool?.exists) {
        throw new Error(`Tool not found: ${name}`);
      }
      if (tool.error) {
        throw new Error(tool.error);
      }
      return tool.result;
    }),
  };
}

describe("tool_handler", () => {
  describe("classifyToolCalls", () => {
    it("should classify local tools correctly", () => {
      const toolRegistry = createMockToolRegistry({
        get_weather: { exists: true },
        search_web: { exists: true },
      });

      const toolCalls = [
        { id: "call-1", type: "function", function: { name: "get_weather", arguments: '{"city":"NY"}' } },
        { id: "call-2", type: "function", function: { name: "unknown_tool", arguments: "{}" } },
      ];

      const result = classifyToolCalls(toolCalls, toolRegistry);

      expect(result.local).toHaveLength(1);
      expect(result.local[0].name).toBe("get_weather");
      expect(result.local[0].args).toEqual({ city: "NY" });

      expect(result.downstream).toHaveLength(1);
      expect(result.downstream[0].name).toBe("unknown_tool");
    });

    it("should return empty arrays for no tool calls", () => {
      const toolRegistry = createMockToolRegistry();

      const result = classifyToolCalls([], toolRegistry);

      expect(result.local).toEqual([]);
      expect(result.downstream).toEqual([]);
    });

    it("should handle all tools being local", () => {
      const toolRegistry = createMockToolRegistry({
        tool1: { exists: true },
        tool2: { exists: true },
      });

      const toolCalls = [
        { id: "call-1", type: "function", function: { name: "tool1", arguments: "{}" } },
        { id: "call-2", type: "function", function: { name: "tool2", arguments: "{}" } },
      ];

      const result = classifyToolCalls(toolCalls, toolRegistry);

      expect(result.local).toHaveLength(2);
      expect(result.downstream).toHaveLength(0);
    });

    it("should handle all tools being downstream", () => {
      const toolRegistry = createMockToolRegistry({});

      const toolCalls = [
        { id: "call-1", type: "function", function: { name: "unknown1", arguments: "{}" } },
        { id: "call-2", type: "function", function: { name: "unknown2", arguments: "{}" } },
      ];

      const result = classifyToolCalls(toolCalls, toolRegistry);

      expect(result.local).toHaveLength(0);
      expect(result.downstream).toHaveLength(2);
    });

    it("should parse JSON arguments", () => {
      const toolRegistry = createMockToolRegistry({
        test: { exists: true },
      });

      const toolCalls = [
        {
          id: "call-1",
          type: "function",
          function: { name: "test", arguments: '{"key":"value","number":42}' },
        },
      ];

      const result = classifyToolCalls(toolCalls, toolRegistry);

      expect(result.local[0].args).toEqual({ key: "value", number: 42 });
    });

    it("should handle object arguments (already parsed)", () => {
      const toolRegistry = createMockToolRegistry({
        test: { exists: true },
      });

      const toolCalls = [
        {
          id: "call-1",
          type: "function",
          function: { name: "test", arguments: { key: "value" } as any },
        },
      ];

      const result = classifyToolCalls(toolCalls, toolRegistry);

      expect(result.local[0].args).toEqual({ key: "value" });
    });

    it("should handle empty arguments string as invalid JSON", () => {
      const toolRegistry = createMockToolRegistry({
        test: { exists: true },
      });

      const toolCalls = [
        {
          id: "call-1",
          type: "function",
          function: { name: "test", arguments: "" },
        },
      ];

      // 空字符串不是有效 JSON，应该抛出错误
      expect(() => classifyToolCalls(toolCalls, toolRegistry)).toThrow();
    });

    it("should handle undefined arguments (converted to {} by ?? operator)", () => {
      const toolRegistry = createMockToolRegistry({
        test: { exists: true },
      });

      const toolCalls = [
        {
          id: "call-1",
          type: "function",
          function: { name: "test", arguments: undefined },
        },
      ];

      const result = classifyToolCalls(toolCalls, toolRegistry);

      // undefined 会被 ?? 转换为 "{}"
      expect(result.local[0].args).toEqual({});
    });
  });

  describe("executeLocalTools", () => {
    it("should execute tools and return messages", async () => {
      const toolRegistry = createMockToolRegistry({
        get_weather: { exists: true, result: { temperature: 25 } },
      });

      const calls: ToolCallItem[] = [
        { id: "call-1", name: "get_weather", args: { city: "NY" } },
      ];

      const messages = await executeLocalTools(calls, toolRegistry);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("tool");
      expect(messages[0].tool_call_id).toBe("call-1");
      expect(JSON.parse(messages[0].content)).toEqual({ temperature: 25 });
    });

    it("should handle tool execution errors", async () => {
      const toolRegistry = createMockToolRegistry({
        failing_tool: { exists: true, error: "Something went wrong" },
      });

      const calls: ToolCallItem[] = [
        { id: "call-1", name: "failing_tool", args: {} },
      ];

      const messages = await executeLocalTools(calls, toolRegistry);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe("tool");
      const content = JSON.parse(messages[0].content);
      expect(content.error).toContain("Something went wrong");
    });

    it("should handle multiple tool calls", async () => {
      const toolRegistry = createMockToolRegistry({
        tool1: { exists: true, result: { a: 1 } },
        tool2: { exists: true, result: { b: 2 } },
      });

      const calls: ToolCallItem[] = [
        { id: "call-1", name: "tool1", args: {} },
        { id: "call-2", name: "tool2", args: {} },
      ];

      const messages = await executeLocalTools(calls, toolRegistry);

      expect(messages).toHaveLength(2);
      expect(messages[0].tool_call_id).toBe("call-1");
      expect(messages[1].tool_call_id).toBe("call-2");
    });

    it("should handle empty calls array", async () => {
      const toolRegistry = createMockToolRegistry();

      const messages = await executeLocalTools([], toolRegistry);

      expect(messages).toEqual([]);
    });

    it("should handle null result", async () => {
      const toolRegistry = createMockToolRegistry({
        null_tool: { exists: true, result: null },
      });

      const calls: ToolCallItem[] = [
        { id: "call-1", name: "null_tool", args: {} },
      ];

      const messages = await executeLocalTools(calls, toolRegistry);

      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0].content)).toEqual({});
    });

    it("should handle undefined result", async () => {
      const toolRegistry = createMockToolRegistry({
        undef_tool: { exists: true, result: undefined },
      });

      const calls: ToolCallItem[] = [
        { id: "call-1", name: "undef_tool", args: {} },
      ];

      const messages = await executeLocalTools(calls, toolRegistry);

      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0].content)).toEqual({});
    });
  });

  describe("handleToolCalls", () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", mockFetch);
      mockFetch.mockReset();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should return result unchanged when no tool calls", async () => {
      const toolRegistry = createMockToolRegistry({});
      const result: OpenAIResponse = {
        id: "test",
        model: "gpt-4",
        choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }],
      };

      const context: ToolHandlerContext = {
        result,
        updatedMessages: [],
        finalBody: { model: "gpt-4" },
        provider: { name: "test", baseUrl: "http://test" },
        key: "sk-test",
        toolRegistry,
        toolRoutingStrategy: "local_first",
        requestTools: undefined,
      };

      const response = await handleToolCalls(context);

      expect("result" in response).toBe(true);
      if ("result" in response) {
        expect(response.result).toBe(result);
      }
    });

    it("should return result unchanged when no tool calls", async () => {
      const toolRegistry = createMockToolRegistry({});
      const result: OpenAIResponse = {
        id: "test",
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              tool_calls: [{ id: "call-1", type: "function", function: { name: "test", arguments: "{}" } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      const context: ToolHandlerContext = {
        result,
        updatedMessages: [],
        finalBody: { model: "gpt-4" },
        provider: { name: "test", baseUrl: "http://test" },
        key: "sk-test",
        toolRegistry,
        toolRoutingStrategy: "passthrough",
        requestTools: undefined,
      };

      const response = await handleToolCalls(context);

      expect("result" in response).toBe(true);
      if ("result" in response) {
        expect(response.result).toBe(result);
      }
    });

    it("should return error for local_only with missing tools", async () => {
      const toolRegistry = createMockToolRegistry({});
      const result: OpenAIResponse = {
        id: "test",
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              tool_calls: [{ id: "call-1", type: "function", function: { name: "missing_tool", arguments: "{}" } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      const context: ToolHandlerContext = {
        result,
        updatedMessages: [],
        finalBody: { model: "gpt-4" },
        provider: { name: "test", baseUrl: "http://test" },
        key: "sk-test",
        toolRegistry,
        toolRoutingStrategy: "local_only",
        requestTools: undefined,
      };

      const response = await handleToolCalls(context);

      expect("error" in response).toBe(true);
      if ("error" in response) {
        expect(response.error).toContain("missing_tool");
        expect(response.status).toBe(400);
      }
    });

    it("should execute local tools for local_only strategy", async () => {
      const toolRegistry = createMockToolRegistry({
        test_tool: { exists: true, result: { success: true } },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "follow-up",
            model: "gpt-4",
            choices: [{ index: 0, message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
          }),
      });

      const result: OpenAIResponse = {
        id: "test",
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              tool_calls: [{ id: "call-1", type: "function", function: { name: "test_tool", arguments: "{}" } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      const context: ToolHandlerContext = {
        result,
        updatedMessages: [{ role: "user", content: "Hello" }],
        finalBody: { model: "gpt-4" },
        provider: { name: "test", baseUrl: "http://test" },
        key: "sk-test",
        toolRegistry,
        toolRoutingStrategy: "local_only",
        requestTools: undefined,
      };

      const response = await handleToolCalls(context);

      expect("result" in response).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should handle mixed local and downstream tools with local_first strategy", async () => {
      const toolRegistry = createMockToolRegistry({
        local_tool: { exists: true, result: { data: "local" } },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "follow-up",
            model: "gpt-4",
            choices: [{ index: 0, message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
          }),
      });

      const result: OpenAIResponse = {
        id: "test",
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              tool_calls: [
                { id: "call-1", type: "function", function: { name: "local_tool", arguments: "{}" } },
                { id: "call-2", type: "function", function: { name: "downstream_tool", arguments: "{}" } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      const context: ToolHandlerContext = {
        result,
        updatedMessages: [{ role: "user", content: "Test" }],
        finalBody: { model: "gpt-4" },
        provider: { name: "test", baseUrl: "http://test" },
        key: "sk-test",
        toolRegistry,
        toolRoutingStrategy: "local_first",
        requestTools: undefined,
      };

      const response = await handleToolCalls(context);

      expect("result" in response).toBe(true);
      // 只执行本地工具，downstream 工具会被忽略
      expect(toolRegistry.call).toHaveBeenCalledWith("local_tool", {});
    });
  });
});

// ============================================================
// 边界条件测试
// ============================================================

describe("tool_handler edge cases", () => {
  it("should handle complex nested arguments", () => {
    const toolRegistry = createMockToolRegistry({
      test: { exists: true },
    });

    const complexArgs = {
      nested: {
        deep: {
          array: [1, 2, 3],
          object: { key: "value" },
        },
      },
      unicode: "中文日本語한국어",
    };

    const toolCalls = [
      {
        id: "call-1",
        type: "function",
        function: { name: "test", arguments: JSON.stringify(complexArgs) },
      },
    ];

    const result = classifyToolCalls(toolCalls, toolRegistry);

    expect(result.local[0].args).toEqual(complexArgs);
  });

  it("should handle large number of tool calls", async () => {
    const tools: Record<string, { exists: boolean; result?: unknown }> = {};
    for (let i = 0; i < 50; i++) {
      tools[`tool_${i}`] = { exists: true, result: { index: i } };
    }

    const toolRegistry = createMockToolRegistry(tools);

    const calls: ToolCallItem[] = [];
    for (let i = 0; i < 50; i++) {
      calls.push({ id: `call-${i}`, name: `tool_${i}`, args: {} });
    }

    const messages = await executeLocalTools(calls, toolRegistry);

    expect(messages).toHaveLength(50);
  });

  it("should handle tool calls with special characters in name", () => {
    const toolRegistry = createMockToolRegistry({
      "tool_with_underscore": { exists: true },
      "tool-with-dash": { exists: true },
    });

    const toolCalls = [
      { id: "call-1", type: "function", function: { name: "tool_with_underscore", arguments: "{}" } },
      { id: "call-2", type: "function", function: { name: "tool-with-dash", arguments: "{}" } },
    ];

    const result = classifyToolCalls(toolCalls, toolRegistry);

    expect(result.local).toHaveLength(2);
  });

  it("should handle empty choices array in result", async () => {
    const toolRegistry = createMockToolRegistry({});
    const result: OpenAIResponse = {
      id: "test",
      model: "gpt-4",
      choices: [],
    };

    const context: ToolHandlerContext = {
      result,
      updatedMessages: [],
      finalBody: { model: "gpt-4" },
      provider: { name: "test", baseUrl: "http://test" },
      key: "sk-test",
      toolRegistry,
      toolRoutingStrategy: "local_first",
      requestTools: undefined,
    };

    const response = await handleToolCalls(context);

    expect("result" in response).toBe(true);
    if ("result" in response) {
      expect(response.result).toBe(result);
    }
  });

  it("should handle null tool_calls array", async () => {
    const toolRegistry = createMockToolRegistry({});
    const result: OpenAIResponse = {
      id: "test",
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello" },
          finish_reason: "stop",
        },
      ],
    };

    const context: ToolHandlerContext = {
      result,
      updatedMessages: [],
      finalBody: { model: "gpt-4" },
      provider: { name: "test", baseUrl: "http://test" },
      key: "sk-test",
      toolRegistry,
      toolRoutingStrategy: "local_first",
      requestTools: undefined,
    };

    const response = await handleToolCalls(context);

    expect("result" in response).toBe(true);
  });

  it("should handle malformed JSON arguments gracefully", () => {
    const toolRegistry = createMockToolRegistry({
      test: { exists: true },
    });

    const toolCalls = [
      {
        id: "call-1",
        type: "function",
        function: { name: "test", arguments: "{invalid json}" },
      },
    ];

    // 应该抛出 JSON 解析错误
    expect(() => classifyToolCalls(toolCalls, toolRegistry)).toThrow();
  });
});
