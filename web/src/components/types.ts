/**
 * 聊天相关类型定义
 */

/**
 * 聊天消息
 */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown;
  name?: string;
  tool_call_id?: string;
  /** 额外字段，用于存储自定义字段如 reasoning_content 等 */
  extraFields?: Record<string, unknown>;
}

/**
 * 工具信息
 */
export interface ToolInfo {
  name: string;
  description?: string;
}

/**
 * 单个参数配置项
 * @description 包含值和是否启用的开关
 */
export interface ParamConfig<T = unknown> {
  enabled: boolean;
  value: T;
}

/**
 * OpenAI API 标准参数配置
 */
export interface OpenAIParams {
  temperature: ParamConfig<number>;
  max_tokens: ParamConfig<number>;
  top_p: ParamConfig<number>;
  frequency_penalty: ParamConfig<number>;
  presence_penalty: ParamConfig<number>;
  stop: ParamConfig<string[]>;
  n: ParamConfig<number>;
  seed: ParamConfig<number>;
  response_format: ParamConfig<{ type: "text" | "json_object" }>;
}

/**
 * 自定义参数项
 */
export interface CustomParam {
  key: string;
  value: unknown;
  enabled: boolean;
}

/**
 * 聊天设置
 */
export interface ChatSettings {
  /** OpenAI 标准参数 */
  params: OpenAIParams;
  /** 自定义参数列表 */
  customParams: CustomParam[];
  /** 额外请求体（extra_body） */
  extraBody: Record<string, unknown>;
  /** 工具列表 */
  tools: string[];
}

/**
 * 默认参数配置
 */
export function createDefaultParams(): OpenAIParams {
  return {
    temperature: { enabled: true, value: 0.7 },
    max_tokens: { enabled: false, value: 2048 },
    top_p: { enabled: false, value: 1 },
    frequency_penalty: { enabled: false, value: 0 },
    presence_penalty: { enabled: false, value: 0 },
    stop: { enabled: false, value: [] },
    n: { enabled: false, value: 1 },
    seed: { enabled: false, value: 0 },
    response_format: { enabled: false, value: { type: "text" } },
  };
}

/**
 * 创建默认聊天设置
 */
export function createDefaultSettings(): ChatSettings {
  return {
    params: createDefaultParams(),
    customParams: [],
    extraBody: {},
    tools: [],
  };
}

/**
 * 参数显示名称映射
 */
export const PARAM_LABELS: Record<keyof OpenAIParams, string> = {
  temperature: "Temperature",
  max_tokens: "Max Tokens",
  top_p: "Top P",
  frequency_penalty: "Frequency Penalty",
  presence_penalty: "Presence Penalty",
  stop: "Stop Sequences",
  n: "N (Choices)",
  seed: "Seed",
  response_format: "Response Format",
};

/**
 * 参数描述映射
 */
export const PARAM_DESCRIPTIONS: Record<keyof OpenAIParams, string> = {
  temperature: "控制输出随机性，0-2，值越大越随机",
  max_tokens: "生成的最大 token 数量",
  top_p: "核采样参数，0-1",
  frequency_penalty: "频率惩罚，-2 到 2，降低重复词频率",
  presence_penalty: "存在惩罚，-2 到 2，鼓励谈论新话题",
  stop: "停止序列，遇到时停止生成",
  n: "生成的候选回复数量",
  seed: "随机种子，用于可复现输出",
  response_format: "响应格式：text 或 json_object",
};

/**
 * 将设置转换为请求体参数
 * @description 只包含启用的参数
 */
export function buildRequestBody(settings: ChatSettings): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  // 处理 OpenAI 标准参数
  for (const [key, config] of Object.entries(settings.params)) {
    if (config.enabled && config.value !== undefined && config.value !== "") {
      // 跳过空数组
      if (Array.isArray(config.value) && config.value.length === 0) continue;
      body[key] = config.value;
    }
  }

  // 处理自定义参数
  for (const param of settings.customParams) {
    if (param.enabled && param.key.trim()) {
      body[param.key] = param.value;
    }
  }

  return body;
}

/**
 * 构建完整请求体（包含 extraBody）
 */
export function buildFullRequestBody(
  settings: ChatSettings,
  model: string,
  messages: Message[],
  stream: boolean,
  tools?: Array<{ type: string; function: { name: string } }>
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      name: m.name,
      tool_call_id: m.tool_call_id,
    })),
    stream,
    ...buildRequestBody(settings),
  };

  // 添加工具
  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  // 合并 extraBody（放在最后，可覆盖前面的字段）
  if (settings.extraBody && Object.keys(settings.extraBody).length > 0) {
    Object.assign(body, settings.extraBody);
  }

  return body;
}
