/**
 * js_tools_routes 单元测试
 * @description 测试 JS 工具管理路由 API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { registerJsToolsRoutes } from "../src/routes/admin/js_tools_routes.js";

// Mock JsToolStore
const mockTools = new Map<string, any>();

const mockJsToolStore = {
  getAll: vi.fn((enabledOnly: boolean) => {
    const tools = Array.from(mockTools.values());
    return enabledOnly ? tools.filter((t: any) => t.enabled) : tools;
  }),
  getById: vi.fn((id: string) => mockTools.get(id)),
  getByName: vi.fn((name: string) => {
    for (const tool of mockTools.values()) {
      if (tool.name === name) return tool;
    }
    return null;
  }),
  create: vi.fn((data: any) => {
    const id = `tool-${Date.now()}`;
    const tool = {
      id,
      ...data,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockTools.set(id, tool);
    return tool;
  }),
  update: vi.fn((id: string, data: any) => {
    const existing = mockTools.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
    mockTools.set(id, updated);
    return updated;
  }),
  delete: vi.fn((id: string) => {
    if (!mockTools.has(id)) return false;
    mockTools.delete(id);
    return true;
  }),
};

const mockJsSandbox = {
  validateCode: vi.fn((code: string) => {
    // 简单验证：检查是否包含危险关键字
    const dangerousPatterns = [
      /eval\s*\(/,
      /Function\s*\(/,
      /require\s*\(/,
      /import\s+/,
      /process\./,
      /child_process/,
    ];

    const issues: string[] = [];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        issues.push(`Dangerous pattern found: ${pattern}`);
      }
    }

    return {
      safe: issues.length === 0,
      issues: issues.length > 0 ? issues : undefined,
    };
  }),
  execute: vi.fn(async (code: string, args: Record<string, unknown>) => {
    // 简单模拟执行
    if (code.includes("return")) {
      const fn = new Function("args", code);
      return { success: true, result: fn(args) };
    }
    return { success: true, result: null };
  }),
};

// Mock fileToolLoader
const mockFileToolLoader = {
  getTool: vi.fn((name: string) => null),
  getAll: vi.fn(() => []),
};

// Mock AppRuntime
const mockRuntime = {
  jsToolStore: mockJsToolStore,
  jsSandbox: mockJsSandbox,
  fileToolLoader: mockFileToolLoader,
  refreshJsTool: vi.fn(),
  removeJsTool: vi.fn(),
  getAllTools: vi.fn(() => ({
    dbTools: Array.from(mockTools.values()),
    fileTools: [],
  })),
};

describe("js_tools_routes", () => {
  const adminToken = "test-admin-token";
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    mockTools.clear();
    vi.clearAllMocks();

    app = Fastify();
    // 装饰 runtime 到 app 实例
    app.decorate("runtime", mockRuntime);
    registerJsToolsRoutes(app, adminToken);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/js-tools", () => {
    it("should return empty array when no tools", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ dbTools: [], fileTools: [] });
    });

    it("should return all tools", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "test_tool",
        description: "Test tool",
        code: "return args.input;",
        enabled: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().dbTools).toHaveLength(1);
      expect(response.json().dbTools[0].name).toBe("test_tool");
    });

    it("should reject request without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/js-tools",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/js-tools/:id", () => {
    it("should return tool by id", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "test_tool",
        description: "Test",
        code: "return 1;",
        enabled: true,
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe("tool-1");
    });

    it("should return 404 for non-existent tool", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/js-tools/non-existent",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Tool not found" });
    });
  });

  describe("POST /api/js-tools", () => {
    it("should create a new tool and refresh registry", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "new_tool",
          description: "A new tool",
          code: "return args.input;",
          inputSchema: { type: "object", properties: { input: { type: "string" } } },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe("new_tool");
      // 验证刷新方法被调用
      expect(mockRuntime.refreshJsTool).toHaveBeenCalledWith("new_tool");
    });

    it("should reject without name", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          description: "No name",
          code: "return 1;",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("name and code are required");
    });

    it("should reject without code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "no_code_tool",
          description: "No code",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("name and code are required");
    });

    it("should reject dangerous code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "dangerous_tool",
          code: "eval('dangerous code')",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Code validation failed");
    });

    it("should reject duplicate name", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "existing_tool",
        code: "return 1;",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: "existing_tool",
          code: "return 2;",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Tool name already exists");
    });
  });

  describe("PUT /api/js-tools/:id", () => {
    it("should update existing tool and refresh registry", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "old_name",
        description: "Old desc",
        code: "return 1;",
        enabled: true,
      });

      const response = await app.inject({
        method: "PUT",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          description: "New description",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().description).toBe("New description");
      // 验证刷新方法被调用
      expect(mockRuntime.refreshJsTool).toHaveBeenCalled();
    });

    it("should return 404 for non-existent tool", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/api/js-tools/non-existent",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { description: "New" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should validate updated code", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "test",
        code: "return 1;",
      });

      const response = await app.inject({
        method: "PUT",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          code: "require('fs')",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Code validation failed");
    });

    it("should reject duplicate name on update", async () => {
      mockTools.set("tool-1", { id: "tool-1", name: "tool_one", code: "return 1;" });
      mockTools.set("tool-2", { id: "tool-2", name: "tool_two", code: "return 2;" });

      const response = await app.inject({
        method: "PUT",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: "tool_two" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("Tool name already exists");
    });
  });

  describe("DELETE /api/js-tools/:id", () => {
    it("should delete existing tool and remove from registry", async () => {
      mockTools.set("tool-1", { id: "tool-1", name: "to_delete", code: "return 1;" });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
      // 验证移除方法被调用
      expect(mockRuntime.removeJsTool).toHaveBeenCalledWith("to_delete");
    });

    it("should return 404 for non-existent tool", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/api/js-tools/non-existent",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/js-tools/:id/test", () => {
    it("should test tool execution", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "test_tool",
        code: "return args.input.toUpperCase();",
      });

      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools/tool-1/test",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { args: { input: "hello" } },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should return 404 for non-existent tool", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools/non-existent/test",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { args: {} },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("POST /api/js-tools/validate", () => {
    it("should validate safe code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools/validate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: "return args.input;" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().safe).toBe(true);
    });

    it("should reject dangerous code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools/validate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: "eval('dangerous')" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().safe).toBe(false);
      expect(response.json().issues).toBeDefined();
    });

    it("should reject request without code", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/js-tools/validate",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("code is required");
    });
  });

  describe("JS Tool Registry Sync", () => {
    it("should call refreshJsTool when tool is enabled", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "test_tool",
        code: "return 1;",
        enabled: true,
      });

      // 模拟更新启用状态
      const response = await app.inject({
        method: "PUT",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRuntime.refreshJsTool).toHaveBeenCalledWith("test_tool");
    });

    it("should call removeJsTool when tool is deleted", async () => {
      mockTools.set("tool-1", {
        id: "tool-1",
        name: "deleted_tool",
        code: "return 1;",
      });

      const response = await app.inject({
        method: "DELETE",
        url: "/api/js-tools/tool-1",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockRuntime.removeJsTool).toHaveBeenCalledWith("deleted_tool");
    });
  });
});