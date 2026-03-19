import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import type { AppConfig } from "../src/core/types.js";
import { AppRuntime } from "../src/app_state.js";
import { KeyStore } from "../src/core/key_store.js";
import { adminRoutes } from "../src/routes/admin/index.js";
import fs from "fs";
import path from "path";

/**
 * Admin Routes 单元测试
 * @description 测试所有管理端 API 接口
 */

// 测试用配置
const testConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 3000,
    admin: {
      adminToken: "test-admin-token-12345",
    },
  },
  providers: [
    {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
      timeoutMs: 30000,
      rpmLimit: 100,
      strategy: "round_robin",
    },
  ],
  models: [
    {
      name: "test-model",
      provider: "test-provider",
      model: "test-model-id",
      supportsTools: true,
      pricing: {
        promptPer1k: 0.001,
        completionPer1k: 0.002,
      },
    },
  ],
  groups: [
    {
      name: "default",
      strategy: "round_robin",
      routes: [{ modelId: "test-provider/test-model", temperature: 0.7 }],
    },
  ],
  keys: [
    {
      alias: "test-key-1",
      provider: "test-provider",
      key: "sk-test-key-1",
      quota: { type: "infinite" },
    },
  ],
  tools: {
    mcpTools: [],
  },
  cache: {
    enable: false,
    maxEntries: 1000,
    dbPath: "./config/test_cache.sqlite",
  },
};

