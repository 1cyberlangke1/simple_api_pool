import type { QuotaConfig } from "@/api/types";

/**
 * 配额管理 Composable
 * @description 提供配额相关的格式化和计算功能
 */
export function useQuota() {
  /**
   * 获取配额显示标签
   * @param quota 配额配置
   * @returns 格式化的配额字符串
   */
  function getQuotaLabel(quota: QuotaConfig): string {
    if (quota.type === "infinite") return "无限";
    if (quota.type === "daily") return `${quota.limit} 次/日`;
    return `$${quota.limit}`;
  }

  /**
   * 获取配额标签类型（用于 Element Plus Tag）
   * @param type 配额类型
   * @returns Tag 类型
   */
  function getQuotaTagType(type: string): string {
    const types: Record<string, string> = {
      infinite: "success",
      daily: "warning",
      total: "danger",
    };
    return types[type] || "info";
  }

  /**
   * 计算配额使用百分比
   * @param quota 配额配置
   * @param used 已使用量
   * @returns 百分比 (0-100)
   */
  function getQuotaPercentage(quota: QuotaConfig, used: number): number {
    // 无限配额、无限制或限制为0时返回0
    if (quota.type === "infinite" || !quota.limit || quota.limit <= 0) return 0;
    return Math.min((used / quota.limit) * 100, 100);
  }

  /**
   * 检查配额是否已耗尽
   * @param quota 配额配置
   * @param used 已使用量
   * @returns 是否耗尽
   */
  function isQuotaExhausted(quota: QuotaConfig, used: number): boolean {
    if (quota.type === "infinite" || !quota.limit) return false;
    return used >= quota.limit;
  }

  return {
    getQuotaLabel,
    getQuotaTagType,
    getQuotaPercentage,
    isQuotaExhausted,
  };
}