/**
 * 应用运行态
 * @description 管理所有运行时组件的容器，支持插件系统
 * @module app_state
 */

import type { AppConfig, ProviderConfig, PluginDefinition, RequestContext } from "./core/types.js";
import { KeyStore } from "./core/key_store.js";
import { ModelRegistry } from "./core/model_registry.js";
import { ToolRegistry } from "./core/tool_registry.js";
import { RpmLimiter } from "./core/rate_limiter.js";
import { CacheStore } from "./core/cache_store.js";
import { GroupCacheManager } from "./core/group_cache.js";
import { StatsStore } from "./core/stats_store.js";
import { EventEmitter } from "./core/event_emitter.js";
import { validateConfig } from "./core/config_schema.js";
import { createModuleLogger } from "./core/logger.js";
import { JsSandbox } from "./core/js_sandbox.js";
import { JsToolStore } from "./core/js_tool_store.js";
import { KeyUsageStore } from "./core/key_usage_store.js";
import { LogStore } from "./core/log_store.js";
import { FileToolLoader } from "./core/file_tool_loader.js";
import { ToolsLoader } from "./runtime/tools_loader.js";
import { PluginManager } from "./runtime/plugin_manager.js";

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
  /** 缓存存储（全局，已弃用，保留向后兼容） */
  cacheStore: CacheStore | null;
  /** 分组缓存管理器 */
  groupCacheManager: GroupCacheManager;
  /** 统计存储 */
  statsStore: StatsStore;
  /** Key 使用状态持久化存储 */
  keyUsageStore: KeyUsageStore;
  /** 日志存储 */
  logStore: LogStore;
  /** 事件发射器 */
  eventEmitter: EventEmitter;
  /** 服务启动时间 (ISO 8601 格式) */
  startTime: string;
  /** JS 沙箱执行器 */
  jsSandbox: JsSandbox;
  /** JS 工具存储（数据库） */
  jsToolStore: JsToolStore;
  /** 文件工具加载器 */
  fileToolLoader: FileToolLoader;
  /** 工具加载器 */
  toolsLoader: ToolsLoader;
  /** 插件管理器 */
  pluginManager: PluginManager;

  /**
   * 初始化运行态
   * @param config 已验证的应用配置
   */
  constructor(config: AppConfig) {
    this.config = config;
    this.eventEmitter = new EventEmitter();
    this.startTime = new Date().toISOString();

    // 初始化持久化存储
    const statsDbPath = this.config.cache.dbPath.replace(/cache\.sqlite$/, "stats.sqlite");
    const keyUsageDbPath = this.config.cache.dbPath.replace(/cache\.sqlite$/, "key_usage.sqlite");
    this.statsStore = new StatsStore(statsDbPath);
    this.keyUsageStore = new KeyUsageStore(keyUsageDbPath);

    // 初始化日志存储
    const logConfig = this.config.log;
    const logEnabled = logConfig?.enabled ?? true;
    const logMaxSizeMB = logConfig?.maxSizeMB ?? 10;
    this.logStore = new LogStore({
      logDir: logConfig?.logDir ?? "./logs",
      maxSize: logEnabled ? logMaxSizeMB * 1024 * 1024 : 0,
      enabled: logEnabled,
    });

    // 初始化核心组件
    this.keyStore = new KeyStore(this.config.keys, this.keyUsageStore);
    this.modelRegistry = new ModelRegistry(this.config.providers, this.config.models, this.config.groups);
    this.toolRegistry = new ToolRegistry();
    this.rpmLimiters = new Map();

    this.cacheStore = this.config.cache.enable
      ? new CacheStore({
          dbPath: this.config.cache.dbPath,
          maxEntries: this.config.cache.maxEntries,
        })
      : null;

    // 初始化分组缓存管理器
    this.groupCacheManager = new GroupCacheManager(this.config.cache.dbPath);
    this.registerGroupCaches();

    // 初始化提供商限流器
    this.initRpmLimiters();

    // 初始化 JS 工具相关组件
    this.jsSandbox = new JsSandbox({
      timeout: 60000,
      allowedDir: "./file",
      allowNetwork: true,
      allowedDomains: [
        "api.open-meteo.com",
        "wttr.in",
        "api.weatherapi.com",
        "geocoding-api.open-meteo.com",
      ],
    });
    this.jsToolStore = new JsToolStore(process.env.JS_TOOL_DB ?? "./config/js_tools.sqlite");
    this.fileToolLoader = new FileToolLoader(process.env.TOOLS_DIR ?? "./tools/js");
    this.fileToolLoader.init();

    // 初始化工具加载器
    this.toolsLoader = new ToolsLoader({
      jsSandbox: this.jsSandbox,
      jsToolStore: this.jsToolStore,
      fileToolLoader: this.fileToolLoader,
      toolRegistry: this.toolRegistry,
    });

    // 初始化插件管理器
    this.pluginManager = new PluginManager({
      toolRegistry: this.toolRegistry,
      eventEmitter: this.eventEmitter,
      getConfig: () => this.config,
      updateConfig: (partial) => {
        this.config = { ...this.config, ...partial };
      },
    });

    this.eventEmitter.emit("request:start", { message: "Runtime initialized" });
  }

  /**
   * 注册已配置缓存的分组
   */
  private registerGroupCaches(): void {
    for (const group of this.config.groups) {
      if (group.features?.cache?.enable) {
        this.groupCacheManager.registerGroup(group.name, {
          maxEntries: group.features.cache.maxEntries ?? 1000,
          ttl: group.features.cache.ttl,
        });
      }
    }
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

    // 关闭旧组件
    this.cacheStore?.close();
    this.toolRegistry.close();
    this.groupCacheManager.close();

    this.config = validation.data!;

    // 重建核心组件
    this.keyStore = new KeyStore(this.config.keys, this.keyUsageStore);
    this.modelRegistry = new ModelRegistry(this.config.providers, this.config.models, this.config.groups);
    this.toolRegistry = new ToolRegistry();
    this.rpmLimiters = new Map();
    this.cacheStore = this.config.cache.enable
      ? new CacheStore({
          dbPath: this.config.cache.dbPath,
          maxEntries: this.config.cache.maxEntries,
        })
      : null;

    this.groupCacheManager = new GroupCacheManager(this.config.cache.dbPath);
    this.registerGroupCaches();
    this.initRpmLimiters();
  }

  // ============================================================
  // 工具加载代理方法
  // ============================================================

  /**
   * 加载工具模块
   */
  async loadTools(): Promise<void> {
    const mcpTools = this.config.tools?.mcpTools ?? [];
    for (const mcpTool of mcpTools) {
      try {
        await this.toolRegistry.loadMcp(mcpTool);
      } catch (err) {
        log.error({ error: err }, `Failed to load MCP tool ${mcpTool.name}`);
      }
    }
    await this.toolsLoader.loadAll();
  }

  /**
   * 加载 JS 工具
   */
  async loadJsTools(): Promise<void> {
    await this.toolsLoader.loadAll();
  }

  /**
   * 刷新单个 JS 工具
   */
  refreshJsTool(name: string): void {
    this.toolsLoader.refreshJsTool(name);
  }

  /**
   * 刷新文件工具
   */
  refreshFileTool(name: string): void {
    this.toolsLoader.refreshFileTool(name);
  }

  /**
   * 获取所有工具
   */
  getAllTools() {
    return this.toolsLoader.getAllTools();
  }

  /**
   * 保存工具到文件
   */
  saveFileTool(tool: Parameters<ToolsLoader["saveFileTool"]>[0]): string {
    return this.toolsLoader.saveFileTool(tool);
  }

  /**
   * 删除文件工具
   */
  deleteFileTool(name: string): boolean {
    return this.toolsLoader.deleteFileTool(name);
  }

  /**
   * 移除 JS 工具
   */
  removeJsTool(name: string): void {
    this.toolsLoader.removeJsTool(name);
  }

  // ============================================================
  // 插件系统代理方法
  // ============================================================

  /** 已注册的插件（向后兼容） */
  get plugins(): Map<string, PluginDefinition> {
    return this.pluginManager.getAllPlugins();
  }

  /**
   * 注册插件
   */
  async registerPlugin(plugin: PluginDefinition): Promise<void> {
    await this.pluginManager.registerPlugin(plugin);
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(name: string): Promise<void> {
    await this.pluginManager.unloadPlugin(name);
  }

  /**
   * 执行请求前钩子
   */
  async executeBeforeRequestHooks(ctx: RequestContext): Promise<void> {
    await this.pluginManager.executeBeforeRequestHooks(ctx);
  }

  /**
   * 执行请求后钩子
   */
  async executeAfterRequestHooks(ctx: RequestContext, result: unknown): Promise<void> {
    await this.pluginManager.executeAfterRequestHooks(ctx, result);
  }

  /**
   * 执行错误处理钩子
   */
  async executeErrorHooks(ctx: RequestContext, error: Error): Promise<void> {
    await this.pluginManager.executeErrorHooks(ctx, error);
  }

  // ============================================================
  // 其他方法
  // ============================================================

  /**
   * 获取提供商配置
   */
  getProvider(providerName: string): ProviderConfig | null {
    return this.config.providers.find((item) => item.name === providerName) ?? null;
  }

  /**
   * 获取分组缓存配置
   */
  getGroupCacheConfig(groupName: string): { maxEntries: number; ttl?: number } | null {
    const group = this.config.groups.find((g) => g.name === groupName);
    const cacheConfig = group?.features?.cache;

    if (!cacheConfig?.enable) return null;

    return {
      maxEntries: cacheConfig.maxEntries ?? 1000,
      ttl: cacheConfig.ttl,
    };
  }

  /**
   * 确保分组已注册到缓存管理器
   */
  ensureGroupCacheRegistered(groupName: string): void {
    const config = this.getGroupCacheConfig(groupName);
    if (config) {
      this.groupCacheManager.registerGroup(groupName, config);
    }
  }

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
      plugins: this.pluginManager.getPluginNames(),
    };
  }
}