describe("Admin Routes", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;
  const adminToken = testConfig.server.admin.adminToken;

  // 辅助函数：创建带认证的请求头（用于 GET/DELETE 等无 body 请求）
  const authHeaders = () => ({
    Authorization: `Bearer ${adminToken}`,
  });

  // 辅助函数：创建带认证和 JSON content-type 的请求头（用于 POST/PUT 等有 body 请求）
  const authHeadersWithJson = () => ({
    Authorization: `Bearer ${adminToken}`,
    "Content-Type": "application/json",
  });

  beforeEach(async () => {
    // 创建运行时
    runtime = new AppRuntime(JSON.parse(JSON.stringify(testConfig)));

    // 创建 Fastify 应用
    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);
    app.decorate("onConfigUpdate", vi.fn());

    // 注册路由
    await app.register(adminRoutes, { prefix: "/admin" });
  });

  afterEach(async () => {
    await app.close();
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  // ============================================================
  // 认证测试
  // ============================================================
  describe("Authentication", () => {
    it("rejects request without auth token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    });

    it("rejects request with wrong token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: {
          Authorization: "Bearer wrong-token",
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it("accepts request with correct Bearer token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
    });

    it("accepts request with X-Admin-Token header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: {
          "X-Admin-Token": adminToken,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ============================================================
  // Config Routes
  // ============================================================
  describe("Config Routes", () => {
    it("GET /api/config returns current config", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const config = response.json();
      expect(config.server.port).toBe(3000);
      expect(config.providers).toHaveLength(1);
      expect(config.models).toHaveLength(1);
    });

    it("PUT /api/config updates config", async () => {
      const newConfig = {
        ...testConfig,
        server: { ...testConfig.server, port: 4000 },
      };

      const response = await app.inject({
        method: "PUT",
        url: "/admin/api/config",
        headers: authHeadersWithJson(),
        payload: newConfig,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
      expect(runtime.config.server.port).toBe(4000);
    });
  });

  // ============================================================
  // Keys Routes
  // ============================================================
  describe("Keys Routes", () => {
    it("GET /api/keys returns all keys", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/keys",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const keys = response.json();
      expect(Array.isArray(keys)).toBe(true);
      expect(keys).toHaveLength(1);
      expect(keys[0].alias).toBe("test-key-1");
    });

    it("POST /api/keys adds a new key", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/keys",
        headers: authHeadersWithJson(),
        payload: {
          alias: "test-key-2",
          provider: "test-provider",
          key: "sk-test-key-2",
          quota: { type: "infinite" },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });

      const keys = runtime.keyStore.listKeys();
      expect(keys).toHaveLength(2);
    });

    it("PUT /api/keys/:alias updates a key", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/admin/api/keys/test-key-1",
        headers: authHeadersWithJson(),
        payload: {
          alias: "test-key-1",
          provider: "test-provider",
          key: "sk-updated-key",
          quota: { type: "daily", limit: 100 },
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("DELETE /api/keys/:alias deletes a key", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/keys/test-key-1",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.keyStore.listKeys()).toHaveLength(0);
    });

    it("POST /api/keys/batch imports multiple keys", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/keys/batch",
        headers: authHeadersWithJson(),
        payload: {
          provider: "test-provider",
          keys: "sk-key-1\nsk-key-2\nsk-key-3",
          delimiter: "\n",
          quotaType: "infinite",
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      expect(result.total).toBe(3);
      expect(result.success).toBe(3);
    });

    it("POST /api/keys/batch rejects empty keys", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/keys/batch",
        headers: authHeadersWithJson(),
        payload: {
          provider: "test-provider",
          keys: "",
          delimiter: "\n",
          quotaType: "infinite",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("POST /api/keys/batch-delete deletes multiple keys", async () => {
      // 先添加一些 keys
      runtime.keyStore.addKey({
        alias: "del-key-1",
        provider: "test-provider",
        key: "sk-del-1",
        quota: { type: "infinite" },
      });
      runtime.keyStore.addKey({
        alias: "del-key-2",
        provider: "test-provider",
        key: "sk-del-2",
        quota: { type: "infinite" },
      });

      const response = await app.inject({
        method: "POST",
        url: "/admin/api/keys/batch-delete",
        headers: authHeadersWithJson(),
        payload: {
          aliases: ["del-key-1", "del-key-2"],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().deleted).toBe(2);
    });
  });

  // ============================================================
  // Providers Routes
  // ============================================================
  describe("Providers Routes", () => {
    it("GET /api/providers returns all providers", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/providers",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const providers = response.json();
      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe("test-provider");
    });

    it("POST /api/providers adds a new provider", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/providers",
        headers: authHeadersWithJson(),
        payload: {
          name: "new-provider",
          baseUrl: "https://api.new.com/v1",
          strategy: "round_robin",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.providers).toHaveLength(2);
    });

    it("POST /api/providers rejects duplicate provider", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/providers",
        headers: authHeadersWithJson(),
        payload: {
          name: "test-provider",
          baseUrl: "https://api.test.com/v1",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("provider already exists");
    });

    it("PUT /api/providers/:name updates a provider", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/admin/api/providers/test-provider",
        headers: authHeadersWithJson(),
        payload: {
          name: "test-provider",
          baseUrl: "https://api.updated.com/v1",
          strategy: "random",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.providers[0]!.baseUrl).toBe("https://api.updated.com/v1");
    });

    it("PUT /api/providers/:name returns 404 for non-existent provider", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/admin/api/providers/non-existent",
        headers: authHeadersWithJson(),
        payload: {
          name: "non-existent",
          baseUrl: "https://api.test.com/v1",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("DELETE /api/providers/:name deletes provider and cascades", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/providers/test-provider",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.providers).toHaveLength(0);
      // 级联删除：关联的模型和 key 也应该被删除
      expect(runtime.config.models.filter(m => m.provider === "test-provider")).toHaveLength(0);
    });

    it("DELETE /api/providers/:name returns 404 for non-existent", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/providers/non-existent",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });

    it("GET /api/providers/:name/upstream-models returns upstream models", async () => {
      // Mock fetch for upstream API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: "gpt-4", owned_by: "openai" },
            { id: "gpt-3.5-turbo", owned_by: "openai" },
          ],
        }),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "GET",
        url: "/admin/api/providers/test-provider/upstream-models",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.models).toHaveLength(2);
      expect(data.models[0].id).toBe("gpt-4");
    });

    it("GET /api/providers/:name/upstream-models returns 404 for non-existent provider", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/providers/non-existent/upstream-models",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
    });

    it("GET /api/providers/:name/upstream-models returns 400 when no key available", async () => {
      // Remove all keys
      runtime.keyStore = new KeyStore([]);

      const response = await app.inject({
        method: "GET",
        url: "/admin/api/providers/test-provider/upstream-models",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain("No available key");
    });

    it("GET /api/providers/:name/upstream-models handles upstream error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "GET",
        url: "/admin/api/providers/test-provider/upstream-models",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(500);
    });

    it("GET /api/providers/:name/upstream-models handles network error", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const response = await app.inject({
        method: "GET",
        url: "/admin/api/providers/test-provider/upstream-models",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain("Network error");
    });
  });

  // ============================================================
  // Models Routes
  // ============================================================
  describe("Models Routes", () => {
    it("GET /api/models returns all models", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/models",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const models = response.json();
      expect(models).toHaveLength(1);
      expect(models[0].name).toBe("test-model");
    });

    it("POST /api/models adds a new model", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/models",
        headers: authHeadersWithJson(),
        payload: {
          name: "new-model",
          provider: "test-provider",
          model: "new-model-id",
        },
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.models).toHaveLength(2);
    });

    it("POST /api/models rejects duplicate model", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/models",
        headers: authHeadersWithJson(),
        payload: {
          name: "test-model",
          provider: "test-provider",
          model: "test-model-id",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("PUT /api/models/:provider/:name updates a model", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/admin/api/models/test-provider/test-model",
        headers: authHeadersWithJson(),
        payload: {
          name: "test-model",
          provider: "test-provider",
          model: "updated-model-id",
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("DELETE /api/models/:provider/:name deletes a model", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/models/test-provider/test-model",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.models).toHaveLength(0);
    });

    it("GET /api/models/capabilities returns model info", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/models/capabilities",
        headers: authHeaders(),
        query: { model: "gpt-4o", provider: "openai" },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.found).toBe(true);
      expect(data.capabilities).toBeDefined();
    });

    it("GET /api/models/capabilities requires model parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/models/capabilities",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ============================================================
  // Groups Routes
  // ============================================================
  describe("Groups Routes", () => {
    it("GET /api/groups returns all groups", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/groups",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const groups = response.json();
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe("default");
    });

    it("POST /api/groups adds a new group", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/groups",
        headers: authHeadersWithJson(),
        payload: {
          name: "new-group",
          strategy: "random",
          routes: [{ modelId: "test-provider/test-model" }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.groups).toHaveLength(2);
    });

    it("PUT /api/groups/:name updates a group", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/admin/api/groups/default",
        headers: authHeadersWithJson(),
        payload: {
          name: "default",
          strategy: "exhaust",
          routes: [{ modelId: "test-provider/test-model" }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.groups[0]!.strategy).toBe("exhaust");
    });

    it("DELETE /api/groups/:name deletes a group", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/groups/default",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(runtime.config.groups).toHaveLength(0);
    });
  });

  // ============================================================
  // Pricing Routes
  // ============================================================
  describe("Pricing Routes", () => {
    it("GET /api/pricing/query requires model parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/pricing/query",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(400);
    });

    it("GET /api/pricing/query returns price for known model", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/pricing/query",
        headers: authHeaders(),
        query: { model: "gpt-4o", provider: "openai" },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThan(0);
      expect(data.exchangeRate).toBeDefined();
    });

    it("GET /api/pricing/query supports fuzzy matching", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/pricing/query",
        headers: authHeaders(),
        query: { model: "gpt" },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.results.length).toBeGreaterThan(0);
    });

    it("GET /api/pricing/all returns all prices", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/pricing/all",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.prices).toBeDefined();
      expect(Array.isArray(data.prices)).toBe(true);
      expect(data.providers).toBeDefined();
      expect(data.exchangeRate).toBeDefined();
    });
  });

  // ============================================================
  // Exchange Rate Routes
  // ============================================================
  describe("Exchange Rate Routes", () => {
    it("GET /api/exchange-rate returns rate", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/exchange-rate",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.base).toBe("USD");
      expect(data.target).toBe("CNY");
      expect(data.rate).toBeGreaterThan(0);
    });

    it("GET /api/exchange-rate supports custom currencies", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/exchange-rate",
        headers: authHeaders(),
        query: { base: "EUR", target: "USD" },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.base).toBe("EUR");
      expect(data.target).toBe("USD");
    });

    it("GET /api/exchange-rate/status returns cache status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/exchange-rate/status",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.cacheStatus).toBeDefined();
      expect(Array.isArray(data.cacheStatus)).toBe(true);
    });

    it("POST /api/exchange-rate/refresh refreshes rate", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/exchange-rate/refresh",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.rate).toBeDefined();
      expect(data.cacheStatus).toBeDefined();
    });
  });

  // ============================================================
  // Stats Routes
  // ============================================================
  describe("Stats Routes", () => {
    it("GET /api/stats/summary returns stats", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/stats/summary",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.hours).toBeDefined();
      expect(data.stats).toBeDefined();
      expect(Array.isArray(data.stats)).toBe(true);
    });

    it("GET /api/stats/summary supports hours parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/stats/summary",
        headers: authHeaders(),
        query: { hours: 48 },
      });

      expect(response.statusCode).toBe(200);
      // query 参数会被转换为字符串，后端会自动解析为数字
      expect(Number(response.json().hours)).toBe(48);
    });

    it("GET /api/stats/hourly returns hourly stats", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/stats/hourly",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.hours).toBeDefined();
      expect(data.stats).toBeDefined();
    });

    it("GET /api/stats/chart returns chart data", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/stats/chart",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.timeline).toBeDefined();
      expect(data.groups).toBeDefined();
      expect(data.groupData).toBeDefined();
      expect(data.summary).toBeDefined();
    });

    it("GET /api/stats/chart supports hours parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/stats/chart",
        headers: authHeaders(),
        query: { hours: 12 },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.timeline.length).toBeLessThanOrEqual(12);
    });

    it("DELETE /api/stats/cleanup removes old stats", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/stats/cleanup",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe("ok");
      expect(data.message).toContain("Cleaned up");
    });

    it("DELETE /api/stats/cleanup supports days parameter", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/stats/cleanup",
        headers: authHeaders(),
        query: { days: 7 },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.message).toContain("7 days");
    });

    it("GET /api/stats/hourly supports group parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/stats/hourly",
        headers: authHeaders(),
        query: { group: "default" },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.group).toBe("default");
    });
  });

  // ============================================================
  // Cache Routes
  // ============================================================
  describe("Cache Routes", () => {
    it("GET /api/cache/stats returns stats (cache disabled)", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/cache/stats",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.enabled).toBe(false);
    });

    it("DELETE /api/cache returns error when cache disabled", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/cache",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(400);
    });
  });
});

