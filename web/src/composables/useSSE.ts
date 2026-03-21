/**
 * SSE (Server-Sent Events) 连接管理
 * @description 替代轮询，实现服务器主动推送，优化性能
 */

import { ref, onUnmounted, type Ref } from "vue";

/**
 * SSE 事件类型映射
 */
export interface SSEEventMap {
  connected: { clientId: string; timestamp: number };
  heartbeat: { timestamp: number };
  "stats:update": { type: string; data: unknown };
  "request:start": { requestId: string; timestamp: number };
  "request:complete": { requestId: string; duration: number };
  "request:error": { requestId: string; error: string };
  "request:cache:hit": { requestId: string };
  "request:cache:miss": { requestId: string };
}

/**
 * SSE 连接状态
 */
export type SSEConnectionState = "connecting" | "connected" | "disconnected" | "error";

/**
 * SSE 连接选项
 */
export interface SSEOptions {
  /** 自动重连 */
  autoReconnect?: boolean;
  /** 重连间隔（毫秒） */
  reconnectInterval?: number;
  /** 最大重连次数 */
  maxReconnectAttempts?: number;
  /** 是否立即连接 */
  immediate?: boolean;
}

/**
 * SSE 连接管理 Composable
 * @param url SSE 端点 URL
 * @param options 连接选项
 * @returns SSE 连接状态和事件处理
 */
export function useSSE<T extends keyof SSEEventMap>(
  url: string,
  options: SSEOptions = {}
) {
  const {
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    immediate = true,
  } = options;

  // 状态
  const connectionState: Ref<SSEConnectionState> = ref("disconnected");
  const lastEvent: Ref<{ type: T; data: SSEEventMap[T] } | null> = ref(null);
  const error: Ref<Error | Event | null> = ref(null);
  const reconnectAttempts = ref(0);

  // 内部状态
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const eventHandlers = new Map<T, Set<(data: SSEEventMap[T]) => void>>();
  // 跟踪已注册的事件监听器：eventType -> handler -> listener
  const registeredListeners = new Map<string, Map<Function, (e: MessageEvent) => void>>();

  /**
   * 连接 SSE
   */
  function connect(): void {
    if (eventSource) {
      eventSource.close();
    }

    connectionState.value = "connecting";
    error.value = null;

    // 构建 URL，添加 token 作为查询参数（EventSource 不支持自定义 header）
    // 直接从 localStorage 读取 token，避免 Pinia store 初始化顺序问题
    const token = localStorage.getItem("admin_token");
    if (!token) {
      error.value = new Error("No authentication token");
      connectionState.value = "error";
      return;
    }
    const urlWithToken = new URL(url, window.location.origin);
    urlWithToken.searchParams.set("token", token);

    eventSource = new EventSource(urlWithToken.toString());

    // 连接成功
    eventSource.onopen = () => {
      connectionState.value = "connected";
      reconnectAttempts.value = 0;
    };

    // 连接错误
    eventSource.onerror = () => {
      error.value = new Error("SSE connection error");
      connectionState.value = "error";

      if (autoReconnect && reconnectAttempts.value < maxReconnectAttempts) {
        reconnectAttempts.value++;
        reconnectTimer = setTimeout(connect, reconnectInterval);
      } else {
        connectionState.value = "disconnected";
      }
    };

    // 注册通用消息处理（保留结构但不打印日志）
    eventSource.onmessage = () => {
      // 消息由特定事件处理器处理
    };

    // 注册特定事件处理
    for (const [eventType, handlers] of eventHandlers) {
      eventSource.addEventListener(eventType as string, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as SSEEventMap[T];
          lastEvent.value = { type: eventType, data };
          for (const handler of handlers) {
            handler(data);
          }
        } catch {
          // 解析失败，忽略该事件
        }
      });
    }
  }

  /**
   * 断开 SSE 连接
   */
  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    // 清理已注册的监听器记录
    registeredListeners.clear();
    connectionState.value = "disconnected";
  }

  /**
   * 订阅事件
   * @param eventType 事件类型
   * @param handler 处理函数
   */
  function on<E extends T>(eventType: E, handler: (data: SSEEventMap[E]) => void): void {
    if (!eventHandlers.has(eventType)) {
      eventHandlers.set(eventType, new Set());
    }
    eventHandlers.get(eventType)!.add(handler as (data: SSEEventMap[T]) => void);

    // 如果已连接，动态添加事件监听
    if (eventSource) {
      const eventKey = eventType as string;
      
      // 获取或创建该事件类型的监听器映射
      if (!registeredListeners.has(eventKey)) {
        registeredListeners.set(eventKey, new Map());
      }
      
      const listenerMap = registeredListeners.get(eventKey)!;
      
      // 如果这个 handler 还没有注册监听器，则添加
      if (!listenerMap.has(handler)) {
        const listener = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            handler(data);
          } catch {
            // 解析失败，忽略该事件
          }
        };
        
        eventSource.addEventListener(eventKey, listener);
        listenerMap.set(handler, listener);
      }
    }
  }

  /**
   * 取消订阅事件
   * @param eventType 事件类型
   * @param handler 处理函数
   */
  function off<E extends T>(eventType: E, handler: (data: SSEEventMap[E]) => void): void {
    eventHandlers.get(eventType as T)?.delete(handler as (data: SSEEventMap[T]) => void);
  }

  // 监听 localStorage 变化，重新连接
  function handleStorageChange(e: StorageEvent) {
    if (e.key === "admin_token") {
      if (e.newValue && connectionState.value === "error") {
        connect();
      } else if (!e.newValue) {
        disconnect();
      }
    }
  }
  window.addEventListener("storage", handleStorageChange);

  // 组件卸载时断开连接并清理事件监听
  onUnmounted(() => {
    disconnect();
    window.removeEventListener("storage", handleStorageChange);
  });

  // 立即连接
  if (immediate) {
    const token = localStorage.getItem("admin_token");
    if (token) {
      connect();
    }
  }

  return {
    connectionState,
    lastEvent,
    error,
    reconnectAttempts,
    connect,
    disconnect,
    on,
    off,
  };
}

/**
 * 仪表盘数据推送专用 Hook
 * @description 封装仪表盘常用的 SSE 事件处理
 */
export function useDashboardSSE() {
  const hasNewData = ref(false);
  const lastUpdateTime = ref<Date | null>(null);

  const { connectionState, connect, disconnect, on } = useSSE<keyof SSEEventMap>(
    "/admin/sse/stats",
    { immediate: false }
  );

  // 订阅统计更新事件
  on("stats:update", () => {
    hasNewData.value = true;
    lastUpdateTime.value = new Date();
  });

  // 订阅请求完成事件
  on("request:complete", () => {
    hasNewData.value = true;
    lastUpdateTime.value = new Date();
  });

  // 订阅缓存事件
  on("request:cache:hit", () => {
    hasNewData.value = true;
    lastUpdateTime.value = new Date();
  });

  on("request:cache:miss", () => {
    hasNewData.value = true;
    lastUpdateTime.value = new Date();
  });

  /**
   * 标记数据已读取
   */
  function markAsRead(): void {
    hasNewData.value = false;
  }

  return {
    connectionState,
    hasNewData,
    lastUpdateTime,
    connect,
    disconnect,
    markAsRead,
  };
}