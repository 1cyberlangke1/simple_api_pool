import type {
  AppConfig,
  ProviderConfig,
  PluginDefinition,
  IPluginRuntime,
  IEventEmitter,
  RequestContext,
  ToolDefinition,
} from "./core/types.js";
import { KeyStore } from "./core/key_store.js";
import { ModelRegistry } from "./core/model_registry.js";
import { ToolRegistry } from "./core/tool_registry.js";
import { RpmLimiter } from "./core/rate_limiter.js";
import { CacheStore } from "./core/cache_store.js";
import { StatsStore } from "./core/stats_store.js";
import { EventEmitter } from "./core/event_emitter.js";
import { validateConfig } from "./core/config_schema.js";
import { createModuleLogger, createPluginLogger, type Logger } from "./core/logger.js";

/** 模块日志器 */
const log = createModuleLogger("runtime");

/**
 * 应用运行态
 * @description 管理所有运行时组件的容器，支持插件系统
 */
export class AppRuntime {
  /** 当前配置 */
  config: AppConfig;
  /** Key 管理器 */
  keyStore: KeyStore;
  /** 模型注册表 */
  modelRegistry: ModelRegistry;
  /** 工具注册表 */
  toolRegistry: ToolRegistry;
  /** 提供商限流器 */
  rpmLimiters: Map<string, RpmLimiter>;
  /** 缓存存储 */
  cacheStore: CacheStore | null;
  /** 统计存储 */
  statsStore: StatsStore;
  /** 事件发射器 */
  eventEmitter: EventEmitter;
  /** 已注册的插件 */
  plugins: Map<string, PluginDefinition>;
  /** 服务启动时间 (ISO 8601 格式) */
  startTime: string;

  /**
   * 初始化运行态
   * @param config 已验证的应用配置
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    this.plugins = new Map();
    // 记录服务启动时间
    this.startTime = new Date().toISOString();

    // 初始化核心组件
    this.keyStore = new KeyStore(this.config.keys);
    this.modelRegistry = new ModelRegistry(this.config.providers, this.config.models, this.config.groups);
    this.toolRegistry = new ToolRegistry();
    this.rpmLimiters = new Map();
    
    // 从 cache.dbPath 推导 stats 数据库路径（解耦硬编码）
    const statsDbPath = this.config.cache.dbPath.replace(/cache\.sqlite$/, "stats.sqlite");
    this.statsStore = new StatsStore(statsDbPath);
    
    this.cacheStore = this.config.cache.enable
      ? new CacheStore({
          dbPath: this.config.cache.dbPath,
          maxEntries: this.config.cache.maxEntries,
        })
      : null;

    // 初始化提供商限流器
    this.initRpmLimiters();

    // 发射初始化事件
    this.eventEmitter.emit("request:start", { message: "Runtime initialized" });
  }

  /**
   * 初始化 RPM 限流器
   */
  private initRpmLimiters(): void {
    for (const provider of this.config.providers) {
      if (provider.rpmLimit && provider.rpmLimit > 0) {
        this.rpmLimiters.set(provider.name, new RpmLimiter(provider.rpmLimit));
      }
    }
  }

  /**
   * 重置运行态
   * @param config 新配置
   */
  reset(config: AppConfig): void {
    const validation = validateConfig(config);
    if (!validation.success) {
      throw new Error(`Config validation failed:\n${validation.errors?.join("\n")}`);
    }

    // 关闭旧组件，释放资源
    this.cacheStore?.close();
    this.toolRegistry.close();

    this.config = validation.data!;

    // 重建核心组件
    this.keyStore = new KeyStore(this.config.keys);
    this.modelRegistry = new ModelRegistry(this.config.providers, this.config.models, this.config.groups);
    this.toolRegistry = new ToolRegistry();
    this.rpmLimiters = new Map();
    this.cacheStore = this.config.cache.enable
      ? new CacheStore({
          dbPath: this.config.cache.dbPath,
          maxEntries: this.config.cache.maxEntries,
        })
      : null;

    this.initRpmLimiters();
  }

