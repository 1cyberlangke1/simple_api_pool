import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMcpClient, McpHttpClient, McpStdioClient, McpSseClient } from "../src/core/mcp_client.js";
import type { McpHttpConfig, McpStdioConfig, McpSseConfig } from "../src/core/types.js";

/**
 * MCP 客户端单元测试
 * @description 测试 MCP 客户端的创建和基本功能
 */

const originalFetch = global.fetch;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  global.fetch = originalFetch;
});

// ============================================================
// 客户端工厂测试
// ============================================================

describe("createMcpClient", () => {
  it("should create McpStdioClient for stdio transport", () => {
    const config: McpStdioConfig = {
      type: "mcp",
      name: "test-stdio",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    };

    const client = createMcpClient(config);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  it("should create McpSseClient for sse transport", () => {
    const config: McpSseConfig = {
      type: "mcp",
      name: "test-sse",
      transport: "sse",
      endpoint: "http://localhost:8080/sse",
    };

    const client = createMcpClient(config);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  it("should create McpHttpClient for http transport", () => {
    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = createMcpClient(config);
    expect(client).toBeDefined();
    expect(client.isConnected()).toBe(false);
  });

  it("should throw error for unsupported transport", () => {
    const config = {
      type: "mcp",
      name: "test-invalid",
      transport: "invalid",
    } as unknown as McpStdioConfig;

    expect(() => createMcpClient(config)).toThrow("Unsupported MCP transport");
  });
});

// ============================================================
// McpStdioClient 测试
// ============================================================

describe("McpStdioClient", () => {
  it("should create client with config", () => {
    const config: McpStdioConfig = {
      type: "mcp",
      name: "test-stdio",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    };

    const client = new McpStdioClient(config);
    expect(client.isConnected()).toBe(false);
  });

  it("should return empty tools list before connection", async () => {
    const config: McpStdioConfig = {
      type: "mcp",
      name: "test-stdio",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    };

    const client = new McpStdioClient(config);
    const tools = await client.listTools();
    expect(tools).toEqual([]);
  });

  it("should throw error when calling tool before connection", async () => {
    const config: McpStdioConfig = {
      type: "mcp",
      name: "test-stdio",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    };

    const client = new McpStdioClient(config);
    await expect(client.callTool("test", {})).rejects.toThrow("not connected");
  });

  it("should throw error when connecting to invalid command", async () => {
    const config: McpStdioConfig = {
      type: "mcp",
      name: "test-stdio",
      transport: "stdio",
      command: "nonexistent-command-12345",
      args: [],
    };

    const client = new McpStdioClient(config);
    await expect(client.connect()).rejects.toThrow("Failed to connect to MCP stdio server");
  });

  it("should handle config with optional fields", () => {
    const config: McpStdioConfig = {
      type: "mcp",
      name: "test-stdio",
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      env: { NODE_ENV: "test" },
      cwd: "/tmp",
    };

    const client = new McpStdioClient(config);
    expect(client.isConnected()).toBe(false);
  });
});

// ============================================================
// McpSseClient 测试
// ============================================================

describe("McpSseClient", () => {
  it("should create client with config", () => {
    const config: McpSseConfig = {
      type: "mcp",
      name: "test-sse",
      transport: "sse",
      endpoint: "http://localhost:8080/sse",
    };

    const client = new McpSseClient(config);
    expect(client.isConnected()).toBe(false);
  });

  it("should return empty tools list before connection", async () => {
    const config: McpSseConfig = {
      type: "mcp",
      name: "test-sse",
      transport: "sse",
      endpoint: "http://localhost:8080/sse",
    };

    const client = new McpSseClient(config);
    const tools = await client.listTools();
    expect(tools).toEqual([]);
  });

  it("should throw error when calling tool before connection", async () => {
    const config: McpSseConfig = {
      type: "mcp",
      name: "test-sse",
      transport: "sse",
      endpoint: "http://localhost:8080/sse",
    };

    const client = new McpSseClient(config);
    await expect(client.callTool("test", {})).rejects.toThrow("not connected");
  });

  it("should throw error when connecting to invalid endpoint", async () => {
    const config: McpSseConfig = {
      type: "mcp",
      name: "test-sse",
      transport: "sse",
      endpoint: "http://nonexistent-server-12345:9999/sse",
    };

    const client = new McpSseClient(config);
    await expect(client.connect()).rejects.toThrow("Failed to connect to MCP SSE server");
  });

  it("should handle config with optional headers", () => {
    const config: McpSseConfig = {
      type: "mcp",
      name: "test-sse",
      transport: "sse",
      endpoint: "http://localhost:8080/sse",
      headers: { "X-API-Key": "secret" },
    };

    const client = new McpSseClient(config);
    expect(client.isConnected()).toBe(false);
  });
});

// ============================================================
// McpHttpClient 测试
// ============================================================

describe("McpHttpClient", () => {
  it("should create client with config", () => {
    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    expect(client.isConnected()).toBe(false);
  });

  it("should return empty tools list before connection", async () => {
    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    const tools = await client.listTools();
    expect(tools).toEqual([]);
  });

  it("should throw error when calling tool before connection", async () => {
    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await expect(client.callTool("test", {})).rejects.toThrow("not connected");
  });

  it("should connect and fetch tools", async () => {
    const mockTools = [
      { name: "get_weather", description: "Get weather", inputSchema: { type: "object" } },
      { name: "search", description: "Search web", inputSchema: { type: "object" } },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: mockTools }),
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    expect(client.isConnected()).toBe(true);
    const tools = await client.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("get_weather");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/tools",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("should call tool after connection", async () => {
    const mockTools = [{ name: "get_weather", description: "Get weather", inputSchema: {} }];
    const mockResult = { temperature: 25, humidity: 60 };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: mockTools }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("get_weather", { city: "NY" });

    expect(result).toEqual(mockResult);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(
      "http://localhost:8080/api/call",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "get_weather", arguments: { city: "NY" } }),
      })
    );
  });

  it("should include custom headers in requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: [] }),
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
      headers: { "X-API-Key": "secret" },
    };

    const client = new McpHttpClient(config);
    await client.connect();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-Key": "secret" }),
      })
    );
  });

  it("should handle connection failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await expect(client.connect()).rejects.toThrow("HTTP error: 500");
    expect(client.isConnected()).toBe(false);
  });

  it("should handle tool call failure", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    await expect(client.callTool("test", {})).rejects.toThrow("HTTP error: 400");
  });

  it("should disconnect properly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: [] }),
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);

    const tools = await client.listTools();
    expect(tools).toEqual([]);
  });
});

