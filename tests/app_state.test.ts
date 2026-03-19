/**
 * AppRuntime 单元测试
 * @description 测试应用运行态和插件系统
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { AppConfig, PluginDefinition, RequestContext, ToolDefinition } from "../src/core/types.js";
import { AppRuntime } from "../src/app_state.js";

// 测试用配置
const testConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 3000,
    admin: {
      adminToken: "test-token",
    },
  },
  providers: [
    {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
    },
  ],
  models: [
    {
      name: "test-model",
      provider: "test-provider",
      model: "test-model-id",
    },
  ],
  groups: [],
  keys: [
    {
      alias: "test-key",
      provider: "test-provider",
      key: "sk-test",
      quota: { type: "infinite" },
    },
  ],
  tools: {
    mcpTools: [],
  },
  cache: {
    enable: false,
    maxEntries: 100,
    dbPath: "./config/test_app_state.sqlite",
  },
};

describe("AppRuntime", () => {
  let runtime: AppRuntime;

  beforeEach(() => {
    runtime = new AppRuntime(testConfig);
  });

  afterEach(() => {
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  describe("initialization", () => {
    it("initializes all components", () => {
      expect(runtime.config).toBeDefined();
      expect(runtime.keyStore).toBeDefined();
      expect(runtime.modelRegistry).toBeDefined();
      expect(runtime.toolRegistry).toBeDefined();
      expect(runtime.eventEmitter).toBeDefined();
      expect(runtime.plugins).toBeDefined();
    });

    it("initializes rpm limiters when configured", () => {
      const configWithRpm: AppConfig = {
        ...testConfig,
        providers: [
          {
            name: "test-provider", // 保持与 model 的 provider 一致
            baseUrl: "https://api.test.com/v1",
            rpmLimit: 100,
          },
        ],
      };

      const rpmRuntime = new AppRuntime(configWithRpm);
      expect(rpmRuntime.rpmLimiters.size).toBe(1);
      expect(rpmRuntime.rpmLimiters.has("test-provider")).toBe(true);

      rpmRuntime.cacheStore?.close();
      rpmRuntime.statsStore.close();
    });
  });

  describe("getProvider", () => {
    it("returns provider config", () => {
      const provider = runtime.getProvider("test-provider");
      expect(provider).toBeDefined();
      expect(provider?.name).toBe("test-provider");
    });

    it("returns null for non-existent provider", () => {
      const provider = runtime.getProvider("nonexistent");
      expect(provider).toBeNull();
    });
  });

  describe("getStats", () => {
    it("returns runtime statistics", () => {
      const stats = runtime.getStats();
      expect(stats.keys).toBeDefined();
      expect(stats.cache).toBeDefined();
      expect(stats.plugins).toEqual([]);
    });
  });

  describe("reset", () => {
    it("resets with new config", () => {
      const newConfig: AppConfig = {
        ...testConfig,
        providers: [
          {
            name: "test-provider", // 保持与 model 的 provider 一致
            baseUrl: "https://api.new.com/v1",
          },
        ],
      };

      runtime.reset(newConfig);

      const provider = runtime.getProvider("test-provider");
      expect(provider).toBeDefined();
      expect(provider?.baseUrl).toBe("https://api.new.com/v1");
    });
  });
});

// ============================================================
// 插件系统测试
// ============================================================
describe("Plugin System", () => {
  let runtime: AppRuntime;

  beforeEach(() => {
    runtime = new AppRuntime(testConfig);
  });

  afterEach(() => {
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  describe("registerPlugin", () => {
    it("registers a plugin successfully", async () => {
      const plugin: PluginDefinition = {
        name: "test-plugin",
        version: "1.0.0",
        hooks: {},
      };

      await runtime.registerPlugin(plugin);

      expect(runtime.plugins.has("test-plugin")).toBe(true);
      expect(runtime.plugins.get("test-plugin")).toBe(plugin);
    });

    it("calls init hook on registration", async () => {
      const initFn = vi.fn();
      const plugin: PluginDefinition = {
        name: "init-plugin",
        version: "1.0.0",
        hooks: {
          init: initFn,
        },
      };

      await runtime.registerPlugin(plugin);

      expect(initFn).toHaveBeenCalledTimes(1);
    });

    it("throws on duplicate plugin registration", async () => {
      const plugin: PluginDefinition = {
        name: "duplicate-plugin",
        version: "1.0.0",
        hooks: {},
      };

      await runtime.registerPlugin(plugin);

      await expect(runtime.registerPlugin(plugin)).rejects.toThrow(
        'Plugin "duplicate-plugin" is already registered'
      );
    });

    it("checks dependencies before registration", async () => {
      const plugin: PluginDefinition = {
        name: "dependent-plugin",
        version: "1.0.0",
        dependencies: ["missing-plugin"],
        hooks: {},
      };

      await expect(runtime.registerPlugin(plugin)).rejects.toThrow(
        'Plugin "dependent-plugin" requires "missing-plugin" which is not registered'
      );
    });

    it("allows registration when dependencies are met", async () => {
      const depPlugin: PluginDefinition = {
        name: "dependency",
        version: "1.0.0",
        hooks: {},
      };

      const mainPlugin: PluginDefinition = {
        name: "main",
        version: "1.0.0",
        dependencies: ["dependency"],
        hooks: {},
      };

      await runtime.registerPlugin(depPlugin);
      await runtime.registerPlugin(mainPlugin);

      expect(runtime.plugins.has("main")).toBe(true);
    });
  });

  describe("unloadPlugin", () => {
    it("unloads a plugin", async () => {
      const plugin: PluginDefinition = {
        name: "unloadable",
        version: "1.0.0",
        hooks: {},
      };

      await runtime.registerPlugin(plugin);
      await runtime.unloadPlugin("unloadable");

      expect(runtime.plugins.has("unloadable")).toBe(false);
    });

    it("calls destroy hook on unload", async () => {
      const destroyFn = vi.fn();
      const plugin: PluginDefinition = {
        name: "destroyable",
        version: "1.0.0",
        hooks: {
          destroy: destroyFn,
        },
      };

      await runtime.registerPlugin(plugin);
      await runtime.unloadPlugin("destroyable");

      expect(destroyFn).toHaveBeenCalledTimes(1);
    });

    it("handles unloading non-existent plugin", async () => {
      // 不应该抛出错误
      await runtime.unloadPlugin("nonexistent");
    });
  });

  describe("plugin runtime API", () => {
    it("provides config access", async () => {
      let capturedConfig: AppConfig | undefined;
      
      const plugin: PluginDefinition = {
        name: "config-reader",
        version: "1.0.0",
        hooks: {
          init: (rt) => {
            capturedConfig = rt.getConfig();
          },
        },
      };

      await runtime.registerPlugin(plugin);

      expect(capturedConfig).toBeDefined();
      expect(capturedConfig?.server.port).toBe(3000);
    });

    it("allows config update", async () => {
      const plugin: PluginDefinition = {
        name: "config-updater",
        version: "1.0.0",
        hooks: {
          init: (rt) => {
            rt.updateConfig({ server: { ...rt.getConfig().server, port: 4000 } });
          },
        },
      };

      await runtime.registerPlugin(plugin);

      expect(runtime.config.server.port).toBe(4000);
    });

    it("provides event emitter", async () => {
      let hasEmitter = false;
      
      const plugin: PluginDefinition = {
        name: "emitter-user",
        version: "1.0.0",
        hooks: {
          init: (rt) => {
            hasEmitter = rt.getEventEmitter() !== undefined;
          },
        },
      };

      await runtime.registerPlugin(plugin);

      expect(hasEmitter).toBe(true);
    });

    it("allows tool registration", async () => {
      const testTool: ToolDefinition = {
        name: "plugin_tool",
        description: "A tool registered by plugin",
        inputSchema: { type: "object", properties: {} },
      };

      const plugin: PluginDefinition = {
        name: "tool-provider",
        version: "1.0.0",
        hooks: {
          init: (rt) => {
            rt.registerTool(testTool, async () => ({ success: true }));
          },
        },
      };

      await runtime.registerPlugin(plugin);

      expect(runtime.toolRegistry.has("plugin_tool")).toBe(true);
    });

    it("provides logging interface", async () => {
      const logs: string[] = [];
      
      const plugin: PluginDefinition = {
        name: "logger-test",
        version: "1.0.0",
        hooks: {
          init: (rt) => {
            // 不实际调用，只验证接口存在
            expect(typeof rt.log.info).toBe("function");
            expect(typeof rt.log.warn).toBe("function");
            expect(typeof rt.log.error).toBe("function");
          },
        },
      };

      await runtime.registerPlugin(plugin);
    });
  });
});

// ============================================================
// 插件钩子执行测试
// ============================================================
describe("Plugin Hooks Execution", () => {
  let runtime: AppRuntime;

  beforeEach(() => {
    runtime = new AppRuntime(testConfig);
  });

  afterEach(() => {
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  const createMockContext = (): RequestContext => ({
    requestId: "test-request-id",
    body: { model: "test", messages: [] },
    modelConfig: {
      name: "test-model",
      provider: "test-provider",
      model: "test-model-id",
    },
    providerConfig: {
      name: "test-provider",
      baseUrl: "https://api.test.com/v1",
    },
    startTime: Date.now(),
    data: new Map(),
  });

  describe("executeBeforeRequestHooks", () => {
    it("executes beforeRequest hooks in order", async () => {
      const order: string[] = [];

      const plugin1: PluginDefinition = {
        name: "plugin1",
        version: "1.0.0",
        hooks: {
          beforeRequest: () => {
            order.push("plugin1");
          },
        },
      };

      const plugin2: PluginDefinition = {
        name: "plugin2",
        version: "1.0.0",
        hooks: {
          beforeRequest: () => {
            order.push("plugin2");
          },
        },
      };

      await runtime.registerPlugin(plugin1);
      await runtime.registerPlugin(plugin2);

      await runtime.executeBeforeRequestHooks(createMockContext());

      expect(order).toEqual(["plugin1", "plugin2"]);
    });

    it("provides context to hooks", async () => {
      let receivedContext: RequestContext | undefined;

      const plugin: PluginDefinition = {
        name: "context-capture",
        version: "1.0.0",
        hooks: {
          beforeRequest: (ctx) => {
            receivedContext = ctx;
          },
        },
      };

      await runtime.registerPlugin(plugin);

      const ctx = createMockContext();
      await runtime.executeBeforeRequestHooks(ctx);

      expect(receivedContext).toBe(ctx);
    });

    it("supports async hooks", async () => {
      let hookExecuted = false;

      const plugin: PluginDefinition = {
        name: "async-plugin",
        version: "1.0.0",
        hooks: {
          beforeRequest: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            hookExecuted = true;
          },
        },
      };

      await runtime.registerPlugin(plugin);
      await runtime.executeBeforeRequestHooks(createMockContext());

      expect(hookExecuted).toBe(true);
    });
  });

  describe("executeAfterRequestHooks", () => {
    it("executes afterRequest hooks with result", async () => {
      let receivedResult: unknown;

      const plugin: PluginDefinition = {
        name: "result-capture",
        version: "1.0.0",
        hooks: {
          afterRequest: (_ctx, result) => {
            receivedResult = result;
          },
        },
      };

      await runtime.registerPlugin(plugin);

      const testResult = { choices: [{ message: { content: "test" } }] };
      await runtime.executeAfterRequestHooks(createMockContext(), testResult);

      expect(receivedResult).toBe(testResult);
    });
  });

  describe("executeErrorHooks", () => {
    it("executes onError hooks with error", async () => {
      let receivedError: Error | undefined;

      const plugin: PluginDefinition = {
        name: "error-handler",
        version: "1.0.0",
        hooks: {
          onError: (_ctx, error) => {
            receivedError = error;
          },
        },
      };

      await runtime.registerPlugin(plugin);

      const testError = new Error("Test error");
      await runtime.executeErrorHooks(createMockContext(), testError);

      expect(receivedError).toBe(testError);
    });
  });

  describe("hook execution with no plugins", () => {
    it("handles beforeRequest with no plugins", async () => {
      // 不应该抛出错误
      await runtime.executeBeforeRequestHooks(createMockContext());
    });

    it("handles afterRequest with no plugins", async () => {
      await runtime.executeAfterRequestHooks(createMockContext(), {});
    });

    it("handles onError with no plugins", async () => {
      await runtime.executeErrorHooks(createMockContext(), new Error("test"));
    });
  });
});

// ============================================================
// 插件系统边界条件测试
// ============================================================
describe("Plugin System Edge Cases", () => {
  let runtime: AppRuntime;

  beforeEach(() => {
    runtime = new AppRuntime(testConfig);
  });

  afterEach(() => {
    runtime.cacheStore?.close();
    runtime.statsStore.close();
  });

  it("handles plugin with no hooks", async () => {
    const plugin: PluginDefinition = {
      name: "no-hooks",
      version: "1.0.0",
      hooks: {},
    };

    await runtime.registerPlugin(plugin);
    expect(runtime.plugins.has("no-hooks")).toBe(true);
  });

  it("handles multiple dependencies", async () => {
    const dep1: PluginDefinition = {
      name: "dep1",
      version: "1.0.0",
      hooks: {},
    };

    const dep2: PluginDefinition = {
      name: "dep2",
      version: "1.0.0",
      hooks: {},
    };

    const main: PluginDefinition = {
      name: "main-multi-dep",
      version: "1.0.0",
      dependencies: ["dep1", "dep2"],
      hooks: {},
    };

    await runtime.registerPlugin(dep1);
    await runtime.registerPlugin(dep2);
    await runtime.registerPlugin(main);

    expect(runtime.plugins.size).toBe(3);
  });

  it("handles plugin with all hook types", async () => {
    const hooks = {
      init: vi.fn(),
      destroy: vi.fn(),
      beforeRequest: vi.fn(),
      afterRequest: vi.fn(),
      onError: vi.fn(),
    };

    const plugin: PluginDefinition = {
      name: "full-hooks",
      version: "1.0.0",
      hooks,
    };

    await runtime.registerPlugin(plugin);

    expect(hooks.init).toHaveBeenCalled();

    const ctx = {
      requestId: "test",
      body: {},
      modelConfig: { name: "test", provider: "test", model: "test" },
      providerConfig: { name: "test", baseUrl: "https://test.com" },
      startTime: Date.now(),
      data: new Map(),
    };

    await runtime.executeBeforeRequestHooks(ctx);
    expect(hooks.beforeRequest).toHaveBeenCalled();

    await runtime.executeAfterRequestHooks(ctx, { result: "test" });
    expect(hooks.afterRequest).toHaveBeenCalled();

    await runtime.executeErrorHooks(ctx, new Error("test"));
    expect(hooks.onError).toHaveBeenCalled();

    await runtime.unloadPlugin("full-hooks");
    expect(hooks.destroy).toHaveBeenCalled();
  });

  it("handles plugin that throws in init", async () => {
    const plugin: PluginDefinition = {
      name: "bad-init",
      version: "1.0.0",
      hooks: {
        init: () => {
          throw new Error("Init failed");
        },
      },
    };

    await expect(runtime.registerPlugin(plugin)).rejects.toThrow("Init failed");
  });

  it("handles plugin that throws in hook", async () => {
    const plugin: PluginDefinition = {
      name: "bad-hook",
      version: "1.0.0",
      hooks: {
        beforeRequest: () => {
          throw new Error("Hook failed");
        },
      },
    };

    await runtime.registerPlugin(plugin);

    const ctx = {
      requestId: "test",
      body: {},
      modelConfig: { name: "test", provider: "test", model: "test" },
      providerConfig: { name: "test", baseUrl: "https://test.com" },
      startTime: Date.now(),
      data: new Map(),
    };

    // 应该抛出错误
    await expect(runtime.executeBeforeRequestHooks(ctx)).rejects.toThrow("Hook failed");
  });

  it("includes plugins in stats", async () => {
    const plugin: PluginDefinition = {
      name: "stats-plugin",
      version: "1.0.0",
      hooks: {},
    };

    await runtime.registerPlugin(plugin);

    const stats = runtime.getStats();
    expect(stats.plugins).toContain("stats-plugin");
  });
});
