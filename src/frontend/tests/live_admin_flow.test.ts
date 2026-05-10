import { describe, expect, it } from "vitest";

import { adminLogCacheMaxEntries, createEmptyAdminLogCache } from "@/lib/admin";
import { createAdminLiveSnapshot, reduceAdminLiveEvent } from "@/lib/live";

function createLogEntry(seq: number, msg = `log-${seq}`) {
  return {
    level: "INFO",
    msg,
    seq,
    time: `2026-05-10T12:00:${String(seq).padStart(2, "0")}Z`
  };
}

describe("admin live helpers", function () {
  it("用 admin bootstrap 初始化 overview 和 global config", function () {
    const snapshot = createAdminLiveSnapshot({
      global_config: {
        admin_key_configured: true,
        client_key_count: 2,
        client_keys: ["a", "b"],
        token_estimation_enabled: true
      },
      health: { status: "ok" },
      provider_stats: {
        openai: {
          success_count: 4
        }
      },
      providers: [{
        base_url: "https://api.openai.com/v1",
        cache_enabled: false,
        cache_max_entries: 1000,
        fail_threshold: 3,
        keys: [],
        key_strategy: "round_robin",
        max_disable_secs: 3600,
        min_disable_secs: 30,
        name: "openai",
        type: "openai_chat"
      }],
      recent_logs: [createLogEntry(8)],
      stream_cursor: 8
    }, createEmptyAdminLogCache(), adminLogCacheMaxEntries, Date.UTC(2026, 4, 10, 12, 0, 8));

    expect(snapshot.cursor).toBe(8);
    expect(snapshot.overview.global_config.client_keys).toEqual(["a", "b"]);
    expect(snapshot.overview.providers).toHaveLength(1);
    expect(snapshot.logCache.entries.map(function mapSeq(entry) {
      return entry.seq;
    })).toEqual([8]);
  });

  it("收到 log_append 时追加日志并保留最多 100 条", function () {
    const initialSnapshot = createAdminLiveSnapshot({
      global_config: {
        admin_key_configured: true,
        client_key_count: 0,
        client_keys: [],
        token_estimation_enabled: false
      },
      recent_logs: Array.from({ length: 100 }, function createEntry(_value, index) {
        return createLogEntry(index + 1);
      }),
      stream_cursor: 100
    }, createEmptyAdminLogCache(), adminLogCacheMaxEntries, Date.UTC(2026, 4, 10, 12, 1, 40));

    const result = reduceAdminLiveEvent(initialSnapshot, {
      data: createLogEntry(101),
      lastEventId: 101,
      type: "log_append"
    }, adminLogCacheMaxEntries, Date.UTC(2026, 4, 10, 12, 1, 41));

    expect(result.requiresBootstrap).toBe(false);
    expect(result.snapshot.cursor).toBe(101);
    expect(result.snapshot.logCache.entries).toHaveLength(100);
    expect(result.snapshot.logCache.entries[0].seq).toBe(2);
    expect(result.snapshot.logCache.entries[99].seq).toBe(101);
  });

  it("收到 global_config_changed 时会要求重拉 bootstrap", function () {
    const initialSnapshot = createAdminLiveSnapshot({
      global_config: {
        admin_key_configured: true,
        client_key_count: 1,
        client_keys: ["client-key"],
        token_estimation_enabled: false
      },
      stream_cursor: 15
    }, createEmptyAdminLogCache(), adminLogCacheMaxEntries, Date.UTC(2026, 4, 10, 12, 2, 0));

    const result = reduceAdminLiveEvent(initialSnapshot, {
      data: { reason: "global_config_changed" },
      lastEventId: 16,
      type: "global_config_changed"
    }, adminLogCacheMaxEntries, Date.UTC(2026, 4, 10, 12, 2, 1));

    expect(result.requiresBootstrap).toBe(true);
    expect(result.snapshot.cursor).toBe(16);
    expect(result.snapshot.overview.global_config.client_keys).toEqual(["client-key"]);
  });
});