// ============================================================
// Cache Enabled 测试
// ============================================================
describe("Admin Routes with Cache Enabled", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;
  const adminToken = testConfig.server.admin.adminToken;
  const testCachePath = "./config/test_admin_cache.sqlite";

  const authHeaders = () => ({
    Authorization: `Bearer ${adminToken}`,
  });

  beforeEach(async () => {
    // 创建启用缓存的配置
    const configWithCache: AppConfig = {
      ...testConfig,
      cache: {
        enable: true,
        maxEntries: 100,
        dbPath: testCachePath,
      },
    };

    runtime = new AppRuntime(configWithCache);

    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);
    app.decorate("onConfigUpdate", vi.fn());

    await app.register(adminRoutes, { prefix: "/admin" });
  });

  afterEach(async () => {
    await app.close();
    runtime.cacheStore?.close();
    runtime.statsStore.close();

    // 清理测试数据库
    try {
      if (fs.existsSync(testCachePath)) {
        fs.unlinkSync(testCachePath);
      }
    } catch {
      // ignore
    }
  });

  describe("Cache Routes with cache enabled", () => {
    it("GET /api/cache/stats returns enabled status", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/cache/stats",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.enabled).toBe(true);
      expect(data.stats).toBeDefined();
      expect(data.stats!.entries).toBe(0);
      expect(data.stats!.hits).toBe(0);
      expect(data.stats!.misses).toBe(0);
    });

    it("DELETE /api/cache clears cache", async () => {
      // 添加一些缓存
      runtime.cacheStore!.set("test-key", { data: "test" });

      const response = await app.inject({
        method: "DELETE",
        url: "/admin/api/cache",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("ok");
      expect(runtime.cacheStore!.size()).toBe(0);
    });
  });
});

