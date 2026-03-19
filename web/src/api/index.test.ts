/**
 * API 模块测试
 * @description 测试聊天 API 调用逻辑
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { sendChatRequest, sendChatStreamRequest, CHAT_API_ENDPOINT } from "./index";

// Mock server
const server = setupServer();

beforeEach(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
  server.close();
});

describe("Chat API", () => {
  describe("CHAT_API_ENDPOINT", () => {
    it("should be /v1/chat/completions (not /admin/api)", () => {
      // 确保 API 端点是 /v1/chat/completions，不是 /admin/api/v1/chat/completions
      expect(CHAT_API_ENDPOINT).toBe("/v1/chat/completions");
      expect(CHAT_API_ENDPOINT).not.toContain("/admin");
    });
  });

  describe("sendChatRequest", () => {
    it("should call /v1/chat/completions endpoint", async () => {
      let calledUrl = "";
      
      server.use(
        http.post("/v1/chat/completions", ({ request }) => {
          calledUrl = new URL(request.url).pathname;
          return HttpResponse.json({
            id: "test-id",
            object: "chat.completion",
            created: 1234567890,
            model: "gpt-4",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Hello!" },
                finish_reason: "stop",
              },
            ],
          });
        })
      );

      const result = await sendChatRequest({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(calledUrl).toBe("/v1/chat/completions");
      expect(result.choices[0].message.content).toBe("Hello!");
    });

    it("should throw error on failed request", async () => {
      server.use(
        http.post("/v1/chat/completions", () => {
          return new HttpResponse(
            JSON.stringify({ error: "Model not found" }),
            { status: 404 }
          );
        })
      );

      await expect(
        sendChatRequest({
          model: "invalid-model",
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow("Model not found");
    });

    it("should send correct request body", async () => {
      let receivedBody: Record<string, unknown> | null = null;
      
      server.use(
        http.post("/v1/chat/completions", async ({ request }) => {
          receivedBody = await request.json() as Record<string, unknown>;
          return HttpResponse.json({
            id: "test-id",
            object: "chat.completion",
            created: 1234567890,
            model: "gpt-4",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "OK" },
                finish_reason: "stop",
              },
            ],
          });
        })
      );

      await sendChatRequest({
        model: "test-model",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        max_tokens: 100,
      });

      expect(receivedBody).toEqual({
        model: "test-model",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.7,
        max_tokens: 100,
      });
    });
  });

  describe("sendChatStreamRequest", () => {
    it("should call /v1/chat/completions endpoint for streaming", async () => {
      let calledUrl = "";
      
      server.use(
        http.post("/v1/chat/completions", ({ request }) => {
          calledUrl = new URL(request.url).pathname;
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            },
          });
          return new HttpResponse(stream, {
            headers: { "Content-Type": "text/event-stream" },
          });
        })
      );

      const reader = await sendChatStreamRequest({
        model: "test-model",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      });

      expect(calledUrl).toBe("/v1/chat/completions");
      expect(reader).toBeDefined();
      
      // 清理 reader
      reader.cancel();
    });

    it("should throw error on failed stream request", async () => {
      server.use(
        http.post("/v1/chat/completions", () => {
          return new HttpResponse(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401 }
          );
        })
      );

      await expect(
        sendChatStreamRequest({
          model: "test-model",
          messages: [{ role: "user", content: "Hi" }],
          stream: true,
        })
      ).rejects.toThrow("Unauthorized");
    });
  });
});
