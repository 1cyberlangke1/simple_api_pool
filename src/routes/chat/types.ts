/**
 * Chat 路由类型定义
 * @description 定义 chat 路由相关的类型
 * @module routes/chat/types
 */

import type { StreamMode } from "../../core/types.js";

/**
 * OpenAI Chat Completion 请求体类型
 */
export interface ChatCompletionBody {
  model: string;
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
  stream?: boolean;
  tools?: unknown[];
  cache?: boolean;
  return_usage?: boolean;
  extra_body?: Record<string, unknown>;
  extraBody?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * OpenAI Usage 类型
 */
export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** 缓存命中时的 token 数（扩展字段） */
  cached_tokens?: number;
}

/**
 * OpenAI 响应类型
 * @description id/object/created/model 为可选，实现层会提供默认值
 */
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
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    delta?: {
      content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: UsageInfo;
}

/**
 * 流式模式决策结果
 */
export interface StreamModeDecision {
  /** 是否请求流式 */
  shouldRequestStream: boolean;
  /** 是否响应流式 */
  shouldRespondStream: boolean;
}

/**
 * 计算流式模式决策
 * @param streamMode 提供商流式模式配置
 * @param clientWantsStream 客户端是否请求流式
 * @returns 流式模式决策结果
 */
export function decideStreamMode(streamMode: StreamMode, clientWantsStream: boolean): StreamModeDecision {
  // streamMode = "none": 保持客户端原始请求方式
  // streamMode = "fake_stream": 供应商只支持非流式，始终请求非流式
  // streamMode = "fake_non_stream": 供应商只支持流式，始终请求流式
  if (streamMode === "fake_stream") {
    return {
      shouldRequestStream: false,
      shouldRespondStream: clientWantsStream,
    };
  } else if (streamMode === "fake_non_stream") {
    return {
      shouldRequestStream: true,
      shouldRespondStream: clientWantsStream,
    };
  } else {
    return {
      shouldRequestStream: clientWantsStream,
      shouldRespondStream: clientWantsStream,
    };
  }
}
