/**
 * 时间常量定义
 * @description 统一管理时间相关的常量
 * @module constants
 */

/** 一分钟的毫秒数 */
export const MINUTE_MS = 60 * 1000;

/** 一小时的毫秒数 */
export const HOUR_MS = 60 * 60 * 1000;

/** 一天的毫秒数 */
export const DAY_MS = 24 * HOUR_MS;

// ============================================================
// 网络请求常量
// ============================================================

/** 默认请求超时时间（毫秒） */
export const DEFAULT_TIMEOUT_MS = 30000;

/** 汇率获取超时时间（毫秒） */
export const EXCHANGE_RATE_TIMEOUT_MS = 5000;

/** Key 最大连续失败次数 */
export const KEY_MAX_FAILURES = 3;

// ============================================================
// 缓存常量
// ============================================================

/** 默认缓存最大条目数 */
export const DEFAULT_CACHE_MAX_ENTRIES = 1000;
