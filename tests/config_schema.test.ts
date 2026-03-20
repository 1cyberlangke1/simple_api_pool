import { describe, it, expect } from "vitest";
import { validateConfig, validatePartialConfig } from "../src/core/config_schema.js";
import type { AppConfig } from "../src/core/types.js";

/**
 * ConfigSchema 单元测试
 * @description 测试配置验证功能
 */

// ============================================================
// 辅助函数：创建有效配置
// ============================================================

function createValidConfig(): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 3000,
      admin: {
        adminToken: "test-token-123",
      },
    },
    providers: [
      {
        name: "openai",
        baseUrl: "https://api.openai.com",
      },
    ],
    models: [
      {
        name: "gpt-4",
        provider: "openai",
        model: "gpt-4-turbo",
      },
    ],
    groups: [],
    keys: [
      {
        alias: "test-key",
        provider: "openai",
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
      dbPath: "./cache.sqlite",
    },
  };
}

describe("ConfigSchema", () => {
  describe("validateConfig", () => {
    describe("valid configurations", () => {
      it("should validate a minimal valid config", () => {
        const config = createValidConfig();
        const result = validateConfig(config);

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
      });

      it("should validate config with all optional fields", () => {
        const config: AppConfig = {
          ...createValidConfig(),
          providers: [
            {
              name: "openai",
              baseUrl: "https://api.openai.com",
              timeoutMs: 30000,
              rpmLimit: 60,
              strategy: "round_robin",
              headers: { "X-Custom": "value" },
              requestOverrides: { stream: true },
              extraBody: { extra: "data" },
            },
          ],
          models: [
            {
              name: "gpt-4",
              provider: "openai",
              model: "gpt-4-turbo",
              pricing: { promptPer1k: 0.01, completionPer1k: 0.03 },
              supportsTools: true,
            },
          ],
          keys: [
            {
              alias: "test-key",
              provider: "openai",
              key: "sk-test-key",
              quota: { type: "daily", limit: 1000 },
              metadata: { weight: 10 },
            },
          ],
        };

        const result = validateConfig(config);
        expect(result.success).toBe(true);
      });

      it("should validate config with groups", () => {
        const config = createValidConfig();
        config.models.push({
          name: "gpt-3.5",
          provider: "openai",
          model: "gpt-3.5-turbo",
        });

        config.groups = [
          {
            name: "fast-models",
            strategy: "round_robin",
            routes: [
              { modelId: "openai/gpt-4", weight: 1 },
              { modelId: "openai/gpt-3.5", weight: 2 },
            ],
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(true);
      });
    });

    describe("server validation", () => {
      it("should reject missing server config", () => {
        const config = { ...createValidConfig(), server: undefined };
        const result = validateConfig(config);

        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
      });

      it("should reject invalid port", () => {
        const config = createValidConfig();
        config.server.port = 70000;

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });

      it("should accept short admin token with warning", () => {
        const config = createValidConfig();
        config.server.admin.adminToken = "short";

        const result = validateConfig(config);
        // 短 token 现在通过验证，但会有警告日志
        expect(result.success).toBe(true);
      });
    });

    describe("provider validation", () => {
      it("should require at least one provider", () => {
        const config = createValidConfig();
        config.providers = [];

        const result = validateConfig(config);
        expect(result.success).toBe(false);
        expect(result.errors?.some((e) => e.includes("provider"))).toBe(true);
      });

      it("should reject invalid baseUrl", () => {
        const config = createValidConfig();
        config.providers[0].baseUrl = "not-a-url";

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });
    });

    describe("model validation", () => {
      it("should require at least one model", () => {
        const config = createValidConfig();
        config.models = [];

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });

      it("should reject model with unknown provider", () => {
        const config = createValidConfig();
        config.models[0].provider = "unknown-provider";

        const result = validateConfig(config);
        expect(result.success).toBe(false);
        expect(result.errors?.some((e) => e.includes("unknown provider"))).toBe(true);
      });
    });

    describe("key validation", () => {
      it("should require at least one key", () => {
        const config = createValidConfig();
        config.keys = [];

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });

      it("should validate quota types", () => {
        const config = createValidConfig();
        config.keys[0].quota = { type: "daily", limit: 100 };

        const result = validateConfig(config);
        expect(result.success).toBe(true);

        config.keys[0].quota = { type: "total", limit: 50 };
        const result2 = validateConfig(config);
        expect(result2.success).toBe(true);

        config.keys[0].quota = { type: "infinite" };
        const result3 = validateConfig(config);
        expect(result3.success).toBe(true);
      });

      it("should reject quota with missing limit", () => {
        const config = createValidConfig();
        config.keys[0].quota = { type: "daily", limit: undefined as any };

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });
    });

    describe("group validation", () => {
      it("should reject group referencing unknown model", () => {
        const config = createValidConfig();
        config.groups = [
          {
            name: "test-group",
            routes: [{ modelId: "unknown/model" }],
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(false);
        expect(result.errors?.some((e) => e.includes("unknown model"))).toBe(true);
      });

      it("should validate group strategy", () => {
        const config = createValidConfig();
        config.models.push({
          name: "gpt-3.5",
          provider: "openai",
          model: "gpt-3.5-turbo",
        });

        config.groups = [
          {
            name: "test-group",
            strategy: "round_robin",
            routes: [{ modelId: "openai/gpt-4" }],
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(true);
      });

      it("should reject invalid temperature range", () => {
        const config = createValidConfig();
        config.groups = [
          {
            name: "test-group",
            routes: [{ modelId: "openai/gpt-4", temperature: 3.0 }],
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });

      it("should validate group features configuration", () => {
        const config = createValidConfig();
        config.groups = [
          {
            name: "test-group",
            routes: [{ modelId: "openai/gpt-4" }],
            features: {
              tools: [],
              toolRoutingStrategy: "local_first",
              promptInject: {
                enableTimestamp: true,
                enableLunar: false,
              },
              truncation: {
                enable: true,
              },
            },
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(true);
      });

      it("should validate tool routing strategies", () => {
        const strategies = ["local_first", "local_only", "passthrough"] as const;

        for (const strategy of strategies) {
          const config = createValidConfig();
          config.groups = [
            {
              name: `test-group-${strategy}`,
              routes: [{ modelId: "openai/gpt-4" }],
              features: {
                toolRoutingStrategy: strategy,
              },
            },
          ];

          const result = validateConfig(config);
          expect(result.success).toBe(true);
        }
      });

      it("should reject invalid tool routing strategy", () => {
        const config = createValidConfig();
        config.groups = [
          {
            name: "test-group",
            routes: [{ modelId: "openai/gpt-4" }],
            features: {
              toolRoutingStrategy: "invalid_strategy" as any,
            },
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(false);
      });

      it("should allow partial features configuration", () => {
        const config = createValidConfig();
        config.groups = [
          {
            name: "test-group",
            routes: [{ modelId: "openai/gpt-4" }],
            features: {
              toolRoutingStrategy: "local_only",
            },
          },
        ];

        const result = validateConfig(config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("dbPath security validation", () => {
    it("should accept valid relative path", () => {
      const config = createValidConfig();
      config.cache.dbPath = "./config/cache.sqlite";
      const result = validateConfig(config);
      expect(result.success).toBe(true);
    });

    it("should accept relative path without ./ prefix", () => {
      const config = createValidConfig();
      config.cache.dbPath = "config/cache.sqlite";
      const result = validateConfig(config);
      expect(result.success).toBe(true);
    });

    it("should reject path with directory traversal (..)", () => {
      const config = createValidConfig();
      config.cache.dbPath = "../config/cache.sqlite";
      const result = validateConfig(config);
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes("..") || e.includes("相对路径"))).toBe(true);
    });

    it("should reject path with nested directory traversal", () => {
      const config = createValidConfig();
      config.cache.dbPath = "./config/../etc/passwd";
      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject path with user directory reference (~)", () => {
      const config = createValidConfig();
      config.cache.dbPath = "~/data/cache.sqlite";
      const result = validateConfig(config);
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes("~") || e.includes("相对路径"))).toBe(true);
    });

    it("should reject Unix absolute path", () => {
      const config = createValidConfig();
      config.cache.dbPath = "/etc/passwd";
      const result = validateConfig(config);
      expect(result.success).toBe(false);
      expect(result.errors?.some(e => e.includes("绝对路径") || e.includes("相对路径"))).toBe(true);
    });

    it("should reject Windows absolute path with backslash", () => {
      const config = createValidConfig();
      config.cache.dbPath = "C:\\Windows\\System32\\cache.sqlite";
      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });

    it("should reject Windows absolute path with forward slash", () => {
      const config = createValidConfig();
      config.cache.dbPath = "D:/data/cache.sqlite";
      const result = validateConfig(config);
      expect(result.success).toBe(false);
    });
  });

  describe("validatePartialConfig", () => {
    it("should validate empty partial config", () => {
      const result = validatePartialConfig({});
      expect(result.success).toBe(true);
    });

    it("should validate partial server config", () => {
      const result = validatePartialConfig({
        server: {
          host: "localhost",
          port: 8080,
          admin: { adminToken: "valid-token" },
        },
      });

      expect(result.success).toBe(true);
    });

    it("should reject invalid partial config", () => {
      const result = validatePartialConfig({
        server: {
          port: 99999,
        } as any,
      });

      expect(result.success).toBe(false);
    });
  });
});
