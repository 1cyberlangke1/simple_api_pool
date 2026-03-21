/**
 * 单次请求执行器
 * @description 执行对单个模型的请求，不包含故障转移逻辑
 * @module routes/chat/request_executor
 */

import type { FastifyReply } from "fastify";
import type { StreamMode, RequestContext, KeyState, ProviderConfig, ModelConfig, ToolRoutingStrategy, TruncationConfig } from "../../core/types.js";
import type { AppRuntime } from "../../app_state.js";
import type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
import { applyOverrides, callChatCompletion, callChatCompletionStream, collectStreamToNonStream } from "../../core/openai_proxy.js";
import { estimateTokensFromMessages, estimateTokensFromString } from "../../core/usage.js";
import { injectSystemPrompt } from "../../core/system_prompt.js";
import { addTruncationPrompt, stripTruncationSuffix } from "../../core/truncation.js";
import { getGroupFeatures } from "./feature_flags.js";
import { handleToolCalls } from "./tool_handler.js";
import { forwardStreamResponse } from "./stream_handler.js";
import { decideStreamMode } from "./types.js";
import { getErrorStatusCode } from "../../core/errors.js";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../core/logger.js";

const log = createModuleLogger("chat");

/**
 * 单次模型请求执行参数
 */
export interface SingleRequestParams {
  targetModelId: string;
  routeTemperature?: number;
  requestedModelId: string;
  parsedGroupId: { name: string } | null;
  body: ChatCompletionBody;
  runtime: AppRuntime;
  reply: FastifyReply;
  isFailoverAttempt?: boolean;
}

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
 * 执行单次模型请求
 * @description 执行对单个模型的请求，不包含故障转移逻辑
 * @param params 请求参数
 * @returns 请求结果
 */
