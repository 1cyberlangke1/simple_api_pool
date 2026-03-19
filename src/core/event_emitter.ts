/**
 * 事件发射器
 * @description 基于 mitt 的轻量级事件系统，支持异步处理
 * @module event_emitter
 */

import mitt from "mitt";
import type { RequestEvent, EventHandler, IEventEmitter } from "./types.js";
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("events");

/**
 * 事件映射类型
 */
type EventMap = {
  [K in RequestEvent]: unknown;
};

/**
 * 事件发射器
 * @description 封装 mitt，提供异步处理和错误隔离
 */
export class EventEmitter implements IEventEmitter {
  private emitter = mitt<EventMap>();
  private onceHandlers: Map<RequestEvent, Set<EventHandler>> = new Map();

  /**
   * 订阅事件
   * @param event 事件名称
   * @param handler 处理器
   */
  on<E extends RequestEvent>(event: E, handler: EventHandler): void {
    this.emitter.on(event, handler as (data: unknown) => void);
  }

  /**
   * 订阅一次性事件
   * @param event 事件名称
   * @param handler 处理器
   */
  once<E extends RequestEvent>(event: E, handler: EventHandler): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }

  /**
   * 取消订阅
   * @param event 事件名称
   * @param handler 处理器
   */
  off<E extends RequestEvent>(event: E, handler: EventHandler): void {
    this.emitter.off(event, handler as (data: unknown) => void);
    this.onceHandlers.get(event)?.delete(handler);
  }

  /**
   * 发射事件
   * @param event 事件名称
   * @param data 事件数据
   */
  async emit<E extends RequestEvent>(event: E, data: unknown): Promise<void> {
    // 执行持久处理器（mitt 内部同步调用）
    const handlers = this.emitter.all.get(event);
    if (handlers) {
      const handlerList = Array.isArray(handlers) ? handlers : [handlers];
      for (const handler of handlerList) {
        try {
          await (handler as EventHandler)(data);
        } catch (err) {
          log.error({ error: err }, `Event handler error [${event}]`);
        }
      }
    }

    // 执行一次性处理器
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      for (const handler of onceHandlers) {
        try {
          await handler(data);
        } catch (err) {
          log.error({ error: err }, `Once handler error [${event}]`);
        }
      }
      onceHandlers.clear();
    }
  }

  /**
   * 移除所有处理器
   * @param event 可选的事件名称，不传则清空所有
   */
  clear(event?: RequestEvent): void {
    if (event) {
      this.emitter.all.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.emitter.all.clear();
      this.onceHandlers.clear();
    }
  }

  /**
   * 获取事件监听器数量
   * @param event 事件名称
   */
  listenerCount(event: RequestEvent): number {
    const handlers = this.emitter.all.get(event);
    const persistent = handlers ? (Array.isArray(handlers) ? handlers.length : 1) : 0;
    const once = this.onceHandlers.get(event)?.size ?? 0;
    return persistent + once;
  }
}
