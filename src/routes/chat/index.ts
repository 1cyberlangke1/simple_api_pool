/**
 * Chat Completion 路由入口
 * @description 处理 /v1/chat/completions 请求，支持流式响应、工具调用、缓存、故障转移等
 * @module routes/chat
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import type { StreamMode } from "../../core/types.js";
import type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
import { decideStreamMode } from "./types.js";
import { parseGroupId } from "./feature_flags.js";
import { executeSingleModelRequest } from "./request_executor.js";
import { createModuleLogger } from "../../core/logger.js";

const log = createModuleLogger("chat");

// 导出类型供外部使用
export type { ChatCompletionBody, OpenAIResponse, UsageInfo } from "./types.js";
export type { GroupFeatures } from "./feature_flags.js";
export type { ToolCallClassification, ToolCallItem } from "./tool_handler.js";

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
  const groupConfig = runtime.modelRegistry.getGroup(`group/${parsedGroupId.name}`);

  if (!groupConfig) {
    runtime.statsStore.recordCall(parsedGroupId.name, false);
    return reply.status(400).send({ error: "group not found" });
  }

  // 检查是否启用故障转移策略
  const failoverEnabled = groupConfig.strategy === "failover";

  if (!failoverEnabled) {
    // 非故障转移模式，使用原有策略选择路由
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