import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { AppRuntime } from "../src/app_state.js";
import type { AppConfig } from "../src/core/types.js";
import { healthHandler } from "../src/routes/health.js";
import { listModelsHandler } from "../src/routes/models.js";

/**
 * 公共路由测试
 * @description 测试 /health 和 /v1/models 公共接口
 */

// 测试配置
const testConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 3000,
    admin: { adminToken: "test-admin-token-12345" },
  },
  providers: [
    {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
      strategy: "round_robin",
    },
  ],
  models: [
    {
      name: "test-model",
      provider: "test-provider",
      model: "gpt-4o-mini",
      supportsTools: true,
    },
  ],
  groups: [
    {
      name: "default",
      strategy: "round_robin",
      routes: [{ modelId: "test-provider/test-model" }],
    },
  ],
  keys: [
    {
      alias: "test-key",
      provider: "test-provider",
      key: "sk-test-key",
      quota: { type: "infinite" },
    },
  ],
  tools: { mcpTools: [] },
  cache: { enable: false, maxEntries: 100, dbPath: "./config/test_cache.sqlite" },
};

describe("Public Routes", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;

  beforeEach(async () => {
    runtime = new AppRuntime(testConfig);

    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);

    // 注册公共路由
    app.get("/health", healthHandler);
    app.get("/v1/models", listModelsHandler);
  });

  afterEach(async () => {
    await app.close();
    runtime.statsStore.close();
  });

  // ============================================================
  // Health Routes
  // ============================================================
  describe("GET /health", () => {
    it("returns status ok", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe("ok");
    });

    it("returns timestamp", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.timestamp).toBeDefined();
      expect(typeof data.timestamp).toBe("string");
    });

    it("returns model list", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.models).toBeDefined();
      expect(Array.isArray(data.models)).toBe(true);
      expect(data.models).toContain("test-provider/test-model");
    });

    it("includes group models in list", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.models).toContain("group/default");
    });

    it("does not require authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
        // 无 Authorization header
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Models Routes
  // ============================================================
  describe("GET /v1/models", () => {
    it("returns OpenAI compatible list format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/models",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.object).toBe("list");
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("returns all available models", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/models",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();

      const modelIds = data.data.map((m: { id: string }) => m.id);
      expect(modelIds).toContain("test-provider/test-model");
      expect(modelIds).toContain("group/default");
    });

    it("returns correct model object format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/models",
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();

      const firstModel = data.data[0];
      expect(firstModel).toHaveProperty("id");
      expect(firstModel).toHaveProperty("object");
      expect(firstModel.object).toBe("model");
    });

    it("does not require authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/models",
        // 无 Authorization header
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
