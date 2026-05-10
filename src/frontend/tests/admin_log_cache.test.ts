import { beforeEach, describe, expect, it } from "vitest";

import {
  adminLogCacheStorageKey,
  applyAdminLogDelta,
  createEmptyAdminLogCache,
  persistAdminLogCache,
  restoreAdminLogCache
} from "@/lib/admin";

function createLogEntry(seq: number, msg = `log-${seq}`) {
  return {
    level: "INFO",
    msg,
    seq,
    time: `2026-05-10T12:00:${String(seq).padStart(2, "0")}Z`
  };
}

describe("admin log cache helpers", function () {
  beforeEach(function clearStoredLogCache() {
    window.localStorage.clear();
  });

  it("会把增量日志追加到本地缓存并裁剪到最近 100 条", function () {
    const payload = {
      entries: Array.from({ length: 105 }, function createSequentialLogEntry(_value, index) {
        return createLogEntry(index + 1);
      }),
      gap: false,
      next_cursor: 105
    };

    const result = applyAdminLogDelta(createEmptyAdminLogCache(), payload, 100, Date.UTC(2026, 4, 10, 12, 0, 0));

    expect(result.gapDetected).toBe(false);
    expect(result.cache.cursor).toBe(105);
    expect(result.cache.entries).toHaveLength(100);
    expect(result.cache.entries[0].seq).toBe(6);
    expect(result.cache.entries[99].seq).toBe(105);
  });

  it("会按 seq 去重合并新增日志", function () {
    const cache = {
      ...createEmptyAdminLogCache(),
      cursor: 2,
      entries: [createLogEntry(1), createLogEntry(2)]
    };

    const result = applyAdminLogDelta(cache, {
      entries: [createLogEntry(2), createLogEntry(3)],
      gap: false,
      next_cursor: 3
    }, 100, Date.UTC(2026, 4, 10, 12, 0, 1));

    expect(result.cache.entries.map(function mapSeq(entry) {
      return entry.seq;
    })).toEqual([1, 2, 3]);
    expect(result.cache.cursor).toBe(3);
  });

  it("发生日志缺口时会用 snapshot 重建本地缓存", function () {
    const cache = {
      ...createEmptyAdminLogCache(),
      cursor: 4,
      entries: [createLogEntry(3), createLogEntry(4)]
    };

    const result = applyAdminLogDelta(cache, {
      entries: [],
      gap: true,
      next_cursor: 10,
      snapshot: [createLogEntry(9), createLogEntry(10)]
    }, 100, Date.UTC(2026, 4, 10, 12, 0, 2));

    expect(result.gapDetected).toBe(true);
    expect(result.cache.cursor).toBe(10);
    expect(result.cache.entries.map(function mapSeq(entry) {
      return entry.seq;
    })).toEqual([9, 10]);
  });

  it("发生日志缺口且服务端游标回退时，会用 snapshot 和新游标覆盖旧缓存", function () {
    const cache = {
      ...createEmptyAdminLogCache(),
      cursor: 99,
      entries: [createLogEntry(98), createLogEntry(99)]
    };

    const result = applyAdminLogDelta(cache, {
      entries: [],
      gap: true,
      next_cursor: 2,
      snapshot: [createLogEntry(1, "restart-1"), createLogEntry(2, "restart-2")]
    }, 100, Date.UTC(2026, 4, 10, 12, 0, 2));

    expect(result.gapDetected).toBe(true);
    expect(result.cache.cursor).toBe(2);
    expect(result.cache.entries.map(function mapSeq(entry) {
      return entry.seq;
    })).toEqual([1, 2]);
  });

  it("会把日志缓存持久化到浏览器并恢复", function () {
    const cache = {
      ...createEmptyAdminLogCache(),
      cursor: 2,
      entries: [createLogEntry(1), createLogEntry(2)],
      updatedAt: Date.UTC(2026, 4, 10, 12, 0, 3)
    };

    persistAdminLogCache(cache);
    const restored = restoreAdminLogCache();

    expect(window.localStorage.getItem(adminLogCacheStorageKey)).toContain(`"cursor":2`);
    expect(restored.cursor).toBe(2);
    expect(restored.entries.map(function mapSeq(entry) {
      return entry.seq;
    })).toEqual([1, 2]);
    expect(restored.updatedAt).toBe(Date.UTC(2026, 4, 10, 12, 0, 3));
  });
});
