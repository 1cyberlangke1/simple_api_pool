import type {
  AppConfig,
  ProviderConfig,
  PluginDefinition,
  IPluginRuntime,
  IEventEmitter,
  RequestContext,
  ToolDefinition,
  LogConfig,
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
import { JsSandbox } from "./core/js_sandbox.js";
import { JsToolStore, type StoredJsTool } from "./core/js_tool_store.js";
import { KeyUsageStore } from "./core/key_usage_store.js";
import { LogStore, DEFAULT_LOG_MAX_SIZE } from "./core/log_store.js";
import { FileToolLoader, type JsonToolFile, type LoadedFileTool } from "./core/file_tool_loader.js";

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
  /** Key 使用状态持久化存储 */
  keyUsageStore: KeyUsageStore;
  /** 日志存储 */
  logStore: LogStore;
  /** 事件发射器 */
  eventEmitter: EventEmitter;
  /** 已注册的插件 */
  plugins: Map<string, PluginDefinition>;
  /** 服务启动时间 (ISO 8601 格式) */
  startTime: string;
  /** JS 沙箱执行器 */
  jsSandbox: JsSandbox;
  /** JS 工具存储（数据库） */
  jsToolStore: JsToolStore;
  /** 文件工具加载器 */
  fileToolLoader: FileToolLoader;

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

    // 初始化核心组件（传入持久化存储）
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
    
    // 初始化文件工具加载器
    this.fileToolLoader = new FileToolLoader(process.env.TOOLS_DIR ?? "./tools/js");
    this.fileToolLoader.init();

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

    // 重建核心组件（保留 keyUsageStore 实例）
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

    // 加载所有启用的 JS 工具
    await this.loadJsTools();
  }

  /**
   * 加载 JS 工具到工具注册表
   * @description 从数据库和文件系统加载所有启用的 JS 工具并注册到 ToolRegistry
   */
  async loadJsTools(): Promise<void> {
    // 加载数据库中的工具
    const jsTools = this.jsToolStore.getAll(true);
    for (const tool of jsTools) {
      this.registerJsTool(tool);
    }
    log.info(`Loaded ${jsTools.length} JS tools from database`);

    // 加载文件工具
    const fileTools = this.fileToolLoader.getAllTools();
    for (const tool of fileTools) {
      this.registerFileTool(tool);
    }
    log.info(`Loaded ${fileTools.length} JS tools from files`);
  }

  /**
   * 注册单个 JS 工具到工具注册表
   * @param tool JS 工具定义
   */
  private registerJsTool(tool: StoredJsTool): void {
    const toolDef: ToolDefinition = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };

    const handler = async (args: unknown): Promise<unknown> => {
      const result = await this.jsSandbox.execute(tool.code, args as Record<string, unknown>);
      if (!result.success) {
        throw new Error(result.error ?? "JS tool execution failed");
      }
      return result.result;
    };

    this.toolRegistry.updateOrRegister(toolDef, handler);
  }

  /**
   * 注册文件工具到工具注册表
   * @param tool 文件工具定义
   */
  private registerFileTool(tool: LoadedFileTool): void {
    const toolDef: ToolDefinition = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };

    const handler = async (args: unknown): Promise<unknown> => {
      // 如果工具需要网络访问，创建专用的沙箱
      const sandbox = tool.allowNetwork
        ? new JsSandbox({
            timeout: 60000,
            allowedDir: "./file",
            allowNetwork: true,
            allowedDomains: tool.allowedDomains ?? [],
          })
        : this.jsSandbox;

      const result = await sandbox.execute(tool.code, args as Record<string, unknown>);
      if (!result.success) {
        throw new Error(result.error ?? "JS tool execution failed");
      }
      return result.result;
    };

    this.toolRegistry.updateOrRegister(toolDef, handler);
  }

  /**
   * 刷新单个 JS 工具
   * @description 当工具被创建或更新时调用
   * @param name 工具名称
   */
  refreshJsTool(name: string): void {
    // 先检查数据库工具
    const dbTool = this.jsToolStore.getByName(name);
    if (dbTool && dbTool.enabled) {
      this.registerJsTool(dbTool);
      log.info(`JS tool "${name}" refreshed from database`);
      return;
    }

    // 再检查文件工具
    const fileTool = this.fileToolLoader.getTool(name);
    if (fileTool) {
      this.registerFileTool(fileTool);
      log.info(`JS tool "${name}" refreshed from file`);
      return;
    }

    // 工具不存在，从注册表中移除
    this.toolRegistry.unregister(name);
    log.info(`JS tool "${name}" removed from registry`);
  }

  /**
   * 刷新文件工具
   * @description 文件变化时调用
   * @param name 工具名称
   */
  refreshFileTool(name: string): void {
    const tool = this.fileToolLoader.getTool(name);
    if (tool) {
      this.registerFileTool(tool);
      log.info(`File tool "${name}" refreshed`);
    } else {
      this.toolRegistry.unregister(name);
      log.info(`File tool "${name}" removed`);
    }
  }

  /**
   * 获取所有工具（合并数据库和文件工具）
   */
  getAllTools(): { dbTools: StoredJsTool[]; fileTools: LoadedFileTool[] } {
    return {
      dbTools: this.jsToolStore.getAll(false),
      fileTools: this.fileToolLoader.getAllTools(),
    };
  }

  /**
   * 保存工具到文件
   * @param tool 工具定义
   * @returns 保存的文件路径
   */
  saveFileTool(tool: JsonToolFile): string {
    const filePath = this.fileToolLoader.saveToolToFile(tool);
    // 立即注册到工具注册表
    const loadedTool = this.fileToolLoader.getTool(tool.name);
    if (loadedTool) {
      this.registerFileTool(loadedTool);
    }
    return filePath;
  }

  /**
   * 删除文件工具
   * @param name 工具名称
   * @returns 是否删除成功
   */
  deleteFileTool(name: string): boolean {
    const result = this.fileToolLoader.deleteToolFile(name);
    if (result) {
      this.toolRegistry.unregister(name);
    }
    return result;
  }

  /**
   * 移除 JS 工具
   * @description 当工具被删除时调用
   * @param name 工具名称
   */
  removeJsTool(name: string): void {
    this.toolRegistry.unregister(name);
    log.info(`JS tool "${name}" removed`);
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