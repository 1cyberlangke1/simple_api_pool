import { ref } from "vue";
import { useIntervalFn, useDateFormat } from "@vueuse/core";

// 从统一的位置导出格式化函数
export { formatBytes, formatHitRate, formatNumber } from "./useFormatters.js";

/**
 * 实时数据轮询 Composable
 * @description 基于 @vueuse/core 的轮询功能
 * @param fetchFn 数据获取函数
 * @param interval 轮询间隔（毫秒，默认 5000）
 * @param immediate 是否立即执行（默认 true）
 */
export function usePolling<T>(
  fetchFn: () => Promise<T>,
  interval: number = 5000,
  immediate: boolean = true
) {
  const data = ref<T | null>(null) as { value: T | null };
  const loading = ref(false);
  const error = ref<Error | null>(null);

  /**
   * 执行数据获取
   */
  async function fetch() {
    loading.value = true;
    error.value = null;

    try {
      data.value = await fetchFn();
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      loading.value = false;
    }
  }

  // 使用 @vueuse/core 的 useIntervalFn
  const { isActive, pause, resume } = useIntervalFn(fetch, interval, {
    immediateCallback: immediate,
    immediate: false,
  });

  // 如果需要立即开始，手动调用
  if (immediate) {
    fetch();
  }

  /**
   * 开始轮询
   */
  function start() {
    if (!isActive.value) {
      resume();
    }
  }

  /**
   * 停止轮询
   */
  function stop() {
    pause();
  }

  /**
   * 重启轮询
   */
  function restart() {
    stop();
    fetch();
    start();
  }

  return {
    data,
    loading,
    error,
    isPolling: isActive,
    fetch,
    start,
    stop,
    restart,
  };
}

/**
 * 格式化日期时间
 * @description 使用 @vueuse/core 的 useDateFormat
 */
export function formatDateTime(date: Date | number | string): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return useDateFormat(d, "YYYY-MM-DD HH:mm:ss").value;
}
