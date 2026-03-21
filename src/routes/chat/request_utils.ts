/**
 * 请求执行器辅助函数
 * @description 包含请求处理的辅助函数和类型定义
 * @module routes/chat/request_utils
 */

import type { FastifyReply } from "fastify";
import type { StreamMode, RequestContext, KeyState, ProviderConfig, ModelConfig, ToolRoutingStrategy, TruncationConfig } from "../../core/types.js";
import type { AppRuntime } from "../../app_state.js";
import type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
import { callChatCompletion, callChatCompletionStream, collectStreamToNonStream, applyOverrides } from "../../core/openai_proxy.js";
import { estimateTokensFromMessages, estimateTokensFromString } from "../../core/usage.js";
import { stripTruncationSuffix } from "../../core/truncation.js";
import { handleToolCalls } from "./tool_handler.js";
import { forwardStreamResponse } from "./stream_handler.js";
import { getErrorStatusCode } from "../../core/errors.js";
import { createModuleLogger } from "../../core/logger.js";

const log = createModuleLogger("chat");

/**
 * 单次模型请求执行结果
 */
export interface SingleRequestResult {
  success: boolean;
  response?: OpenAIResponse | null;
  error?: string;
  statusCode?: number;
  usage?: UsageInfo;
  /** 是否来自缓存 */
  fromCache?: boolean;
}

/**
 * 流式请求处理参数
 */
export interface StreamRequestParams {
  provider: ProviderConfig;
  keyState: KeyState;
  finalBody: Record<string, unknown>;
  reply: FastifyReply;
  modelConfig: ModelConfig;
  runtime: AppRuntime;
  requestContext: RequestContext;
  requestedModelId: string;
  parsedGroupId: { name: string } | null;
  cacheEnabled: boolean;
  cacheKey: string | null;
  updatedMessages: Array<{ role: string; content: unknown }>;
}

/**
 * 非流式请求处理参数
 */
export interface NonStreamRequestParams {
  provider: ProviderConfig;
  keyState: KeyState;
  finalBody: Record<string, unknown>;
  shouldRequestStream: boolean;
  body: ChatCompletionBody;
  runtime: AppRuntime;
  requestContext: RequestContext;
  requestedModelId: string;
  parsedGroupId: { name: string } | null;
  modelConfig: ModelConfig;
  cacheEnabled: boolean;
  cacheKey: string | null;
  updatedMessages: Array<{ role: string; content: unknown }>;
  toolRoutingStrategy: ToolRoutingStrategy;
  openAiTools: unknown[] | undefined;
  injectLocalTools: boolean;
  truncationConfig: TruncationConfig | undefined;
  keyAlias: string;
}

/**
 * 发送缓存的流式响应
 * @param reply Fastify 响应对象
 * @param cachedResponse 缓存的响应
 * @param cachedUsage 缓存的用量信息
 * @param model 模型名称
 */
export async function sendCachedStreamResponse(
  reply: FastifyReply,
  cachedResponse: OpenAIResponse,
  cachedUsage: UsageInfo | undefined,
  model: string
): Promise<void> {
  const cachedContent = cachedResponse.choices?.[0]?.message?.content ?? "";
  const cachedId = cachedResponse.id ?? `cache-${Date.now()}`;
  const cachedModel = cachedResponse.model ?? model;

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");

  reply.raw.write(`data: ${JSON.stringify({
    id: cachedId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: cachedModel,
    choices: [{ index: 0, delta: { role: "assistant", content: cachedContent }, finish_reason: null }]
  })}\n\n`);

  reply.raw.write(`data: ${JSON.stringify({
    id: cachedId,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: cachedModel,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: cachedUsage ? { ...cachedUsage, cached_tokens: cachedUsage.total_tokens } : undefined
  })}\n\n`);

  reply.raw.write("data: [DONE]\n\n");
  reply.raw.end();
}

/**
 * 发射请求开始事件
 * @param runtime 运行时实例
 * @param requestContext 请求上下文
 * @param model 模型名称
 * @param provider 提供商名称
 * @param group 分组名称
 * @param isFailoverAttempt 是否故障转移尝试
 */
