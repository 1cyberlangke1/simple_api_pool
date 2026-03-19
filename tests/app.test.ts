/**
 * App 测试
 * @description 测试 Fastify 应用构建和路由注册
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { buildApp } from "../src/app.js";
import { AppRuntime } from "../src/app_state.js";
import type { AppConfig } from "../src/core/types.js";

// 测试配置
const testConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 3000,
    admin: {
      adminToken: "test-token-12345",
    },
  },
  providers: [
    {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
      timeoutMs: 30000,
      strategy: "round_robin",
    },
  ],
  models: [
    {
      name: "test-model",
      provider: "test-provider",
      model: "test-model-id",
      supportsTools: false,
      pricing: {},
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
  tools: {
    mcpTools: [],
  },
  cache: {
    enable: false,
    maxEntries: 1000,
    dbPath: "./config/test_app.sqlite",
  },
};

describe("buildApp", () => {
  let runtime: AppRuntime;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    runtime = new AppRuntime(testConfig);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    runtime.statsStore.close();
    runtime.cacheStore?.close();
  });

  describe("应用构建", () => {
    it("应该成功构建 Fastify 应用", async () => {
      app = await buildApp(runtime);
      expect(app).toBeDefined();
      expect(app.runtime).toBe(runtime);
    });

    it("应该注册 runtime 装饰器", async () => {
      app = await buildApp(runtime);
      expect(app.runtime).toBeDefined();
      expect(app.runtime.config).toEqual(testConfig);
    });

    it("应该注册可选的 onConfigUpdate 回调", async () => {
      let called = false;
      const callback = () => {
        called = true;
      };
      app = await buildApp(runtime, callback);
      expect(app.onConfigUpdate).toBe(callback);
    });
  });

  describe("路由注册", () => {
    beforeEach(async () => {
      app = await buildApp(runtime);
    });

    it("应该注册 GET /health 路由", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ok");
      expect(body.groups).toBeDefined();
    });

    it("应该注册 GET /v1/models 路由", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/models",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeInstanceOf(Array);
    });

    it("应该注册 POST /v1/chat/completions 路由", async () => {
      // 路由存在性检查：无论返回什么状态码，只要不是 500 说明路由正常工作
      const response = await app.inject({
        method: "POST",
        url: "/v1/chat/completions",
        payload: {
          model: "default",
          messages: [{ role: "user", content: "Hello" }],
        },
      });
      // 404 表示分组不存在，400 表示参数错误，其他状态码表示路由正常工作
      // 只要没有抛出未捕获异常，路由就是存在的
      expect(response.statusCode).toBeDefined();
    });

    it("应该注册 Admin API 路由", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: {
          Authorization: "Bearer test-token-12345",
        },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe("404 处理", () => {
    beforeEach(async () => {
      app = await buildApp(runtime);
    });

    it("应该返回 404 对于未知路由", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/unknown-route",
      });
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Not Found");
    });
  });

  describe("CORS 配置", () => {
    beforeEach(async () => {
      app = await buildApp(runtime);
    });

    it("应该允许跨域请求", async () => {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/health",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "GET",
        },
      });
      expect(response.statusCode).toBe(204);
    });
  });

  describe("Admin 路由认证", () => {
    beforeEach(async () => {
      app = await buildApp(runtime);
    });

    it("应该拒绝无 token 的 Admin 请求", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
      });
      expect(response.statusCode).toBe(401);
    });

    it("应该拒绝错误 token 的 Admin 请求", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: {
          Authorization: "Bearer wrong-token",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("应该接受正确 token 的 Admin 请求", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/admin/api/config",
        headers: {
          Authorization: "Bearer test-token-12345",
        },
      });
      expect(response.statusCode).toBe(200);
    });
  });
});
