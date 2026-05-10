import { describe, expect, it, vi } from "vitest";

import { createStatusLiveSnapshot, reduceStatusLiveEvent } from "@/lib/live";
import { openLiveStream } from "@/services/live_service.js";

describe("status live helpers", function () {
  it("用 bootstrap 初始化状态页数据", function () {
    const snapshot = createStatusLiveSnapshot({
      health: { status: "ok" },
      provider_stats: {
        openai: {
          success_count: 3
        }
      },
      provider_types: {
        openai: "openai_chat"
      },
      stream_cursor: 12
    });

    expect(snapshot.cursor).toBe(12);
    expect(snapshot.overview.health.status).toBe("ok");
    expect(snapshot.overview.provider_types?.openai).toBe("openai_chat");
    expect(snapshot.overview.provider_stats.openai?.success_count).toBe(3);
  });

  it("收到 stats_delta 时只更新对应 provider", function () {
    const initialSnapshot = createStatusLiveSnapshot({
      provider_stats: {
        alpha: { success_count: 1 },
        beta: { success_count: 2 }
      },
      stream_cursor: 4
    });

    const result = reduceStatusLiveEvent(initialSnapshot, {
      data: {
        provider: "beta",
        snapshot: {
          error_count: 5,
          success_count: 9
        }
      },
      lastEventId: 7,
      type: "stats_delta"
    });

    expect(result.requiresBootstrap).toBe(false);
    expect(result.snapshot.cursor).toBe(7);
    expect(result.snapshot.overview.provider_stats.alpha?.success_count).toBe(1);
    expect(result.snapshot.overview.provider_stats.beta?.success_count).toBe(9);
    expect(result.snapshot.overview.provider_stats.beta?.error_count).toBe(5);
  });

  it("收到 resync_required 时会要求重拉 bootstrap", function () {
    const snapshot = createStatusLiveSnapshot({
      stream_cursor: 9
    });

    const result = reduceStatusLiveEvent(snapshot, {
      data: { reason: "gap" },
      lastEventId: 0,
      type: "resync_required"
    });

    expect(result.requiresBootstrap).toBe(true);
    expect(result.snapshot.cursor).toBe(9);
  });
});

describe("live service", function () {
  it("会把 SSE 事件解析并转发给调用方", function () {
    class MockEventSource {
      listeners = new Map<string, Array<(event: MessageEvent) => void>>();
      onerror: ((event: Event) => void) | null = null;
      onopen: ((event: Event) => void) | null = null;
      url: string;

      constructor(url: string) {
        this.url = url;
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        const listeners = this.listeners.get(type) || [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      removeEventListener(type: string, listener: (event: MessageEvent) => void) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter(function keep(nextListener) {
          return nextListener !== listener;
        }));
      }

      close() {}

      emit(type: string, payload: unknown, lastEventId = "0") {
        const listeners = this.listeners.get(type) || [];
        const event = {
          data: JSON.stringify(payload),
          lastEventId
        } as MessageEvent;
        listeners.forEach(function notify(listener) {
          listener(event);
        });
      }
    }

    const receivedEvents: Array<{ type: string; lastEventId: number; data: unknown }> = [];
    const stream = openLiveStream("/api/status/stream?after=12", {
      EventSourceConstructor: MockEventSource as unknown as typeof EventSource,
      eventNames: ["stats_delta"],
      onEvent(event) {
        receivedEvents.push({
          data: event.data,
          lastEventId: event.lastEventId,
          type: event.type
        });
      }
    });

    const source = stream.source as unknown as MockEventSource;
    source.emit("stats_delta", { provider: "openai" }, "18");

    expect(source.url).toContain("/api/status/stream?after=12");
    expect(receivedEvents).toEqual([{
      data: { provider: "openai" },
      lastEventId: 18,
      type: "stats_delta"
    }]);

    const closeSpy = vi.spyOn(source, "close");
    stream.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
