import { z } from "zod";

// ============================================================
// 配置 Schema 定义
// ============================================================

/**
 * 配额类型 Schema
 */
const QuotaSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("infinite") }),
  z.object({ type: z.literal("daily"), limit: z.number().positive() }),
  z.object({ type: z.literal("total"), limit: z.number().positive() }),
]);

/**
 * Key 配置 Schema
 */
const KeyConfigSchema = z.object({
  alias: z.string().min(1),
  provider: z.string().min(1),
  key: z.string().min(1),
  model: z.string().optional(),
  quota: QuotaSchema,
  metadata: z.record(z.unknown()).optional(),
});

/**
 * 提供商配置 Schema
 */
const ProviderConfigSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  timeoutMs: z.number().positive().optional(),
  rpmLimit: z.number().positive().optional(),
  strategy: z.enum(["exhaust", "round_robin", "random", "weighted"]).optional(),
  headers: z.record(z.string()).optional(),
  requestOverrides: z.record(z.unknown()).optional(),
  extraBody: z.record(z.unknown()).optional(),
  streamMode: z.enum(["none", "fake_stream", "fake_non_stream"]).optional(),
  /** 每日配额重置时间，格式 HH:MM */
  resetTime: z.string().regex(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/, "重置时间格式应为 HH:MM").optional(),
  extensions: z.record(z.unknown()).optional(),
});

/**
 * 价格配置 Schema
 */
const PricingSchema = z.object({
  promptPer1k: z.number().nonnegative().optional(),
  completionPer1k: z.number().nonnegative().optional(),
});

/**
 * 模型配置 Schema
 */
const ModelConfigSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  requestOverrides: z.record(z.unknown()).optional(),
  extraBody: z.record(z.unknown()).optional(),
  pricing: PricingSchema.optional(),
  supportsTools: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * 分组路由 Schema
 */
const GroupRouteSchema = z.object({
  modelId: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  weight: z.number().positive().optional(),
});

/**
 * 工具路由策略 Schema
 */
const ToolRoutingStrategySchema = z.enum(["local_first", "local_only", "passthrough"]);

/**
 * 天气配置 Schema
 */
