/**
 * Chat Completion 路由入口
 * @description 处理 /v1/chat/completions 请求，支持流式响应、工具调用、缓存等
 * @module routes/chat
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { StreamMode, RequestContext } from "../../core/types.js";
import { applyOverrides, callChatCompletion, callChatCompletionStream, collectStreamToNonStream } from "../../core/openai_proxy.js";
import { estimateTokensFromMessages, estimateTokensFromString } from "../../core/usage.js";
import { injectSystemPrompt } from "../../core/system_prompt.js";
import { addTruncationPrompt, stripTruncationSuffix } from "../../core/truncation.js";
import { CacheStore } from "../../core/cache_store.js";
import { getGroupFeatures, parseGroupId } from "./feature_flags.js";
import { handleToolCalls } from "./tool_handler.js";
import { sendStreamingResponse, forwardStreamResponse } from "./stream_handler.js";
import type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
import { decideStreamMode } from "./types.js";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../core/logger.js";

const log = createModuleLogger("chat");

// 导出类型供外部使用
export type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
export type { GroupFeatures } from "./feature_flags.js";
export type { ToolCallClassification, ToolCallItem } from "./tool_handler.js";

/**
 * Chat Completion 处理器
 * @description 处理 /v1/chat/completions 请求
 */
export async function chatCompletionHandler(
  request: FastifyRequest<{ Body: ChatCompletionBody }>,
  reply: FastifyReply
): Promise<void> {
  const runtime = request.server.runtime;
  const body = request.body;

  // ============================================================
  // 1. 参数校验与模型解析
  // ============================================================
  const requestedModelId = body.model;
  if (!requestedModelId || !Array.isArray(body.messages)) {
    return reply.status(400).send({ error: "invalid request: model and messages are required" });
  }

  let targetModelId = requestedModelId;
  let routeTemperature: number | undefined;
  let groupId: string | null = null;
  // 预解析分组 ID，避免后续重复调用 parseGroupId
  let parsedGroupId: { name: string; wantsCache: boolean } | null = null;

  // 处理分组模型（支持 -cache 后缀）
  if (runtime.modelRegistry.isGroup(targetModelId)) {
    groupId = targetModelId;
    // 解析分组名和缓存请求（只解析一次）
    parsedGroupId = parseGroupId(targetModelId);
    
    // 使用实际分组名查找路由
    const route = runtime.modelRegistry.pickGroupRoute(parsedGroupId.name);
    if (!route) {
      // 记录统计（失败）
      runtime.statsStore.recordCall(parsedGroupId.name, false);
      return reply.status(400).send({ error: "group route not found" });
    }
    targetModelId = route.modelId;
    routeTemperature = route.temperature;
  }

  // 获取分组功能配置（独立配置，支持 -cache 后缀）
  const features = getGroupFeatures(groupId, runtime);

  // 获取模型配置
  const modelConfig = runtime.modelRegistry.getModel(targetModelId);
  if (!modelConfig) {
    if (parsedGroupId) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
    }
    return reply.status(404).send({ error: "model not found" });
  }

  // 获取提供商配置
  const provider = runtime.modelRegistry.getProvider(modelConfig.provider);
  if (!provider) {
    if (parsedGroupId) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
    }
    return reply.status(404).send({ error: "provider not found" });
  }

  // ============================================================
  // 2. 流式模式决策
  // ============================================================
  const streamMode: StreamMode = provider.streamMode ?? "none";
  const clientWantsStream = body.stream === true;
  const { shouldRequestStream, shouldRespondStream } = decideStreamMode(streamMode, clientWantsStream);

  // ============================================================
  // 3. 限流与 Key 选择
  // ============================================================
  const limiter = runtime.rpmLimiters.get(provider.name);
  if (limiter && !limiter.allow()) {
    if (parsedGroupId) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
    }
    return reply.status(429).send({ error: "provider rpm limit exceeded" });
  }

  const strategy = provider.strategy ?? "round_robin";
  const keyState = runtime.keyStore.pickKey(provider.name, strategy, modelConfig.model);
  if (!keyState) {
    if (parsedGroupId) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
    }
    return reply.status(429).send({ error: "no available key" });
  }

  // ============================================================
  // 4. 消息预处理
  // ============================================================
  let messages = body.messages;
  
  // 提示词注入（分组独立配置）
  if (features.promptInject) {
    messages = await injectSystemPrompt(body.messages, features.promptInject);
  }
  const updatedMessages = messages.map((msg) => ({ ...msg }));

  // 截断检测注入（分组独立配置）
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

  // ============================================================
  // 5. 工具注入
  // ============================================================
  const toolSupport = modelConfig.supportsTools ?? true;
  const toolRoutingStrategy = features.toolRoutingStrategy;
  
  // 从分组配置获取要注入的工具
  const selectedTools = features.tools;
  const hasLocalTools = toolSupport && selectedTools.length > 0;
  const injectLocalTools = hasLocalTools && toolRoutingStrategy !== "passthrough";
  
  // 获取选中工具的 OpenAI 格式
  const openAiTools = injectLocalTools
    ? runtime.toolRegistry.getToolsByNames(selectedTools)
    : undefined;

  // 构建请求体
  const baseBody: Record<string, unknown> = {
    ...body,
    messages: updatedMessages,
    model: modelConfig.model,
    temperature: routeTemperature ?? body.temperature,
  };

  if (openAiTools && openAiTools.length > 0) {
    baseBody.tools = [...(Array.isArray(body.tools) ? body.tools : []), ...openAiTools];
  }

  // 处理额外请求体
  const extraBodyCandidate = body.extra_body ?? body.extraBody;
  const extraBody =
    typeof extraBodyCandidate === "object" && extraBodyCandidate !== null ? extraBodyCandidate : {};
  const finalBody = applyOverrides(baseBody, provider, modelConfig, extraBody as Record<string, unknown>);

  // ============================================================
  // 6. 缓存检查
  // ============================================================
  const cacheEnabled = features.enableCache && runtime.cacheStore && body.cache !== false;
  let cacheKey: string | null = null;

  if (cacheEnabled && runtime.cacheStore) {
    const cachePayload = {
      model: finalBody.model,
      messages: finalBody.messages,
      tools: finalBody.tools,
      tool_choice: (finalBody as Record<string, unknown>).tool_choice,
      response_format: (finalBody as Record<string, unknown>).response_format,
      temperature: (finalBody as Record<string, unknown>).temperature,
    };
    cacheKey = CacheStore.buildKey(cachePayload);
    const cached = runtime.cacheStore.get(cacheKey);

    if (cached) {
      // 缓存命中日志
      log.info({
        requestId: randomUUID(),
        model: requestedModelId,
        group: parsedGroupId?.name,
        cached: true,
      }, "Cache hit, returning cached response");
      
      if (parsedGroupId) {
        runtime.statsStore.recordCall(parsedGroupId.name, true);
      }
      if (body.stream) {
        return sendStreamingResponse(reply, cached as unknown as OpenAIResponse, modelConfig.model);
      }
      return reply.send(cached);
    }
  }

  // ============================================================
  // 7. 调用上游 API
  // ============================================================
  // 创建请求上下文（用于插件钩子）
  const requestContext: RequestContext = {
    requestId: randomUUID(),
    body: finalBody as Record<string, unknown>,
    modelConfig,
    providerConfig: provider,
    keyState,
    startTime: Date.now(),
    data: new Map(),
  };

  // 记录请求日志
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
  }, "LLM request started");

  // 执行 beforeRequest 钩子
  await runtime.executeBeforeRequestHooks(requestContext);

  try {
    // 流式转发：直接转发上游流式响应
    if (shouldRequestStream && shouldRespondStream) {
      const stream = callChatCompletionStream(provider, keyState.key, finalBody);
      const success = await forwardStreamResponse(reply, stream);
      // 在流式响应完成后记录统计
      if (parsedGroupId) {
        runtime.statsStore.recordCall(parsedGroupId.name, success);
      }
      return;
    }

    // 非流式请求
    let result: OpenAIResponse;
    if (shouldRequestStream && !shouldRespondStream) {
      result = (await collectStreamToNonStream(provider, keyState.key, finalBody)) as unknown as OpenAIResponse;
    } else {
      result = (await callChatCompletion(provider, keyState.key, finalBody)) as unknown as OpenAIResponse;
    }

    // ============================================================
    // 8. 工具调用处理
    // ============================================================
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
        // 执行错误钩子
        await runtime.executeErrorHooks(requestContext, new Error(toolResult.error));
        return reply.status(toolResult.status).send({ error: toolResult.error });
      }
      result = toolResult.result;
    }

    // ============================================================
    // 9. 后处理
    // ============================================================
    // 截断检测处理
    const responseContent = result.choices?.[0]?.message?.content;
    if (truncationConfig?.enable && responseContent) {
      try {
        if (result.choices?.[0]?.message) {
          result.choices[0].message.content = stripTruncationSuffix(
            responseContent,
            truncationConfig.suffix
          );
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
        const promptTokens = estimateTokensFromMessages(updatedMessages);
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

    // 缓存结果
    if (cacheEnabled && cacheKey && runtime.cacheStore) {
      runtime.cacheStore.set(cacheKey, result as unknown as Record<string, unknown>);
    }

    // 记录统计
    if (parsedGroupId) {
      runtime.statsStore.recordCall(parsedGroupId.name, true);
    }

    // 执行 afterRequest 钩子
    await runtime.executeAfterRequestHooks(requestContext, result);

    // 记录请求完成日志
    const duration = Date.now() - requestContext.startTime;
    log.info({
      requestId: requestContext.requestId,
      model: requestedModelId,
      provider: provider.name,
      keyAlias: keyState.alias,
      group: parsedGroupId?.name,
      duration,
      usage,
      cached: false,
      finishReason: result.choices?.[0]?.finish_reason,
    }, "LLM request completed");

    // ============================================================
    // 10. 返回响应
    // ============================================================
    if (shouldRespondStream) {
      return sendStreamingResponse(reply, result, modelConfig.model);
    }

    return reply.send(result);
  } catch (err) {
    // 记录失败统计
    if (parsedGroupId) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
    }

    // 记录错误日志
    const duration = Date.now() - requestContext.startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error({
      requestId: requestContext.requestId,
      model: requestedModelId,
      provider: provider.name,
      keyAlias: keyState.alias,
      group: parsedGroupId?.name,
      duration,
      error: errorMessage,
    }, "LLM request failed");

    // 执行错误钩子
    await runtime.executeErrorHooks(requestContext, err as Error);
    throw err;
  }
}