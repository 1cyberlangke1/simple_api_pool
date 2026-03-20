import api from "./index";

// ============================================================
// 基础类型定义
// ============================================================

export interface QuotaConfig {
  type: "infinite" | "daily" | "total";
  limit?: number;
}

export interface KeyConfig {
  alias: string;
  provider: string;
  key: string;
  model?: string;
  quota: QuotaConfig;
  /** 扩展元数据 */
  metadata?: Record<string, unknown>;
}

export interface KeyState extends KeyConfig {
  usedToday: number;
  remainingTotal: number | null;
}

/**
 * 流式模式配置
 * @description 控制流式/非流式请求的转换方式
 * - none: 不做转换，保持客户端原始请求方式
 * - fake_stream: 伪流式，请求非流式但返回流式响应
 * - fake_non_stream: 伪非流式，请求流式但返回非流式响应
 */
export type StreamMode = "none" | "fake_stream" | "fake_non_stream";

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  timeoutMs?: number;
  rpmLimit?: number;
  strategy?: "exhaust" | "round_robin" | "random" | "weighted";
  headers?: Record<string, string>;
  requestOverrides?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
  /** 流式模式转换配置 */
  streamMode?: StreamMode;
  /** 每日配额重置时间（格式 HH:MM） */
  resetTime?: string;
  /** 扩展配置 */
  extensions?: Record<string, unknown>;
}

export interface PricingConfig {
  promptPer1k?: number;
  completionPer1k?: number;
}

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

export interface GroupRouteConfig {
  modelId: string;
  temperature?: number;
  weight?: number;
}

/**
 * 工具路由策略
 * - local_first: 优先使用中间层工具，未命中则传递给下游
 * - local_only: 仅使用中间层工具，未命中则返回错误
 * - passthrough: 直接传递给下游，不注入中间层工具
 */
export type ToolRoutingStrategy = "local_first" | "local_only" | "passthrough";

/**
 * 系统提示词注入配置
 * @description 在用户消息前注入系统提示词
 */
export interface PromptInjectConfig {
  /** 是否注入当前时间戳（如 "当前时间: 2024-01-15 14:30:00"） */
  enableTimestamp?: boolean;
  /** 是否注入农历日期（如: "农历: 甲辰年腊月初五"） */
  enableLunar?: boolean;
  /** 是否注入天气信息 */
  enableWeather?: boolean;
  /** 天气查询配置 */
  weather?: {
    provider: "open-meteo";
    latitude: number;
    longitude: number;
  };
}

/**
 * 截断检测配置
 * @description 检测模型输出是否因上下文窗口限制被截断
 */
export interface TruncationConfig {
  /** 是否启用截断检测 */
  enable: boolean;
  /** 终止符号（默认 __END_OF_RESPONSE__） */
  suffix?: string;
  /** 自定义截断检测提示词 */
  prompt?: string;
}

/**
 * 分组功能配置
 * @description 每个分组独立配置，不继承全局
 */
export interface GroupFeatureConfig {
  /** 要注入的工具名称列表（从全局工具池选择） */
  tools?: string[];
  /** 工具路由策略 */
  toolRoutingStrategy?: ToolRoutingStrategy;
  /** 系统提示词注入配置（不设置则不注入） */
  promptInject?: PromptInjectConfig;
  /** 截断检测配置（不设置则不检测） */
  truncation?: TruncationConfig;
}

export interface GroupConfig {
  name: string;
  strategy?: "round_robin" | "random" | "exhaust" | "weighted";
  routes: GroupRouteConfig[];
  /** 功能配置（独立配置，不继承全局） */
  features?: GroupFeatureConfig;
}

// ============================================================
// 工具配置类型
// ============================================================

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
 */
export type McpToolConfig = McpStdioConfig | McpSseConfig | McpHttpConfig;

/**
 * 工具配置集合
 * @description 全局 MCP 工具池
 */
export interface ToolsConfig {
  /** MCP 工具列表 */
  mcpTools: McpToolConfig[];
}

/**
 * 缓存配置
 * @description 全局缓存配置，下游可通过分组名后缀 `-cache` 启用
 */