  /**
   * 加载工具模块
   * @description 加载全局 MCP 工具池中的所有工具
   */
  async loadTools(): Promise<void> {
    // 安全检查：确保 mcpTools 存在且是数组
    const mcpTools = this.config.tools?.mcpTools ?? [];
    for (const mcpTool of mcpTools) {
      try {
        await this.toolRegistry.loadMcp(mcpTool);
      } catch (err) {
        log.error({ error: err }, `Failed to load MCP tool ${mcpTool.name}`);
      }
    }
  }

  /**
   * 获取提供商配置
   */
  getProvider(providerName: string): ProviderConfig | null {
    return this.config.providers.find((item) => item.name === providerName) ?? null;
  }

  // ============================================================
  // 插件系统
  // ============================================================

  /**
   * 注册插件
   * @param plugin 插件定义
   */
  async registerPlugin(plugin: PluginDefinition): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    // 检查依赖
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`Plugin "${plugin.name}" requires "${dep}" which is not registered`);
        }
      }
    }

    // 注册插件
    this.plugins.set(plugin.name, plugin);

    // 调用初始化钩子
    if (plugin.hooks.init) {
      await plugin.hooks.init(this.createPluginRuntime(plugin.name));
    }

    log.info(`Plugin "${plugin.name}" registered`);
  }

  /**
   * 卸载插件
   * @param name 插件名称
   */
  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) return;

    // 调用销毁钩子
    if (plugin.hooks.destroy) {
      await plugin.hooks.destroy();
    }

    this.plugins.delete(name);
    log.info(`Plugin "${name}" unloaded`);
  }

  /**
   * 创建插件运行时
   */
  private createPluginRuntime(pluginName: string): IPluginRuntime {
    const pluginLog = createPluginLogger(pluginName);
    return {
      getConfig: () => this.config,
      updateConfig: (partial) => {
        this.config = { ...this.config, ...partial };
      },
      getEventEmitter: () => this.eventEmitter,
      registerMiddleware: (_middleware) => {
        // 中间件注册逻辑（在 app.ts 中实现）
        pluginLog.info("registered middleware");
      },
      registerTool: (tool: ToolDefinition, _handler: (args: unknown) => Promise<unknown>) => {
        this.toolRegistry.register(tool, _handler);
        pluginLog.info(`registered tool: ${tool.name}`);
      },
      log: {
        info: (msg: string, data?: unknown) => {
          if (data && typeof data === "object" && data !== null) {
            pluginLog.info(data as Record<string, unknown>, msg);
          } else {
            pluginLog.info(msg);
          }
        },
        warn: (msg: string, data?: unknown) => {
          if (data && typeof data === "object" && data !== null) {
            pluginLog.warn(data as Record<string, unknown>, msg);
          } else {
            pluginLog.warn(msg);
          }
        },
        error: (msg: string, data?: unknown) => {
          if (data && typeof data === "object" && data !== null) {
            pluginLog.error(data as Record<string, unknown>, msg);
          } else {
            pluginLog.error(msg);
          }
        },
      },
    };
  }

  // ============================================================
  // 请求生命周期钩子
  // ============================================================

  /**
   * 执行请求前钩子
   */
  async executeBeforeRequestHooks(ctx: RequestContext): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks.beforeRequest) {
        await plugin.hooks.beforeRequest(ctx);
      }
    }
  }

  /**
   * 执行请求后钩子
   */
  async executeAfterRequestHooks(ctx: RequestContext, result: unknown): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks.afterRequest) {
        await plugin.hooks.afterRequest(ctx, result);
      }
    }
  }

  /**
   * 执行错误处理钩子
   */
  async executeErrorHooks(ctx: RequestContext, error: Error): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.hooks.onError) {
        await plugin.hooks.onError(ctx, error);
      }
    }
  }

  // ============================================================
  // 统计信息
  // ============================================================

  /**
   * 获取运行时统计
   */
  getStats(): {
    keys: { total: number; available: number; byProvider: Record<string, number> };
    cache: { enabled: boolean; size?: number };
    plugins: string[];
  } {
    return {
      keys: this.keyStore.getStats(),
      cache: {
        enabled: this.config.cache.enable,
        size: this.cacheStore?.size(),
      },
      plugins: Array.from(this.plugins.keys()),
    };
  }
}