/**
 * 插件系统类型定义
 * @description 定义插件钩子和运行时接口
 * @module plugin_types
 */

import type { AppConfig, RequestContext } from "./types.js";
import type { IEventEmitter } from "./events.js";
import type { ToolDefinition } from "./types.js";

// ============================================================
// 插件钩子定义
// ============================================================

/**
 * 插件钩子接口
 * @description 插件可以在请求生命周期的不同阶段注入自定义逻辑
 */
export interface PluginHooks {
  /** 插件初始化时调用 */
  init?: (runtime: IPluginRuntime) => void | Promise<void>;
  /** 插件销毁时调用 */
  destroy?: () => void | Promise<void>;
  /** 请求发送前调用 */
  beforeRequest?: (ctx: RequestContext) => void | Promise<void>;
  /** 请求完成后调用 */
  afterRequest?: (ctx: RequestContext, result: unknown) => void | Promise<void>;
  /** 请求出错时调用 */
  onError?: (ctx: RequestContext, error: Error) => void | Promise<void>;
}

/**
 * 插件定义
 * @description 描述一个插件的基本信息和钩子
 */
export interface PluginDefinition {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description?: string;
  /** 依赖的其他插件 */
  dependencies?: string[];
  /** 插件钩子 */
  hooks: PluginHooks;
}

// ============================================================
// 插件运行时接口
// ============================================================

/**
 * 插件运行时接口
 * @description 提供给插件使用的运行时 API
 */
export interface IPluginRuntime {
  /** 获取当前配置 */
  getConfig(): AppConfig;
  /** 更新配置 */
  updateConfig(config: Partial<AppConfig>): void;
  /** 获取事件发射器 */
  getEventEmitter(): IEventEmitter;
  /** 注册中间件 */
  registerMiddleware(middleware: unknown): void;
  /** 注册工具 */
  registerTool(tool: ToolDefinition, handler: (args: unknown) => Promise<unknown>): void;
  /** 日志接口 */
  log: {
    info: (msg: string, data?: unknown) => void;
    warn: (msg: string, data?: unknown) => void;
    error: (msg: string, data?: unknown) => void;
  };
}