export async function executeSingleModelRequest(params: SingleRequestParams): Promise<SingleRequestResult> {
  const {
    targetModelId,
    routeTemperature,
    requestedModelId,
    parsedGroupId,
    body,
    runtime,
    reply,
    isFailoverAttempt = false,
  } = params;

  // 获取分组功能配置
  const features = getGroupFeatures(
    parsedGroupId ? `group/${parsedGroupId.name}` : null,
    runtime
  );

  // 获取模型配置
  const modelConfig = runtime.modelRegistry.getModel(targetModelId);
  if (!modelConfig) {
    return { success: false, error: "model not found", statusCode: 404 };
  }

  // 获取提供商配置
  const provider = runtime.modelRegistry.getProvider(modelConfig.provider);
  if (!provider) {
    return { success: false, error: "provider not found", statusCode: 404 };
  }

  // 流式模式决策
  const streamMode: StreamMode = provider.streamMode ?? "none";
  const clientWantsStream = body.stream === true;
  const { shouldRequestStream, shouldRespondStream } = decideStreamMode(streamMode, clientWantsStream);

  // 限流检查
  const limiter = runtime.rpmLimiters.get(provider.name);
  if (limiter && !limiter.allow()) {
    return { success: false, error: "provider rpm limit exceeded", statusCode: 429 };
  }

  // Key 选择
  const strategy = provider.strategy ?? "round_robin";
  const keyState = runtime.keyStore.pickKey(provider.name, strategy, modelConfig.model);
  if (!keyState) {
    return { success: false, error: "no available key", statusCode: 429 };
  }

  // 发射 Key 选择事件
  runtime.eventEmitter.emit("request:key:select", {
    alias: keyState.alias,
    provider: provider.name,
    model: modelConfig.model,
    group: parsedGroupId?.name,
  });

  // 消息预处理
  let messages = body.messages;
  if (features.promptInject) {
    messages = await injectSystemPrompt(body.messages, features.promptInject);
  }
  const updatedMessages = messages.map((msg) => ({ ...msg }));

  // 截断检测注入
  const truncationConfig = features.truncation;
  if (truncationConfig?.enable) {
    const lastMessage = updatedMessages.at(-1);
    if (lastMessage?.role === "user") {
      const content =
        typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content);
      lastMessage.content = addTruncationPrompt(content, truncationConfig.suffix, truncationConfig.prompt);
    }
  }

  // 序列化多模态内容
  for (const msg of updatedMessages) {
    if (Array.isArray(msg.content)) {
      msg.content = JSON.stringify(msg.content);
    }
  }

  // 工具注入
  const toolSupport = modelConfig.supportsTools ?? true;
  const toolRoutingStrategy = features.toolRoutingStrategy;
  const selectedTools = features.tools;

  // 从请求体中提取工具名称
  const requestToolNames: string[] = [];
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (typeof tool === "object" && tool !== null && "function" in tool) {
        const toolFunc = (tool as { function: { name: string } }).function;
        if (toolFunc?.name) {
          requestToolNames.push(toolFunc.name);
        }
      }
    }
  }

  // 合并分组工具和请求工具
  const allToolNames = [...new Set([...selectedTools, ...requestToolNames])];
  const hasLocalTools = toolSupport && allToolNames.length > 0;
  const injectLocalTools = hasLocalTools && toolRoutingStrategy !== "passthrough";

  // 从 ToolRegistry 获取完整工具定义
  const openAiTools = injectLocalTools
    ? runtime.toolRegistry.getToolsByNames(allToolNames)
    : undefined;

  // 构建请求体
  const baseBody: Record<string, unknown> = {
    ...body,
    messages: updatedMessages,
    model: modelConfig.model,
    stream: shouldRequestStream,
  };

  // 使用完整工具定义替换请求体中的简化格式
  if (openAiTools && openAiTools.length > 0) {
    baseBody.tools = openAiTools;
  } else if (Array.isArray(body.tools) && body.tools.length > 0) {
    baseBody.tools = body.tools;
  }

  // 处理额外请求体
  const extraBodyCandidate = body.extra_body ?? body.extraBody;
  const extraBody =
    typeof extraBodyCandidate === "object" && extraBodyCandidate !== null ? extraBodyCandidate : {};
  const finalBody = applyOverrides(baseBody, provider, modelConfig, extraBody as Record<string, unknown>);

  // 分组温度优先级最高
  if (routeTemperature !== undefined) {
    finalBody.temperature = routeTemperature;
  }

  // 缓存检查
  const cacheEnabled = !isFailoverAttempt && !!parsedGroupId?.name && !!features.cache?.enable && body.cache !== false;
  let cacheKey: string | null = null;

  if (cacheEnabled && parsedGroupId?.name) {
    runtime.ensureGroupCacheRegistered(parsedGroupId.name);

    const cachePayload = {
      model: finalBody.model,
      messages: finalBody.messages,
      tools: finalBody.tools,
      tool_choice: (finalBody as Record<string, unknown>).tool_choice,
      response_format: (finalBody as Record<string, unknown>).response_format,
      temperature: (finalBody as Record<string, unknown>).temperature,
    };
    cacheKey = runtime.groupCacheManager.buildKey(parsedGroupId.name, cachePayload);
    const cached = runtime.groupCacheManager.get(parsedGroupId.name, cacheKey);

    if (cached) {
      const cachedResponse = cached.response as OpenAIResponse;
      const cachedUsage = cached.usage as UsageInfo | undefined;

      runtime.eventEmitter.emit("request:cache:hit", {
        model: requestedModelId,
        provider: provider.name,
        group: parsedGroupId?.name,
        cachedTokens: cachedUsage?.completion_tokens ?? 0,
      });

      log.info({
        requestId: randomUUID(),
        model: requestedModelId,
        group: parsedGroupId?.name,
        cached: true,
        cachedTokens: cachedUsage?.completion_tokens ?? 0,
      }, "Cache hit, returning cached response");

      if (cachedUsage) {
        cachedResponse.usage = {
          ...cachedUsage,
          cached_tokens: cachedUsage.total_tokens,
        };
      }

      // 如果客户端请求流式输出，转换为 SSE 流式格式
      if (shouldRespondStream) {
        await sendCachedStreamResponse(reply, cachedResponse, cachedUsage, finalBody.model as string);
        return { success: true, response: cachedResponse, usage: cachedUsage, fromCache: true };
      }

      return { success: true, response: cachedResponse, usage: cachedUsage, fromCache: true };
    }
  }

  // 创建请求上下文
  const requestContext: RequestContext = {
    requestId: randomUUID(),
    body: finalBody as Record<string, unknown>,
    modelConfig,
    providerConfig: provider,
    keyState,
    startTime: Date.now(),
    data: new Map(),
  };

  emitRequestStartEvents(runtime, requestContext, requestedModelId, provider.name, parsedGroupId?.name, isFailoverAttempt);

  log.info({
    requestId: requestContext.requestId,
    model: requestedModelId,
    targetModel: modelConfig.model,
    provider: provider.name,
    keyAlias: keyState.alias,
    group: parsedGroupId?.name,
    stream: shouldRespondStream,
    streamMode,
    messages: updatedMessages.length,
    tools: openAiTools?.length ?? 0,
    failoverAttempt: isFailoverAttempt,
  }, "LLM request started");

  await runtime.executeBeforeRequestHooks(requestContext);

  try {
    // 流式转发
    if (shouldRequestStream && shouldRespondStream) {
      return await handleStreamRequest({
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
      });
    }

    // 非流式请求
    return await handleNonStreamRequest({
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
      keyAlias: keyState.alias,
    });
  } catch (err) {
    return handleRequestError(runtime, requestContext, requestedModelId, provider.name, parsedGroupId?.name, err);
  }
}

/**
 * 发送缓存的流式响应
 */
async function sendCachedStreamResponse(
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
 */
function emitRequestStartEvents(
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
 * 流式请求处理参数
 */
interface StreamRequestParams {
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
 * 处理流式请求
 */
async function handleStreamRequest(params: StreamRequestParams): Promise<SingleRequestResult> {
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
 * 非流式请求处理参数
 */
interface NonStreamRequestParams {
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
 * 处理非流式请求
 */
async function handleNonStreamRequest(params: NonStreamRequestParams): Promise<SingleRequestResult> {
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
 */
function createUsageInfo(
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
 */
function applyQuota(
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
 */
function handleRequestError(
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
