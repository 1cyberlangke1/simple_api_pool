import type { FastifyInstance } from "fastify";
import { registerConfigRoutes } from "./config_routes.js";
import { registerKeysRoutes } from "./keys_routes.js";
import { registerProvidersRoutes } from "./providers_routes.js";
import { registerModelsRoutes } from "./models_routes.js";
import { registerGroupsRoutes } from "./groups_routes.js";
import { registerPricingRoutes } from "./pricing_routes.js";
import { registerExchangeRateRoutes } from "./exchange_rate_routes.js";
import { registerCacheRoutes } from "./cache_routes.js";
import { registerStatsRoutes } from "./stats_routes.js";
import { registerToolsRoutes } from "./tools_routes.js";
import { registerLogsRoutes } from "./logs_routes.js";
import { registerJsToolsRoutes } from "./js_tools_routes.js";
import { registerSSERoutes } from "./sse_routes.js";
import { registerPerformanceRoutes } from "./performance_routes.js";

/**
 * 管理端 API 路由
 * @description 仅提供 API 接口，前端由 Vue 应用提供
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const adminToken = app.runtime.config.server.admin.adminToken;

  // 注册各模块路由
  registerConfigRoutes(app, adminToken);
  registerKeysRoutes(app, adminToken);
  registerProvidersRoutes(app, adminToken);
  registerModelsRoutes(app, adminToken);
  registerGroupsRoutes(app, adminToken);
  registerPricingRoutes(app, adminToken);
  registerExchangeRateRoutes(app, adminToken);
  registerCacheRoutes(app, adminToken);
  registerStatsRoutes(app, adminToken);
  registerToolsRoutes(app, adminToken);
  registerLogsRoutes(app, adminToken);
  registerJsToolsRoutes(app, adminToken);
  registerSSERoutes(app, adminToken);
  registerPerformanceRoutes(app, adminToken);
}