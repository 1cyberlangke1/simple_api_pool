import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  setStreamHeaders,
  sendStreamingResponse,
  forwardStreamResponse,
} from "../src/routes/chat/stream_handler.js";
import type { OpenAIResponse } from "../src/routes/chat/types.js";
import type { StreamChunk } from "../src/core/openai_proxy.js";

/**
 * 流式响应处理单元测试
 * @description 测试流式响应的发送和转发功能
 */

// Mock FastifyReply
function createMockReply() {
  const headers: Record<string, string> = {};
  const writes: string[] = [];
  let endedState = false;

  const mockReply = {
    raw: {
      setHeader: vi.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      write: vi.fn((data: string) => {
        writes.push(data);
        return true;
      }),
      end: vi.fn(() => {
        endedState = true;
      }),
    },
    headers,
    writes,
    get ended() {
      return endedState;
    },
  };

  return mockReply;
}

describe("stream_handler", () => {
  describe("setStreamHeaders", () => {
    it("should set SSE headers", () => {
      const reply = createMockReply();

      setStreamHeaders(reply as any);

      expect(reply.raw.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
      expect(reply.raw.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
      expect(reply.raw.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
      expect(reply.raw.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    });
  });

  describe("sendStreamingResponse", () => {
    it("should send streaming response with content", async () => {
      const reply = createMockReply();
      const result: OpenAIResponse = {
        id: "test-id",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello, world!" },
            finish_reason: "stop",
          },
        ],
      };

      await sendStreamingResponse(reply as any, result, "gpt-4");

      // 应该发送了多个 chunk
      expect(reply.writes.length).toBeGreaterThan(2);

      // 最后应该是 [DONE]
      expect(reply.writes[reply.writes.length - 1]).toBe("data: [DONE]\n\n");

      // 应该调用了 end
      expect(reply.ended).toBe(true);

      // 检查内容 chunk
      const contentWrite = reply.writes.find((w) => w.includes("Hello, world!"));
      expect(contentWrite).toBeDefined();
    });

    it("should handle empty content", async () => {
      const reply = createMockReply();
      const result: OpenAIResponse = {
        id: "test-id",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "" },
            finish_reason: "stop",
          },
        ],
      };

      await sendStreamingResponse(reply as any, result, "gpt-4");

      expect(reply.ended).toBe(true);
      expect(reply.writes[reply.writes.length - 1]).toBe("data: [DONE]\n\n");
    });

    it("should send tool calls in response", async () => {
      const reply = createMockReply();
      const result: OpenAIResponse = {
        id: "test-id",
        object: "chat.completion",
        created: 1234567890,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "get_weather", arguments: '{"city":"NY"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      await sendStreamingResponse(reply as any, result, "gpt-4");

      // 检查工具调用 chunk
      const toolCallWrite = reply.writes.find((w) => w.includes("tool_calls"));
      expect(toolCallWrite).toBeDefined();
      expect(toolCallWrite).toContain("get_weather");
    });

    it("should handle missing id and use default", async () => {
      const reply = createMockReply();
      const result: OpenAIResponse = {
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "test" },
            finish_reason: "stop",
          },
        ],
      };

      await sendStreamingResponse(reply as any, result, "gpt-4");

      const roleChunk = reply.writes.find((w) => w.includes("chatcmpl-proxy"));
      expect(roleChunk).toBeDefined();
    });

    it("should use provided model name when result.model is missing", async () => {
      const reply = createMockReply();
      const result: OpenAIResponse = {
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "test" },
            finish_reason: "stop",
          },
        ],
      };

      await sendStreamingResponse(reply as any, result, "custom-model");

      const modelChunk = reply.writes.find((w) => w.includes("custom-model"));
      expect(modelChunk).toBeDefined();
    });

    it("should send multiple tool calls", async () => {
      const reply = createMockReply();
      const result: OpenAIResponse = {
        id: "test-id",
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "get_weather", arguments: "{}" },
                },
                {
                  id: "call-2",
                  type: "function",
                  function: { name: "search_web", arguments: "{}" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      };

      await sendStreamingResponse(reply as any, result, "gpt-4");

      const toolCallWrite = reply.writes.find((w) => w.includes("tool_calls"));
      expect(toolCallWrite).toContain("get_weather");
      expect(toolCallWrite).toContain("search_web");
    });
  });

  describe("forwardStreamResponse", () => {
    it("should forward stream chunks", async () => {
      const reply = createMockReply();

      async function* mockStream(): AsyncGenerator<StreamChunk, void, unknown> {
        yield {
          id: "chunk-1",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }],
        };
        yield {
          id: "chunk-1",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }],
        };
        yield {
          id: "chunk-1",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
      }

      await forwardStreamResponse(reply as any, mockStream());

      expect(reply.writes).toHaveLength(4); // 3 chunks + [DONE]
      expect(reply.writes[reply.writes.length - 1]).toBe("data: [DONE]\n\n");
      expect(reply.ended).toBe(true);
    });

    it("should handle empty stream", async () => {
      const reply = createMockReply();

      async function* emptyStream(): AsyncGenerator<StreamChunk, void, unknown> {
        // no chunks
      }

      await forwardStreamResponse(reply as any, emptyStream());

      expect(reply.writes).toHaveLength(1); // only [DONE]
      expect(reply.writes[0]).toBe("data: [DONE]\n\n");
      expect(reply.ended).toBe(true);
    });

    it("should forward tool calls in stream", async () => {
      const reply = createMockReply();

      async function* mockStream(): AsyncGenerator<StreamChunk, void, unknown> {
        yield {
          id: "chunk-1",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    id: "tc-1",
                    type: "function",
                    function: { name: "test", arguments: "{}" },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
      }

      await forwardStreamResponse(reply as any, mockStream());

      const toolCallWrite = reply.writes.find((w) => w.includes("tool_calls"));
      expect(toolCallWrite).toBeDefined();
    });

    it("should handle usage in final chunk", async () => {
      const reply = createMockReply();

      async function* mockStream(): AsyncGenerator<StreamChunk, void, unknown> {
        yield {
          id: "chunk-1",
          object: "chat.completion.chunk",
          created: 1234567890,
          model: "gpt-4",
          choices: [{ index: 0, delta: { content: "test" }, finish_reason: null }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };
      }

      await forwardStreamResponse(reply as any, mockStream());

      const usageWrite = reply.writes.find((w) => w.includes("total_tokens"));
      expect(usageWrite).toBeDefined();
    });
  });
});

