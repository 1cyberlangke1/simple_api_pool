/**
 * 工具调用处理
 * @description 处理工具调用的分类和执行
 * @module routes/chat/tool_handler
 */

import type { ToolRoutingStrategy, IToolLookup, IToolExecutor, IToolRegistry } from "../../core/types.js";
import { callChatCompletion } from "../../core/openai_proxy.js";
import type { OpenAIResponse } from "./types.js";

/**
 * 工具调用项
 */
export interface ToolCallItem {
  id: string;
  name: string;
  args: unknown;
}

/**
 * 工具调用分类结果
 */
export interface ToolCallClassification {
  /** 本地工具调用 */
  local: Array<ToolCallItem>;
  /** 下游工具调用（未命中本地工具） */
  downstream: Array<ToolCallItem>;
}

/**
 * 分类工具调用
 * @param toolCalls 工具调用列表
 * @param toolRegistry 工具注册表（只需查询能力）
 * @returns 分类结果
 */
export function classifyToolCalls(
  toolCalls: Array<{ id: string; type: string; function: { name: string; arguments?: string } }>,
  toolRegistry: IToolLookup
): ToolCallClassification {
  const local: Array<ToolCallItem> = [];
  const downstream: Array<ToolCallItem> = [];

  for (const call of toolCalls) {
    const name = call.function.name;
    const argsRaw = call.function.arguments ?? "{}";
    
    // 安全解析 JSON 参数，处理格式错误的情况
    let args: unknown;
    try {
      args = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
    } catch {
      // JSON 格式错误，使用原始字符串作为参数
      args = { raw: argsRaw };
    }

    if (toolRegistry.has(name)) {
      local.push({ id: call.id, name, args });
    } else {
      downstream.push({ id: call.id, name, args });
    }
  }

  return { local, downstream };
}

/**
 * 执行本地工具调用并返回工具消息
 * @param localCalls 本地工具调用列表
 * @param toolRegistry 工具注册表（只需执行能力）
 * @returns 工具消息列表
 */
export async function executeLocalTools(
  localCalls: Array<ToolCallItem>,
  toolRegistry: IToolExecutor
): Promise<Array<{ role: string; tool_call_id: string; content: string }>> {
  const toolMessages: Array<{ role: string; tool_call_id: string; content: string }> = [];

  for (const call of localCalls) {
    try {
      const toolResult = await toolRegistry.call(call.name, call.args);
      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult ?? {}),
      });
    } catch (err) {
      toolMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({ error: String(err) }),
      });
    }
  }

  return toolMessages;
}

/**
 * 工具调用处理上下文
 */
export interface ToolHandlerContext {
  result: OpenAIResponse;
  updatedMessages: Array<{ role: string; content: unknown }>;
  finalBody: Record<string, unknown>;
  provider: { name: string; baseUrl: string };
  key: string;
  /** 工具注册表（需要查询和执行能力） */
  toolRegistry: IToolRegistry;
  toolRoutingStrategy: ToolRoutingStrategy;
  requestTools: unknown[] | undefined;
}

/**
 * 处理工具调用
 * @description 根据工具路由策略处理工具调用
 * @param context 工具调用处理上下文
 * @returns 处理后的响应结果或错误响应
 */
export async function handleToolCalls(
  context: ToolHandlerContext
): Promise<{ result: OpenAIResponse } | { error: string; status: number }> {
  const { result, toolRegistry, toolRoutingStrategy, requestTools: _requestTools } = context;
  const toolCalls = result.choices?.[0]?.message?.tool_calls;

  // 没有工具调用，直接返回
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return { result };
  }

  // 分类工具调用
  const classification = classifyToolCalls(toolCalls, toolRegistry);

  // 根据策略处理
  if (toolRoutingStrategy === "passthrough") {
    // passthrough: 直接返回，不处理工具调用
    return { result };
  }

  if (toolRoutingStrategy === "local_only") {
    // local_only: 仅使用本地工具
    if (classification.downstream.length > 0) {
      const missingTools = classification.downstream.map((t) => t.name).join(", ");
      return { error: `Tool(s) not found in local registry: ${missingTools}`, status: 400 };
    }

    // 执行本地工具调用
    if (classification.local.length > 0) {
      const newResult = await executeAndFollowUp(classification.local, context);
      return { result: newResult };
    }

    return { result };
  }

  // local_first: 优先使用本地工具，未命中的传递给下游
  if (classification.local.length > 0) {
    const newResult = await executeAndFollowUp(classification.local, context);
    return { result: newResult };
  }

  return { result };
}

/**
 * 执行本地工具并发起后续请求
 * @param localCalls 本地工具调用列表
 * @param context 处理上下文
 * @returns 新的响应结果
 */
async function executeAndFollowUp(
  localCalls: Array<ToolCallItem>,
  context: ToolHandlerContext
): Promise<OpenAIResponse> {
  const { result, updatedMessages, finalBody, provider, key, toolRegistry } = context;

  // 执行本地工具
  const toolMessages = await executeLocalTools(localCalls, toolRegistry);

  // 构建后续请求
  const assistantMessage = result.choices?.[0]?.message;
  const followUpBody: Record<string, unknown> = {
    ...finalBody,
    messages: [...updatedMessages, ...(assistantMessage ? [assistantMessage, ...toolMessages] : toolMessages)],
  };

  return (await callChatCompletion(provider, key, followUpBody)) as unknown as OpenAIResponse;
}
