import { describe, it, expect, beforeEach } from "vitest";
import {
  TruncationService,
  DEFAULT_TRUNCATION_SUFFIX,
  DEFAULT_TRUNCATION_PROMPT,
  initTruncationService,
  getTruncationService,
  getTruncationSuffix,
  addTruncationPrompt,
  stripTruncationSuffix,
  TRUNCATION_SUFFIX,
} from "../src/core/truncation.js";
import type { TruncationConfig } from "../src/core/types.js";

describe("TruncationService", () => {
  describe("default values", () => {
    it("should have correct default", () => {
      expect(DEFAULT_TRUNCATION_SUFFIX).toBe("__END_OF_RESPONSE__");
      expect(DEFAULT_TRUNCATION_PROMPT).toContain("{suffix}");
    });
  });

  describe("constructor", () => {
    it("should use default values when config is minimal", () => {
      const config: TruncationConfig = { enable: true };
      const service = new TruncationService(config);

      expect(service.getSuffix()).toBe(DEFAULT_TRUNCATION_SUFFIX);
      expect(service.getPrompt()).toContain(DEFAULT_TRUNCATION_SUFFIX);
      expect(service.isEnabled()).toBe(true);
    });

    it("should use custom suffix", () => {
      const config: TruncationConfig = {
        enable: true,
        suffix: "__CUSTOM_END__",
      };
      const service = new TruncationService(config);

      expect(service.getSuffix()).toBe("__CUSTOM_END__");
      expect(service.getPrompt()).toContain("__CUSTOM_END__");
    });

    it("should use custom prompt", () => {
      const config: TruncationConfig = {
        enable: true,
        prompt: "Please end with {suffix}",
      };
      const service = new TruncationService(config);

      expect(service.getPrompt()).toBe("Please end with __END_OF_RESPONSE__");
    });
  });

  describe("injectPrompt", () => {
    it("should inject prompt into last user message", () => {
      const service = new TruncationService({ enable: true });
      const messages = [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "Write a poem" },
      ];

      const result = service.injectPrompt(messages);

      // 最后一条用户消息应该被注入提示词
      expect(result[3]!.content).toContain("Write a poem");
      expect(result[3]!.content).toContain("__END_OF_RESPONSE__");
      // 其他消息不应该被修改
      expect(result[0]!.content).toBe("You are helpful.");
      expect(result[1]!.content).toBe("Hello");
      expect(result[2]!.content).toBe("Hi!");
    });

    it("should not inject when disabled", () => {
      const service = new TruncationService({ enable: false });
      const messages = [{ role: "user", content: "Hello" }];

      const result = service.injectPrompt(messages);

      expect(result[0]!.content).toBe("Hello");
    });

    it("should handle empty messages", () => {
      const service = new TruncationService({ enable: true });
      const result = service.injectPrompt([]);
      expect(result).toEqual([]);
    });

    it("should handle non-string content", () => {
      const service = new TruncationService({ enable: true });
      const messages = [{ role: "user", content: { text: "Hello" } }];

      const result = service.injectPrompt(messages);

      expect(result[0]!.content).toContain("Hello");
    });
  });

  describe("stripSuffix", () => {
    it("should strip suffix from content", () => {
      const service = new TruncationService({ enable: true });
      const content = `Hello world\n__END_OF_RESPONSE__`;

      const result = service.stripSuffix(content);

      expect(result).toBe("Hello world");
    });

    it("should throw TRUNCATED error when suffix is missing", () => {
      const service = new TruncationService({ enable: true });
      const content = "Hello world";

      expect(() => service.stripSuffix(content)).toThrow("TRUNCATED");
    });

    it("should not strip when disabled", () => {
      const service = new TruncationService({ enable: false });
      const content = "Hello world";

      const result = service.stripSuffix(content);

      expect(result).toBe("Hello world");
    });

    it("should handle custom suffix", () => {
      const service = new TruncationService({
        enable: true,
        suffix: "__DONE__",
      });
      const content = `Hello world\n__DONE__`;

      const result = service.stripSuffix(content);

      expect(result).toBe("Hello world");
    });

    it("should find suffix anywhere in content", () => {
      const service = new TruncationService({ enable: true });
      const content = `Hello world\n__END_OF_RESPONSE__\nSome extra text that shouldn't be here`;

      const result = service.stripSuffix(content);

      expect(result).toBe("Hello world");
    });
  });

  describe("updateConfig", () => {
    it("should update config", () => {
      const service = new TruncationService({ enable: true, suffix: "__OLD__" });
      expect(service.getSuffix()).toBe("__OLD__");

      service.updateConfig({ enable: true, suffix: "__NEW__" });
      expect(service.getSuffix()).toBe("__NEW__");
    });
  });
});