export function emitRequestStartEvents(
  runtime: AppRuntime,
  requestContext: RequestContext,
  model: string,
  provider: string,
  group: string | undefined,
  isFailoverAttempt: boolean
): void {
  runtime.eventEmitter.emit("request:start", {
    requestId: requestContext.requestId,
    model,
    provider,
    group,
    failoverAttempt: isFailoverAttempt,
  });

  runtime.eventEmitter.emit("request:cache:miss", {
    model,
    provider,
    group,
  });
}

/**
 * 处理流式请求
 * @param params 请求参数
 * @returns 请求结果
 */
export async function handleStreamRequest(params: StreamRequestParams): Promise<SingleRequestResult> {
  const {
    provider,
    keyState,
    finalBody,
    reply,
    modelConfig,
    runtime,
    requestContext,
    requestedModelId,
    parsedGroupId,
    cacheEnabled,
    cacheKey,
    updatedMessages,
  } = params;

  const stream = callChatCompletionStream(provider, keyState.key, finalBody);
  const result = await forwardStreamResponse(reply, stream, modelConfig.model);

  if (result.success && result.response && cacheEnabled && cacheKey && parsedGroupId?.name) {
    const responseContent = result.response.choices?.[0]?.message?.content ?? "";
    const cacheUsage = createUsageInfo(result.response.usage, updatedMessages, responseContent, modelConfig.model);
    runtime.groupCacheManager.set(parsedGroupId.name, cacheKey, {
      response: result.response,
      usage: cacheUsage,
    });
  }

  runtime.eventEmitter.emit("request:complete", {
    requestId: requestContext.requestId,
    model: requestedModelId,
    provider: provider.name,
    group: parsedGroupId?.name,
    success: result.success,
    stream: true,
  });

  return { success: result.success, response: result.response };
}

/**
 * 处理非流式请求
 * @param params 请求参数
 * @returns 请求结果
 */
export async function handleNonStreamRequest(params: NonStreamRequestParams): Promise<SingleRequestResult> {
  const {
    provider,
    keyState,
    finalBody,
    shouldRequestStream,
    body,
    runtime,
    requestContext,
    requestedModelId,
    parsedGroupId,
    modelConfig,
    cacheEnabled,
    cacheKey,
    updatedMessages,
    toolRoutingStrategy,
    openAiTools,
    injectLocalTools,
    truncationConfig,
    keyAlias,
  } = params;

  let result: OpenAIResponse;
  if (shouldRequestStream) {
    result = (await collectStreamToNonStream(provider, keyState.key, finalBody)) as unknown as OpenAIResponse;
  } else {
    result = (await callChatCompletion(provider, keyState.key, finalBody)) as unknown as OpenAIResponse;
  }

  // 工具调用处理
  if (injectLocalTools || (body.tools && Array.isArray(body.tools) && body.tools.length > 0)) {
    const toolResult = await handleToolCalls({
      result,
      updatedMessages,
      finalBody,
      provider,
      key: keyState.key,
      toolRegistry: runtime.toolRegistry,
      toolRoutingStrategy,
      requestTools: body.tools,
    });

    if ("error" in toolResult) {
      await runtime.executeErrorHooks(requestContext, new Error(toolResult.error));
      return { success: false, error: toolResult.error, statusCode: toolResult.status };
    }
    result = toolResult.result;
  }

  // 截断检测处理
  const responseContent = result.choices?.[0]?.message?.content;
  if (truncationConfig?.enable && responseContent) {
    try {
      if (result.choices?.[0]?.message) {
        result.choices[0].message.content = stripTruncationSuffix(responseContent, truncationConfig.suffix);
      }
    } catch {
      // 截断检测失败，保持原样
    }
  }

  // 计算 usage
  const wantsNoUsage = body.return_usage === false;
  let usage: UsageInfo | undefined = result.usage;

  if (!wantsNoUsage) {
    if (!usage?.prompt_tokens || !usage?.completion_tokens) {
      const promptTokens = estimateTokensFromMessages(updatedMessages as Parameters<typeof estimateTokensFromMessages>[0]);
      const completionTokens = responseContent ? estimateTokensFromString(responseContent) : 1;
      usage = {
        prompt_tokens: usage?.prompt_tokens ?? promptTokens,
        completion_tokens: usage?.completion_tokens ?? completionTokens,
        total_tokens: (usage?.prompt_tokens ?? promptTokens) + (usage?.completion_tokens ?? completionTokens),
      };
      result.usage = usage;
    }
  }

  // 扣减配额
  applyQuota(runtime, keyState, modelConfig, usage);

  // 缓存结果
  if (cacheEnabled && cacheKey && parsedGroupId?.name) {
    const cacheUsage = createUsageInfo(result.usage, updatedMessages, responseContent, modelConfig.model);
    runtime.groupCacheManager.set(parsedGroupId.name, cacheKey, {
      response: result,
      usage: cacheUsage,
    });
  }

  runtime.eventEmitter.emit("request:complete", {
    requestId: requestContext.requestId,
    model: requestedModelId,
    provider: provider.name,
    group: parsedGroupId?.name,
    success: true,
    stream: false,
    usage,
  });

  await runtime.executeAfterRequestHooks(requestContext, result);

  const duration = Date.now() - requestContext.startTime;
  log.info({
    requestId: requestContext.requestId,
    model: requestedModelId,
    provider: provider.name,
    keyAlias,
    group: parsedGroupId?.name,
    duration,
    usage,
    cached: false,
    finishReason: result.choices?.[0]?.finish_reason,
  }, "LLM request completed");

  return { success: true, response: result, usage };
}

