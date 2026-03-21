/**
 * 运行时间计算
 * @description 计算并格式化服务运行时间
 */

import { ref, type Ref } from "vue";

/**
 * 运行时间返回类型
 */
export interface UseUptimeReturn {
  /** 运行秒数 */
  uptime: Ref<number>;
  /** 格式化后的运行时间字符串 */
  formattedUptime: Ref<string>;
  /** 更新运行时间 */
  updateUptime: (startTime: string | null, isConnected: boolean) => void;
  /** 启动定时更新 */
  startUptimeTimer: () => () => void;
}

/**
 * 格式化运行时间为可读字符串
 * @param seconds 总秒数
 * @returns 格式化的时间字符串 (如 "2天 3小时 15分 30秒")
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0 || days > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分`);
  parts.push(`${secs}秒`);

  return parts.join(" ");
}

/**
 * 运行时间计算 Composable
 * @description 管理服务运行时间的计算和显示
 * @returns 运行时间状态和方法
 */
export function useUptime(): UseUptimeReturn {
  const uptime = ref(0);
  const formattedUptime = ref("--");

  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * 更新运行时间
   * @param startTime 服务启动时间 (ISO 8601)
   * @param isConnected 后端是否连接正常
   */
  function updateUptime(startTime: string | null, isConnected: boolean): void {
    if (!isConnected || !startTime) {
      return;
    }

    const startMs = new Date(startTime).getTime();
    const nowMs = Date.now();
    uptime.value = Math.floor((nowMs - startMs) / 1000);
    formattedUptime.value = formatUptime(uptime.value);
  }

  /**
   * 启动定时更新
   * @returns 停止定时器的函数
   */
  function startUptimeTimer(): () => void {
    if (timer) {
      clearInterval(timer);
    }

    timer = setInterval(() => {
      // 此处需要外部传入 startTime 和 isConnected
      // 实际更新逻辑由外部调用 updateUptime
    }, 1000);

    return () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }

  return {
    uptime,
    formattedUptime,
    updateUptime,
    startUptimeTimer,
  };
}