const WeatherSchema = z.object({
  provider: z.literal("open-meteo"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * 系统提示词注入 Schema
 * @description 在用户消息前注入系统提示词
 */
const PromptInjectSchema = z.object({
  /** 注入时间戳 */
  enableTimestamp: z.boolean().optional(),
  /** 注入农历 */
  enableLunar: z.boolean().optional(),
  /** 注入天气 */
  enableWeather: z.boolean().optional(),
  /** 天气配置 */
  weather: WeatherSchema.optional(),
});

/**
 * 截断检测 Schema
 * @description 检测模型输出是否被截断
 */
const TruncationSchema = z.object({
  /** 是否启用 */
  enable: z.boolean(),
  /** 终止符号 */
  suffix: z.string().optional(),
  /** 检测提示词 */
  prompt: z.string().optional(),
});

/**
 * 分组功能配置 Schema
 * @description 每个分组独立配置，不再继承全局
 */
const GroupFeatureSchema = z.object({
  /** 要注入的工具名称列表（从全局工具池选择） */
  tools: z.array(z.string()).optional(),
  /** 工具路由策略 */
  toolRoutingStrategy: ToolRoutingStrategySchema.optional(),
  /** 系统提示词注入配置 */
  promptInject: PromptInjectSchema.optional(),
  /** 截断检测配置 */
  truncation: TruncationSchema.optional(),
});

/**
 * 分组配置 Schema
 */
const GroupConfigSchema = z.object({
  name: z.string().min(1),
  strategy: z.enum(["round_robin", "random", "exhaust", "weighted"]).optional(),
  routes: z.array(GroupRouteSchema).min(1),
  features: GroupFeatureSchema.optional(),
});

/**
 * 本地工具 Schema
 */
const LocalToolSchema = z.object({
  type: z.literal("local"),
  name: z.string().min(1),
  modulePath: z.string().min(1),
});

/**
 * MCP stdio 传输 Schema
 */
const McpStdioSchema = z.object({
  type: z.literal("mcp"),
  name: z.string().min(1),
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

/**
 * MCP SSE 传输 Schema
 */
const McpSseSchema = z.object({
  type: z.literal("mcp"),
  name: z.string().min(1),
  transport: z.literal("sse"),
  endpoint: z.string().url(),
  headers: z.record(z.string()).optional(),
  reconnectInterval: z.number().positive().optional(),
});

/**
 * MCP HTTP 传输 Schema
 */
const McpHttpSchema = z.object({
  type: z.literal("mcp"),
  name: z.string().min(1),
  transport: z.literal("http"),
  endpoint: z.string().url(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().positive().optional(),
});

/**
 * MCP 工具 Schema（联合类型）
 */
const McpToolSchema = z.discriminatedUnion("transport", [McpStdioSchema, McpSseSchema, McpHttpSchema]);

/**
 * 工具配置 Schema
 * @description 全局 MCP 工具池
 */
const ToolsConfigSchema = z.object({
  /** MCP 工具列表（可选，默认为空数组） */
  mcpTools: z.array(McpToolSchema).optional().default([]),
});

/**
 * 缓存配置 Schema
 */
const CacheSchema = z.object({
  /** 是否启用缓存 */
  enable: z.boolean(),
  /** 最大缓存条目数 */
  maxEntries: z.number().positive(),
  /** 数据库路径 */
  dbPath: z.string().min(1),
  /** 过期时间（秒） */
  ttl: z.number().positive().optional(),
});

/**
 * 管理配置 Schema
 */
const AdminSchema = z.object({
  /** 管理员令牌，建议至少 8 个字符 */
  adminToken: z.string().min(1, "Admin token is required"),
  ipWhitelist: z.array(z.string()).optional(),
});

/**
 * 服务器配置 Schema
 */
const ServerSchema = z.object({
  host: z.string(),
  port: z.number().positive().max(65535),
  admin: AdminSchema,
  bodyLimit: z.number().positive().optional(),
  shutdownTimeout: z.number().positive().optional(),
});

/**
 * 插件配置 Schema
 */
const PluginSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  options: z.record(z.unknown()).optional(),
});

/**
 * 应用配置 Schema
 */
export const AppConfigSchema = z.object({
  server: ServerSchema,
  providers: z.array(ProviderConfigSchema).min(1, "At least one provider is required"),
  models: z.array(ModelConfigSchema).min(1, "At least one model is required"),
  groups: z.array(GroupConfigSchema),
  keys: z.array(KeyConfigSchema).min(1, "At least one key is required"),
  tools: ToolsConfigSchema,
  cache: CacheSchema,
  plugins: z.array(PluginSchema).optional(),
  extensions: z.record(z.unknown()).optional(),
});

// ============================================================
// 验证函数
// ============================================================

/**
 * 验证结果
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

/**
 * 验证配置
 * @param config 原始配置对象
 * @returns 验证结果
 */
export function validateConfig(config: unknown): ValidationResult<z.infer<typeof AppConfigSchema>> {
  const result = AppConfigSchema.safeParse(config);

  if (result.success) {
    // 警告：adminToken 长度不足
    const warnings: string[] = [];
    if (result.data.server.admin.adminToken.length < 8) {
      warnings.push("[WARN] Admin token is shorter than 8 characters, consider using a longer token for security");
    }

    // 额外验证：检查模型引用的提供商是否存在
    const providerNames = new Set(result.data.providers.map((p) => p.name));
    const modelErrors: string[] = [];

    for (const model of result.data.models) {
      if (!providerNames.has(model.provider)) {
        modelErrors.push(`Model "${model.name}" references unknown provider "${model.provider}"`);
      }
    }

    // 检查分组引用的模型是否存在
    const modelIds = new Set(result.data.models.map((m) => `${m.provider}/${m.name}`));
    const groupErrors: string[] = [];

    for (const group of result.data.groups) {
      for (const route of group.routes) {
        if (!modelIds.has(route.modelId)) {
          groupErrors.push(`Group "${group.name}" references unknown model "${route.modelId}"`);
        }
      }
    }

    // 检查分组引用的工具是否存在于全局工具池
    const toolNames = new Set(result.data.tools.mcpTools.map((t) => t.name));
    const toolErrors: string[] = [];

    for (const group of result.data.groups) {
      if (group.features?.tools) {
        for (const toolName of group.features.tools) {
          if (!toolNames.has(toolName)) {
            toolErrors.push(`Group "${group.name}" references unknown tool "${toolName}"`);
          }
        }
      }
    }

    const allErrors = [...modelErrors, ...groupErrors, ...toolErrors];
    if (allErrors.length > 0) {
      return {
        success: false,
        errors: allErrors,
      };
    }

    // 输出警告
    for (const warn of warnings) {
      console.warn(warn);
    }

    return {
      success: true,
      data: result.data,
    };
  }

  // 格式化错误信息
  const errors = result.error.errors.map((e) => {
    const path = e.path.join(".");
    return `${path}: ${e.message}`;
  });

  return {
    success: false,
    errors,
  };
}

/**
 * 验证部分配置（用于更新）
 */
export function validatePartialConfig(
  config: unknown
): ValidationResult<Partial<z.infer<typeof AppConfigSchema>>> {
  const schema = AppConfigSchema.partial();
  const result = schema.safeParse(config);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((e) => {
    const path = e.path.join(".");
    return `${path}: ${e.message}`;
  });

  return {
    success: false,
    errors,
  };
}

// 导出类型
export type AppConfig = z.infer<typeof AppConfigSchema>;
