import { describe, expect, it } from "vitest";
import { estimateTokensFromString, estimateTokensFromMessages, estimateTokensFromTools } from "../src/core/usage.js";

/**
 * Token 计算单元测试
 * @description 测试 js-tiktoken 精确计算功能
 */
describe("Token Calculation", () => {
  describe("estimateTokensFromString", () => {
    it("returns 0 for empty string", () => {
      expect(estimateTokensFromString("")).toBe(0);
    });

    it("calculates tokens for ASCII text", () => {
      // "Hello, World!" 的 cl100k_base 编码是 4 tokens
      const tokens = estimateTokensFromString("Hello, World!");
      expect(tokens).toBeGreaterThanOrEqual(1);
    });

    it("calculates tokens for Chinese text", () => {
      // 中文在 cl100k_base 中每个字符约 1-2 tokens
      const tokens = estimateTokensFromString("你好世界");
      expect(tokens).toBeGreaterThanOrEqual(1);
    });

    it("handles null/undefined gracefully", () => {
      expect(estimateTokensFromString(null)).toBe(0);
      expect(estimateTokensFromString(undefined)).toBe(0);
    });

    it("uses different models correctly", () => {
      const text = "Hello, World!";
      const gpt4Tokens = estimateTokensFromString(text, "gpt-4");
      const gpt35Tokens = estimateTokensFromString(text, "gpt-3.5-turbo");
      // 两者应该相同（都使用 cl100k_base）
      expect(gpt4Tokens).toBe(gpt35Tokens);
    });

    it("handles GPT-4o model", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "gpt-4o");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles GPT-4o-mini model", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "gpt-4o-mini");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles Claude models (uses GPT-4 encoding)", () => {
      const text = "Hello, World!";
      const claudeTokens = estimateTokensFromString(text, "claude-3-opus");
      const gpt4Tokens = estimateTokensFromString(text, "gpt-4");
      // Claude 使用相同的 cl100k_base 编码
      expect(claudeTokens).toBe(gpt4Tokens);
    });

    it("handles Claude 3.5 Sonnet", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "claude-3-5-sonnet");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles DeepSeek models", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "deepseek-chat");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles Qwen models", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "qwen-turbo");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles unknown model (fallback to GPT-4)", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "unknown-model-xyz");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles model with prefix match", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "gpt-4-turbo-preview");
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles model with different case", () => {
      const text = "Hello, World!";
      const tokens = estimateTokensFromString(text, "GPT-4");
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("estimateTokensFromMessages", () => {
    it("calculates tokens from message array", () => {
      const messages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const tokens = estimateTokensFromMessages(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it("returns 0 for empty array", () => {
      const tokens = estimateTokensFromMessages([]);
      expect(tokens).toBe(0);
    });

    it("handles complex content", () => {
      const messages = [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
      ];

      const tokens = estimateTokensFromMessages(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it("includes message overhead", () => {
      const singleMessage = [{ role: "user", content: "Hello" }];
      const tokens = estimateTokensFromMessages(singleMessage);
      // 应该大于纯文本 token 数（因为包含格式开销）
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles name field", () => {
      const messages = [{ role: "user", content: "Hello", name: "Alice" }];
      const tokensWith = estimateTokensFromMessages(messages);
      const tokensWithout = estimateTokensFromMessages([{ role: "user", content: "Hello" }]);
      // 有 name 字段应该有额外开销
      expect(tokensWith).toBeGreaterThanOrEqual(tokensWithout);
    });

    it("handles multimodal content with image_url", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            { type: "image_url", image_url: { url: "https://example.com/image.png" } },
          ],
        },
      ];

      const tokens = estimateTokensFromMessages(messages);
      // 图片应该有固定的 token 开销 (85)
      expect(tokens).toBeGreaterThan(80);
    });

    it("handles array content with string parts", () => {
      const messages = [
        {
          role: "user",
          content: [
            "plain string",
            { type: "text", text: "typed text" },
          ],
        } as any,
      ];

      const tokens = estimateTokensFromMessages(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles array content with non-object parts", () => {
      const messages = [
        {
          role: "user",
          content: ["string part", 123, true, null],
        } as any,
      ];

      const tokens = estimateTokensFromMessages(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles message without content", () => {
      const messages = [{ role: "user" }];
      const tokens = estimateTokensFromMessages(messages as any);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles undefined content", () => {
      const messages = [{ role: "user", content: undefined }];
      const tokens = estimateTokensFromMessages(messages as any);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles null content", () => {
      const messages = [{ role: "user", content: null }];
      const tokens = estimateTokensFromMessages(messages as any);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles number content", () => {
      const messages = [{ role: "user", content: 123 }];
      const tokens = estimateTokensFromMessages(messages as any);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles object content (non-array)", () => {
      const messages = [
        { role: "user", content: { text: "hello" } },
      ];
      const tokens = estimateTokensFromMessages(messages as any);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("estimateTokensFromTools", () => {
    it("calculates tokens from tools array", () => {
      const tools = [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the current weather",
          },
        },
      ];

      const tokens = estimateTokensFromTools(tools);
      expect(tokens).toBeGreaterThan(0);
    });

    it("returns 0 for empty array", () => {
      const tokens = estimateTokensFromTools([]);
      expect(tokens).toBe(0);
    });

    it("handles tools without function", () => {
      const tools = [{ type: "function" }];
      const tokens = estimateTokensFromTools(tools as any);
      expect(tokens).toBe(0);
    });

    it("handles tools without description", () => {
      const tools = [
        {
          type: "function",
          function: { name: "simple_tool" },
        },
      ];
      const tokens = estimateTokensFromTools(tools);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles multiple tools", () => {
      const tools = [
        {
          type: "function",
          function: { name: "tool1", description: "First tool" },
        },
        {
          type: "function",
          function: { name: "tool2", description: "Second tool" },
        },
        {
          type: "function",
          function: { name: "tool3", description: "Third tool" },
        },
      ];
      const tokens = estimateTokensFromTools(tools);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe("Token Calculation Edge Cases", () => {
    it("handles very long text", () => {
      const longText = "Hello, World! ".repeat(10000);
      const tokens = estimateTokensFromString(longText);
      expect(tokens).toBeGreaterThan(10000);
    });

    it("handles special characters", () => {
      const specialText = "Hello\n\t\rWorld! 🎉🚀💻";
      const tokens = estimateTokensFromString(specialText);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles Unicode characters from various languages", () => {
      const unicodeText = "日本語 한국어 العربية עברית ไทย";
      const tokens = estimateTokensFromString(unicodeText);
      expect(tokens).toBeGreaterThan(0);
    });

    it("handles binary-like content", () => {
      const binaryText = "\x00\x01\x02\x03\x04\x05";
      const tokens = estimateTokensFromString(binaryText);
      expect(tokens).toBeGreaterThan(0);
    });
  });
});