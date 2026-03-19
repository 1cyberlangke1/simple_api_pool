import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigStore, getDefaultRuntimePath } from "../src/core/config_store.js";
import type { AppConfig } from "../src/core/types.js";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * ConfigStore 单元测试
 * @description 测试配置存储功能
 */

// ============================================================
// 辅助函数
// ============================================================

function createTestConfig(): AppConfig {
  return {
    server: {
      host: "127.0.0.1",
      port: 3000,
      admin: { adminToken: "test-token" },
    },
    providers: [{ name: "test", baseUrl: "https://api.test.com" }],
    models: [{ name: "test-model", provider: "test", model: "test-model" }],
    groups: [],
    keys: [{ alias: "test-key", provider: "test", key: "sk-test", quota: { type: "infinite" } }],
    tools: { mcpTools: [] },
    cache: { enable: false, maxEntries: 1000, dbPath: "./cache.sqlite" },
  };
}

describe("ConfigStore", () => {
  let store: ConfigStore;
  let testDir: string;
  let runtimePath: string;
  const baseConfig = createTestConfig();

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `config_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    runtimePath = path.join(testDir, "runtime.json");
    store = new ConfigStore(baseConfig, runtimePath);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should initialize with base config when no runtime file", () => {
      const config = store.getConfig();
      expect(config).toEqual(baseConfig);
    });

    it("should load runtime config if exists", () => {
      // 创建运行时配置文件
      const runtimeConfig = { ...baseConfig, server: { ...baseConfig.server, port: 8080 } };
      fs.writeFileSync(runtimePath, JSON.stringify(runtimeConfig));

      // 重新创建 store
      const newStore = new ConfigStore(baseConfig, runtimePath);
      expect(newStore.getConfig().server.port).toBe(8080);
    });
  });

  describe("getConfig", () => {
    it("should return current config", () => {
      const config = store.getConfig();
      expect(config.server.port).toBe(3000);
    });
  });

  describe("updateConfig", () => {
    it("should update config in memory", () => {
      const newConfig = { ...baseConfig, server: { ...baseConfig.server, port: 8080 } };
      store.updateConfig(newConfig);

      expect(store.getConfig().server.port).toBe(8080);
    });

    it("should persist config to runtime file", () => {
      const newConfig = { ...baseConfig, server: { ...baseConfig.server, port: 8080 } };
      store.updateConfig(newConfig);

      // 读取文件验证
      const saved = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
      expect(saved.server.port).toBe(8080);
    });

    it("should create config directory if not exists", () => {
      const nestedPath = path.join(testDir, "nested", "dir", "runtime.json");
      const nestedStore = new ConfigStore(baseConfig, nestedPath);

      const newConfig = { ...baseConfig, server: { ...baseConfig.server, port: 9000 } };
      nestedStore.updateConfig(newConfig);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe("getRuntimePath", () => {
    it("should return runtime path", () => {
      expect(store.getRuntimePath()).toBe(runtimePath);
    });
  });

  describe("persistence", () => {
    it("should survive store recreation", () => {
      // 更新配置
      const newConfig = { ...baseConfig, server: { ...baseConfig.server, port: 5000 } };
      store.updateConfig(newConfig);

      // 创建新的 store 实例
      const newStore = new ConfigStore(baseConfig, runtimePath);
      expect(newStore.getConfig().server.port).toBe(5000);
    });
  });
});

describe("getDefaultRuntimePath", () => {
  it("should return path to config/runtime.json", () => {
    const rootDir = "/app/root";
    const result = getDefaultRuntimePath(rootDir);
    expect(result).toBe(path.join(rootDir, "config", "runtime.json"));
  });

  it("should handle relative paths", () => {
    const rootDir = "./project";
    const result = getDefaultRuntimePath(rootDir);
    expect(result).toContain("config");
    expect(result).toContain("runtime.json");
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("ConfigStore - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  let testDir: string;
  const baseConfig = createTestConfig();

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `config_monkey_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("runtime file edge cases", () => {
    it("should handle runtime file with extra fields", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      // 添加额外字段，应该被忽略
      const extendedConfig = {
        ...baseConfig,
        server: { ...baseConfig.server, port: 9999 },
        extraField: "should be ignored",
        anotherExtra: { nested: true },
      };
      fs.writeFileSync(runtimePath, JSON.stringify(extendedConfig));

      const store = new ConfigStore(baseConfig, runtimePath);
      const config = store.getConfig();

      expect(config.server.port).toBe(9999);
    });

    it("should handle runtime file with Unicode content", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const unicodeConfig = {
        ...baseConfig,
        providers: [
          { name: "测试提供商", baseUrl: "https://api.example.com" },
          { name: "日本語プロバイダー", baseUrl: "https://api.example.jp" },
        ],
      };
      fs.writeFileSync(runtimePath, JSON.stringify(unicodeConfig), "utf8");

      const store = new ConfigStore(baseConfig, runtimePath);
      const config = store.getConfig();

      expect(config.providers[0].name).toBe("测试提供商");
      expect(config.providers[1].name).toBe("日本語プロバイダー");
    });

    it("should handle runtime file with deeply nested config", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const deepConfig = {
        ...baseConfig,
        extensions: {
          level1: {
            level2: {
              level3: {
                level4: {
                  value: "deep",
                },
              },
            },
          },
        },
      };
      fs.writeFileSync(runtimePath, JSON.stringify(deepConfig));

      const store = new ConfigStore(baseConfig, runtimePath);
      const config = store.getConfig();

      expect((config as any).extensions.level1.level2.level3.level4.value).toBe("deep");
    });

    it("should handle empty runtime file", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      fs.writeFileSync(runtimePath, "");

      // 空文件会导致 JSON.parse 抛出错误
      expect(() => new ConfigStore(baseConfig, runtimePath)).toThrow();
    });

    it("should handle runtime file with only whitespace", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      fs.writeFileSync(runtimePath, "   \n\t  ");

      expect(() => new ConfigStore(baseConfig, runtimePath)).toThrow();
    });

    it("should handle malformed JSON runtime file", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      fs.writeFileSync(runtimePath, "{ invalid json }");

      expect(() => new ConfigStore(baseConfig, runtimePath)).toThrow();
    });
  });

  describe("path edge cases", () => {
    it("should handle path with special characters", () => {
      const specialDir = path.join(testDir, "path with spaces & special! chars");
      fs.mkdirSync(specialDir, { recursive: true });
      const runtimePath = path.join(specialDir, "runtime.json");

      const store = new ConfigStore(baseConfig, runtimePath);
      store.updateConfig({ ...baseConfig, server: { ...baseConfig.server, port: 1234 } });

      expect(fs.existsSync(runtimePath)).toBe(true);
    });

    it("should handle very long path", () => {
      // Windows 有路径长度限制，所以不要超过
      const longDir = path.join(testDir, "a".repeat(50), "b".repeat(50));
      fs.mkdirSync(longDir, { recursive: true });
      const runtimePath = path.join(longDir, "runtime.json");

      const store = new ConfigStore(baseConfig, runtimePath);
      store.updateConfig(baseConfig);

      expect(store.getRuntimePath()).toBe(runtimePath);
    });

    it("should handle deeply nested directory creation", () => {
      const deepPath = path.join(
        testDir,
        "level1",
        "level2",
        "level3",
        "level4",
        "level5",
        "runtime.json"
      );

      const store = new ConfigStore(baseConfig, deepPath);
      store.updateConfig(baseConfig);

      expect(fs.existsSync(deepPath)).toBe(true);
    });
  });

  describe("config value edge cases", () => {
    it("should handle config with maximum port number", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      const maxPortConfig = {
        ...baseConfig,
        server: { ...baseConfig.server, port: 65535 },
      };
      store.updateConfig(maxPortConfig);

      expect(store.getConfig().server.port).toBe(65535);
    });

    it("should handle config with minimum port number", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      const minPortConfig = {
        ...baseConfig,
        server: { ...baseConfig.server, port: 1 },
      };
      store.updateConfig(minPortConfig);

      expect(store.getConfig().server.port).toBe(1);
    });

    it("should handle config with empty arrays", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      const emptyArraysConfig: AppConfig = {
        server: baseConfig.server,
        providers: [],
        models: [],
        groups: [],
        keys: [],
        tools: { mcpTools: [] },
        cache: baseConfig.cache,
      };
      store.updateConfig(emptyArraysConfig);

      expect(store.getConfig().providers).toEqual([]);
      expect(store.getConfig().keys).toEqual([]);
    });

    it("should handle config with large arrays", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      // 创建大量 provider
      const manyProviders = Array.from({ length: 100 }, (_, i) => ({
        name: `provider-${i}`,
        baseUrl: `https://api.provider${i}.com`,
      }));

      const largeConfig = {
        ...baseConfig,
        providers: manyProviders,
      };
      store.updateConfig(largeConfig);

      expect(store.getConfig().providers.length).toBe(100);
    });

    it("should handle config with very long strings", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      const longStringConfig = {
        ...baseConfig,
        server: {
          ...baseConfig.server,
          admin: {
            adminToken: "a".repeat(10000),
          },
        },
      };
      store.updateConfig(longStringConfig);

      expect(store.getConfig().server.admin.adminToken.length).toBe(10000);
    });

    it("should handle config with special string values", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      const specialStringsConfig = {
        ...baseConfig,
        providers: [
          {
            name: "provider with spaces",
            baseUrl: "https://api.example.com/path?query=value&other=test",
            headers: {
              "X-Custom-Header": "value with spaces\tand\ttabs",
              "X-Emoji": "🚀🎉",
            },
          },
        ],
      };
      store.updateConfig(specialStringsConfig);

      expect(store.getConfig().providers[0].name).toBe("provider with spaces");
      expect(store.getConfig().providers[0].headers!["X-Emoji"]).toBe("🚀🎉");
    });
  });

  describe("multiple updates", () => {
    it("should handle rapid consecutive updates", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      // 快速连续更新
      for (let i = 0; i < 100; i++) {
        store.updateConfig({
          ...baseConfig,
          server: { ...baseConfig.server, port: 3000 + i },
        });
      }

      // 最后一次更新应该生效
      expect(store.getConfig().server.port).toBe(3099);
    });

    it("should handle alternating between two configs", () => {
      const runtimePath = path.join(testDir, "runtime.json");
      const store = new ConfigStore(baseConfig, runtimePath);

      const configA = { ...baseConfig, server: { ...baseConfig.server, port: 1111 } };
      const configB = { ...baseConfig, server: { ...baseConfig.server, port: 2222 } };

      for (let i = 0; i < 10; i++) {
        store.updateConfig(i % 2 === 0 ? configA : configB);
      }

      // 最后一次是 configB（i=9, 9%2=1）
      expect(store.getConfig().server.port).toBe(2222);
    });
  });

  describe("concurrent store instances", () => {
    it("should handle multiple store instances with same runtime file", () => {
      const runtimePath = path.join(testDir, "runtime.json");

      const store1 = new ConfigStore(baseConfig, runtimePath);
      store1.updateConfig({
        ...baseConfig,
        server: { ...baseConfig.server, port: 4444 },
      });

      // 第二个实例应该读取第一个实例的更新
      const store2 = new ConfigStore(baseConfig, runtimePath);
      expect(store2.getConfig().server.port).toBe(4444);
    });
  });
});

describe("getDefaultRuntimePath - Monkey Testing", () => {
  it("should handle empty string", () => {
    const result = getDefaultRuntimePath("");
    expect(result).toContain("config");
    expect(result).toContain("runtime.json");
  });

  it("should handle path with trailing slash", () => {
    const result = getDefaultRuntimePath("/app/root/");
    expect(result).toContain("config");
    expect(result).toContain("runtime.json");
  });

  it("should handle path with Unicode characters", () => {
    const result = getDefaultRuntimePath("/应用/目录");
    expect(result).toContain("config");
    expect(result).toContain("runtime.json");
  });
});