import type { ModelConfig, ProviderConfig } from "./types.js";
import { UpstreamError } from "./errors.js";

/**
 * 拼接 URL
 * @param baseUrl 基础 URL
 * @param path 路径
 * @returns 合并后的 URL
 */
function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\//, "")}`;
}

/**
 * 构建通用的请求配置
 * @param provider 提供商配置
 * @param apiKey API Key
 * @param body 请求体
 * @returns fetch 配置对象
 */
function buildFetchConfig(
  provider: ProviderConfig,
  apiKey: string,
  body: Record<string, unknown>
): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(provider.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: provider.timeoutMs ? AbortSignal.timeout(provider.timeoutMs) : undefined,
  };
}

/**
 * OpenAI 兼容代理客户端（非流式）
 * @param provider 提供商配置
 * @param apiKey API Key
 * @param body 请求体
 * @returns 代理请求结果
 * @throws 上游返回错误时抛出异常
 */
export async function callChatCompletion(
  provider: ProviderConfig,
  apiKey: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const url = joinUrl(provider.baseUrl, "chat/completions");
  const res = await fetch(url, buildFetchConfig(provider, apiKey, body));
  if (!res.ok) {
    const text = await res.text();
    throw new UpstreamError(res.status, text, provider.name);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * 流式响应块类型
 * @description 支持任意 delta 字段，自适应不同提供商的扩展字段
 */
export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
      /** 支持其他扩展字段（如 reasoning_content 等） */
      [key: string]: unknown;
    };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * 非流式响应类型
 */
interface NonStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * OpenAI 兼容代理客户端（流式）
 * @description 发送流式请求并返回一个可读流，供伪非流式收集或直接转发
 * @param provider 提供商配置
 * @param apiKey API Key
 * @param body 请求体
 * @returns 流式响应迭代器
 * @throws 上游返回错误时抛出异常
 */
export async function* callChatCompletionStream(
  provider: ProviderConfig,
  apiKey: string,
  body: Record<string, unknown>
): AsyncGenerator<StreamChunk, void, unknown> {
  const url = joinUrl(provider.baseUrl, "chat/completions");
  const res = await fetch(url, buildFetchConfig(provider, apiKey, { ...body, stream: true }));

  if (!res.ok) {
    const text = await res.text();
    throw new UpstreamError(res.status, text, provider.name);
  }

  if (!res.body) {
    throw new Error("No response body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      const jsonStr = trimmed.slice(6);
      try {
        const chunk = JSON.parse(jsonStr) as StreamChunk;
        yield chunk;
      } catch {
        // 忽略解析错误
      }
    }
  }
}

/**
 * 收集流式响应并转换为非流式格式
 * @description 用于伪非流式模式：请求流式但返回非流式响应
 * @param provider 提供商配置
 * @param apiKey API Key
 * @param body 请求体
 * @returns 非流式响应
 */
export async function collectStreamToNonStream(
  provider: ProviderConfig,
  apiKey: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const chunks: StreamChunk[] = [];
  let content = "";
  let role = "assistant";
  const toolCalls: Map<string, { id: string; type: "function"; function: { name: string; arguments: string } }> = new Map();
  let finishReason = "stop";
  let id = "";
  let model = "";
  let created = 0;
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
  // 收集额外的 delta 字段（如 reasoning_content）
  const extraDeltaFields: Record<string, string> = {};

  // 确保请求体中 stream 为 true（伪非流式模式必须请求流式）
  const streamBody = { ...body, stream: true };

  for await (const chunk of callChatCompletionStream(provider, apiKey, streamBody)) {
    chunks.push(chunk);
    id = chunk.id || id;
    model = chunk.model || model;
    created = chunk.created || created;

    if (chunk.usage) {
      usage = chunk.usage;
    }

    const choice = chunk.choices?.[0];
    if (choice) {
      const delta = choice.delta;
      if (delta) {
        if (delta.role) {
          role = delta.role;
        }
        if (delta.content) {
          content += delta.content;
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.id && !toolCalls.has(tc.id)) {
              toolCalls.set(tc.id, {
                id: tc.id,
                type: "function",
                function: { name: tc.function.name, arguments: tc.function.arguments },
              });
            } else if (tc.id && toolCalls.has(tc.id)) {
              const existing = toolCalls.get(tc.id)!;
              existing.function.arguments += tc.function.arguments;
            }
          }
        }
        // 收集所有其他字符串类型的 delta 字段（自适应扩展字段）
        for (const [key, value] of Object.entries(delta)) {
          if (key === "role" || key === "content" || key === "tool_calls") continue;
          if (typeof value === "string") {
            if (!extraDeltaFields[key]) extraDeltaFields[key] = "";
            extraDeltaFields[key] += value;
          }
        }
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }
  }

  const response: NonStreamResponse = {
    id: id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: created || Math.floor(Date.now() / 1000),
    model: model || (body.model as string) || "unknown",
    choices: [
      {
        index: 0,
        message: {
          role,
          content: content || undefined,
          ...(toolCalls.size > 0 ? { tool_calls: Array.from(toolCalls.values()) } : {}),
          // 包含额外的 delta 字段
          ...(Object.keys(extraDeltaFields).length > 0 ? extraDeltaFields : {}),
        },
        finish_reason: finishReason,
      },
    ],
    usage,
  };

  return response as unknown as Record<string, unknown>;
}

/**
 * 生成模型最终请求体
 * @param requestBody 原始请求体
 * @param provider 提供商配置
 * @param model 模型配置
 * @param extraBody 额外请求体
 * @returns 合并后的请求体（provider 覆写优先级低于 model 覆写）
 */
export function applyOverrides(
  requestBody: Record<string, unknown>,
  provider: ProviderConfig,
  model: ModelConfig,
  extraBody: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...requestBody, ...extraBody, ...(provider.extraBody ?? {}), ...(model.extraBody ?? {}) };
  const providerOverrides = provider.requestOverrides ?? {};
  const modelOverrides = model.requestOverrides ?? {};
  return { ...merged, ...providerOverrides, ...modelOverrides };
}