/**
 * 创建 UsageInfo
 * @param usage 原始用量信息
 * @param messages 消息列表
 * @param content 响应内容
 * @param model 模型名称
 * @returns UsageInfo 对象
 */
export function createUsageInfo(
  usage: UsageInfo | undefined,
  messages: unknown[],
  content: string | undefined,
  model: string
): UsageInfo {
  if (usage) {
    return {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    };
  }

  const promptTokens = estimateTokensFromMessages(messages as Parameters<typeof estimateTokensFromMessages>[0]);
  const completionTokens = content ? estimateTokensFromString(content, model) : 1;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

/**
 * 扣减配额
 * @param runtime 运行时实例
 * @param keyState Key 状态
 * @param modelConfig 模型配置
 * @param usage 用量信息
 */
export function applyQuota(
  runtime: AppRuntime,
  keyState: KeyState,
  modelConfig: ModelConfig,
  usage: UsageInfo | undefined
): void {
  const pricing = modelConfig.pricing;
  if (keyState.quota.type === "total") {
    if (pricing && usage) {
      const promptCost = ((usage.prompt_tokens ?? 0) * (pricing.promptPer1k ?? 0)) / 1000;
      const completionCost = ((usage.completion_tokens ?? 0) * (pricing.completionPer1k ?? 0)) / 1000;
      runtime.keyStore.applyCost(keyState.alias, promptCost + completionCost);
    } else if (usage) {
      const totalTokens = usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
      runtime.keyStore.applyCost(keyState.alias, Math.max(0.0001, totalTokens / 1000));
    } else {
      runtime.keyStore.applyCost(keyState.alias, 1);
    }
  } else {
    runtime.keyStore.applyCost(keyState.alias, 0);
  }
}

/**
 * 处理请求错误
 * @param runtime 运行时实例
 * @param requestContext 请求上下文
 * @param model 模型名称
 * @param provider 提供商名称
 * @param group 分组名称
 * @param err 错误对象
 * @returns 请求结果
 */
export function handleRequestError(
  runtime: AppRuntime,
  requestContext: RequestContext,
  model: string,
  provider: string,
  group: string | undefined,
  err: unknown
): SingleRequestResult {
  const duration = Date.now() - requestContext.startTime;
  const errorMessage = err instanceof Error ? err.message : String(err);
  const statusCode = getErrorStatusCode(err);

  log.error({
    requestId: requestContext.requestId,
    model,
    provider,
    duration,
    error: errorMessage,
  }, "LLM request failed");

  runtime.eventEmitter.emit("request:error", {
    requestId: requestContext.requestId,
    model,
    provider,
    group,
    error: errorMessage,
  });

  runtime.executeErrorHooks(requestContext, err as Error);

  return { success: false, error: errorMessage, statusCode };
}
