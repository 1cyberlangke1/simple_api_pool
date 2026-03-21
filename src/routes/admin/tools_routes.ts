/**
 * 工具管理路由
 * @description 提供工具列表和管理功能
 * @module routes/admin/tools_routes
 */

import type { FastifyInstance } from "fastify";
import { adminAuth } from "./auth.js";

/**
 * 注册工具管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerToolsRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 获取工具列表
   * @route GET /admin/api/tools
   */
  app.get("/api/tools", {
    preHandler: adminAuth(adminToken),
  }, async (_request, reply) => {
    const registry = app.runtime.toolRegistry;
    
    const tools = registry.getOpenAITools().map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));

    return reply.send({
      tools,
      count: tools.length,
    });
  });

  /**
   * 获取单个工具详情
   * @route GET /admin/api/tools/:name
   */
  app.get("/api/tools/:name", {
    preHandler: adminAuth(adminToken),
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const registry = app.runtime.toolRegistry;
    
    if (!registry.has(name)) {
      return reply.status(404).send({ error: "Tool not found" });
    }

    const tools = registry.getOpenAITools();
    const tool = tools.find((t) => t.function.name === name);
    
    if (!tool) {
      return reply.status(404).send({ error: "Tool not found" });
    }

    return reply.send({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    });
  });

  /**
   * 调用工具（测试用）
   * @route POST /admin/api/tools/:name/call
   */
  app.post("/api/tools/:name/call", {
    preHandler: adminAuth(adminToken),
  }, async (request, reply) => {
    const { name } = request.params as { name: string };
    const { args } = request.body as { args?: unknown };
    const registry = app.runtime.toolRegistry;
    
    if (!registry.has(name)) {
      return reply.status(404).send({ error: "Tool not found" });
    }

    try {
      const result = await registry.call(name, args);
      return reply.send({
        success: true,
        result,
      });
    } catch (err) {
      // 安全提取错误消息，处理非 Error 类型异常
      const errorMessage = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({
        success: false,
        error: errorMessage,
      });
    }
  });
}
