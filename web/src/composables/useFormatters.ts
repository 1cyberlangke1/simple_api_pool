/**
 * 格式化工具函数
 * @description 提供常用的格式化函数
 * @module useFormatters
 */

/**
 * 格式化字节数为可读字符串
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 格式化命中率
 * @param rate 命中率（0-1）
 * @returns 格式化后的百分比字符串
 */
export function formatHitRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * 格式化数字（添加千分位）
 * @param num 数字
 * @returns 格式化后的字符串
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * 格式化小时字符串
 * @param hour 小时字符串（格式：2024-01-15T10）
 * @returns 格式化后的小时（如：10:00）
 */
export function formatHour(hour: string): string {
  const match = hour.match(/T(\d+)$/);
  return match ? `${match[1]}:00` : hour;
}

/**
 * 格式化工具 Composable
 * @description 提供格式化工具函数的 composable
 */
export function useFormatters() {
  return {
    formatBytes,
    formatHitRate,
    formatNumber,
    formatHour,
  };
}
