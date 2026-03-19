import { ref } from "vue";
import { getExchangeRate, type ExchangeRateData } from "@/api/types";

/**
 * 货币转换 Composable
 * @description 提供货币转换和格式化功能
 */
export function useCurrency() {
  const showCNY = ref(false);
  const exchangeRate = ref<ExchangeRateData | null>(null);
  const loading = ref(false);

  /**
   * 获取汇率
   */
  async function fetchExchangeRate(): Promise<void> {
    loading.value = true;
    try {
      const { data } = await getExchangeRate("USD", "CNY");
      exchangeRate.value = data;
    } catch {
      // 忽略错误
    } finally {
      loading.value = false;
    }
  }

  /**
   * 格式化价格显示
   * @param usd 美元价格
   * @param cny 人民币价格（可选，不传则自动计算）
   * @returns 格式化的价格字符串
   */
  function formatPrice(usd?: number, cny?: number): string {
    if (showCNY.value && exchangeRate.value) {
      const cnyValue = cny ?? (usd !== undefined ? usd * exchangeRate.value.rate : undefined);
      if (cnyValue !== undefined) {
        return `¥${cnyValue.toFixed(6)}`;
      }
    }
    if (usd !== undefined) {
      return `$${usd.toFixed(6)}`;
    }
    return "-";
  }

  /**
   * 转换为人民币
   * @param usd 美元金额
   * @returns 人民币金额
   */
  function toCNY(usd: number): number {
    if (!exchangeRate.value) return usd;
    return usd * exchangeRate.value.rate;
  }

  /**
   * 转换为美元
   * @param cny 人民币金额
   * @returns 美元金额
   */
  function toUSD(cny: number): number {
    if (!exchangeRate.value) return cny;
    return cny / exchangeRate.value.rate;
  }

  /**
   * 切换货币显示
   */
  function toggleCurrency(): void {
    showCNY.value = !showCNY.value;
  }

  return {
    showCNY,
    exchangeRate,
    loading,
    fetchExchangeRate,
    formatPrice,
    toCNY,
    toUSD,
    toggleCurrency,
  };
}