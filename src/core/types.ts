/**
 * 核心类型定义
 * @description 定义配置、状态、工具等核心类型
 * @module types
 */

import type { JSONSchema7 } from "json-schema";

// 从拆分模块重新导出
export { MINUTE_MS, HOUR_MS, DAY_MS, DEFAULT_TIMEOUT_MS, EXCHANGE_RATE_TIMEOUT_MS, KEY_MAX_FAILURES, DEFAULT_CACHE_MAX_ENTRIES } from "./constants.js";
export type { RequestEvent, EventHandler, RequestStartEvent, RequestCompleteEvent, RequestErrorEvent, KeySelectEvent, ToolCallEvent, IEventEmitter } from "./events.js";
export type { PluginHooks, PluginDefinition, IPluginRuntime } from "./plugin_types.js";

// ============================================================
// 配置类型定义
// ============================================================

/**
 * 配额类型定义
 * @description 描述 key 的可用额度
 */
export type QuotaConfig =
  | { type: "infinite" }
  | { type: "daily"; limit: number }
  | { type: "total"; limit: number };

/**
 * API Key 配置
 * @description 绑定提供商与可选模型的 Key 描述
 */
export interface KeyConfig {
  alias: string;
  provider: string;
  key: string;
  model?: string;
  quota: QuotaConfig;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 流式模式配置
 * @description 控制流式/非流式请求的转换方式
 * - none: 不做转换，保持客户端原始请求方式
 * - fake_stream: 伪流式，请求非流式但返回流式响应
 * - fake_non_stream: 伪非流式，请求流式但返回非流式响应
 */
export type StreamMode = "none" | "fake_stream" | "fake_non_stream";

/**
 * 提供商级别配置
 * @description 控制请求代理、限流和默认覆写
 */
export interface ProviderConfig {
  name: string;
  baseUrl: string;
  timeoutMs?: number;
  rpmLimit?: number;
  strategy?: KeySelectionStrategy;
  headers?: Record<string, string>;
  requestOverrides?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
  /** 流式模式转换配置 */
  streamMode?: StreamMode;
  /**
   * 每日配额重置时间（格式 "HH:MM"，如 "00:00"）
   * @description 默认为系统时区 00:00，该提供商下所有 Key 在此时间重置每日配额
   * @default "00:00"
   */
  resetTime?: string;
  /** 扩展配置 */
  extensions?: Record<string, unknown>;
}

/**
 * 模型价格配置
 * @description 用于总金额配额扣减
 */
export interface PricingConfig {
  promptPer1k?: number;
  completionPer1k?: number;
}

/**
 * 模型级别配置
 * @description 用于 /v1/models 与请求路由
 */
export interface ModelConfig {
  name: string;
  provider: string;
  model: string;
  requestOverrides?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
  pricing?: PricingConfig;
  supportsTools?: boolean;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 模型分组路由
 * @description 分组内路由选择
 */
export interface GroupRouteConfig {
  modelId: string;
  temperature?: number;
  weight?: number;
}

/**
 * 工具路由策略
 * @description 控制工具调用的处理方式
 * - local_first: 优先使用中间层工具，未命中则传递给下游
 * - local_only: 仅使用中间层工具，未命中则返回错误
 * - passthrough: 直接传递给下游，不注入中间层工具
 */
export type ToolRoutingStrategy = "local_first" | "local_only" | "passthrough";

/**
 * 系统提示词注入配置
 * @description 在用户消息前注入系统提示词，帮助模型理解上下文
 */
export interface PromptInjectConfig {
  /** 是否注入当前时间戳（如: "当前时间: 2024-01-15 14:30:00"） */
  enableTimestamp?: boolean;
  /** 是否注入农历日期（如: "农历: 甲辰年腊月初五"） */
  enableLunar?: boolean;
  /** 是否注入天气信息 */
  enableWeather?: boolean;
  /** 天气查询配置（需要 enableWeather 为 true） */
  weather?: {
    /** 天气数据源，目前仅支持 open-meteo */
    provider: "open-meteo";
    /** 纬度 (-90 到 90) */
    latitude: number;
    /** 经度 (-180 到 180) */
    longitude: number;
  };
}

/**
 * 截断检测配置
 * @description 检测模型输出是否因上下文窗口限制被截断
 * @behavior 在用户消息末尾注入终止标记，验证模型是否正确输出该标记
 */
export interface TruncationConfig {
  /** 是否启用截断检测 */
  enable: boolean;
  /** 终止符号（默认: __END_OF_RESPONSE__），模型应在输出末尾包含此符号 */
  suffix?: string;
  /** 自定义截断检测提示词（注入到最新用户消息末尾），不设置则使用默认提示 */
  prompt?: string;
}

/**
 * 分组功能配置
 * @description 每个分组独立配置，不再继承全局配置
 */
export interface GroupFeatureConfig {
  /**
   * 要注入的工具名称列表
   * @description 从全局 MCP 工具池中选择要注入的工具
   * @example ["get_weather", "search_web"]
   */
  tools?: string[];
  /**
   * 工具路由策略
   * @default "local_first"
   */
  toolRoutingStrategy?: ToolRoutingStrategy;
  /**
   * 系统提示词注入配置
   * @description 不设置则不注入任何提示词
   */
  promptInject?: PromptInjectConfig;
  /**
   * 截断检测配置
   * @description 不设置则不启用截断检测
   */
  truncation?: TruncationConfig;
}

/**
 * 自定义分组配置
 * @description 模型路由分组，每个分组可独立配置功能
 */
export interface GroupConfig {
  /** 分组名称，下游通过 group/{name} 访问 */
  name: string;
  /** 分组内模型路由策略 */
  strategy?: ModelGroupStrategy;
  /** 分组内的模型路由列表 */
  routes: GroupRouteConfig[];
  /** 功能配置（独立配置，不继承全局） */
  features?: GroupFeatureConfig;
}

/**
 * 本地工具模块配置
 * @description 通过本地 JS/TS 模块提供工具
 */
export interface LocalToolConfig {
  type: "local";
  name: string;
  modulePath: string;
}

/**
 * MCP stdio 传输配置
 * @description 通过标准输入输出与 MCP 服务通信
 */
export interface McpStdioConfig {
  type: "mcp";
  name: string;
  transport: "stdio";
  /** 可执行命令 */
  command: string;
  /** 命令行参数 */
  args?: string[];
  /** 环境变量 */
  env?: Record<string, string>;
  /** 工作目录 */
  cwd?: string;
}

/**
 * MCP SSE 传输配置
 * @description 通过 Server-Sent Events 与 MCP 服务通信
 */
export interface McpSseConfig {
  type: "mcp";
  name: string;
  transport: "sse";
  /** SSE 端点 URL */
  endpoint: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
}

/**
 * MCP HTTP 传输配置
 * @description 通过 HTTP 请求与 MCP 服务通信
 */
export interface McpHttpConfig {
  type: "mcp";
  name: string;
  transport: "http";
  /** HTTP 端点 URL */
  endpoint: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求超时（毫秒） */
  timeout?: number;
}

/**
 * MCP 工具配置（联合类型）
 * @description 支持 stdio、SSE、HTTP 三种传输方式
 */
export type McpToolConfig = McpStdioConfig | McpSseConfig | McpHttpConfig;

/**
 * 工具配置集合
 * @description 全局 MCP 工具池，分组从中选择要注入的工具
 */
export interface ToolsConfig {
  /**
   * MCP 工具列表
   * @description 全局管理的 MCP 工具池，分组通过 features.tools 选择要注入的工具
   */
  mcpTools: McpToolConfig[];
}

/**
 * 缓存配置
 * @description 全局缓存配置，下游可通过分组名后缀 `-cache` 使用带缓存的版本
 */
export interface CacheConfig {
  /** 是否启用缓存功能 */
  enable: boolean;
  /** 最大缓存条目数 */
  maxEntries: number;
  /** 缓存数据库文件路径 */
  dbPath: string;
  /** 缓存过期时间（秒），不设置则永不过期 */
  ttl?: number;
}

/**
 * 管理面板配置
 * @description 保护 /admin 与管理 API
 */
export interface AdminConfig {
  adminToken: string;
  ipWhitelist?: string[];
}

/**
 * 服务器配置
 * @description 控制监听地址与管理端
 */
export interface ServerConfig {
  host: string;
  port: number;
  admin: AdminConfig;
  bodyLimit?: number;
  shutdownTimeout?: number;
}

/**
 * 插件配置
 * @description 允许加载外部插件
 */
export interface PluginConfig {
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/**
 * 顶层应用配置
 * @description 作为应用唯一配置入口
 */
export interface AppConfig {
  /** 服务器配置 */
  server: ServerConfig;
  /** 提供商列表 */
  providers: ProviderConfig[];
  /** 模型列表 */
  models: ModelConfig[];
  /** 分组列表（每个分组独立配置功能） */
  groups: GroupConfig[];
  /** API Key 列表 */
  keys: KeyConfig[];
  /** 全局 MCP 工具池 */
  tools: ToolsConfig;
  /** 全局缓存配置 */
  cache: CacheConfig;
  /** 插件配置 */
  plugins?: PluginConfig[];
  /** 扩展配置 */
  extensions?: Record<string, unknown>;
}

// ============================================================
// 策略类型定义
// ============================================================

export type KeySelectionStrategy = "exhaust" | "round_robin" | "random" | "weighted";
export type ModelGroupStrategy = "round_robin" | "random" | "exhaust" | "weighted";

export interface IKeySelectionStrategy {
  /** 策略名称（内置策略或自定义名称） */
  readonly name: KeySelectionStrategy | (string & {});
  select(keys: KeyState[]): KeyState | null;
  onKeyUsed?(key: KeyState): void;
}

export interface IModelGroupStrategy {
  readonly name: ModelGroupStrategy;
  select(routes: GroupRouteConfig[]): GroupRouteConfig | null;
}

// ============================================================
// 存储适配器类型定义
// ============================================================

export interface CacheEntry {
  key: string;
  value: unknown;
  createdAt: number;
  accessedAt: number;
  hits: number;
}

export interface ICacheAdapter {
  get(key: string): CacheEntry | null;
  set(key: string, value: unknown): void;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  close?(): void | Promise<void>;
}

export interface IKeyStateAdapter {
  get(alias: string): KeyState | null;
  set(alias: string, state: KeyState): void;
  delete(alias: string): boolean;
  getAll(): KeyState[];
  resetDaily(): void;
}

// ============================================================
// 工具系统接口（解耦用）
// ============================================================

/**
 * 工具查询接口
 * @description 用于检查工具是否存在，解耦 tool_handler 与 ToolRegistry
 */
export interface IToolLookup {
  /** 检查工具是否存在 */
  has(name: string): boolean;
}

/**
 * 工具执行接口
 * @description 用于执行工具调用，解耦 tool_handler 与 ToolRegistry
 */
export interface IToolExecutor {
  /** 执行工具调用 */
  call(name: string, args: unknown): Promise<unknown>;
}

/**
 * 工具注册表接口
 * @description 组合查询和执行能力
 */
export interface IToolRegistry extends IToolLookup, IToolExecutor {}

// ============================================================
// 请求上下文类型
// ============================================================

export interface RequestContext {
  requestId: string;
  body: Record<string, unknown>;
  modelConfig: ModelConfig;
  providerConfig: ProviderConfig;
  keyState?: KeyState;
  startTime: number;
  data: Map<string, unknown>;
}

// ============================================================
// 运行时状态类型定义
// ============================================================

export interface KeyState {
  alias: string;
  provider: string;
  key: string;
  model?: string;
  quota: QuotaConfig;
  usage: { dailyCount: number; totalCost: number };
  available: boolean;
  lastUsedAt: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * 检查 Key 是否可用
 * @description 综合检查 available 标志和配额状态，避免多处重复实现
 * @param key Key 状态对象
 * @returns 是否可用
 */
export function isKeyAvailable(key: KeyState): boolean {
  if (!key.available) return false;

  const { quota, usage } = key;
  switch (quota.type) {
    case "infinite":
      return true;
    case "daily":
      return usage.dailyCount < quota.limit;
    case "total":
      return usage.totalCost < quota.limit;
    default:
      return false;
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
}

/**
 * 工具调用处理接口
 */
export interface ToolHandler {
  call(name: string, args: unknown): Promise<unknown>;
}

export interface LocalToolModule {
  tools: ToolDefinition[];
  callTool: (name: string, args: unknown) => Promise<unknown>;
}

export interface OpenAIResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ============================================================
// 中间件类型定义
// ============================================================

export interface MiddlewareContext extends RequestContext {
  next: () => Promise<unknown>;
}

export type Middleware = (ctx: MiddlewareContext) => Promise<unknown>;
export type MiddlewarePriority = "high" | "medium" | "low";

export interface MiddlewareOptions {
  priority?: MiddlewarePriority;
  enabled?: boolean;
}