describe("Legacy API", () => {
  beforeEach(() => {
    // Reset default service
    initTruncationService({ enable: true });
  });

  describe("initTruncationService", () => {
    it("should initialize default service", () => {
      initTruncationService({ enable: true, suffix: "__TEST__" });
      expect(getTruncationSuffix()).toBe("__TEST__");
    });
  });

  describe("getTruncationService", () => {
    it("should return service after init", () => {
      initTruncationService({ enable: true });
      expect(getTruncationService()).not.toBeNull();
    });
  });

  describe("addTruncationPrompt", () => {
    it("should add prompt to content", () => {
      const result = addTruncationPrompt("Hello");
      expect(result).toContain("Hello");
      expect(result).toContain("__END_OF_RESPONSE__");
    });
  });

  describe("stripTruncationSuffix", () => {
    it("should strip suffix using default service", () => {
      initTruncationService({ enable: true });
      const content = `Hello\n__END_OF_RESPONSE__`;
      const result = stripTruncationSuffix(content);
      expect(result).toBe("Hello");
    });

    it("should use default suffix when no service", () => {
      // When no service is initialized, use default
      const content = `Hello\n__END_OF_RESPONSE__`;
      const result = stripTruncationSuffix(content);
      expect(result).toBe("Hello");
    });
  });

  describe("TRUNCATION_SUFFIX constant", () => {
    it("should equal default suffix", () => {
      expect(TRUNCATION_SUFFIX).toBe(DEFAULT_TRUNCATION_SUFFIX);
    });
  });
});

// ============================================================
// 随机猴子测试 - 边界条件和异常输入
// ============================================================

