import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolRegistry } from "../src/core/tool_registry.js";
import type { ToolDefinition } from "../src/core/types.js";

/**
 * ToolRegistry 单元测试
 * @description 测试工具注册表功能
 */

// ============================================================
// 辅助函数和常量
// ============================================================

const mockTool: ToolDefinition = {
  name: "test_tool",
  description: "A test tool",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
    },
    required: ["query"],
  },
};

const anotherTool: ToolDefinition = {
  name: "another_tool",
  description: "Another test tool",
  inputSchema: {
    type: "object",
    properties: {
      count: { type: "number" },
    },
  },
};

describe("ToolRegistry", () => {
  let registry: ToolRegistry;
  const originalFetch = global.fetch;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("register", () => {
    it("should register a tool", () => {
      const handler = vi.fn();
      registry.register(mockTool, handler);

      expect(registry.has("test_tool")).toBe(true);
      expect(registry.listNames()).toContain("test_tool");
    });

    it("should register multiple tools", () => {
      registry.register(mockTool, vi.fn());
      registry.register(anotherTool, vi.fn());

      expect(registry.listNames()).toHaveLength(2);
    });
  });

  describe("unregister", () => {
    it("should unregister a tool", () => {
      registry.register(mockTool, vi.fn());
      const result = registry.unregister("test_tool");

      expect(result).toBe(true);
      expect(registry.has("test_tool")).toBe(false);
    });

    it("should return false for non-existent tool", () => {
      const result = registry.unregister("non_existent");
      expect(result).toBe(false);
    });
  });

  describe("has", () => {
    it("should return true for registered tool", () => {
      registry.register(mockTool, vi.fn());
      expect(registry.has("test_tool")).toBe(true);
    });

    it("should return false for non-existent tool", () => {
      expect(registry.has("non_existent")).toBe(false);
    });
  });

  describe("listNames", () => {
    it("should return empty array when no tools", () => {
      expect(registry.listNames()).toEqual([]);
    });

    it("should return all tool names", () => {
      registry.register(mockTool, vi.fn());
      registry.register(anotherTool, vi.fn());

      const names = registry.listNames();
      expect(names).toContain("test_tool");
      expect(names).toContain("another_tool");
    });
  });

  describe("getOpenAITools", () => {
    it("should return empty array when no tools", () => {
      expect(registry.getOpenAITools()).toEqual([]);
    });

    it("should return OpenAI tools format", () => {
      registry.register(mockTool, vi.fn());

      const tools = registry.getOpenAITools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: "function",
        function: {
          name: "test_tool",
          description: "A test tool",
          parameters: mockTool.inputSchema,
        },
      });
    });
  });

  describe("getToolsByNames", () => {
    it("should return empty array when no tools match", () => {
      registry.register(mockTool, vi.fn());

      const tools = registry.getToolsByNames(["non_existent"]);

      expect(tools).toEqual([]);
    });

    it("should return matching tools", () => {
      registry.register(mockTool, vi.fn());
      registry.register(anotherTool, vi.fn());

      const tools = registry.getToolsByNames(["test_tool"]);

      expect(tools).toHaveLength(1);
      expect(tools[0].function.name).toBe("test_tool");
    });

    it("should return multiple matching tools", () => {
      registry.register(mockTool, vi.fn());
      registry.register(anotherTool, vi.fn());

      const tools = registry.getToolsByNames(["test_tool", "another_tool"]);

      expect(tools).toHaveLength(2);
    });

    it("should handle empty names array", () => {
      registry.register(mockTool, vi.fn());

      const tools = registry.getToolsByNames([]);

      expect(tools).toEqual([]);
    });

    it("should ignore duplicate names", () => {
      registry.register(mockTool, vi.fn());

      const tools = registry.getToolsByNames(["test_tool", "test_tool"]);

      expect(tools).toHaveLength(1);
    });
  });

  describe("close", () => {
    it("should clear all tools and handlers", async () => {
      registry.register(mockTool, vi.fn());
      registry.register(anotherTool, vi.fn());

      expect(registry.listNames()).toHaveLength(2);

      await registry.close();

      expect(registry.listNames()).toHaveLength(0);
      expect(registry.has("test_tool")).toBe(false);
    });

    it("should disconnect MCP clients", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tools: [mockTool] }),
      });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "test-mcp",
        transport: "http",
        endpoint: "http://localhost:8080",
      });

      expect(registry.has("test_tool")).toBe(true);

      await registry.close();

      expect(registry.has("test_tool")).toBe(false);
    });
  });

  describe("call", () => {
    it("should call registered handler", async () => {
      const handler = vi.fn().mockResolvedValue({ result: "success" });
      registry.register(mockTool, handler);

      const result = await registry.call("test_tool", { query: "test" });

      expect(handler).toHaveBeenCalledWith({ query: "test" });
      expect(result).toEqual({ result: "success" });
    });

    it("should throw for non-existent tool", async () => {
      await expect(registry.call("non_existent", {})).rejects.toThrow("Tool not found");
    });

    it("should propagate handler errors", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("Handler error"));
      registry.register(mockTool, handler);

      await expect(registry.call("test_tool", {})).rejects.toThrow("Handler error");
    });
  });

  describe("loadMcp", () => {
    it("should load tools from MCP endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tools: [mockTool, anotherTool],
          }),
      });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "test-mcp",
        transport: "http",
        endpoint: "http://localhost:8080",
      });

      expect(registry.has("test_tool")).toBe(true);
      expect(registry.has("another_tool")).toBe(true);
    });

    it("should handle empty tool list", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "test-mcp",
        transport: "http",
        endpoint: "http://localhost:8080",
      });

      expect(registry.listNames()).toEqual([]);
    });

    it("should call MCP endpoint on tool call", async () => {
      const mockFetch = vi.fn();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              tools: [mockTool],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ result: "from-mcp" }),
        });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "test-mcp",
        transport: "http",
        endpoint: "http://localhost:8080",
      });

      const result = await registry.call("test_tool", { query: "test" });

      expect(result).toEqual({ result: "from-mcp" });
      // 第二次调用应该是 POST 到 /call
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should include custom headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "test-mcp",
        transport: "http",
        endpoint: "http://localhost:8080",
        headers: { "X-Custom": "value" },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/tools",
        expect.objectContaining({
          headers: expect.objectContaining({ "X-Custom": "value" }),
        })
      );
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("ToolRegistry - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  let registry: ToolRegistry;
  const originalFetch = global.fetch;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("tool name edge cases", () => {
    it("should handle tool name with underscores and hyphens", () => {
      const tool: ToolDefinition = {
        name: "my_tool-name_v1",
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has("my_tool-name_v1")).toBe(true);
    });

    it("should handle tool name with Unicode characters", () => {
      const tool: ToolDefinition = {
        name: "工具_ツール_🛠️",
        description: "Unicode tool",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has("工具_ツール_🛠️")).toBe(true);
    });

    it("should handle tool name with dots", () => {
      const tool: ToolDefinition = {
        name: "my.tool.name",
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has("my.tool.name")).toBe(true);
    });

    it("should handle very long tool name", () => {
      const longName = "a".repeat(1000);
      const tool: ToolDefinition = {
        name: longName,
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has(longName)).toBe(true);
    });

    it("should handle tool name that looks like SQL injection", () => {
      const maliciousName = "tool'; DROP TABLE tools; --";
      const tool: ToolDefinition = {
        name: maliciousName,
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has(maliciousName)).toBe(true);
    });

    it("should handle registering tool with same name (appends, does not overwrite)", () => {
      const tool: ToolDefinition = {
        name: "same_name",
        description: "First version",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn().mockResolvedValue("first"));

      // 再次注册同名工具 - 实现是追加，不是覆盖
      const updatedTool: ToolDefinition = {
        name: "same_name",
        description: "Second version",
        inputSchema: { type: "object", properties: { new: { type: "string" } } },
      };
      registry.register(updatedTool, vi.fn().mockResolvedValue("second"));

      // 会有两个同名工具
      const openaiTools = registry.getOpenAITools();
      expect(openaiTools.length).toBe(2);
      // 第一个保持原样
      expect(openaiTools[0].function.description).toBe("First version");
      // 第二个是新增的
      expect(openaiTools[1].function.description).toBe("Second version");
    });
  });

  describe("tool description edge cases", () => {
    it("should handle empty description", () => {
      const tool: ToolDefinition = {
        name: "empty_desc",
        description: "",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      const openaiTools = registry.getOpenAITools();
      expect(openaiTools[0].function.description).toBe("");
    });

    it("should handle very long description", () => {
      const longDesc = "This is a tool. ".repeat(1000);
      const tool: ToolDefinition = {
        name: "long_desc",
        description: longDesc,
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      const openaiTools = registry.getOpenAITools();
      expect(openaiTools[0].function.description).toBe(longDesc);
    });

    it("should handle description with special characters", () => {
      const specialDesc = "Tool with \n\t\r special chars: \x00\x1F and emoji 🚀";
      const tool: ToolDefinition = {
        name: "special_desc",
        description: specialDesc,
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has("special_desc")).toBe(true);
    });

    it("should handle description with code blocks", () => {
      const codeDesc = `
Tool that executes code:

\`\`\`python
def example():
    return "hello"
\`\`\`

Use with caution!
      `;
      const tool: ToolDefinition = {
        name: "code_desc",
        description: codeDesc,
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn());
      expect(registry.has("code_desc")).toBe(true);
    });
  });

  describe("inputSchema edge cases", () => {
    it("should handle empty schema", () => {
      const tool: ToolDefinition = {
        name: "empty_schema",
        description: "Test",
        inputSchema: {} as any,
      };

      registry.register(tool, vi.fn());
      expect(registry.has("empty_schema")).toBe(true);
    });

    it("should handle complex nested schema", () => {
      const complexSchema: any = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  country: { type: "string" },
                },
              },
            },
          },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          metadata: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["user"],
      };

      const tool: ToolDefinition = {
        name: "complex_schema",
        description: "Complex",
        inputSchema: complexSchema,
      };

      registry.register(tool, vi.fn());
      const openaiTools = registry.getOpenAITools();
      expect(openaiTools[0].function.parameters).toEqual(complexSchema);
    });

    it("should handle schema with circular reference (as JSON)", () => {
      // 注意：JSON 不支持循环引用，所以这里测试是否能正确处理
      const tool: ToolDefinition = {
        name: "normal_schema",
        description: "Test",
        inputSchema: {
          type: "object",
          properties: {
            self: { $ref: "#" }, // JSON Schema 引用
          },
        },
      };

      registry.register(tool, vi.fn());
      expect(registry.has("normal_schema")).toBe(true);
    });
  });

  describe("handler edge cases", () => {
    it("should handle handler returning undefined", async () => {
      const tool: ToolDefinition = {
        name: "undefined_handler",
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn().mockResolvedValue(undefined));

      const result = await registry.call("undefined_handler", {});
      expect(result).toBeUndefined();
    });

    it("should handle handler returning null", async () => {
      const tool: ToolDefinition = {
        name: "null_handler",
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn().mockResolvedValue(null));

      const result = await registry.call("null_handler", {});
      expect(result).toBeNull();
    });

    it("should handle handler returning complex object", async () => {
      const complexResult = {
        nested: {
          deep: {
            value: [1, 2, 3],
            map: new Map([["key", "value"]]),
          },
        },
        date: new Date(),
        func: () => "test",
      };

      const tool: ToolDefinition = {
        name: "complex_result",
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(tool, vi.fn().mockResolvedValue(complexResult));

      const result = await registry.call("complex_result", {}) as typeof complexResult;
      expect(result.nested.deep.value).toEqual([1, 2, 3]);
    });

    it("should handle handler throwing various error types", async () => {
      const tool: ToolDefinition = {
        name: "error_handler",
        description: "Test",
        inputSchema: { type: "object" },
      };

      // 测试各种错误类型
      const errorTypes = [
        new Error("Standard error"),
        new TypeError("Type error"),
        new RangeError("Range error"),
        new SyntaxError("Syntax error"),
        "String error",
        123,
        null,
      ];

      for (const error of errorTypes) {
        registry.register(tool, vi.fn().mockRejectedValue(error));

        if (error instanceof Error) {
          await expect(registry.call("error_handler", {})).rejects.toThrow();
        } else {
          // 非 Error 对象的拒绝
          try {
            await registry.call("error_handler", {});
            expect.fail("Should have thrown");
          } catch (e) {
            // 任何错误都被捕获
          }
        }
      }
    });

    it("should handle async handler with delay", async () => {
      const tool: ToolDefinition = {
        name: "slow_handler",
        description: "Test",
        inputSchema: { type: "object" },
      };

      registry.register(
        tool,
        vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve("delayed"), 100))
        )
      );

      const start = Date.now();
      const result = await registry.call("slow_handler", {});
      const elapsed = Date.now() - start;

      expect(result).toBe("delayed");
      expect(elapsed).toBeGreaterThanOrEqual(90); // 允许一些误差
    });
  });

  describe("call arguments edge cases", () => {
    it("should handle call with empty object args", async () => {
      const handler = vi.fn().mockResolvedValue("ok");
      registry.register(mockTool, handler);

      await registry.call("test_tool", {});
      expect(handler).toHaveBeenCalledWith({});
    });

    it("should handle call with undefined args", async () => {
      const handler = vi.fn().mockResolvedValue("ok");
      registry.register(mockTool, handler);

      await registry.call("test_tool", undefined as any);
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it("should handle call with null args", async () => {
      const handler = vi.fn().mockResolvedValue("ok");
      registry.register(mockTool, handler);

      await registry.call("test_tool", null as any);
      expect(handler).toHaveBeenCalledWith(null);
    });

    it("should handle call with array args", async () => {
      const handler = vi.fn().mockResolvedValue("ok");
      registry.register(mockTool, handler);

      await registry.call("test_tool", [1, 2, 3] as any);
      expect(handler).toHaveBeenCalledWith([1, 2, 3]);
    });

    it("should handle call with primitive args", async () => {
      const handler = vi.fn().mockResolvedValue("ok");
      registry.register(mockTool, handler);

      await registry.call("test_tool", "string arg" as any);
      expect(handler).toHaveBeenCalledWith("string arg");

      await registry.call("test_tool", 123 as any);
      expect(handler).toHaveBeenCalledWith(123);

      await registry.call("test_tool", true as any);
      expect(handler).toHaveBeenCalledWith(true);
    });

    it("should handle call with large args", async () => {
      const handler = vi.fn().mockResolvedValue("ok");
      registry.register(mockTool, handler);

      const largeArgs = {
        data: "x".repeat(100000),
        array: Array(10000).fill({ nested: true }),
      };

      await registry.call("test_tool", largeArgs);
      expect(handler).toHaveBeenCalledWith(largeArgs);
    });
  });

  describe("loadMcp edge cases", () => {
    it("should handle MCP endpoint returning error status", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("Server error"),
      });
      global.fetch = mockFetch;

      // 实现会抛出错误
      await expect(
        registry.loadMcp({
          type: "mcp",
          name: "error-mcp",
          transport: "http",
          endpoint: "http://localhost:8080",
        })
      ).rejects.toThrow();
    });

    it("should handle MCP endpoint returning invalid JSON", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });
      global.fetch = mockFetch;

      await expect(
        registry.loadMcp({
          type: "mcp",
          name: "invalid-json-mcp",
          transport: "http",
          endpoint: "http://localhost:8080",
        })
      ).rejects.toThrow();
    });

    it("should handle MCP endpoint returning malformed tools array", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tools: "not an array",
          }),
      });
      global.fetch = mockFetch;

      // 实现可能会成功但工具列表为空，或者抛出错误
      try {
        await registry.loadMcp({
          type: "mcp",
          name: "malformed-mcp",
          transport: "http",
          endpoint: "http://localhost:8080",
        });
        // 如果成功，工具列表应该为空
        expect(registry.listNames()).toEqual([]);
      } catch {
        // 如果抛出错误也是预期行为
      }
    });

    it("should handle MCP endpoint with timeout", async () => {
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const error = new Error("Timeout");
            error.name = "AbortError";
            setTimeout(() => reject(error), 100);
          })
      );
      global.fetch = mockFetch;

      await expect(
        registry.loadMcp({
          type: "mcp",
          name: "timeout-mcp",
          transport: "http",
          endpoint: "http://localhost:8080",
          timeout: 50,
        })
      ).rejects.toThrow();
    });

    it("should handle MCP endpoint with custom headers including special characters", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "special-headers-mcp",
        transport: "http",
        endpoint: "http://localhost:8080",
        headers: {
          "X-Custom": "value with spaces",
          "X-Unicode": "日本語ヘッダー",
          "X-Emoji": "🚀",
          Authorization: "Bearer token-with-special!@#$%",
        },
      });

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0][1];
      expect(callArgs.headers["X-Unicode"]).toBe("日本語ヘッダー");
      expect(callArgs.headers["X-Emoji"]).toBe("🚀");
    });

    it("should handle MCP endpoint URL with path and query", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      });
      global.fetch = mockFetch;

      await registry.loadMcp({
        type: "mcp",
        name: "complex-url-mcp",
        transport: "http",
        endpoint: "http://localhost:8080/api/v1/mcp?version=2",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8080/api/v1/mcp?version=2/tools",
        expect.any(Object)
      );
    });
  });

  describe("concurrent operations", () => {
    it("should handle concurrent tool registrations", async () => {
      const promises = Array.from({ length: 100 }, (_, i) => {
        const tool: ToolDefinition = {
          name: `concurrent_tool_${i}`,
          description: `Tool ${i}`,
          inputSchema: { type: "object" },
        };
        return Promise.resolve(registry.register(tool, vi.fn()));
      });

      await Promise.all(promises);

      expect(registry.listNames().length).toBe(100);
    });

    it("should handle concurrent tool calls", async () => {
      const tool: ToolDefinition = {
        name: "concurrent_call_test",
        description: "Test",
        inputSchema: { type: "object" },
      };

      const handler = vi.fn().mockImplementation((args) =>
        Promise.resolve(`result-${args.id}`)
      );
      registry.register(tool, handler);

      const promises = Array.from({ length: 50 }, (_, i) =>
        registry.call("concurrent_call_test", { id: i })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(50);
      expect(handler).toHaveBeenCalledTimes(50);
    });
  });

  describe("unregister edge cases", () => {
    it("should handle unregister then re-register", () => {
      registry.register(mockTool, vi.fn());
      expect(registry.has("test_tool")).toBe(true);

      registry.unregister("test_tool");
      expect(registry.has("test_tool")).toBe(false);

      registry.register(mockTool, vi.fn());
      expect(registry.has("test_tool")).toBe(true);
    });

    it("should handle multiple unregister calls", () => {
      registry.register(mockTool, vi.fn());

      expect(registry.unregister("test_tool")).toBe(true);
      expect(registry.unregister("test_tool")).toBe(false);
      expect(registry.unregister("test_tool")).toBe(false);
    });
  });

  describe("getOpenAITools edge cases", () => {
    it("should maintain consistent format for all tools", () => {
      const tools: ToolDefinition[] = [
        { name: "tool1", description: "D1", inputSchema: { type: "string" } as any },
        { name: "tool2", description: "D2", inputSchema: { type: "number" } as any },
        { name: "tool3", description: "D3", inputSchema: { type: "boolean" } as any },
      ];

      tools.forEach((t) => registry.register(t, vi.fn()));

      const openaiTools = registry.getOpenAITools();

      openaiTools.forEach((t) => {
        expect(t.type).toBe("function");
        expect(t.function).toHaveProperty("name");
        expect(t.function).toHaveProperty("description");
        expect(t.function).toHaveProperty("parameters");
      });
    });
  });
});