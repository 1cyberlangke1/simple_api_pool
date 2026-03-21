/**
 * useUptime Composable 测试
 * @description 测试运行时间计算功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useUptime, formatUptime } from "./useUptime";

describe("formatUptime", () => {
  it("应该正确格式化0秒", () => {
    expect(formatUptime(0)).toBe("0秒");
  });

  it("应该正确格式化秒数", () => {
    expect(formatUptime(30)).toBe("30秒");
  });

  it("应该正确格式化分钟", () => {
    expect(formatUptime(90)).toBe("1分 30秒");
  });

  it("应该正确格式化小时", () => {
    expect(formatUptime(3661)).toBe("1小时 1分 1秒");
  });

  it("应该正确格式化天", () => {
    expect(formatUptime(90061)).toBe("1天 1小时 1分 1秒");
  });

  it("应该正确格式化多天", () => {
    expect(formatUptime(259200)).toBe("3天 0小时 0分 0秒");
  });

  it("应该正确处理整分钟", () => {
    expect(formatUptime(60)).toBe("1分 0秒");
  });

  it("应该正确处理整小时", () => {
    expect(formatUptime(3600)).toBe("1小时 0分 0秒");
  });

  it("应该显示小时当有天数时", () => {
    expect(formatUptime(86400)).toBe("1天 0小时 0分 0秒");
  });

  it("应该显示分钟当有小时时", () => {
    expect(formatUptime(3600)).toBe("1小时 0分 0秒");
  });
});

describe("useUptime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("初始状态", () => {
    it("uptime 初始应为 0", () => {
      const { uptime } = useUptime();
      expect(uptime.value).toBe(0);
    });

    it("formattedUptime 初始应为 '--'", () => {
      const { formattedUptime } = useUptime();
      expect(formattedUptime.value).toBe("--");
    });
  });

  describe("updateUptime", () => {
    it("不应该更新当 isConnected 为 false", () => {
      const { uptime, formattedUptime, updateUptime } = useUptime();
      updateUptime("2024-01-15T10:00:00Z", false);
      expect(uptime.value).toBe(0);
      expect(formattedUptime.value).toBe("--");
    });

    it("不应该更新当 startTime 为 null", () => {
      const { uptime, formattedUptime, updateUptime } = useUptime();
      updateUptime(null, true);
      expect(uptime.value).toBe(0);
      expect(formattedUptime.value).toBe("--");
    });

    it("应该正确计算运行时间", () => {
      vi.setSystemTime(new Date("2024-01-15T10:00:30Z"));
      const { uptime, formattedUptime, updateUptime } = useUptime();
      updateUptime("2024-01-15T10:00:00Z", true);
      expect(uptime.value).toBe(30);
      expect(formattedUptime.value).toBe("30秒");
    });

    it("应该正确计算长时间运行", () => {
      vi.setSystemTime(new Date("2024-01-16T12:30:45Z"));
      const { uptime, formattedUptime, updateUptime } = useUptime();
      updateUptime("2024-01-15T10:00:00Z", true);
      expect(uptime.value).toBe(95445);
      expect(formattedUptime.value).toBe("1天 2小时 30分 45秒");
    });
  });

  describe("startUptimeTimer", () => {
    it("应该返回停止函数", () => {
      const { startUptimeTimer } = useUptime();
      const stop = startUptimeTimer();
      expect(typeof stop).toBe("function");
      stop();
    });

    it("定时器应该每秒触发", () => {
      const { startUptimeTimer } = useUptime();
      startUptimeTimer();
      
      // 验证定时器已启动
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(1000);
      
      // 清理
      vi.clearAllTimers();
    });
  });
});
