/**
 * Chat Completion 路由入口
 * @description 处理 /v1/chat/completions 请求，支持流式响应、工具调用、缓存、故障转移等
 * @module routes/chat
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { StreamMode, RequestContext, GroupRouteConfig, KeyState, ProviderConfig, ModelConfig } from "../../core/types.js";
import type { AppRuntime } from "../../app_state.js";
import { applyOverrides, callChatCompletion, callChatCompletionStream, collectStreamToNonStream } from "../../core/openai_proxy.js";
import { estimateTokensFromMessages, estimateTokensFromString } from "../../core/usage.js";
import { injectSystemPrompt } from "../../core/system_prompt.js";
import { addTruncationPrompt, stripTruncationSuffix } from "../../core/truncation.js";
import { getGroupFeatures, parseGroupId } from "./feature_flags.js";
import { handleToolCalls } from "./tool_handler.js";
import { sendStreamingResponse, forwardStreamResponse } from "./stream_handler.js";
import type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
import { decideStreamMode } from "./types.js";
import { UpstreamError, getErrorStatusCode } from "../../core/errors.js";
import { randomUUID } from "crypto";
import { createModuleLogger } from "../../core/logger.js";

const log = createModuleLogger("chat");

// 导出类型供外部使用
export type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
export type { GroupFeatures } from "./feature_flags.js";
export type { ToolCallClassification, ToolCallItem } from "./tool_handler.js";

/**
 * 单次模型请求执行参数
 */
interface SingleRequestParams {
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
interface SingleRequestResult {
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
async function executeSingleModelRequest(params: SingleRequestParams): Promise<SingleRequestResult> {
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

  // 从请求体中提取工具名称（前端可能只传名称）
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
    stream: shouldRequestStream,  // 根据流式模式决策设置 stream，而非客户端原始值
  };

