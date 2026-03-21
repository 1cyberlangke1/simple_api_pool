/**
 * JS 工具管理路由
 * @description 提供 JS 工具的 CRUD 和测试 API，支持数据库工具和文件工具
 * @module routes/admin/js_tools_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import type { CreateJsToolRequest, UpdateJsToolRequest } from "../../core/js_tool_store.js";
import { loadJsToolExamples } from "../../tools/js_tools/index.js";
import type { JsonToolFile } from "../../core/file_tool_loader.js";
import type { JSONSchema7 } from "json-schema";

/**
 * 统一的工具列表响应
 */
interface ToolListResponse {
  dbTools: Array<{
    id: string;
    name: string;
    description: string;
    inputSchema: JSONSchema7;
    code: string;
    enabled: boolean;
    createdAt: number;
    updatedAt: number;
    source: "database";
  }>;
  fileTools: Array<{
    name: string;
    description: string;
    inputSchema: JSONSchema7;
    code: string;
    category?: string;
    tags?: string[];
    allowNetwork?: boolean;
    allowedDomains?: string[];
    filePath: string;
    loadedAt: number;
    source: "file";
  }>;
}

/**
 * 注册 JS 工具管理路由
 */
export function registerJsToolsRoutes(app: FastifyInstance, adminToken: string): void {
  // 列出所有 JS 工具（合并数据库和文件工具）
  app.get(
    "/api/js-tools",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const { dbTools, fileTools } = app.runtime.getAllTools();

      const response: ToolListResponse = {
        dbTools: dbTools.map((t) => ({ ...t, source: "database" as const })),
        fileTools: fileTools.map((t) => ({ ...t, source: "file" as const })),
      };

      return reply.send(response);
    }
  );

  // 获取单个 JS 工具（支持数据库 ID 或工具名称）
  app.get<{ Params: { id: string } }>(
    "/api/js-tools/:id",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;

      // 先尝试从数据库获取
      const dbTool = app.runtime.jsToolStore.getById(id);
      if (dbTool) {
        return reply.send({ ...dbTool, source: "database" });
      }

      // 再尝试按名称从数据库获取
      const dbToolByName = app.runtime.jsToolStore.getByName(id);
      if (dbToolByName) {
        return reply.send({ ...dbToolByName, source: "database" });
      }

      // 最后尝试从文件工具获取
      const fileTool = app.runtime.fileToolLoader.getTool(id);
      if (fileTool) {
        return reply.send({ ...fileTool, source: "file" });
      }

      return reply.status(404).send({ error: "Tool not found" });
    }
  );

  // 创建数据库工具
  app.post<{ Body: CreateJsToolRequest }>(
    "/api/js-tools",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: CreateJsToolRequest }>, reply: FastifyReply) => {
      const { name, description, inputSchema, code } = request.body;

      if (!name || !code) {
        return reply.status(400).send({ error: "name and code are required" });
      }

      // 验证代码安全性
      const validation = app.runtime.jsSandbox.validateCode(code);
      if (!validation.safe) {
        return reply.status(400).send({
          error: "Code validation failed",
          issues: validation.issues,
        });
      }

      // 检查名称是否已存在（数据库和文件）
      if (app.runtime.jsToolStore.getByName(name)) {
        return reply.status(400).send({ error: "Tool name already exists in database" });
      }
      if (app.runtime.fileToolLoader.getTool(name)) {
        return reply.status(400).send({ error: "Tool name already exists in files" });
      }

      const tool = app.runtime.jsToolStore.create({
        name,
        description: description ?? "",
        inputSchema: inputSchema ?? { type: "object", properties: {} },
        code,
      });

      // 实时更新 ToolRegistry
      app.runtime.refreshJsTool(name);

      return reply.send({ ...tool, source: "database" });
    }
  );

  // 更新数据库工具
  app.put<{ Params: { id: string }; Body: UpdateJsToolRequest }>(
    "/api/js-tools/:id",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateJsToolRequest }>,
      reply: FastifyReply
    ) => {
      const existing = app.runtime.jsToolStore.getById(request.params.id);

      if (!existing) {
        return reply.status(404).send({ error: "Tool not found in database" });
      }

      // 如果更新代码，验证安全性
      if (request.body.code) {
        const validation = app.runtime.jsSandbox.validateCode(request.body.code);
        if (!validation.safe) {
          return reply.status(400).send({
            error: "Code validation failed",
            issues: validation.issues,
          });
        }
      }

      // 如果更新名称，检查是否重复
      if (request.body.name && request.body.name !== existing.name) {
        const nameExists = app.runtime.jsToolStore.getByName(request.body.name);
        if (nameExists) {
          return reply.status(400).send({ error: "Tool name already exists in database" });
        }
        if (app.runtime.fileToolLoader.getTool(request.body.name)) {
          return reply.status(400).send({ error: "Tool name already exists in files" });
        }
      }

      const updated = app.runtime.jsToolStore.update(request.params.id, request.body);

      // 实时更新 ToolRegistry
      const toolName = updated?.name ?? existing.name;
      app.runtime.refreshJsTool(toolName);

      // 如果名称变更，移除旧名称的工具
      if (request.body.name && request.body.name !== existing.name) {
        app.runtime.removeJsTool(existing.name);
      }

      return reply.send({ ...updated, source: "database" });
    }
  );

  // 删除数据库工具
  app.delete<{ Params: { id: string } }>(
    "/api/js-tools/:id",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const existing = app.runtime.jsToolStore.getById(request.params.id);

      if (!existing) {
        return reply.status(404).send({ error: "Tool not found in database" });
      }

      const deleted = app.runtime.jsToolStore.delete(request.params.id);

      if (!deleted) {
        return reply.status(404).send({ error: "Tool not found" });
      }

      // 实时从 ToolRegistry 移除
      app.runtime.removeJsTool(existing.name);

      return reply.send({ status: "ok" });
    }
  );

  // 测试 JS 工具（支持数据库和文件工具）
  app.post<{ Params: { id: string }; Body: { args: Record<string, unknown> } }>(
    "/api/js-tools/:id/test",
    { preHandler: adminAuth(adminToken) },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { args: Record<string, unknown> } }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;

      // 先尝试从数据库获取
      const dbTool = app.runtime.jsToolStore.getById(id) ?? app.runtime.jsToolStore.getByName(id);
      if (dbTool) {
        const result = await app.runtime.jsSandbox.execute(dbTool.code, request.body.args ?? {});
        // 执行失败时返回 400 状态码
        if (!result.success) {
          return reply.status(400).send(result);
        }
        return reply.send(result);
      }

      // 再尝试从文件工具获取
      const fileTool = app.runtime.fileToolLoader.getTool(id);
      if (fileTool) {
        // 如果工具需要网络访问，创建专用沙箱
        const sandbox = fileTool.allowNetwork
          ? new (await import("../../core/js_sandbox.js")).JsSandbox({
              timeout: 60000,
              allowedDir: "./file",
              allowNetwork: true,
              allowedDomains: fileTool.allowedDomains ?? [],
            })
          : app.runtime.jsSandbox;

        const result = await sandbox.execute(fileTool.code, request.body.args ?? {});
        // 执行失败时返回 400 状态码
        if (!result.success) {
          return reply.status(400).send(result);
        }
        return reply.send(result);
      }

      return reply.status(404).send({ error: "Tool not found" });
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

      const validation = app.runtime.jsSandbox.validateCode(code);

      return reply.send(validation);
    }
  );

  // ============================================================
  // 文件工具 API
  // ============================================================

  // 获取文件工具列表
  app.get(
    "/api/file-tools",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const tools = app.runtime.fileToolLoader.getAllTools();
      return reply.send(tools.map((t) => ({ ...t, source: "file" })));
    }
  );

  // 保存文件工具（创建或更新）
  app.post<{ Body: JsonToolFile }>(
    "/api/file-tools",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: JsonToolFile }>, reply: FastifyReply) => {
      const tool = request.body;

      if (!tool.name || !tool.code || !tool.inputSchema) {
        return reply.status(400).send({ error: "name, code and inputSchema are required" });
      }

      // 验证代码安全性
      const validation = app.runtime.jsSandbox.validateCode(tool.code);
      if (!validation.safe) {
        return reply.status(400).send({
          error: "Code validation failed",
          issues: validation.issues,
        });
      }

      // 检查数据库中是否已存在同名工具
      if (app.runtime.jsToolStore.getByName(tool.name)) {
        return reply.status(400).send({
          error: `Tool "${tool.name}" already exists in database. Delete it first or use a different name.`,
        });
      }

      // 保存到文件
      const filePath = app.runtime.saveFileTool(tool);

      // 获取保存后的工具
      const savedTool = app.runtime.fileToolLoader.getTool(tool.name);

      return reply.send({ ...savedTool, source: "file", filePath });
    }
  );

  // 删除文件工具
  app.delete<{ Params: { name: string } }>(
    "/api/file-tools/:name",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const { name } = request.params;

      const deleted = app.runtime.deleteFileTool(name);

      if (!deleted) {
        return reply.status(404).send({ error: "File tool not found" });
      }

      return reply.send({ status: "ok" });
    }
  );

  // 重新加载所有文件工具
  app.post(
    "/api/file-tools/reload",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      app.runtime.fileToolLoader.reloadAll();
      // 重新注册所有文件工具
      const tools = app.runtime.fileToolLoader.getAllTools();
      for (const tool of tools) {
        app.runtime.refreshFileTool(tool.name);
      }
      return reply.send({ status: "ok", count: tools.length });
    }
  );

  // ============================================================
  // 示例工具 API
  // ============================================================

  // 获取示例工具列表
  app.get(
    "/api/js-tools/examples",
    { preHandler: adminAuth(adminToken) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const examples = await loadJsToolExamples();
      return reply.send(examples);
    }
  );

  // 从示例导入工具（可选择导入到数据库或文件）
  app.post<{ Body: { name: string; target?: "database" | "file" } }>(
    "/api/js-tools/import",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Body: { name: string; target?: "database" | "file" } }>, reply: FastifyReply) => {
      const { name, target = "file" } = request.body;

      if (!name) {
        return reply.status(400).send({ error: "name is required" });
      }

      // 查找示例工具
      const examples = await loadJsToolExamples();
      const example = examples.find((e) => e.name === name);

      if (!example) {
        return reply.status(404).send({ error: `Example tool not found: ${name}` });
      }

      // 检查是否已存在
      if (app.runtime.jsToolStore.getByName(example.name)) {
        return reply.status(400).send({ error: `Tool "${name}" already exists in database` });
      }
      if (app.runtime.fileToolLoader.getTool(example.name)) {
        return reply.status(400).send({ error: `Tool "${name}" already exists in files` });
      }

      if (target === "database") {
        // 导入到数据库
        const tool = app.runtime.jsToolStore.create({
          name: example.name,
          description: example.description,
          inputSchema: example.inputSchema as JSONSchema7,
          code: example.code,
        });
        app.runtime.refreshJsTool(name);
        return reply.send({ ...tool, source: "database" });
      } else {
        // 导入到文件
        const filePath = app.runtime.saveFileTool({
          name: example.name,
          description: example.description,
          inputSchema: example.inputSchema as JSONSchema7,
          code: example.code,
          category: example.category,
          tags: example.tags,
        });
        const savedTool = app.runtime.fileToolLoader.getTool(example.name);
        return reply.send({ ...savedTool, source: "file", filePath });
      }
    }
  );
}
