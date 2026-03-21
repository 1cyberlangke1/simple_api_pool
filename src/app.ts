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
  // 生产环境应限制特定域名，开发环境允许所有来源
  const isProduction = process.env.NODE_ENV === "production";
  await app.register(cors, {
    origin: isProduction
      ? (origin, callback) => {
          // 生产环境：只允许 localhost 和配置的域名
          const allowedOrigins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
          ];
          // 允许无 origin 的请求（如移动端应用、Postman）
          if (!origin) return callback(null, true);
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            // 记录未授权的跨域请求
            app.log.warn({ origin }, "CORS: Origin not allowed");
            callback(new Error("Not allowed by CORS"), false);
          }
        }
      : true, // 开发环境允许所有来源
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Token", "X-API-Key"],
    credentials: true,
  });

  // 装饰运行态到 app 实例
  app.decorate("runtime", runtime);
  app.decorate("onConfigUpdate", onConfigUpdate);

  // 加载工具
  await runtime.loadTools();

  // API 认证中间件（用于 /v1/* 路由，排除 /v1/models）
  const apiAuth = runtime.config.server.apiAuth;
  if (apiAuth?.enabled && apiAuth.tokens && apiAuth.tokens.length > 0) {
    app.addHook("onRequest", async (request, reply) => {
      // 只对 /v1/* 路由进行认证检查，但排除 /v1/models（公开端点）
      if (!request.url.startsWith("/v1/")) {
        return;
      }
      // /v1/models 是公开端点，不需要认证
      if (request.url === "/v1/models" || request.url.startsWith("/v1/models?")) {
        return;
      }

      const authType = apiAuth.type ?? "bearer";
      let providedToken: string | undefined;

      if (authType === "bearer") {
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          providedToken = authHeader.slice(7);
        }
      } else {
        // api-key 方式
        providedToken = request.headers["x-api-key"] as string | undefined;
      }

      // 检查令牌是否在允许的令牌列表中
      if (!providedToken || !apiAuth.tokens!.includes(providedToken)) {
        return reply.status(401).send({ error: "Unauthorized", message: "Invalid or missing API token" });
      }
    });
  }

  // 注册 API 路由

  // Health check
  app.get("/health", healthHandler);

  // OpenAI compatible API
  app.post("/v1/chat/completions", chatCompletionHandler);
  app.get("/v1/models", listModelsHandler);

  // Admin API routes
  await app.register(adminRoutes, { prefix: "/admin" });

  // 404 handler
  app.setNotFoundHandler((_request, reply) => {
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