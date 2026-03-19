import { MINUTE_MS } from "./types.js";

/**
 * RPM 限流器
 * @description 简单滑动窗口按分钟计数的限流实现
 */
export class RpmLimiter {
  private windowStart: number;
  private count: number;

  /**
   * 创建限流器实例
   * @param rpmLimit 每分钟请求数限制
   */
  constructor(private rpmLimit: number) {
    this.windowStart = Date.now();
    this.count = 0;
  }

  /**
   * 检查是否允许请求
   * @returns 是否允许（true = 允许，false = 被限流）
   */
  allow(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= MINUTE_MS) {
      this.windowStart = now;
      this.count = 0;
    }
    if (this.count >= this.rpmLimit) {
      return false;
    }
    this.count++;
    return true;
  }
}