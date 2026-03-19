/**
 * Token 计算工具
 * @description 使用 js-tiktoken 进行精确的 token 计算
 * @module usage
 */

import { encodingForModel, type Tiktoken, type TiktokenModel } from "js-tiktoken";

/**
 * 支持的模型编码映射
 * @description 用于选择正确的 tokenizer
 */
const MODEL_ENCODINGS: Record<string, TiktokenModel> = {
  // GPT-4 系列
  "gpt-4": "gpt-4",
  "gpt-4-turbo": "gpt-4-turbo",
  "gpt-4-turbo-preview": "gpt-4-turbo-preview",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4-32k": "gpt-4-32k",

  // GPT-3.5 系列
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k": "gpt-3.5-turbo-16k",

  // Claude 系列 (使用 cl100k_base 编码，与 GPT-4 相同)
  "claude-3-opus": "gpt-4",
  "claude-3-sonnet": "gpt-4",
  "claude-3-haiku": "gpt-4",
  "claude-3-5-sonnet": "gpt-4",

  // DeepSeek 系列
  "deepseek-chat": "gpt-4",
  "deepseek-coder": "gpt-4",

  // Qwen 系列
  "qwen-turbo": "gpt-4",
  "qwen-plus": "gpt-4",
  "qwen-max": "gpt-4",
};

/**
 * 默认编码模型
 */
const DEFAULT_MODEL: TiktokenModel = "gpt-4";

/**
 * Encoding 实例缓存
 * @description 避免每次调用都创建新实例，提升性能
 */
const encodingCache: Map<TiktokenModel, Tiktoken> = new Map();

/**
 * 获取模型对应的编码器名称
 * @param model 模型名称
 * @returns Tiktoken 编码器名称
 */
function getEncodingModel(model: string): TiktokenModel {
  // 精确匹配
  if (MODEL_ENCODINGS[model]) {
    return MODEL_ENCODINGS[model];
  }

  // 前缀匹配
  const lowerModel = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_ENCODINGS)) {
    if (lowerModel.startsWith(key.toLowerCase())) {
      return value;
    }
  }

  // 默认使用 cl100k_base (GPT-4 编码)
  return DEFAULT_MODEL;
}

/**
 * 获取缓存的 encoding 实例
 * @param model Tiktoken 编码器名称
 * @returns Tiktoken 实例
 */
function getEncoding(model: TiktokenModel): Tiktoken {
  let encoding = encodingCache.get(model);
  if (!encoding) {
    encoding = encodingForModel(model);
    encodingCache.set(model, encoding);
  }
  return encoding;
}

/**
 * 从字符串计算 token 数量
 * @param str 任意字符串
 * @param model 模型名称（用于选择正确的 tokenizer）
 * @returns token 数量
 * @description 使用 js-tiktoken 进行精确计算，encoding 实例会被缓存复用
 */
export function estimateTokensFromString(str: string | null | undefined, model: string = "gpt-4"): number {
  if (!str) return 0;

  try {
    const encodingModel = getEncodingModel(model);
    const encoding = getEncoding(encodingModel);
    return encoding.encode(str).length;
  } catch {
    // 回退到字节估算
    const bytes = new TextEncoder().encode(str).length;
    return Math.max(1, Math.ceil(bytes / 4));
  }
}

/**
 * 从 OpenAI messages 数组计算 token 数量
 * @param messages OpenAI 消息数组
 * @param model 模型名称
 * @returns token 数量
 * @description 精确计算消息的 token 数量，包括消息格式开销，encoding 实例会被缓存复用
 */
export function estimateTokensFromMessages(
  messages: Array<{ role: string; content?: unknown; name?: string }>,
  model: string = "gpt-4"
): number {
  if (!messages.length) return 0;

  try {
    const encodingModel = getEncodingModel(model);
    const encoding = getEncoding(encodingModel);

    let total = 0;

    // 每条消息的基础开销（GPT-4 格式）
    const messageOverhead = 4; // <|start|>{role}\n{content}<|end|>\n
    const nameOverhead = 1; // name 字段额外开销

    for (const msg of messages) {
      total += messageOverhead;

      // 计算角色 token
      total += encoding.encode(msg.role).length;

      // 计算内容 token
      if (typeof msg.content === "string") {
        total += encoding.encode(msg.content).length;
      } else if (Array.isArray(msg.content)) {
        // 多模态内容
        for (const part of msg.content) {
          if (typeof part === "string") {
            total += encoding.encode(part).length;
          } else if (typeof part === "object" && part !== null) {
            if ("text" in part && typeof part.text === "string") {
              total += encoding.encode(part.text).length;
            }
            // 图片 token 估算 (根据 OpenAI 文档)
            if ("type" in part && part.type === "image_url") {
              total += 85; // 低分辨率图片固定 85 tokens
            }
          }
        }
      }

      // 名称字段
      if (msg.name) {
        total += nameOverhead + encoding.encode(msg.name).length;
      }
    }

    // 对话总开销
    total += 2; // <|start|>assistant<|message|>

    return total;
  } catch {
    // 回退到简单估算
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        const bytes = new TextEncoder().encode(msg.content).length;
        total += Math.max(1, Math.ceil(bytes / 4));
      }
    }
    return Math.max(1, total);
  }
}

/**
 * 计算工具定义的 token 数量
 * @param tools OpenAI 工具定义数组
 * @param model 模型名称
 * @returns token 数量
 * @description encoding 实例会被缓存复用
 */
export function estimateTokensFromTools(
  tools: Array<{ type: string; function?: { name: string; description?: string } }>,
  model: string = "gpt-4"
): number {
  if (!tools.length) return 0;

  try {
    const encodingModel = getEncodingModel(model);
    const encoding = getEncoding(encodingModel);

    let total = 0;

    for (const tool of tools) {
      if (tool.function) {
        total += encoding.encode(tool.function.name).length;
        if (tool.function.description) {
          total += encoding.encode(tool.function.description).length;
        }
      }
    }

    return total;
  } catch {
    return tools.length * 50; // 粗略估算
  }
}
