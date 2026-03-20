/**
 * SSE (Server-Sent Events) 路由
 * @description 实现服务器推送，替代前端轮询，优化性能
 * @module routes/admin/sse_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply, preValidationAsyncHookHandler } from "fastify";
import type { RequestEvent, ConfigEvent } from "../../core/events.js";
import { createModuleLogger } from "../../core/logger.js";

const log = createModuleLogger("sse");

/**
 * SSE 专用认证中间件
 * @description 支持 query 参数 token，因为 EventSource 不支持自定义 header
 * @param adminToken 管理员令牌
 * @returns Fastify preHandler 函数
 */
function sseAuth(adminToken: string): preValidationAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // 优先从 query 参数获取 token（EventSource 不支持自定义 header）
    const queryToken = (request.query as { token?: string }).token;
    // 也支持 header 方式
    const header = request.headers.authorization ?? "";
    const headerToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const alt = (request.headers["x-admin-token"] as string | undefined) ?? "";

    if (queryToken !== adminToken && headerToken !== adminToken && alt !== adminToken) {
      return reply.status(401).send({ error: "unauthorized" });
    }
  };
}

/**
 * SSE 客户端连接
 */
interface SSEClient {
  id: string;
  reply: FastifyReply;
  subscribedEvents: Set<string>;
  lastHeartbeat: number;
}

/**
 * 注册 SSE 路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerSSERoutes(app: FastifyInstance, adminToken: string): void {
  // 存储活跃的 SSE 连接
  const clients = new Map<string, SSEClient>();

  /**
   * 发送 SSE 消息
   * @param client 客户端
   * @param event 事件名
   * @param data 数据
   */
  function sendEvent(client: SSEClient, event: string, data: unknown): boolean {
    try {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.reply.raw.write(payload);
      return true;
    } catch (err) {
      log.warn({ error: err }, `Failed to send event to client ${client.id}`);
      return false;
    }
  }

  /**
   * 广播事件给所有订阅的客户端
   * @param eventName 事件名
   * @param data 数据
   */
  function broadcast(eventName: string, data: unknown): void {
    let activeCount = 0;
    for (const client of clients.values()) {
      // 检查客户端是否订阅了此事件（空集合表示订阅所有事件）
      if (client.subscribedEvents.size === 0 || client.subscribedEvents.has(eventName)) {
        if (sendEvent(client, eventName, data)) {
          activeCount++;
        }
      }
    }
    if (activeCount > 0) {
      log.debug(`Broadcast [${eventName}] to ${activeCount} clients`);
    }
  }

  // 订阅后端事件系统
  const requestEventTypes: RequestEvent[] = [
    "request:start",
    "request:complete",
    "request:error",
    "request:cache:hit",
    "request:cache:miss",
    "request:key:select",
  ];

  const configEventTypes: ConfigEvent[] = [
    "config:provider:changed",
    "config:model:changed",
    "config:key:changed",
    "config:group:changed",
  ];

  const eventHandlers = new Map<RequestEvent | ConfigEvent, (data: unknown) => void>();

  for (const eventType of requestEventTypes) {
    const handler = (data: unknown) => broadcast(eventType, data);
    eventHandlers.set(eventType, handler);
    app.runtime.eventEmitter.on(eventType, handler);
  }

  for (const eventType of configEventTypes) {
    const handler = (data: unknown) => broadcast(eventType, data);
    eventHandlers.set(eventType, handler);
    app.runtime.eventEmitter.on(eventType, handler);
  }

  // SSE 端点 - 统计更新推送
  app.get("/sse/stats", { preHandler: sseAuth(adminToken) }, async (request: FastifyRequest, reply: FastifyReply) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // 设置 SSE 响应头
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // 禁用 nginx 缓冲
    reply.raw.flushHeaders?.();

    // 注册客户端
    const client: SSEClient = {
      id: clientId,
      reply,
      subscribedEvents: new Set(), // 空集合 = 订阅所有事件
      lastHeartbeat: Date.now(),
    };
    clients.set(clientId, client);

    // 发送初始连接成功消息
    sendEvent(client, "connected", { clientId, timestamp: Date.now() });

    // 立即发送当前统计数据
    try {
      const stats = app.runtime.statsStore.getHourlyStats(undefined, 24);
      sendEvent(client, "stats:update", { type: "hourly", data: stats });
    } catch (err) {
      log.warn({ error: err }, "Failed to send initial stats");
    }

    log.info(`SSE client connected: ${clientId}, total: ${clients.size}`);

    // 保持连接
    const heartbeatInterval = setInterval(() => {
      if (clients.has(clientId)) {
        const client = clients.get(clientId)!;
        client.lastHeartbeat = Date.now();
        sendEvent(client, "heartbeat", { timestamp: Date.now() });
      }
    }, 30000); // 30秒心跳

    // 清理断开的连接
    request.raw.on("close", () => {
      clearInterval(heartbeatInterval);
      clients.delete(clientId);
      log.info(`SSE client disconnected: ${clientId}, total: ${clients.size}`);
    });

    // 保持请求不结束
    return new Promise(() => {});
  });

  // 手动触发统计数据推送（供内部调用）
  app.decorate("sseBroadcastStats", (data: unknown) => {
    broadcast("stats:update", data);
  });

  // 清理超时连接的定时任务
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clients) {
      if (now - client.lastHeartbeat > 120000) { // 2分钟无心跳则断开
        log.warn(`Cleaning up stale SSE client: ${id}`);
        client.reply.raw.end();
        clients.delete(id);
      }
    }
  }, 60000);

  // 应用关闭时清理
  app.addHook("onClose", async () => {
    clearInterval(cleanupInterval);
    for (const [eventType, handler] of eventHandlers) {
      app.runtime.eventEmitter.off(eventType, handler);
    }
    for (const client of clients.values()) {
      client.reply.raw.end();
    }
    clients.clear();
    log.info("SSE routes closed, all clients disconnected");
  });
};

// 扩展 Fastify 类型
declare module "fastify" {
  interface FastifyInstance {
    sseBroadcastStats?: (data: unknown) => void;
  }
}