// ============================================================
// Tools Routes 测试
// ============================================================
describe("Tools Routes", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;
  const adminToken = testConfig.server.admin.adminToken;

  const authHeaders = () => ({
    "X-Admin-Token": adminToken,
  });

  beforeEach(async () => {
    runtime = new AppRuntime(testConfig);

    // 注册一个测试工具
    runtime.toolRegistry.register(
      {
        name: "test_tool",
        description: "A test tool for unit testing",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "A message to echo" },
          },
          required: ["message"],
        },
      },
      async (args) => {
        const typedArgs = args as { message: string };
        return { echoed: typedArgs.message };
      }
    );

    // 注册另一个测试工具
    runtime.toolRegistry.register(
      {
        name: "calculator",
        description: "A simple calculator",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
            operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"] },
          },
          required: ["a", "b", "operation"],
        },
      },
      async (args) => {
        const { a, b, operation } = args as { a: number; b: number; operation: string };
        switch (operation) {
          case "add":
            return { result: a + b };
          case "subtract":
            return { result: a - b };
          case "multiply":
            return { result: a * b };
          case "divide":
            return { result: b !== 0 ? a / b : null };
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      }
    );

    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);
    app.decorate("onConfigUpdate", vi.fn());

    await app.register(adminRoutes, { prefix: "/admin" });
  });

  afterEach(async () => {
    await app.close();
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  describe("GET /api/tools", () => {
    it("returns list of tools", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.tools).toBeDefined();
      expect(Array.isArray(data.tools)).toBe(true);
      expect(data.count).toBe(2);
      expect(data.tools[0].name).toBe("test_tool");
      expect(data.tools[1].name).toBe("calculator");
    });

    it("requires authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools",
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects invalid token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools",
        headers: { "X-Admin-Token": "invalid-token" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/tools/:name", () => {
    it("returns specific tool details", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools/test_tool",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.name).toBe("test_tool");
      expect(data.description).toBe("A test tool for unit testing");
      expect(data.parameters).toBeDefined();
      expect(data.parameters.type).toBe("object");
    });

    it("returns 404 for non-existent tool", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools/nonexistent_tool",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe("Tool not found");
    });

    it("requires authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools/test_tool",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /api/tools/:name/call", () => {
    it("calls tool with valid args", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/test_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { message: "Hello, World!" } },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.result).toEqual({ echoed: "Hello, World!" });
    });

    it("calls calculator tool", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/calculator/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { a: 5, b: 3, operation: "add" } },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.result).toEqual({ result: 8 });
    });

    it("handles tool execution error", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/calculator/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { a: 5, b: 3, operation: "unknown" } },
      });

      expect(response.statusCode).toBe(500);
      const data = response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Unknown operation");
    });

    it("returns 404 for non-existent tool", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/nonexistent_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: {} },
      });

      expect(response.statusCode).toBe(404);
    });

    it("requires authentication", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/test_tool/call",
        headers: { "Content-Type": "application/json" },
        payload: { args: { message: "test" } },
      });

      expect(response.statusCode).toBe(401);
    });

    it("handles empty args", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/test_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: {},
      });

      // 工具可能因为缺少参数而失败
      const data = response.json();
      // 成功或失败取决于工具实现
      expect([200, 500]).toContain(response.statusCode);
    });
  });
});