export interface CacheConfig {
  /** 是否启用缓存功能 */
  enable: boolean;
  /** 最大缓存条目数 */
  maxEntries: number;
  /** 缓存数据库文件路径 */
  dbPath: string;
  /** 缓存过期时间（秒） */
  ttl?: number;
}

/**
 * 插件配置
 */
export interface PluginConfig {
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

/**
 * 应用配置
 */
export interface AppConfig {
  server: {
    host: string;
    port: number;
    /** 请求体大小限制（字节） */
    bodyLimit?: number;
    /** 关闭超时时间（毫秒） */
    shutdownTimeout?: number;
    admin: {
      adminToken: string;
      /** IP 白名单 */
      ipWhitelist?: string[];
    };
  };
  providers: ProviderConfig[];
  models: ModelConfig[];
  groups: GroupConfig[];
  keys: KeyConfig[];
  tools: ToolsConfig;
  cache: CacheConfig;
  /** 插件配置 */
  plugins?: PluginConfig[];
  /** 扩展配置 */
  extensions?: Record<string, unknown>;
}

// ============================================================
// API 方法
// ============================================================

export const getConfig = () => api.get<AppConfig>("/config");

export const updateConfig = (config: AppConfig) => api.put<{ status: string }>("/config", config);

export const getKeys = () => api.get<KeyState[]>("/keys");

export const addKey = (key: KeyConfig) => api.post<{ status: string }>("/keys", key);

export const updateKey = (alias: string, key: KeyConfig) =>
  api.put<{ status: string }>(`/keys/${encodeURIComponent(alias)}`, key);

export const deleteKey = (alias: string) =>
  api.delete<{ status: string }>(`/keys/${encodeURIComponent(alias)}`);

export interface BatchImportResult {
  status: string;
  total: number;
  success: number;
  results: Array<{ alias: string; status: "success" | "error"; error?: string }>;
}

export const batchImportKeys = (data: {
  provider: string;
  keys: string;
  delimiter: string;
  quotaType: "infinite" | "daily" | "total";
  quotaLimit?: number;
}) => api.post<BatchImportResult>("/keys/batch", data);

export const batchDeleteKeys = (aliases: string[]) =>
  api.post<{ status: string; total: number; deleted: number; results: Array<{ alias: string; status: "success" | "not_found" }> }>("/keys/batch-delete", { aliases });

export const getProviders = () => api.get<ProviderConfig[]>("/providers");

export const addProvider = (provider: ProviderConfig) => api.post<{ status: string }>("/providers", provider);

export const updateProvider = (name: string, provider: ProviderConfig) =>
  api.put<{ status: string }>(`/providers/${encodeURIComponent(name)}`, provider);

export const deleteProvider = (name: string) =>
  api.delete<{
    status: string;
    deletedModels?: number;
    deletedKeys?: number;
    deletedGroupRoutes?: number;
    deletedGroups?: number;
  }>(`/providers/${encodeURIComponent(name)}`);

export const getUpstreamModels = (providerName: string) =>
  api.get<{ models: Array<{ id: string; owned_by?: string }> }>(`/providers/${encodeURIComponent(providerName)}/upstream-models`);

export const getModels = () => api.get<ModelConfig[]>("/models");

export const addModel = (model: ModelConfig) => api.post<{ status: string }>("/models", model);

export const updateModel = (provider: string, name: string, model: ModelConfig) =>
  api.put<{ status: string }>(`/models/${encodeURIComponent(provider)}/${encodeURIComponent(name)}`, model);

export const deleteModel = (provider: string, name: string) =>
  api.delete<{
    status: string;
    deletedGroupRoutes?: number;
    deletedGroups?: number;
  }>(`/models/${encodeURIComponent(provider)}/${encodeURIComponent(name)}`);

// ============================================================
// 模型能力查询 API
// ============================================================

export interface ModelCapabilitiesResponse {
  found: boolean;
  model: string;
  provider?: string;
  capabilities?: {
    supportsTools: boolean;
  };
  pricing?: {
    promptPer1k: number;
    completionPer1k: number;
  };
  contextWindow?: number;
  displayName?: string;
}

/**
 * 获取模型能力（supportsTools 等）和价格
 */
export const getModelCapabilities = (model: string, provider?: string) =>
  api.get<ModelCapabilitiesResponse>("/models/capabilities", {
    params: { model, provider },
  });

export const getGroups = () => api.get<GroupConfig[]>("/groups");

export const addGroup = (group: GroupConfig) => api.post<{ status: string }>("/groups", group);

export const updateGroup = (name: string, group: GroupConfig) =>
  api.put<{ status: string }>(`/groups/${encodeURIComponent(name)}`, group);

export const deleteGroup = (name: string) =>
  api.delete<{ status: string }>(`/groups/${encodeURIComponent(name)}`);

// ============================================================
// MCP 工具管理 API
// ============================================================

export interface ToolInfo {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/**
 * 工具列表响应
 */
export interface ToolsListResponse {
  tools: ToolInfo[];
  count: number;
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * 获取已加载的工具列表
 */
export const getTools = () => api.get<ToolsListResponse>("/tools");

/**
 * 获取单个工具详情
 */
export const getTool = (name: string) =>
  api.get<ToolInfo>(`/tools/${encodeURIComponent(name)}`);

/**
 * 调用工具（测试用）
 */
export const callTool = (name: string, args?: unknown) =>
  api.post<ToolCallResult>(`/tools/${encodeURIComponent(name)}/call`, { args });

// ============================================================
// 模型价格查询 API
// ============================================================

export interface ModelPriceResult {
  price: {
    providerId: string;
    modelId: string;
    displayName?: string;
    inputPricePer1M: number;
    outputPricePer1M: number;
    contextWindow?: number;
    supportsTools?: boolean;
    promptPer1k: number;
    completionPer1k: number;
    promptPer1kCNY: number;
    completionPer1kCNY: number;
  };
  score: number;
  matchType: "exact" | "provider_exact" | "fuzzy";
}

export interface ExchangeRateData {
  base: string;
  target: string;
  rate: number;
  source: "online" | "fallback";
  updatedAt: number;
  nextUpdateAt: number;
}

export interface PriceQueryResponse {
  results: ModelPriceResult[];
  exchangeRate: ExchangeRateData;
}

export interface AllPricesResponse {
  prices: Array<{
    providerId: string;
    modelId: string;
    displayName?: string;
    inputPricePer1M: number;
    outputPricePer1M: number;
    contextWindow?: number;
    supportsTools?: boolean;
    promptPer1k: number;
    completionPer1k: number;
    promptPer1kCNY: number;
    completionPer1kCNY: number;
  }>;
  providers: string[];
  exchangeRate: ExchangeRateData;
}

/**
 * 查询模型价格（支持模糊匹配）
 */
export const queryModelPrice = (model: string, provider?: string, limit?: number) =>
  api.get<PriceQueryResponse>("/pricing/query", {
    params: { model, provider, limit },
  });

/**
 * 获取所有支持的模型价格
 */
export const getAllPrices = () => api.get<AllPricesResponse>("/pricing/all");

/**
 * 获取汇率
 */
export const getExchangeRate = (base?: string, target?: string) =>
  api.get<ExchangeRateData>("/exchange-rate", {
    params: { base, target },
  });

/**
 * 强制刷新汇率
 */
export const refreshExchangeRate = () =>
  api.post<{
    success: boolean;
    rate: ExchangeRateData;
    cacheStatus: Array<{ pair: string; rate: number; source: string; updatedAt: Date }>;
  }>("/exchange-rate/refresh");

/**
 * 获取汇率缓存状态
 */
export const getExchangeRateStatus = () =>
  api.get<{
    cacheStatus: Array<{ pair: string; rate: number; source: string; updatedAt: Date }>;
  }>("/exchange-rate/status");

// ============================================================
// 缓存统计 API
// ============================================================

export interface CacheStats {
  entries: number;
  maxEntries: number;
  dbSizeBytes: number;
  hits: number;
  misses: number;
  hitRate: number;
  hits24h: number;
  misses24h: number;
  hitRate24h: number;
}

export interface CacheStatsResponse {
  enabled: boolean;
  stats: CacheStats | null;
}

/**
 * 获取缓存统计信息
 */
export const getCacheStats = () => api.get<CacheStatsResponse>("/cache/stats");

/**
 * 清空缓存
 */
export const clearCache = () => api.delete<{ status: string; message: string }>("/cache");

// ============================================================
// 统计 API
// ============================================================

/**
 * 分组小时统计
 */
export interface GroupHourlyStats {
  group: string;
  hour: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
}

/**
 * 分组汇总统计
 */
export interface GroupSummaryStats {
  group: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number;
  avgCallsPerHour: number;
}

/**
 * 图表数据
 */
export interface ChartData {
  timeline: string[];
  groups: string[];
  groupData: Record<string, { calls: number[]; successRate: number[] }>;
  summary: GroupSummaryStats[];
}

/**
 * 获取分组汇总统计
 */
export const getStatsSummary = (hours?: number) =>
  api.get<{ hours: number; stats: GroupSummaryStats[] }>("/stats/summary", {
    params: { hours },
  });

/**
 * 获取小时统计数据
 */
export const getStatsHourly = (group?: string, hours?: number) =>
  api.get<{ group?: string; hours: number; stats: GroupHourlyStats[] }>("/stats/hourly", {
    params: { group, hours },
  });

/**
 * 获取图表数据
 */
export const getStatsChart = (hours?: number) =>
  api.get<ChartData>("/stats/chart", {
    params: { hours },
  });

/**
 * 清理过期统计数据
 */
export const cleanupStats = (days?: number) =>
  api.delete<{ status: string; message: string }>("/stats/cleanup", {
    params: { days },
  });

// ============================================================
// 日志 API
// ============================================================

/**
 * 日志文件信息（后端返回格式）
 */
export interface LogFileInfo {
  date: string;
  filename: string;
  size: number;
}

export interface LogListResponse {
  files: LogFileInfo[];
  total: number;
}

/**
 * 解析后的日志条目
 */
export interface LogEntry {
  time: string;
  level: string;
  msg: string;
  module?: string;
  plugin?: string;
}

/**
 * 后端返回的日志内容（原始格式）
 */
export interface LogContentRawResponse {
  date: string;
  logs: string[]; // 原始 JSON 字符串数组
  offset: number;
  limit: number;
  total: number;
  fileSize: number;
}

export const getLogList = () => api.get<LogListResponse>("/logs");

export const getLogContent = (date: string, level?: string, limit?: number) =>
  api.get<LogContentRawResponse>("/logs/content", { params: { date, level, limit } });

/**
 * 日志配置响应
 */
export interface LogConfigResponse {
  enabled: boolean;
  totalFiles: number;
  totalSize: number;
}

export const getLogConfig = () => api.get<LogConfigResponse>("/logs/config");

// ============================================================
// JS 工具 API
// ============================================================

export interface JsTool {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  code: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateJsToolRequest {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  code: string;
}

export interface UpdateJsToolRequest {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  code?: string;
  enabled?: boolean;
}

export interface JsToolTestResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

export interface JsToolValidation {
  safe: boolean;
  issues: string[];
}

export const getJsTools = () => api.get<JsTool[]>("/js-tools");

export const getJsTool = (id: string) => api.get<JsTool>(`/js-tools/${id}`);

export const createJsTool = (data: CreateJsToolRequest) => api.post<JsTool>("/js-tools", data);

export const updateJsTool = (id: string, data: UpdateJsToolRequest) =>
  api.put<JsTool>(`/js-tools/${id}`, data);

export const deleteJsTool = (id: string) => api.delete<{ status: string }>(`/js-tools/${id}`);

export const testJsTool = (id: string, args: Record<string, unknown>) =>
  api.post<JsToolTestResult>(`/js-tools/${id}/test`, { args });

export const validateJsCode = (code: string) =>
  api.post<JsToolValidation>("/js-tools/validate", { code });