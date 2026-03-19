import Fastify from "fastify";
import cors from "@fastify/cors";
import type { AppConfig } from "./core/types.js";
import type { AppRuntime } from "./app_state.js";
import { chatCompletionHandler } from "./routes/chat/index.js";
import { listModelsHandler } from "./routes/models.js";
import { healthHandler } from "./routes/health.js";
import { adminRoutes } from "./routes/admin/index.js";

/**
 * 构建 Fastify 应用
 * @description 纯后端 API 服务，前端独立部署
 * @param runtime 应用运行态
 * @param onConfigUpdate 配置更新回调
 * @returns Fastify 实例
 */
export async function buildApp(runtime: AppRuntime, onConfigUpdate?: (config: AppConfig) => void) {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
    bodyLimit: 50 * 1024 * 1024, // 50MB
  });

  // 注册 CORS（前后端分离，允许跨域）
  await app.register(cors, {
    origin: true, // 开发环境允许所有来源
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
  });

  // 装饰运行态到 app 实例
  app.decorate("runtime", runtime);
  app.decorate("onConfigUpdate", onConfigUpdate);

  // 加载工具
  await runtime.loadTools();

  // 注册 API 路由

  // Health check
  app.get("/health", healthHandler);

  // OpenAI compatible API
  app.post("/v1/chat/completions", chatCompletionHandler);
  app.get("/v1/models", listModelsHandler);

  // Admin API routes
  await app.register(adminRoutes, { prefix: "/admin" });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({ error: "Not Found" });
  });

  return app;
}

// 类型扩展
declare module "fastify" {
  interface FastifyInstance {
    runtime: AppRuntime;
    onConfigUpdate?: (config: AppConfig) => void;
  }
}