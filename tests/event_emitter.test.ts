import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "../src/core/event_emitter.js";

/**
 * EventEmitter 单元测试
 * @description 测试事件发射器的所有功能
 */
describe("EventEmitter", () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe("on", () => {
    it("should register event handler", () => {
      const handler = vi.fn();
      emitter.on("request:start", handler);

      expect(emitter.listenerCount("request:start")).toBe(1);
    });

    it("should register multiple handlers for same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on("request:start", handler1);
      emitter.on("request:start", handler2);

      expect(emitter.listenerCount("request:start")).toBe(2);
    });
  });

  describe("once", () => {
    it("should register one-time handler", () => {
      const handler = vi.fn();
      emitter.once("request:start", handler);

      expect(emitter.listenerCount("request:start")).toBe(1);
    });

    it("should remove handler after first emit", async () => {
      const handler = vi.fn();
      emitter.once("request:start", handler);

      await emitter.emit("request:start", { data: "test" });
      expect(handler).toHaveBeenCalledTimes(1);

      await emitter.emit("request:start", { data: "test2" });
      expect(handler).toHaveBeenCalledTimes(1); // 仍然只调用一次
    });
  });

  describe("off", () => {
    it("should remove registered handler", () => {
      const handler = vi.fn();
      emitter.on("request:start", handler);
      emitter.off("request:start", handler);

      expect(emitter.listenerCount("request:start")).toBe(0);
    });

    it("should not affect other handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on("request:start", handler1);
      emitter.on("request:start", handler2);
      emitter.off("request:start", handler1);

      expect(emitter.listenerCount("request:start")).toBe(1);
    });

    it("should remove once handler as well", () => {
      const handler = vi.fn();
      emitter.once("request:start", handler);
      emitter.off("request:start", handler);

      expect(emitter.listenerCount("request:start")).toBe(0);
    });
  });

  describe("emit", () => {
    it("should call all handlers with data", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const data = { requestId: "123" };

      emitter.on("request:start", handler1);
      emitter.on("request:start", handler2);

      await emitter.emit("request:start", data);

      expect(handler1).toHaveBeenCalledWith(data);
      expect(handler2).toHaveBeenCalledWith(data);
    });

    it("should do nothing for event with no handlers", async () => {
      // 不应该抛错
      await emitter.emit("request:start", { data: "test" });
    });

    it("should handle async handlers", async () => {
      const results: number[] = [];
      const asyncHandler = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(1);
      });
      const syncHandler = vi.fn(() => {
        results.push(2);
      });

      emitter.on("request:start", asyncHandler);
      emitter.on("request:start", syncHandler);

      await emitter.emit("request:start", {});

      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it("should continue after handler error", async () => {
      const errorHandler = vi.fn(() => {
        throw new Error("test error");
      });
      const normalHandler = vi.fn();

      emitter.on("request:start", errorHandler);
      emitter.on("request:start", normalHandler);

      await emitter.emit("request:start", {});

      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("should clear all handlers for specific event", () => {
      emitter.on("request:start", vi.fn());
      emitter.on("request:start", vi.fn());
      emitter.on("request:complete", vi.fn());

      emitter.clear("request:start");

      expect(emitter.listenerCount("request:start")).toBe(0);
      expect(emitter.listenerCount("request:complete")).toBe(1);
    });

    it("should clear all handlers when no event specified", () => {
      emitter.on("request:start", vi.fn());
      emitter.on("request:complete", vi.fn());
      emitter.on("request:error", vi.fn());

      emitter.clear();

      expect(emitter.listenerCount("request:start")).toBe(0);
      expect(emitter.listenerCount("request:complete")).toBe(0);
      expect(emitter.listenerCount("request:error")).toBe(0);
    });
  });

  describe("listenerCount", () => {
    it("should return 0 for event with no handlers", () => {
      expect(emitter.listenerCount("request:start")).toBe(0);
    });

    it("should count both on and once handlers", () => {
      emitter.on("request:start", vi.fn());
      emitter.once("request:start", vi.fn());

      expect(emitter.listenerCount("request:start")).toBe(2);
    });
  });
});
