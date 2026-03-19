/**
 * errors 模块单元测试
 * @description 测试自定义错误类型和错误处理函数
 */

import { describe, it, expect } from "vitest";
import {
  ConfigValidationError,
  KeyExhaustedException,
  UpstreamError,
  ToolNotFoundError,
  ModelNotFoundError,
  GroupNotFoundError,
  RateLimitExceededError,
  McpClientError,
  isCustomError,
  getErrorStatusCode,
} from "../src/core/errors";

describe("errors", () => {
  describe("ConfigValidationError", () => {
    it("should create error with errors array", () => {
      const errors = ["error1", "error2"];
      const error = new ConfigValidationError(errors);

      expect(error.name).toBe("ConfigValidationError");
      expect(error.errors).toBe(errors);
      expect(error.message).toContain("error1");
      expect(error.message).toContain("error2");
    });

    it("should handle empty errors array", () => {
      const error = new ConfigValidationError([]);
      expect(error.message).toBe("Config validation failed:\n");
    });

    it("should be instanceof Error", () => {
      const error = new ConfigValidationError(["test"]);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("KeyExhaustedException", () => {
    it("should create error with provider and reason", () => {
      const error = new KeyExhaustedException("openai", "all keys are disabled");

      expect(error.name).toBe("KeyExhaustedException");
      expect(error.provider).toBe("openai");
      expect(error.reason).toBe("all keys are disabled");
      expect(error.message).toContain("openai");
      expect(error.message).toContain("all keys are disabled");
    });

    it("should be instanceof Error", () => {
      const error = new KeyExhaustedException("test", "test reason");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("UpstreamError", () => {
    it("should create error with status and body", () => {
      const error = new UpstreamError(500, "Internal Server Error");

      expect(error.name).toBe("UpstreamError");
      expect(error.status).toBe(500);
      expect(error.body).toBe("Internal Server Error");
      expect(error.provider).toBeUndefined();
      expect(error.message).toContain("500");
      expect(error.message).toContain("Internal Server Error");
    });

    it("should create error with provider", () => {
      const error = new UpstreamError(401, "Unauthorized", "openai");

      expect(error.status).toBe(401);
      expect(error.provider).toBe("openai");
    });

    it("should be instanceof Error", () => {
      const error = new UpstreamError(404, "Not Found");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("ToolNotFoundError", () => {
    it("should create error with tool name", () => {
      const error = new ToolNotFoundError("get_weather");

      expect(error.name).toBe("ToolNotFoundError");
      expect(error.toolName).toBe("get_weather");
      expect(error.message).toContain("get_weather");
    });

    it("should be instanceof Error", () => {
      const error = new ToolNotFoundError("test_tool");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("ModelNotFoundError", () => {
    it("should create error with model name only", () => {
      const error = new ModelNotFoundError("gpt-5");

      expect(error.name).toBe("ModelNotFoundError");
      expect(error.modelName).toBe("gpt-5");
      expect(error.provider).toBeUndefined();
      expect(error.message).toBe("Model not found: gpt-5");
    });

    it("should create error with model name and provider", () => {
      const error = new ModelNotFoundError("gpt-5", "openai");

      expect(error.modelName).toBe("gpt-5");
      expect(error.provider).toBe("openai");
      expect(error.message).toContain("provider: openai");
    });

    it("should be instanceof Error", () => {
      const error = new ModelNotFoundError("test_model");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("GroupNotFoundError", () => {
    it("should create error with group name", () => {
      const error = new GroupNotFoundError("premium");

      expect(error.name).toBe("GroupNotFoundError");
      expect(error.groupName).toBe("premium");
      expect(error.message).toContain("premium");
    });

    it("should be instanceof Error", () => {
      const error = new GroupNotFoundError("test_group");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("RateLimitExceededError", () => {
    it("should create error with provider and rpm", () => {
      const error = new RateLimitExceededError("openai", 60);

      expect(error.name).toBe("RateLimitExceededError");
      expect(error.provider).toBe("openai");
      expect(error.rpm).toBe(60);
      expect(error.message).toContain("openai");
      expect(error.message).toContain("60 RPM");
    });

    it("should be instanceof Error", () => {
      const error = new RateLimitExceededError("test", 100);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("McpClientError", () => {
    it("should create error with tool name and operation", () => {
      const error = new McpClientError("weather_tool", "connect");

      expect(error.name).toBe("McpClientError");
      expect(error.toolName).toBe("weather_tool");
      expect(error.operation).toBe("connect");
      expect(error.cause).toBeUndefined();
      expect(error.message).toContain("weather_tool");
      expect(error.message).toContain("connect");
      expect(error.message).toContain("unknown");
    });

    it("should create error with cause", () => {
      const cause = new Error("Connection refused");
      const error = new McpClientError("weather_tool", "connect", cause);

      expect(error.cause).toBe(cause);
      expect(error.message).toContain("Connection refused");
    });

    it("should be instanceof Error", () => {
      const error = new McpClientError("test", "test_op");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("isCustomError", () => {
    it("should return true for ConfigValidationError", () => {
      const error = new ConfigValidationError(["test"]);
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for KeyExhaustedException", () => {
      const error = new KeyExhaustedException("test", "reason");
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for UpstreamError", () => {
      const error = new UpstreamError(500, "error");
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for ToolNotFoundError", () => {
      const error = new ToolNotFoundError("test");
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for ModelNotFoundError", () => {
      const error = new ModelNotFoundError("test");
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for GroupNotFoundError", () => {
      const error = new GroupNotFoundError("test");
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for RateLimitExceededError", () => {
      const error = new RateLimitExceededError("test", 100);
      expect(isCustomError(error)).toBe(true);
    });

    it("should return true for McpClientError", () => {
      const error = new McpClientError("test", "op");
      expect(isCustomError(error)).toBe(true);
    });

    it("should return false for standard Error", () => {
      const error = new Error("standard error");
      expect(isCustomError(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isCustomError("string")).toBe(false);
      expect(isCustomError(123)).toBe(false);
      expect(isCustomError(null)).toBe(false);
      expect(isCustomError(undefined)).toBe(false);
      expect(isCustomError({})).toBe(false);
    });
  });

  describe("getErrorStatusCode", () => {
    it("should return upstream status for UpstreamError", () => {
      const error = new UpstreamError(403, "Forbidden");
      expect(getErrorStatusCode(error)).toBe(403);
    });

    it("should return 404 for ToolNotFoundError", () => {
      const error = new ToolNotFoundError("test");
      expect(getErrorStatusCode(error)).toBe(404);
    });

    it("should return 404 for ModelNotFoundError", () => {
      const error = new ModelNotFoundError("test");
      expect(getErrorStatusCode(error)).toBe(404);
    });

    it("should return 404 for GroupNotFoundError", () => {
      const error = new GroupNotFoundError("test");
      expect(getErrorStatusCode(error)).toBe(404);
    });

    it("should return 400 for ConfigValidationError", () => {
      const error = new ConfigValidationError(["test"]);
      expect(getErrorStatusCode(error)).toBe(400);
    });

    it("should return 429 for RateLimitExceededError", () => {
      const error = new RateLimitExceededError("test", 100);
      expect(getErrorStatusCode(error)).toBe(429);
    });

    it("should return 503 for KeyExhaustedException", () => {
      const error = new KeyExhaustedException("test", "reason");
      expect(getErrorStatusCode(error)).toBe(503);
    });

    it("should return 500 for McpClientError", () => {
      const error = new McpClientError("test", "op");
      expect(getErrorStatusCode(error)).toBe(500);
    });

    it("should return 500 for standard Error", () => {
      const error = new Error("standard error");
      expect(getErrorStatusCode(error)).toBe(500);
    });

    it("should return 500 for non-Error objects", () => {
      expect(getErrorStatusCode("string")).toBe(500);
      expect(getErrorStatusCode(null)).toBe(500);
      expect(getErrorStatusCode(undefined)).toBe(500);
    });
  });
});