// ============================================================
// 边界条件测试
// ============================================================

describe("MCP Client Edge Cases", () => {
  it("should handle empty tools response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: [] }),
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const tools = await client.listTools();
    expect(tools).toEqual([]);
  });

  it("should handle tools with missing description", async () => {
    const mockTools = [
      { name: "tool1", inputSchema: {} },
      { name: "tool2", description: "Has desc", inputSchema: {} },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: mockTools }),
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const tools = await client.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("tool1");
    expect(tools[1].description).toBe("Has desc");
  });

  it("should handle network errors during connect", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await expect(client.connect()).rejects.toThrow("Network error");
  });

  it("should handle network errors during tool call", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockRejectedValueOnce(new Error("Network timeout"));

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    await expect(client.callTool("test", {})).rejects.toThrow("Network timeout");
  });

  it("should handle various HTTP status codes", async () => {
    const statusCodes = [400, 401, 403, 404, 500, 502, 503];

    for (const status of statusCodes) {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
      });
      global.fetch = mockFetch;

      const config: McpHttpConfig = {
        type: "mcp",
        name: "test-http",
        transport: "http",
        endpoint: "http://localhost:8080/api",
      };

      const client = new McpHttpClient(config);
      await expect(client.connect()).rejects.toThrow(`HTTP error: ${status}`);
    }
  });

  it("should handle large tool list", async () => {
    const mockTools = Array.from({ length: 100 }, (_, i) => ({
      name: `tool_${i}`,
      description: `Tool number ${i}`,
      inputSchema: { type: "object" },
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tools: mockTools }),
    });
    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const tools = await client.listTools();
    expect(tools).toHaveLength(100);
  });

  it("should handle complex tool result", async () => {
    const complexResult = {
      nested: {
        data: [1, 2, 3],
        metadata: { count: 3, type: "array" },
      },
      unicode: "中文测试 日本語 한국어",
      emoji: "🚀🎉🔥",
    };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(complexResult),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("test", {});
    expect(result).toEqual(complexResult);
  });
});

// ============================================================
// parseMcpResult 边界测试（通过 HTTP 客户端间接测试）
// 注意：HTTP 客户端直接返回 JSON 响应，parseMcpResult 只在 SDK 客户端中使用
// ============================================================

describe("parseMcpResult via HTTP client", () => {
  it("should return JSON response directly for HTTP client", async () => {
    const mockResult = { temperature: 25 };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("test", {});
    expect(result).toEqual(mockResult);
  });

  it("should handle content array response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          content: [{ text: "some text" }],
        }),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("test", {});
    // HTTP 客户端直接返回 JSON 响应
    expect(result).toEqual({ content: [{ text: "some text" }] });
  });

  it("should handle toolResult response", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ toolResult: "fallback result" }),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("test", {});
    expect(result).toEqual({ toolResult: "fallback result" });
  });

  it("should handle empty content array", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [] }),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("test", {});
    expect(result).toEqual({ content: [] });
  });

  it("should handle raw result when no content or toolResult", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ custom: "result" }),
      });

    global.fetch = mockFetch;

    const config: McpHttpConfig = {
      type: "mcp",
      name: "test-http",
      transport: "http",
      endpoint: "http://localhost:8080/api",
    };

    const client = new McpHttpClient(config);
    await client.connect();

    const result = await client.callTool("test", {});
    expect(result).toEqual({ custom: "result" });
  });
});
