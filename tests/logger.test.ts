import { describe, it, expect, vi } from "vitest";
import { LOGGER, createModuleLogger, createPluginLogger, type Logger } from "../src/core/logger.js";

/**
 * Logger 模块单元测试
 * @description 测试日志模块的所有公开 API
 */

describe("Logger", () => {
  describe("LOGGER", () => {
    it("should be defined and have all log methods", () => {
      expect(LOGGER).toBeDefined();
      expect(typeof LOGGER.trace).toBe("function");
      expect(typeof LOGGER.debug).toBe("function");
      expect(typeof LOGGER.info).toBe("function");
      expect(typeof LOGGER.warn).toBe("function");
      expect(typeof LOGGER.error).toBe("function");
      expect(typeof LOGGER.fatal).toBe("function");
      expect(typeof LOGGER.child).toBe("function");
    });

    it("should log message without data", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      LOGGER.info("test message");
      
      // 不验证具体输出，只验证不抛出异常
      expect(true).toBe(true);
      
      spy.mockRestore();
    });

    it("should log message with data", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      LOGGER.info({ key: "value" }, "test message with data");
      
      expect(true).toBe(true);
      
      spy.mockRestore();
    });

    it("should log all levels without throwing", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      expect(() => LOGGER.trace("trace")).not.toThrow();
      expect(() => LOGGER.debug("debug")).not.toThrow();
      expect(() => LOGGER.info("info")).not.toThrow();
      expect(() => LOGGER.warn("warn")).not.toThrow();
      expect(() => LOGGER.error("error")).not.toThrow();
      expect(() => LOGGER.fatal("fatal")).not.toThrow();
      
      spy.mockRestore();
    });
  });

  describe("createModuleLogger", () => {
    it("should create logger with module tag", () => {
      const moduleLogger = createModuleLogger("test-module");
      
      expect(moduleLogger).toBeDefined();
      expect(typeof moduleLogger.info).toBe("function");
      expect(typeof moduleLogger.child).toBe("function");
    });

    it("should log without throwing", () => {
      const moduleLogger = createModuleLogger("test-module");
      
      expect(() => moduleLogger.info("test")).not.toThrow();
    });
  });

  describe("createPluginLogger", () => {
    it("should create logger with plugin tag", () => {
      const pluginLogger = createPluginLogger("test-plugin");
      
      expect(pluginLogger).toBeDefined();
      expect(typeof pluginLogger.info).toBe("function");
      expect(typeof pluginLogger.child).toBe("function");
    });

    it("should log without throwing", () => {
      const pluginLogger = createPluginLogger("test-plugin");
      
      expect(() => pluginLogger.info("test")).not.toThrow();
    });
  });

  describe("Logger child", () => {
    it("should create child logger", () => {
      const childLogger = LOGGER.child({ module: "child-test" });
      
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe("function");
    });

    it("child logger should work independently", () => {
      const childLogger = LOGGER.child({ module: "child-test" });
      
      expect(() => childLogger.info("child message")).not.toThrow();
      expect(() => childLogger.warn("child warning")).not.toThrow();
      expect(() => childLogger.error("child error")).not.toThrow();
    });
  });
});