// ============================================================
// Tools Routes - Monkey Testing (Edge Cases)
// ============================================================
describe("Tools Routes - Monkey Testing", () => {
  let app: ReturnType<typeof Fastify>;
  let runtime: AppRuntime;
  const adminToken = testConfig.server.admin.adminToken;

  const authHeaders = () => ({
    "X-Admin-Token": adminToken,
  });

  beforeEach(async () => {
    runtime = new AppRuntime(testConfig);

    // 注册一个返回复杂结果的工具
    runtime.toolRegistry.register(
      {
        name: "complex_tool",
        description: "A tool with complex return values",
        inputSchema: { type: "object", properties: {} },
      },
      async (args) => {
        const typedArgs = args as { type?: string };
        if (typedArgs.type === "null") return null;
        if (typedArgs.type === "undefined") return undefined;
        if (typedArgs.type === "array") return [1, 2, 3];
        if (typedArgs.type === "nested") return { a: { b: { c: [1, 2, 3] } } };
        return { result: "default" };
      }
    );

    // 注册一个抛出错误的工具
    runtime.toolRegistry.register(
      {
        name: "error_tool",
        description: "A tool that always throws",
        inputSchema: { type: "object", properties: {} },
      },
      async () => {
        throw new Error("Intentional error for testing");
      }
    );

    app = Fastify({ logger: false });
    app.decorate("runtime", runtime);
    app.decorate("onConfigUpdate", vi.fn());

    await app.register(adminRoutes, { prefix: "/admin" });
  });

  afterEach(async () => {
    await app.close();
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  describe("edge cases", () => {
    it("handles tool returning null", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/complex_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { type: "null" } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().result).toBeNull();
    });

    it("handles tool returning undefined", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/complex_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { type: "undefined" } },
      });

      expect(response.statusCode).toBe(200);
      // undefined 在 JSON 序列化时会被保留或转为 undefined
      const result = response.json().result;
      expect(result === null || result === undefined).toBe(true);
    });

    it("handles tool returning array", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/complex_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { type: "array" } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().result).toEqual([1, 2, 3]);
    });

    it("handles tool returning nested object", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/complex_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: { type: "nested" } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().result).toEqual({ a: { b: { c: [1, 2, 3] } } });
    });

    it("handles tool that throws error", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/admin/api/tools/error_tool/call",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        payload: { args: {} },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().success).toBe(false);
      expect(response.json().error).toContain("Intentional error");
    });

    it("handles tool name with special characters", async () => {
      // 注册带特殊字符的工具
      runtime.toolRegistry.register(
        {
          name: "tool-with-dash_and_underscore",
          description: "Tool with special chars in name",
          inputSchema: { type: "object", properties: {} },
        },
        async () => ({ ok: true })
      );

      const response = await app.inject({
        method: "GET",
        url: "/admin/api/tools/tool-with-dash_and_underscore",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe("tool-with-dash_and_underscore");
    });

    it("handles empty tools list", async () => {
      // 创建没有工具的新 runtime
      const emptyRuntime = new AppRuntime(testConfig);
      const emptyApp = Fastify({ logger: false });
      emptyApp.decorate("runtime", emptyRuntime);
      emptyApp.decorate("onConfigUpdate", vi.fn());

      await emptyApp.register(adminRoutes, { prefix: "/admin" });

      const response = await emptyApp.inject({
        method: "GET",
        url: "/admin/api/tools",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().tools).toEqual([]);
      expect(response.json().count).toBe(0);

      await emptyApp.close();
      emptyRuntime.cacheStore?.close();
      emptyRuntime.statsStore.close();
    });
  });
});
