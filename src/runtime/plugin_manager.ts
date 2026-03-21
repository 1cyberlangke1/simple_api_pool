/**
 * 插件管理器
 * @description 管理插件的注册、卸载和生命周期钩子
 * @module runtime/plugin_manager
 */

import type { AppConfig, PluginDefinition, IPluginRuntime, RequestContext } from "../core/types.js";
import { createModuleLogger, createPluginLogger } from "../core/logger.js";
import { EventEmitter } from "../core/event_emitter.js";
import { ToolRegistry } from "../core/tool_registry.js";

const log = createModuleLogger("plugin-manager");

/**
 * 插件管理器配置
 */
export interface PluginManagerConfig {
  /** 工具注册表 */
  toolRegistry: ToolRegistry;
  /** 事件发射器 */
  eventEmitter: EventEmitter;
  /** 获取当前配置的方法 */
  getConfig: () => AppConfig;
  /** 更新配置的方法 */
  updateConfig: (partial: Partial<AppConfig>) => void;
}

/**
 * 插件管理器
 * @description 管理插件的注册、卸载和生命周期
 */
export class PluginManager {
  private plugins: Map<string, PluginDefinition>;
  private toolRegistry: ToolRegistry;
  private eventEmitter: EventEmitter;
  private getConfig: () => AppConfig;
  private updateConfig: (partial: Partial<AppConfig>) => void;

  constructor(config: PluginManagerConfig) {
    this.plugins = new Map();
    this.toolRegistry = config.toolRegistry;
    this.eventEmitter = config.eventEmitter;
    this.getConfig = config.getConfig;
    this.updateConfig = config.updateConfig;
  }

  /**
   * 获取所有已注册的插件名称
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * 获取插件定义
   * @param name 插件名称
   */
  getPlugin(name: string): PluginDefinition | undefined {
    return this.plugins.get(name);
  }

  /**
   * 获取所有插件
   */
  getAllPlugins(): Map<string, PluginDefinition> {
    return new Map(this.plugins);
  }

  /**
   * 检查插件是否已注册
   * @param name 插件名称
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

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
      getConfig: () => this.getConfig(),
      updateConfig: (partial) => {
        this.updateConfig(partial);
      },
      getEventEmitter: () => this.eventEmitter,
      registerMiddleware: (_middleware) => {
        pluginLog.info("registered middleware");
      },
      registerTool: (tool, _handler) => {
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
}