  // 使用完整工具定义替换请求体中的简化格式
  if (openAiTools && openAiTools.length > 0) {
    baseBody.tools = openAiTools;
  } else if (Array.isArray(body.tools) && body.tools.length > 0) {
    // 如果本地没有工具定义，保留原始请求（传递给下游）
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

  // 缓存检查（故障转移时不使用缓存）
  const cacheEnabled = !isFailoverAttempt && parsedGroupId?.name && features.cache?.enable && body.cache !== false;
  let cacheKey: string | null = null;

  if (cacheEnabled && parsedGroupId?.name) {
    // 确保分组已注册到缓存管理器
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
        const cachedContent = cachedResponse.choices?.[0]?.message?.content ?? "";
        const cachedId = cachedResponse.id ?? `cache-${Date.now()}`;
        const cachedModel = cachedResponse.model ?? finalBody.model as string;

        // 发送 SSE 流式响应
        reply.raw.setHeader("Content-Type", "text/event-stream");
        reply.raw.setHeader("Cache-Control", "no-cache");
        reply.raw.setHeader("Connection", "keep-alive");

        // 第一个 chunk：包含 role 和 content 开头
        reply.raw.write(`data: ${JSON.stringify({
          id: cachedId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: cachedModel,
          choices: [{ index: 0, delta: { role: "assistant", content: cachedContent }, finish_reason: null }]
        })}\n\n`);

        // 第二个 chunk：结束标记
        reply.raw.write(`data: ${JSON.stringify({
          id: cachedId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: cachedModel,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: cachedUsage ? {
            ...cachedUsage,
            cached_tokens: cachedUsage.total_tokens,
          } : undefined
        })}\n\n`);

        reply.raw.write("data: [DONE]\n\n");
        reply.raw.end();

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

  runtime.eventEmitter.emit("request:start", {
    requestId: requestContext.requestId,
    model: requestedModelId,
    provider: provider.name,
    group: parsedGroupId?.name,
    failoverAttempt: isFailoverAttempt,
  });

  runtime.eventEmitter.emit("request:cache:miss", {
    model: requestedModelId,
    provider: provider.name,
    group: parsedGroupId?.name,
  });

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
      const stream = callChatCompletionStream(provider, keyState.key, finalBody);
      const result = await forwardStreamResponse(reply, stream, modelConfig.model);

      if (result.success && result.response && cacheEnabled && cacheKey && parsedGroupId?.name) {
        const responseContent = result.response.choices?.[0]?.message?.content ?? "";
        let cacheUsage: UsageInfo;

        if (result.response.usage) {
          cacheUsage = {
            prompt_tokens: result.response.usage.prompt_tokens,
            completion_tokens: result.response.usage.completion_tokens,
            total_tokens: result.response.usage.total_tokens,
          };
        } else {
          const promptTokens = estimateTokensFromMessages(updatedMessages);
          const completionTokens = estimateTokensFromString(responseContent, modelConfig.model);
          cacheUsage = {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          };
        }

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

    // 非流式请求
    let result: OpenAIResponse;
    if (shouldRequestStream && !shouldRespondStream) {
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
    if (cacheEnabled && cacheKey && parsedGroupId?.name) {
      let cacheUsage: UsageInfo;

      if (result.usage) {
        cacheUsage = {
          prompt_tokens: result.usage.prompt_tokens,
          completion_tokens: result.usage.completion_tokens,
          total_tokens: result.usage.total_tokens,
        };
      } else {
        const promptTokens = estimateTokensFromMessages(updatedMessages);
        const completionTokens = responseContent ? estimateTokensFromString(responseContent, modelConfig.model) : 1;
        cacheUsage = {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        };
      }

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
      stream: shouldRespondStream,
      usage,
    });

    await runtime.executeAfterRequestHooks(requestContext, result);

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

    return { success: true, response: result, usage };
  } catch (err) {
    const duration = Date.now() - requestContext.startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    const statusCode = getErrorStatusCode(err);

    log.error({
      requestId: requestContext.requestId,
      model: requestedModelId,
      provider: provider.name,
      keyAlias: keyState.alias,
      group: parsedGroupId?.name,
      duration,
      error: errorMessage,
    }, "LLM request failed");

    runtime.eventEmitter.emit("request:error", {
      requestId: requestContext.requestId,
      model: requestedModelId,
      provider: provider.name,
      group: parsedGroupId?.name,
      error: errorMessage,
    });

    await runtime.executeErrorHooks(requestContext, err as Error);

    return { success: false, error: errorMessage, statusCode };
  }
}

/**
 * Chat Completion 处理器
 * @description 处理 /v1/chat/completions 请求，支持故障转移
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

  // 检查是否为分组模型
  const isGroup = runtime.modelRegistry.isGroup(requestedModelId);

  if (!isGroup) {
    // 非分组模型，直接执行单次请求
    const result = await executeSingleModelRequest({
      targetModelId: requestedModelId,
      requestedModelId,
      parsedGroupId: null,
      body,
      runtime,
      reply,
    });

    if (!result.success) {
      return reply.status(result.statusCode ?? 500).send({ error: result.error });
    }

    // 缓存命中时直接发送响应（非流式）
    if (result.fromCache && result.response && !reply.sent) {
      return reply.send(result.response);
    }

    // 检查是否已发送流式响应
    if (result.response) {
      const provider = runtime.modelRegistry.getProvider(requestedModelId.split("/")[0] ?? "");
      const streamMode: StreamMode = provider?.streamMode ?? "none";
      const clientWantsStream = body.stream === true;
      const { shouldRespondStream } = decideStreamMode(streamMode, clientWantsStream);

      if (!shouldRespondStream && !reply.sent) {
        return reply.send(result.response);
      }
    }
    return;
  }

  // ============================================================
  // 2. 分组模型处理
  // ============================================================
  const parsedGroupId = parseGroupId(requestedModelId);
  // getGroup 期望格式为 group/{name} 或纯分组名
  const groupConfig = runtime.modelRegistry.getGroup(`group/${parsedGroupId.name}`);

  if (!groupConfig) {
    runtime.statsStore.recordCall(parsedGroupId.name, false);
    return reply.status(400).send({ error: "group not found" });
  }

  // 检查是否启用故障转移策略
  const failoverEnabled = groupConfig.strategy === "failover";

  if (!failoverEnabled) {
    // 非故障转移模式，使用原有策略选择路由
    // pickGroupRoute 期望格式为 group/{name} 或纯分组名
    const route = runtime.modelRegistry.pickGroupRoute(`group/${parsedGroupId.name}`);
    if (!route) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
      return reply.status(400).send({ error: "group route not found" });
    }

    const result = await executeSingleModelRequest({
      targetModelId: route.modelId,
      routeTemperature: route.temperature,
      requestedModelId,
      parsedGroupId,
      body,
      runtime,
      reply,
    });

    if (!result.success) {
      runtime.statsStore.recordCall(parsedGroupId.name, false);
      return reply.status(result.statusCode ?? 500).send({ error: result.error });
    }

    runtime.statsStore.recordCall(parsedGroupId.name, true);

    // 缓存命中时直接发送响应
    if (result.fromCache && result.response && !reply.sent) {
      return reply.send(result.response);
    }

    if (result.response && !reply.sent) {
      const modelConfig = runtime.modelRegistry.getModel(route.modelId);
      if (modelConfig) {
        const provider = runtime.modelRegistry.getProvider(modelConfig.provider);
        const streamMode: StreamMode = provider?.streamMode ?? "none";
        const clientWantsStream = body.stream === true;
        const { shouldRespondStream } = decideStreamMode(streamMode, clientWantsStream);

        if (!shouldRespondStream) {
          return reply.send(result.response);
        }
      }
    }
    return;
  }

  // ============================================================
  // 3. 故障转移策略处理
  // ============================================================
  const routes = runtime.modelRegistry.getGroupRoutes(`group/${parsedGroupId.name}`);
  if (routes.length === 0) {
    runtime.statsStore.recordCall(parsedGroupId.name, false);
    return reply.status(400).send({ error: "group has no routes" });
  }

  // 故障转移：按顺序尝试所有路由，失败时切换到下一个
  const errors: string[] = [];

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const isFailoverAttempt = i > 0;

    log.info({
      model: requestedModelId,
      targetRoute: route.modelId,
      attemptIndex: i,
      totalRoutes: routes.length,
      isFailoverAttempt,
    }, "Failover attempt");

    const result = await executeSingleModelRequest({
      targetModelId: route.modelId,
      routeTemperature: route.temperature,
      requestedModelId,
      parsedGroupId,
      body,
      runtime,
      reply,
      isFailoverAttempt,
    });

    if (result.success) {
      runtime.statsStore.recordCall(parsedGroupId.name, true);

      // 缓存命中时直接发送响应
      if (result.fromCache && result.response && !reply.sent) {
        return reply.send(result.response);
      }

      if (result.response && !reply.sent) {
        const modelConfig = runtime.modelRegistry.getModel(route.modelId);
        if (modelConfig) {
          const provider = runtime.modelRegistry.getProvider(modelConfig.provider);
          const streamMode: StreamMode = provider?.streamMode ?? "none";
          const clientWantsStream = body.stream === true;
          const { shouldRespondStream } = decideStreamMode(streamMode, clientWantsStream);

          if (!shouldRespondStream) {
            return reply.send(result.response);
          }
        }
      }
      return;
    }

    errors.push(`${route.modelId}: ${result.error}`);

    // 如果不是最后一次尝试，继续下一个模型
    if (i < routes.length - 1) {
      log.warn({
        model: requestedModelId,
        failedRoute: route.modelId,
        error: result.error,
        nextAttempt: i + 1,
      }, "Failover: route failed, trying next");
    }
  }

  // 所有尝试都失败
  runtime.statsStore.recordCall(parsedGroupId.name, false);

  log.error({
    model: requestedModelId,
    attempts: routes.length,
    errors,
  }, "Failover: all routes failed");

  return reply.status(500).send({
    error: "all routes failed",
    details: errors,
  });
}