// ============================================================
// 边界条件测试
// ============================================================

describe("stream_handler edge cases", () => {
  it("should handle very long content", async () => {
    const reply = createMockReply();
    const longContent = "A".repeat(100000);
    const result: OpenAIResponse = {
      id: "test-id",
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: longContent },
          finish_reason: "stop",
        },
      ],
    };

    await sendStreamingResponse(reply as any, result, "gpt-4");

    const contentWrite = reply.writes.find((w) => w.includes("A".repeat(100)));
    expect(contentWrite).toBeDefined();
  });

  it("should handle unicode content", async () => {
    const reply = createMockReply();
    const unicodeContent = "中文 日本語 한국어 emoji 🚀🎉🔥";
    const result: OpenAIResponse = {
      id: "test-id",
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: unicodeContent },
          finish_reason: "stop",
        },
      ],
    };

    await sendStreamingResponse(reply as any, result, "gpt-4");

    const contentWrite = reply.writes.find((w) => w.includes("中文"));
    expect(contentWrite).toBeDefined();
    expect(contentWrite).toContain("🚀");
  });

  it("should handle special characters in content", async () => {
    const reply = createMockReply();
    const specialContent = 'Line1\nLine2\tTab"Quote\'Apostrophe\\Backslash';
    const result: OpenAIResponse = {
      id: "test-id",
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: specialContent },
          finish_reason: "stop",
        },
      ],
    };

    await sendStreamingResponse(reply as any, result, "gpt-4");

    // 应该正确 JSON 转义
    const contentWrite = reply.writes.find((w) => w.includes("Line1"));
    expect(contentWrite).toBeDefined();
  });

  it("should handle null message gracefully", async () => {
    const reply = createMockReply();
    const result: OpenAIResponse = {
      id: "test-id",
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: null as any,
          finish_reason: "stop",
        },
      ],
    };

    await sendStreamingResponse(reply as any, result, "gpt-4");

    // 即使 message 为 null，也应该发送响应并结束
    expect(reply.writes.length).toBeGreaterThan(0);
    expect(reply.writes[reply.writes.length - 1]).toBe("data: [DONE]\n\n");
  });

  it("should handle empty choices array", async () => {
    const reply = createMockReply();
    const result: OpenAIResponse = {
      id: "test-id",
      model: "gpt-4",
      choices: [],
    };

    await sendStreamingResponse(reply as any, result, "gpt-4");

    expect(reply.ended).toBe(true);
  });

  it("should handle multiple choices (only first used)", async () => {
    const reply = createMockReply();
    const result: OpenAIResponse = {
      id: "test-id",
      model: "gpt-4",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "First" },
          finish_reason: "stop",
        },
        {
          index: 1,
          message: { role: "assistant", content: "Second" },
          finish_reason: "stop",
        },
      ],
    };

    await sendStreamingResponse(reply as any, result, "gpt-4");

    const firstWrite = reply.writes.find((w) => w.includes("First"));
    const secondWrite = reply.writes.find((w) => w.includes("Second"));
    expect(firstWrite).toBeDefined();
    expect(secondWrite).toBeUndefined();
  });
});
