import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigStore, getDefaultConfigPath } from "../src/core/config_store.js";
import type { AppConfig } from "../src/core/types.js";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * ConfigStore 单元测试
 * @description 测试配置存储功能（直接写入 setting.json，无 runtime.json 机制）
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
  let configPath: string;
  const baseConfig = createTestConfig();

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `config_test_${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    configPath = path.join(testDir, "setting.json");
    store = new ConfigStore(baseConfig, configPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("constructor", () => {
    it("should initialize with provided config", () => {
      const config = store.getConfig();
      expect(config).toEqual(baseConfig);
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

    it("should persist config to setting.json file", () => {
      const newConfig = { ...baseConfig, server: { ...baseConfig.server, port: 8080 } };
      store.updateConfig(newConfig);

      // 读取文件验证
      const saved = JSON.parse(fs.readFileSync(configPath, "utf8"));
      expect(saved.server.port).toBe(8080);
    });

    it("should create config directory if not exists", () => {
      const nestedPath = path.join(testDir, "nested", "dir", "setting.json");
      const nestedStore = new ConfigStore(baseConfig, nestedPath);

      const newConfig = { ...baseConfig, server: { ...baseConfig.server, port: 9000 } };
      nestedStore.updateConfig(newConfig);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });
  });

  describe("getConfigPath", () => {
    it("should return config path", () => {
      expect(store.getConfigPath()).toBe(configPath);
    });
  });
});

describe("getDefaultConfigPath", () => {
  it("should return path to config/setting.json", () => {
    const rootDir = "/app/root";
    const result = getDefaultConfigPath(rootDir);
    expect(result).toBe(path.join(rootDir, "config", "setting.json"));
  });

  it("should handle relative paths", () => {
    const rootDir = "./project";
    const result = getDefaultConfigPath(rootDir);
    expect(result).toContain("config");
    expect(result).toContain("setting.json");
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

  describe("config file edge cases", () => {
    it("should handle config with Unicode content", () => {
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

      const unicodeConfig = {
        ...baseConfig,
        providers: [
          { name: "测试提供商", baseUrl: "https://api.example.com" },
          { name: "日本語プロバイダー", baseUrl: "https://api.example.jp" },
        ],
      };
      store.updateConfig(unicodeConfig);

      const config = store.getConfig();
      expect(config.providers[0].name).toBe("测试提供商");
      expect(config.providers[1].name).toBe("日本語プロバイダー");
    });

    it("should handle config with deeply nested config", () => {
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

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
      store.updateConfig(deepConfig);

      const config = store.getConfig();
      expect((config as any).extensions.level1.level2.level3.level4.value).toBe("deep");
    });
  });

  describe("path edge cases", () => {
    it("should handle path with special characters", () => {
      const specialDir = path.join(testDir, "path with spaces & special! chars");
      fs.mkdirSync(specialDir, { recursive: true });
      const configPath = path.join(specialDir, "setting.json");

      const store = new ConfigStore(baseConfig, configPath);
      store.updateConfig({ ...baseConfig, server: { ...baseConfig.server, port: 1234 } });

      expect(fs.existsSync(configPath)).toBe(true);
    });

    it("should handle very long path", () => {
      // Windows 有路径长度限制，所以不要超过
      const longDir = path.join(testDir, "a".repeat(50), "b".repeat(50));
      fs.mkdirSync(longDir, { recursive: true });
      const configPath = path.join(longDir, "setting.json");

      const store = new ConfigStore(baseConfig, configPath);
      store.updateConfig(baseConfig);

      expect(store.getConfigPath()).toBe(configPath);
    });

    it("should handle deeply nested directory creation", () => {
      const deepPath = path.join(
        testDir,
        "level1",
        "level2",
        "level3",
        "level4",
        "level5",
        "setting.json"
      );

      const store = new ConfigStore(baseConfig, deepPath);
      store.updateConfig(baseConfig);

      expect(fs.existsSync(deepPath)).toBe(true);
    });
  });

  describe("config value edge cases", () => {
    it("should handle config with maximum port number", () => {
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

      const maxPortConfig = {
        ...baseConfig,
        server: { ...baseConfig.server, port: 65535 },
      };
      store.updateConfig(maxPortConfig);

      expect(store.getConfig().server.port).toBe(65535);
    });

    it("should handle config with minimum port number", () => {
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

      const minPortConfig = {
        ...baseConfig,
        server: { ...baseConfig.server, port: 1 },
      };
      store.updateConfig(minPortConfig);

      expect(store.getConfig().server.port).toBe(1);
    });

    it("should handle config with empty arrays", () => {
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

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
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

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
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

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
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

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
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

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
      const configPath = path.join(testDir, "setting.json");
      const store = new ConfigStore(baseConfig, configPath);

      const configA = { ...baseConfig, server: { ...baseConfig.server, port: 1111 } };
      const configB = { ...baseConfig, server: { ...baseConfig.server, port: 2222 } };

      for (let i = 0; i < 10; i++) {
        store.updateConfig(i % 2 === 0 ? configA : configB);
      }

      // 最后一次是 configB（i=9, 9%2=1）
      expect(store.getConfig().server.port).toBe(2222);
    });
  });
});

describe("getDefaultConfigPath - Monkey Testing", () => {
  it("should handle empty string", () => {
    const result = getDefaultConfigPath("");
    expect(result).toContain("config");
    expect(result).toContain("setting.json");
  });

  it("should handle path with trailing slash", () => {
    const result = getDefaultConfigPath("/app/root/");
    expect(result).toContain("config");
    expect(result).toContain("setting.json");
  });

  it("should handle path with Unicode characters", () => {
    const result = getDefaultConfigPath("/应用/目录");
    expect(result).toContain("config");
    expect(result).toContain("setting.json");
  });
});
