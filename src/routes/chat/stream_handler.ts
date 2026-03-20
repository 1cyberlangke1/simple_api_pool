/**
 * 流式响应处理
 * @description 处理流式响应的发送和转发
 * @module routes/chat/stream_handler
 */

import type { FastifyReply } from "fastify";
import type { StreamChunk } from "../../core/openai_proxy.js";
import type { OpenAIResponse } from "./types.js";

/**
 * 设置流式响应头
 * @description 为 SSE 流式响应设置标准的 HTTP 头
 * @param reply Fastify reply 对象
 */
export function setStreamHeaders(reply: FastifyReply): void {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no");
}

/**
 * 发送流式响应
 * @description 将完整响应以流式格式发送给客户端
 * @param reply Fastify reply
 * @param result 完整响应结果
 * @param model 模型名
 */
export async function sendStreamingResponse(reply: FastifyReply, result: OpenAIResponse, model: string): Promise<void> {
  setStreamHeaders(reply);

  const message = result.choices?.[0]?.message ?? {};
  const id = result.id ?? "chatcmpl-proxy";
  const modelName = result.model ?? model;
  const created = result.created ?? Math.floor(Date.now() / 1000);

  // 发送角色
  reply.raw.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: modelName,
      choices: [{ delta: { role: "assistant" }, index: 0, finish_reason: null }],
    })}\n\n`
  );

  // 发送 message 中的所有字段（支持自定义字段如 reasoning_content）
  for (const [key, value] of Object.entries(message)) {
    if (key === "role") continue; // 角色已发送
    if (value === undefined || value === null) continue;

    if (key === "tool_calls" && Array.isArray(value)) {
      // 工具调用
      reply.raw.write(
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model: modelName,
          choices: [
            {
              delta: {
                tool_calls: value.map((tc) => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.function.name, arguments: tc.function.arguments },
                })),
              },
              index: 0,
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    } else {
      // 其他字段（content, reasoning_content 等）
      reply.raw.write(
        `data: ${JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model: modelName,
          choices: [{ delta: { [key]: value }, index: 0, finish_reason: null }],
        })}\n\n`
      );
    }
  }

  // 发送结束标记
  reply.raw.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: modelName,
      choices: [{ delta: {}, index: 0, finish_reason: result.choices?.[0]?.finish_reason ?? "stop" }],
    })}\n\n`
  );
  reply.raw.write("data: [DONE]\n\n");

  reply.raw.end();
}

/**
 * 流式响应转发结果
 */
export interface StreamForwardResult {
  success: boolean;
  /** 合并后的完整响应 */
  response: OpenAIResponse | null;
}

/**
 * 转发流式响应并收集完整响应
 * @description 转发上游流式响应给客户端，同时收集合并为完整响应用于缓存
 * @param reply Fastify reply
 * @param stream 流式响应迭代器
 * @param model 模型名（用于构建响应）
 * @returns 转发结果，包含完整响应（保留所有原始字段）
 */
export async function forwardStreamResponse(
  reply: FastifyReply,
  stream: AsyncGenerator<StreamChunk, void, unknown>,
  model: string
): Promise<StreamForwardResult> {
  setStreamHeaders(reply);

  // 收集响应数据 - 使用 Record 保留所有字段
  const response: Record<string, unknown> = {
    id: "",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "" } as Record<string, unknown>,
        finish_reason: null as string | null,
      },
    ],
  };

  // 收集 tool_calls（需要特殊处理增量合并）
  const toolCallsMap = new Map<string, Record<string, unknown>>();

  try {
    for await (const chunk of stream) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);

      // 合并所有顶级字段（保留自定义字段）
      for (const [key, value] of Object.entries(chunk)) {
        if (key === "choices") continue; // choices 单独处理
        if (value !== undefined && value !== null) {
          response[key] = value;
        }
      }

      // 处理 choices（增量合并）
      const choice = chunk.choices?.[0];
      if (choice) {
        // 合并 choice 级别的自定义字段
        for (const [key, value] of Object.entries(choice)) {
          if (key !== "delta" && key !== "finish_reason" && value !== undefined) {
            (response.choices as Record<string, unknown>[])[0][key] = value;
          }
        }

        // 处理 finish_reason
        if (choice.finish_reason) {
          (response.choices as Record<string, unknown>[])[0].finish_reason = choice.finish_reason;
        }

        // 处理 delta（增量合并到 message）
        const delta = choice.delta;
        if (delta) {
          const message = (response.choices as Record<string, unknown>[])[0].message as Record<string, unknown>;
          
          // 合并所有 delta 字段（保留自定义字段）
          for (const [key, value] of Object.entries(delta)) {
            if (key === "tool_calls" && Array.isArray(value)) {
              // tool_calls 需要增量合并
              for (const tc of value as Record<string, unknown>[]) {
                const id = tc.id as string;
                if (toolCallsMap.has(id)) {
                  const existing = toolCallsMap.get(id)!;
                  const func = existing.function as Record<string, unknown>;
                  const tcFunc = (tc.function as Record<string, unknown>) || {};
                  if (tcFunc.name) func.name = tcFunc.name;
                  if (tcFunc.arguments) {
                    func.arguments = (func.arguments as string) + (tcFunc.arguments as string);
                  }
                  // 合并 tool_call 的其他自定义字段
                  for (const [k, v] of Object.entries(tc)) {
                    if (k !== "function" && v !== undefined) {
                      existing[k] = v;
                    }
                  }
                } else {
                  toolCallsMap.set(id, {
                    id,
                    type: tc.type ?? "function",
                    function: {
                      name: (tc.function as Record<string, unknown>)?.name ?? "",
                      arguments: (tc.function as Record<string, unknown>)?.arguments ?? "",
                    },
                  });
                }
              }
              message.tool_calls = Array.from(toolCallsMap.values());
            } else if (typeof value === "string") {
              // 字符串字段增量累加（content, reasoning_content 等）
              const existing = message[key] as string | undefined;
              message[key] = (existing ?? "") + value;
            } else if (value !== undefined) {
              // 其他类型字段直接赋值
              message[key] = value;
            }
          }
        }
      }
    }

    reply.raw.write("data: [DONE]\n\n");

    // 确保必要字段存在
    if (!response.id) {
      response.id = `chatcmpl-${Date.now()}`;
    }

    // 清理空的 tool_calls
    const message = (response.choices as Record<string, unknown>[])[0].message as Record<string, unknown>;
    if (toolCallsMap.size === 0) {
      delete message.tool_calls;
    }

    return { success: true, response: response as unknown as OpenAIResponse };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Stream error";
    reply.raw.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    return { success: false, response: null };
  } finally {
    reply.raw.end();
  }
}