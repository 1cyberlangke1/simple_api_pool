/**
 * JS 工具管理路由
 * @description 提供 JS 工具的 CRUD 和测试 API
 * @module routes/admin/js_tools_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import { JsToolStore, type CreateJsToolRequest, type UpdateJsToolRequest } from "../../core/js_tool_store.js";
import { JsSandbox } from "../../core/js_sandbox.js";
import type { JSONSchema7 } from "json-schema";

// JS 工具存储实例（延迟初始化）
let jsToolStore: JsToolStore | null = null;
let jsSandbox: JsSandbox | null = null;

/**
 * 获取 JS 工具存储实例
 */
function getJsToolStore(): JsToolStore {
  if (!jsToolStore) {
    const dbPath = process.env.JS_TOOL_DB ?? "./config/js_tools.sqlite";
    jsToolStore = new JsToolStore(dbPath);
  }
  return jsToolStore;
}

/**
 * 获取 JS 沙箱实例
 */
function getJsSandbox(): JsSandbox {
  if (!jsSandbox) {
    jsSandbox = new JsSandbox({
      timeout: 60000,
      allowedDir: "./file",
    });
  }
  return jsSandbox;
}

/**
 * 注册 JS 工具管理路由
 */
export function registerJsToolsRoutes(app: FastifyInstance, adminToken: string): void {
  // 列出所有 JS 工具
  app.get(
    "/api/js-tools",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const store = getJsToolStore();
      const tools = store.getAll(false);
      return reply.send(tools);
    }
  );

  // 获取单个 JS 工具
  app.get<{ Params: { id: string } }>(
    "/api/js-tools/:id",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const store = getJsToolStore();
      const tool = store.getById(request.params.id);
      if (!tool) {
        return reply.status(404).send({ error: "Tool not found" });
      }
      return reply.send(tool);
    }
  );

  // 创建 JS 工具
  app.post<{ Body: CreateJsToolRequest }>(
    "/api/js-tools",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: CreateJsToolRequest }>, reply: FastifyReply) => {
      const { name, description, inputSchema, code } = request.body;

      if (!name || !code) {
        return reply.status(400).send({ error: "name and code are required" });
      }

      // 验证代码安全性
      const sandbox = getJsSandbox();
      const validation = sandbox.validateCode(code);
      if (!validation.safe) {
        return reply.status(400).send({
          error: "Code validation failed",
          issues: validation.issues,
        });
      }

      const store = getJsToolStore();

      // 检查名称是否已存在
      if (store.getByName(name)) {
        return reply.status(400).send({ error: "Tool name already exists" });
      }

      const tool = store.create({
        name,
        description: description ?? "",
        inputSchema: inputSchema ?? { type: "object", properties: {} },
        code,
      });

      return reply.send(tool);
    }
  );

  // 更新 JS 工具
  app.put<{ Params: { id: string }; Body: UpdateJsToolRequest }>(
    "/api/js-tools/:id",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateJsToolRequest }>,
      reply: FastifyReply
    ) => {
      const store = getJsToolStore();
      const existing = store.getById(request.params.id);

      if (!existing) {
        return reply.status(404).send({ error: "Tool not found" });
      }

      // 如果更新代码，验证安全性
      if (request.body.code) {
        const sandbox = getJsSandbox();
        const validation = sandbox.validateCode(request.body.code);
        if (!validation.safe) {
          return reply.status(400).send({
            error: "Code validation failed",
            issues: validation.issues,
          });
        }
      }

      // 如果更新名称，检查是否重复
      if (request.body.name && request.body.name !== existing.name) {
        const nameExists = store.getByName(request.body.name);
        if (nameExists) {
          return reply.status(400).send({ error: "Tool name already exists" });
        }
      }

      const updated = store.update(request.params.id, request.body);
      return reply.send(updated);
    }
  );

  // 删除 JS 工具
  app.delete<{ Params: { id: string } }>(
    "/api/js-tools/:id",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const store = getJsToolStore();
      const deleted = store.delete(request.params.id);

      if (!deleted) {
        return reply.status(404).send({ error: "Tool not found" });
      }

      return reply.send({ status: "ok" });
    }
  );

  // 测试 JS 工具
  app.post<{ Params: { id: string }; Body: { args: Record<string, unknown> } }>(
    "/api/js-tools/:id/test",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { args: Record<string, unknown> } }>,
      reply: FastifyReply
    ) => {
      const store = getJsToolStore();
      const tool = store.getById(request.params.id);

      if (!tool) {
        return reply.status(404).send({ error: "Tool not found" });
      }

      const sandbox = getJsSandbox();
      const result = await sandbox.execute(tool.code, request.body.args ?? {});

      return reply.send(result);
    }
  );

  // 验证 JS 代码
  app.post<{ Body: { code: string } }>(
    "/api/js-tools/validate",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: { code: string } }>, reply: FastifyReply) => {
      const { code } = request.body;

      if (!code) {
        return reply.status(400).send({ error: "code is required" });
      }

      const sandbox = getJsSandbox();
      const validation = sandbox.validateCode(code);

      return reply.send(validation);
    }
  );
}

/**
 * 获取所有启用的 JS 工具
 * @description 供 ToolRegistry 使用
 */
export function getEnabledJsTools(): Array<{
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  code: string;
}> {
  const store = getJsToolStore();
  const tools = store.getAll(true);

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    code: tool.code,
  }));
}
