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
 * @description 将非流式响应转换为流式格式发送（伪流式），一次性发送全部内容
 * @param reply Fastify reply
 * @param result 响应结果
 * @param model 模型名
 */
export async function sendStreamingResponse(reply: FastifyReply, result: OpenAIResponse, model: string): Promise<void> {
  setStreamHeaders(reply);

  const content = result.choices?.[0]?.message?.content ?? "";
  const toolCalls = result.choices?.[0]?.message?.tool_calls;
  const id = result.id ?? "chatcmpl-proxy";
  const modelName = result.model ?? model;
  const created = Math.floor(Date.now() / 1000);

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

  // 一次性发送全部内容
  if (content) {
    reply.raw.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: modelName,
        choices: [{ delta: { content }, index: 0, finish_reason: null }],
      })}\n\n`
    );
  }

  // 发送工具调用（如果有）
  if (toolCalls && toolCalls.length > 0) {
    reply.raw.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model: modelName,
        choices: [
          {
            delta: {
              tool_calls: toolCalls.map((tc) => ({
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
  }

  // 发送结束标记
  reply.raw.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model: modelName,
      choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
    })}\n\n`
  );
  reply.raw.write("data: [DONE]\n\n");

  reply.raw.end();
}

/**
 * 转发流式响应
 * @description 直接转发上游流式响应给客户端
 * @param reply Fastify reply
 * @param stream 流式响应迭代器
 * @returns 是否成功完成（无错误）
 */
export async function forwardStreamResponse(reply: FastifyReply, stream: AsyncGenerator<StreamChunk, void, unknown>): Promise<boolean> {
  setStreamHeaders(reply);

  try {
    for await (const chunk of stream) {
      reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    reply.raw.write("data: [DONE]\n\n");
    return true;
  } catch (error) {
    // 发送错误信息给客户端
    const errorMessage = error instanceof Error ? error.message : "Stream error";
    reply.raw.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    return false;
  } finally {
    // 确保连接始终被关闭
    reply.raw.end();
  }
}