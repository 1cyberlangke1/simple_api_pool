/**
 * useSSE 测试
 * @description 测试 SSE (Server-Sent Events) 连接管理 Composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withSetup } from "@/test/setup";
import { useSSE, useDashboardSSE } from "./useSSE";

// Mock EventSource
class MockEventSource {
  url: string;
  onopen: ((this: EventSource, ev: Event) => any) | null = null;
  onerror: ((this: EventSource, ev: Event) => any) | null = null;
  onmessage: ((this: MessageEvent, ev: MessageEvent) => any) | null = null;
  readyState: number = 0;
  private listeners: Map<string, EventListener[]> = new Map();

  static instances: MockEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    const arr = this.listeners.get(type);
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx > -1) arr.splice(idx, 1);
    }
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  // 测试辅助方法
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen.call(this as any, new Event("open"));
    }
  }

  simulateError() {
    if (this.onerror) {
      this.onerror.call(this as any, new Event("error"));
    }
  }

  simulateMessage(type: string, data: any) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      const event = new MessageEvent(type, { data: JSON.stringify(data) });
      listeners.forEach((l) => l(event));
    }
  }
}

// 替换全局 EventSource
vi.stubGlobal("EventSource", MockEventSource);

describe("useSSE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("初始状态", () => {
    it("无 token 时 immediate: true 不会调用 connect，状态应为 disconnected", () => {
      const { result } = withSetup(() =>
        useSSE("/sse", { immediate: true })
      );

      // immediate: true 但无 token 时不会调用 connect()
      expect(result.connectionState.value).toBe("disconnected");
      expect(MockEventSource.instances.length).toBe(0);
    });

    it("有 token 时应该尝试连接", () => {
      localStorage.setItem("admin_token", "test-token");

      withSetup(() => useSSE("/sse", { immediate: true }));

      expect(MockEventSource.instances.length).toBe(1);
      const instance = MockEventSource.instances[0];
      expect(instance.url).toContain("token=test-token");
    });

    it("immediate: false 时不应该自动连接", () => {
      localStorage.setItem("admin_token", "test-token");

      withSetup(() => useSSE("/sse", { immediate: false }));

      expect(MockEventSource.instances.length).toBe(0);
    });
  });

  describe("connect", () => {
    it("应该正确构建带 token 的 URL", () => {
      localStorage.setItem("admin_token", "my-secret-token");

      const { result } = withSetup(() => useSSE("/sse", { immediate: false }));
      result.connect();

      const instance = MockEventSource.instances[0];
      expect(instance.url).toContain("/sse");
      expect(instance.url).toContain("token=my-secret-token");
    });

    it("连接成功应该更新状态", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE("/sse", { immediate: false })
      );
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateOpen();

      expect(result.connectionState.value).toBe("connected");
    });

    it("无 token 时连接应该失败", () => {
      const { result } = withSetup(() =>
        useSSE("/sse", { immediate: false })
      );
      result.connect();

      expect(result.connectionState.value).toBe("error");
      expect(result.error.value).toBeInstanceOf(Error);
    });
  });

  describe("disconnect", () => {
    it("应该关闭连接并更新状态", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE("/sse", { immediate: false })
      );
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateOpen();

      result.disconnect();

      expect(result.connectionState.value).toBe("disconnected");
      expect(instance.readyState).toBe(2); // CLOSED
    });

    it("应该取消重连定时器", () => {
      vi.useFakeTimers();
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE("/sse", {
          immediate: false,
          autoReconnect: true,
          reconnectInterval: 1000,
        })
      );
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateError();

      result.disconnect();

      // 快进时间，确保不会重连
      vi.advanceTimersByTime(2000);
      expect(MockEventSource.instances.length).toBe(1); // 还是只有原来的实例

      vi.useRealTimers();
    });
  });

  describe("事件处理", () => {
    it("应该正确处理自定义事件", () => {
      localStorage.setItem("admin_token", "test-token");

      const handler = vi.fn();
      const { result } = withSetup(() =>
        useSSE<"stats:update">("/sse", { immediate: false })
      );

      result.on("stats:update", handler);
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateOpen();
      instance.simulateMessage("stats:update", { type: "test", data: { count: 10 } });

      expect(handler).toHaveBeenCalledWith({ type: "test", data: { count: 10 } });
    });

    it("应该更新 lastEvent", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE<"stats:update">("/sse", { immediate: false })
      );

      result.on("stats:update", () => {});
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateOpen();
      instance.simulateMessage("stats:update", { count: 10 });

      expect(result.lastEvent.value).toEqual({
        type: "stats:update",
        data: { count: 10 },
      });
    });
  });

  describe("自动重连", () => {
    it("错误后应该尝试重连", () => {
      vi.useFakeTimers();
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE("/sse", {
          immediate: false,
          autoReconnect: true,
          reconnectInterval: 1000,
          maxReconnectAttempts: 3,
        })
      );
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateError();

      // 快进到重连时间
      vi.advanceTimersByTime(1000);

      // 应该创建了新的 EventSource 实例
      expect(MockEventSource.instances.length).toBe(2);

      vi.useRealTimers();
    });

    it("达到最大重连次数后应该停止", () => {
      vi.useFakeTimers();
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE("/sse", {
          immediate: false,
          autoReconnect: true,
          reconnectInterval: 100,
          maxReconnectAttempts: 2,
        })
      );
      result.connect();

      // 模拟多次错误
      for (let i = 0; i < 5; i++) {
        const instance = MockEventSource.instances[MockEventSource.instances.length - 1];
        instance.simulateError();
        vi.advanceTimersByTime(100);
      }

      expect(result.reconnectAttempts.value).toBe(2);
      expect(result.connectionState.value).toBe("disconnected");

      vi.useRealTimers();
    });

    it("autoReconnect: false 时不应该重连", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() =>
        useSSE("/sse", {
          immediate: false,
          autoReconnect: false,
        })
      );
      result.connect();

      const instance = MockEventSource.instances[0];
      instance.simulateError();

      expect(result.connectionState.value).toBe("disconnected");
      expect(MockEventSource.instances.length).toBe(1);
    });
  });
});

describe("useDashboardSSE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances = [];
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("初始状态", () => {
    it("hasNewData 初始应为 false", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() => useDashboardSSE());

      expect(result.hasNewData.value).toBe(false);
    });

    it("lastUpdateTime 初始应为 null", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() => useDashboardSSE());

      expect(result.lastUpdateTime.value).toBeNull();
    });
  });

  describe("markAsRead", () => {
    it("应该将 hasNewData 设为 false", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() => useDashboardSSE());

      result.hasNewData.value = true;
      result.markAsRead();

      expect(result.hasNewData.value).toBe(false);
    });
  });

  describe("connect/disconnect", () => {
    it("应该返回连接方法", () => {
      localStorage.setItem("admin_token", "test-token");

      const { result } = withSetup(() => useDashboardSSE());

      expect(typeof result.connect).toBe("function");
      expect(typeof result.disconnect).toBe("function");

      result.connect();
      expect(result.connectionState.value).toBe("connecting");
    });
  });
});