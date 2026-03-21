/**
 * 字符串格式化工具函数
 * @description 提供字符串截断、JSON 格式化等工具函数
 */

/** 长字符串截断阈值 */
export const TRUNCATE_THRESHOLD = 200;

/** 截断后显示的长度 */
export const TRUNCATE_SHOW_LENGTH = 50;

/**
 * 智能截断 JSON 中的长字符串值
 * @description 递归遍历对象，对超过阈值的长字符串进行截断，避免大数据渲染卡顿
 * @param value 要处理的值
 * @returns 处理后的值（原始值不变，返回截断后的副本）
 */
export function truncateLongStrings(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > TRUNCATE_THRESHOLD) {
      const truncated = value.slice(0, TRUNCATE_SHOW_LENGTH);
      const remaining = value.length - TRUNCATE_SHOW_LENGTH;
      return `${truncated}... [已截断 ${remaining} 字符，共 ${value.length} 字符]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => truncateLongStrings(item));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = truncateLongStrings(val);
    }
    return result;
  }

  return value;
}

/**
 * 格式化 JSON 并截断长字符串
 * @param data JSON 数据
 * @returns 格式化后的字符串
 */
export function formatJsonWithTruncate(data: unknown): string {
  const truncated = truncateLongStrings(data);
  return JSON.stringify(truncated, null, 2);
}
