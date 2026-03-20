/**
 * 事件系统类型定义
 * @description 定义请求生命周期中的事件类型
 * @module events
 */

import type { KeyState } from "./types.js";

// ============================================================
// 事件类型定义
// ============================================================

export type RequestEvent =
  | "request:start"
  | "request:validate"
  | "request:model:resolve"
  | "request:key:select"
  | "request:cache:hit"
  | "request:cache:miss"
  | "request:upstream:before"
  | "request:upstream:after"
  | "request:tool:call"
  | "request:complete"
  | "request:error";

/**
 * 配置变更事件类型
 * @description 当 providers/models/keys/groups 配置发生变更时触发
 */
export type ConfigEvent =
  | "config:provider:changed"
  | "config:model:changed"
  | "config:key:changed"
  | "config:group:changed";

export type AppEvent = RequestEvent | ConfigEvent;

export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

// ============================================================
// 事件数据类型
// ============================================================

/**
 * 请求开始事件
 */
export interface RequestStartEvent {
  requestId: string;
  body: Record<string, unknown>;
  timestamp: number;
}

/**
 * 请求完成事件
 */
export interface RequestCompleteEvent {
  requestId: string;
  duration: number;
  usage?: { promptTokens: number; completionTokens: number };
  cached: boolean;
}

/**
 * 请求错误事件
 */
export interface RequestErrorEvent {
  requestId: string;
  error: Error;
  stage: string;
  timestamp: number;
}

/**
 * Key 选择事件
 */
export interface KeySelectEvent {
  requestId: string;
  provider: string;
  selectedKey: KeyState;
  availableKeys: number;
}

/**
 * 工具调用事件
 */
export interface ToolCallEvent {
  requestId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  error?: Error;
  duration: number;
}

// ============================================================
// 事件发射器接口
// ============================================================

/**
 * 事件发射器接口
 * @description 用于订阅和发布请求生命周期事件及配置变更事件
 */
export interface IEventEmitter {
  on<E extends AppEvent>(event: E, handler: EventHandler): void;
  off<E extends AppEvent>(event: E, handler: EventHandler): void;
  emit<E extends AppEvent>(event: E, data: unknown): Promise<void>;
}
