/**
 * 单次请求执行器
 * @description 执行对单个模型的请求，不包含故障转移逻辑
 * @module routes/chat/request_executor
 */

import type { FastifyReply } from "fastify";
import type { StreamMode, RequestContext } from "../../core/types.js";
import type { AppRuntime } from "../../app_state.js";
import type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
import type { SingleRequestResult } from "./request_utils.js";
import { applyOverrides } from "../../core/openai_proxy.js";
import { injectSystemPrompt } from "../../core/system_prompt.js";
import { addTruncationPrompt } from "../../core/truncation.js";
import { getGroupFeatures } from "./feature_flags.js";
import { decideStreamMode } from "./types.js";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../core/logger.js";
import {
  sendCachedStreamResponse,
  emitRequestStartEvents,
  handleStreamRequest,
  handleNonStreamRequest,
  handleRequestError,
} from "./request_utils.js";

const log = createModuleLogger("chat");

// 重新导出类型供外部使用
export type { SingleRequestResult } from "./request_utils.js";

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