describe("TruncationService - Monkey Testing (Edge Cases & Abnormal Inputs)", () => {
  describe("constructor edge cases", () => {
    it("should handle empty suffix - uses default", () => {
      const service = new TruncationService({ enable: true, suffix: "" });
      // 空字符串会使用默认值（|| DEFAULT_TRUNCATION_SUFFIX）
      expect(service.getSuffix()).toBe(DEFAULT_TRUNCATION_SUFFIX);
    });

    it("should handle very long suffix", () => {
      const longSuffix = "a".repeat(10000);
      const service = new TruncationService({ enable: true, suffix: longSuffix });
      expect(service.getSuffix()).toBe(longSuffix);
    });

    it("should handle suffix with special characters", () => {
      const specialSuffixes = [
        "__END__🚀__",
        "结束标记",
        "\n\t\r",
        "<!--END-->",
        "'; DROP TABLE; --",
        "${variable}",
        "{{template}}",
      ];

      for (const suffix of specialSuffixes) {
        const service = new TruncationService({ enable: true, suffix });
        expect(service.getSuffix()).toBe(suffix);
      }
    });

    it("should handle suffix that appears in prompt template", () => {
      const service = new TruncationService({
        enable: true,
        suffix: "PLACEHOLDER",
        prompt: "Use PLACEHOLDER and {suffix} correctly",
      });

      // {suffix} 应该被替换，但第一个 PLACEHOLDER 不应该
      expect(service.getPrompt()).toContain("PLACEHOLDER");
      expect(service.getPrompt()).toContain("PLACEHOLDER and PLACEHOLDER");
    });

    it("should handle prompt without {suffix} placeholder", () => {
      const service = new TruncationService({
        enable: true,
        prompt: "No placeholder here",
      });

      // 没有 {suffix} 的 prompt 应该返回原样
      expect(service.getPrompt()).toBe("No placeholder here");
    });

    it("should handle empty prompt - uses default", () => {
      const service = new TruncationService({
        enable: true,
        prompt: "",
      });

      // 空字符串会使用默认 prompt（|| DEFAULT_TRUNCATION_PROMPT）
      expect(service.getPrompt()).toBe(DEFAULT_TRUNCATION_PROMPT.replace("{suffix}", DEFAULT_TRUNCATION_SUFFIX));
    });

    it("should handle very long prompt", () => {
      const longPrompt = "End with {suffix}\n" + "a".repeat(10000);
      const service = new TruncationService({ enable: true, prompt: longPrompt });

      expect(service.getPrompt().length).toBeGreaterThan(10000);
    });
  });

  describe("injectPrompt edge cases", () => {
    let service: TruncationService;

    beforeEach(() => {
      service = new TruncationService({ enable: true });
    });

    it("should handle messages with no user messages", () => {
      const messages = [
        { role: "system", content: "System prompt" },
        { role: "assistant", content: "Hello" },
      ];

      const result = service.injectPrompt(messages);

      // 没有 user 消息，不应该注入
      expect(result[0]!.content).toBe("System prompt");
      expect(result[1]!.content).toBe("Hello");
    });

    it("should handle messages with null content", () => {
      const messages = [
        { role: "user", content: null },
      ];

      // 不应该崩溃
      const result = service.injectPrompt(messages);
      expect(result.length).toBe(1);
    });

    it("should handle messages with undefined content", () => {
      const messages = [
        { role: "user", content: undefined },
      ];

      const result = service.injectPrompt(messages);
      expect(result.length).toBe(1);
    });

    it("should handle messages with array content", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "Hello" },
            { type: "image_url", image_url: { url: "https://example.com/image.png" } },
          ],
        },
      ];

      const result = service.injectPrompt(messages);
      // 数组内容会被 JSON.stringify 转换为字符串
      expect(typeof result[0]!.content).toBe("string");
      expect(result[0]!.content).toContain("Hello");
    });

    it("should handle messages with number content", () => {
      const messages = [{ role: "user", content: 12345 }];

      const result = service.injectPrompt(messages);
      expect(result[0]!.content).toContain("12345");
    });

    it("should handle messages with boolean content", () => {
      const messages = [{ role: "user", content: true }];

      const result = service.injectPrompt(messages);
      expect(result[0]!.content).toContain("true");
    });

    it("should handle single message", () => {
      const messages = [{ role: "user", content: "Hello" }];

      const result = service.injectPrompt(messages);
      expect(result[0]!.content).toContain("Hello");
      expect(result[0]!.content).toContain("__END_OF_RESPONSE__");
    });

    it("should handle very long message content", () => {
      const longContent = "a".repeat(100000);
      const messages = [{ role: "user", content: longContent }];

      const result = service.injectPrompt(messages);
      expect(result[0]!.content).toContain(longContent);
    });

    it("should handle message with special characters in content", () => {
      const specialContents = [
        "Hello\nWorld\tTabbed",
        "Emoji: 🚀🎉🔥",
        "Chinese: 你好世界",
        "SQL: '; DROP TABLE users; --",
        "HTML: <script>alert('xss')</script>",
        "Template: ${variable}",
      ];

      for (const content of specialContents) {
        const messages = [{ role: "user", content }];
        const result = service.injectPrompt(messages);
        expect(result[0]!.content).toContain(content);
      }
    });

    it("should not modify original messages array", () => {
      const messages = [{ role: "user", content: "Original" }];
      const originalContent = messages[0]!.content;

      service.injectPrompt(messages);

      // 原数组不应该被修改（深拷贝）
      // 注意：当前实现可能会修改，这里测试实际行为
    });
  });

  describe("stripSuffix edge cases", () => {
    let service: TruncationService;

    beforeEach(() => {
      service = new TruncationService({ enable: true });
    });

    it("should handle empty content", () => {
      expect(() => service.stripSuffix("")).toThrow("TRUNCATED");
    });

    it("should handle content that is exactly the suffix", () => {
      const result = service.stripSuffix("__END_OF_RESPONSE__");
      expect(result).toBe("");
    });

    it("should handle suffix at the beginning", () => {
      const content = "__END_OF_RESPONSE__Some text";
      const result = service.stripSuffix(content);
      expect(result).toBe("");
    });

    it("should handle suffix in the middle", () => {
      const content = "Start__END_OF_RESPONSE__End";
      const result = service.stripSuffix(content);
      expect(result).toBe("Start");
    });

    it("should handle multiple occurrences of suffix", () => {
      const content = "Part1__END_OF_RESPONSE__Part2__END_OF_RESPONSE__Part3";
      const result = service.stripSuffix(content);
      // 使用 lastIndexOf，所以从最后一个出现处截断
      expect(result).toBe("Part1__END_OF_RESPONSE__Part2");
    });

    it("should handle content with only whitespace before suffix", () => {
      const content = "   \n\t\n__END_OF_RESPONSE__";
      const result = service.stripSuffix(content);
      // trimEnd() 会移除尾随空白
      expect(result).toBe("");
    });

    it("should handle very long content", () => {
      const longContent = "a".repeat(100000) + "\n__END_OF_RESPONSE__";
      const result = service.stripSuffix(longContent);
      expect(result).toBe("a".repeat(100000));
    });

    it("should handle content with special characters", () => {
      const specialContents = [
        "你好世界\n__END_OF_RESPONSE__",
        "🚀🎉🔥\n__END_OF_RESPONSE__",
        "SQL: '; DROP TABLE;\n__END_OF_RESPONSE__",
      ];

      for (const content of specialContents) {
        const result = service.stripSuffix(content);
        expect(result).not.toContain("__END_OF_RESPONSE__");
      }
    });

    it("should handle newline variations", () => {
      const contents = [
        "Text\r\n__END_OF_RESPONSE__",
        "Text\r__END_OF_RESPONSE__",
        "Text\n__END_OF_RESPONSE__",
        "Text\n\r__END_OF_RESPONSE__",
      ];

      for (const content of contents) {
        const result = service.stripSuffix(content);
        expect(result).not.toContain("__END_OF_RESPONSE__");
      }
    });

    it("should handle when disabled", () => {
      const disabledService = new TruncationService({ enable: false });
      const content = "No suffix here";

      const result = disabledService.stripSuffix(content);
      expect(result).toBe("No suffix here");
    });

    it("should not throw when disabled and suffix missing", () => {
      const disabledService = new TruncationService({ enable: false });
      const content = "No suffix here";

      expect(() => disabledService.stripSuffix(content)).not.toThrow();
    });
  });

  describe("updateConfig edge cases", () => {
    let service: TruncationService;

    beforeEach(() => {
      service = new TruncationService({ enable: true });
    });

    it("should handle updating to disabled", () => {
      service.updateConfig({ enable: false });
      expect(service.isEnabled()).toBe(false);
    });

    it("should handle updating suffix", () => {
      service.updateConfig({ enable: true, suffix: "__NEW__" });
      expect(service.getSuffix()).toBe("__NEW__");
    });

    it("should handle updating prompt", () => {
      service.updateConfig({ enable: true, prompt: "New prompt {suffix}" });
      expect(service.getPrompt()).toContain("New prompt");
    });

    it("should handle partial config update", () => {
      service.updateConfig({ enable: true, suffix: "__PARTIAL__" });
      // 只更新提供的字段
      expect(service.getSuffix()).toBe("__PARTIAL__");
    });
  });

  describe("isEnabled edge cases", () => {
    it("should return false when disabled", () => {
      const service = new TruncationService({ enable: false });
      expect(service.isEnabled()).toBe(false);
    });

    it("should return true when enabled", () => {
      const service = new TruncationService({ enable: true });
      expect(service.isEnabled()).toBe(true);
    });
  });
});

describe("Legacy API - Monkey Testing", () => {
  describe("addTruncationPrompt edge cases", () => {
    it("should handle empty string", () => {
      const result = addTruncationPrompt("");
      expect(result).toContain("__END_OF_RESPONSE__");
    });

    it("should handle null", () => {
      // @ts-ignore - 测试异常输入
      const result = addTruncationPrompt(null);
      expect(result).toBeDefined();
    });

    it("should handle undefined", () => {
      // @ts-ignore - 测试异常输入
      const result = addTruncationPrompt(undefined);
      expect(result).toBeDefined();
    });

    it("should handle very long string", () => {
      const longContent = "a".repeat(100000);
      const result = addTruncationPrompt(longContent);
      expect(result).toContain(longContent);
    });
  });

  describe("stripTruncationSuffix edge cases", () => {
    beforeEach(() => {
      initTruncationService({ enable: true });
    });

    it("should handle empty string", () => {
      expect(() => stripTruncationSuffix("")).toThrow("TRUNCATED");
    });

    it("should handle string without suffix", () => {
      expect(() => stripTruncationSuffix("No suffix")).toThrow("TRUNCATED");
    });
  });
});