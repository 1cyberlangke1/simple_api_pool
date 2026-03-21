import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import { HOUR_MS, DAY_MS } from "./types.js";

/**
 * 分组缓存配置
 */
export interface GroupCacheConfig {
  /** 最大缓存条目数 */
  maxEntries: number;
  /** 缓存过期时间（秒），不设置则永不过期 */
  ttl?: number;
}

/**
 * 分组缓存统计信息
 */
export interface GroupCacheStats {
  /** 分组名称 */
  groupName: string;
  /** 缓存条目数量 */
  entries: number;
  /** 最大条目数 */
  maxEntries: number;
  /** 缓存过期时间（秒） */
  ttl: number | null;
  /** 总命中次数 */
  hits: number;
  /** 总未命中次数 */
  misses: number;
  /** 命中率（0-1） */
  hitRate: number;
  /** 最近 24 小时命中次数 */
  hits24h: number;
  /** 最近 24 小时未命中次数 */
  misses24h: number;
  /** 最近 24 小时命中率 */
  hitRate24h: number;
  /** 过期条目数 */
  expiredEntries: number;
}

/**
 * 分组缓存管理器
 * @description 使用 SQLite 持久化，支持多分组隔离缓存，每个分组独立配置 maxEntries 和 TTL
 * @behavior 所有分组共享同一数据库文件，通过 key 前缀隔离
 */
export class GroupCacheManager {
  private db: Database.Database;
  private groups: Map<string, GroupCacheConfig> = new Map();
  private stats: Map<string, { hits: number; misses: number; hits24h: number; misses24h: number }> = new Map();
  private statsResetTime: number = Date.now();
  private statsTimer: NodeJS.Timeout | null = null;
  private ttlTimer: NodeJS.Timeout | null = null;
  private defaultConfig: GroupCacheConfig;

  /** 预编译语句 */
  private stmtGet: Database.Statement;
  private stmtUpdateAccess: Database.Statement;
  private stmtSet: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtDeleteByGroup: Database.Statement;
  private stmtCountByGroup: Database.Statement;
  private stmtCountExpiredByGroup: Database.Statement;
  private stmtPruneByGroup: Database.Statement;

  /**
   * @param dbPath SQLite 数据库文件路径
   * @param defaultConfig 默认缓存配置
   */
  constructor(dbPath: string, defaultConfig: GroupCacheConfig = { maxEntries: 100 }) {
    this.defaultConfig = defaultConfig;
    this.db = new Database(dbPath);

    // 创建缓存表（增加 group_name 字段便于查询）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS group_cache (
        key TEXT PRIMARY KEY,
        group_name TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_access INTEGER NOT NULL
      )
    `);

    // 创建分组索引加速查询
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_group_name ON group_cache(group_name)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_last_access ON group_cache(last_access)`);

    // 预编译语句
    this.stmtGet = this.db.prepare("SELECT response, created_at FROM group_cache WHERE key = ?");
    this.stmtUpdateAccess = this.db.prepare("UPDATE group_cache SET last_access = ? WHERE key = ?");
    this.stmtSet = this.db.prepare(
      "INSERT INTO group_cache (key, group_name, response, created_at, last_access) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET response=excluded.response, created_at=excluded.created_at, last_access=excluded.last_access"
    );
    this.stmtDelete = this.db.prepare("DELETE FROM group_cache WHERE key = ?");
    this.stmtDeleteByGroup = this.db.prepare("DELETE FROM group_cache WHERE group_name = ?");
    this.stmtCountByGroup = this.db.prepare("SELECT COUNT(*) as count FROM group_cache WHERE group_name = ?");
    this.stmtCountExpiredByGroup = this.db.prepare("SELECT COUNT(*) as count FROM group_cache WHERE group_name = ? AND created_at < ?");
    this.stmtPruneByGroup = this.db.prepare(
      "DELETE FROM group_cache WHERE key IN (SELECT key FROM group_cache WHERE group_name = ? ORDER BY last_access ASC LIMIT ?)"
    );

    // 每小时重置 24 小时统计
    this.statsTimer = setInterval(() => this.reset24hStats(), HOUR_MS);

    // 每小时清理过期条目
    this.ttlTimer = setInterval(() => this.cleanupExpired(), HOUR_MS);
  }

  /**
   * 注册分组缓存配置
   * @param groupName 分组名称
   * @param config 缓存配置
   */
  registerGroup(groupName: string, config: GroupCacheConfig): void {
    this.groups.set(groupName, config);
    if (!this.stats.has(groupName)) {
      this.stats.set(groupName, { hits: 0, misses: 0, hits24h: 0, misses24h: 0 });
    }
  }

  /**
   * 获取分组缓存配置
   * @param groupName 分组名称
   * @returns 缓存配置
   */
  getConfig(groupName: string): GroupCacheConfig {
    return this.groups.get(groupName) ?? this.defaultConfig;
  }

  /**
   * 生成缓存键
   * @param groupName 分组名称
   * @param payload 请求数据
   * @returns 缓存键
   */
  buildKey(groupName: string, payload: unknown): string {
    const stable = stableStringify(payload);
    const hash = crypto.createHash("sha256").update(stable).digest("hex");
    return `${groupName}:${hash}`;
  }

  /**
   * 获取缓存
   * @param groupName 分组名称
   * @param key 缓存键（不含分组前缀）
   * @returns 缓存值或 null
   */
  get(groupName: string, key: string): Record<string, unknown> | null {
    const fullKey = key.includes(":") ? key : `${groupName}:${key}`;
    const config = this.getConfig(groupName);
    const stats = this.stats.get(groupName) ?? { hits: 0, misses: 0, hits24h: 0, misses24h: 0 };

    const row = this.stmtGet.get(fullKey) as
      | { response: string; created_at: number }
      | undefined;

    if (!row) {
      stats.misses++;
      stats.misses24h++;
      this.stats.set(groupName, stats);
      return null;
    }

    // 检查 TTL 过期
    if (config.ttl) {
      const ttlMs = config.ttl * 1000;
      const expiresAt = row.created_at + ttlMs;
      if (Date.now() > expiresAt) {
        this.stmtDelete.run(fullKey);
        stats.misses++;
        stats.misses24h++;
        this.stats.set(groupName, stats);
        return null;
      }
    }

    stats.hits++;
    stats.hits24h++;
    this.stats.set(groupName, stats);
    this.stmtUpdateAccess.run(Date.now(), fullKey);
    return JSON.parse(row.response) as Record<string, unknown>;
  }

  /**
   * 写入缓存
   * @param groupName 分组名称
   * @param key 缓存键（不含分组前缀）
   * @param response 响应数据
   */
  set(groupName: string, key: string, response: Record<string, unknown>): void {
    const fullKey = key.includes(":") ? key : `${groupName}:${key}`;
    const now = Date.now();
    this.stmtSet.run(fullKey, groupName, JSON.stringify(response), now, now);
    this.prune(groupName);
  }

  /**
   * 删除缓存
   * @param groupName 分组名称
   * @param key 缓存键（不含分组前缀）
   */
  delete(groupName: string, key: string): boolean {
    const fullKey = key.includes(":") ? key : `${groupName}:${key}`;
    const result = this.stmtDelete.run(fullKey);
    return result.changes > 0;
  }

  /**
   * 清空指定分组的缓存
   * @param groupName 分组名称
   */
  clearGroup(groupName: string): void {
    this.stmtDeleteByGroup.run(groupName);
  }

  /**
   * 清空所有缓存
   */
  clearAll(): void {
    this.db.exec("DELETE FROM group_cache");
  }

  /**
   * 获取分组缓存数量
   * @param groupName 分组名称
   */
  size(groupName: string): number {
    const row = this.stmtCountByGroup.get(groupName) as { count: number };
    return row?.count ?? 0;
  }

  /**
   * 获取分组过期条目数量
   * @param groupName 分组名称
   */
  getExpiredCount(groupName: string): number {
    const config = this.getConfig(groupName);
    if (!config.ttl) return 0;
    
    const cutoff = Date.now() - config.ttl * 1000;
    const row = this.stmtCountExpiredByGroup.get(groupName, cutoff) as { count: number };
    return row?.count ?? 0;
  }

  /**
   * 获取数据库文件大小
   */
  getDbSize(): number {
    try {
      const stats = fs.statSync(this.db.name);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * 获取分组缓存统计
   * @param groupName 分组名称
   */
  getStats(groupName: string): GroupCacheStats {
    const config = this.getConfig(groupName);
    const stats = this.stats.get(groupName) ?? { hits: 0, misses: 0, hits24h: 0, misses24h: 0 };
    const total = stats.hits + stats.misses;
    const total24h = stats.hits24h + stats.misses24h;

    return {
      groupName,
      entries: this.size(groupName),
      maxEntries: config.maxEntries,
      ttl: config.ttl ?? null,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: total > 0 ? stats.hits / total : 0,
      hits24h: stats.hits24h,
      misses24h: stats.misses24h,
      hitRate24h: total24h > 0 ? stats.hits24h / total24h : 0,
      expiredEntries: this.getExpiredCount(groupName),
    };
  }

  /**
   * 获取所有分组统计
   */
  getAllStats(): GroupCacheStats[] {
    const result: GroupCacheStats[] = [];
    for (const [groupName] of this.groups) {
      result.push(this.getStats(groupName));
    }
    return result;
  }

  /**
   * 重置 24 小时统计
   */
  private reset24hStats(): void {
    const now = Date.now();
    if (now - this.statsResetTime >= DAY_MS) {
      for (const [groupName, s] of this.stats) {
        this.stats.set(groupName, { ...s, hits24h: 0, misses24h: 0 });
      }
      this.statsResetTime = now;
    }
  }

  /**
   * 清理过期条目
   */
  private cleanupExpired(): void {
    for (const [groupName, config] of this.groups) {
      if (config.ttl) {
        const cutoff = Date.now() - config.ttl * 1000;
        this.db.prepare("DELETE FROM group_cache WHERE group_name = ? AND created_at < ?").run(groupName, cutoff);
      }
    }
  }

  /**
   * 裁剪分组缓存大小
   */
  private prune(groupName: string): void {
    const config = this.getConfig(groupName);
    const count = this.size(groupName);
    if (count <= config.maxEntries) return;
    
    const removeCount = count - config.maxEntries;
    this.stmtPruneByGroup.run(groupName, removeCount);
  }

  /**
   * 关闭数据库连接并清理定时器
   */
  close(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    if (this.ttlTimer) {
      clearInterval(this.ttlTimer);
      this.ttlTimer = null;
    }
    this.db.close();
  }
}

/**
 * 稳定序列化
 * @description 使用 WeakSet 检测循环引用，防止栈溢出
 * @param value 要序列化的值
 * @param seen 已访问对象集合（用于检测循环引用）
 */
function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  
  // 循环引用检测
  if (seen.has(value as object)) {
    return '"[Circular]"';
  }
  seen.add(value as object);
  
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const inner = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, seen)}`).join(",");
  return `{${inner}}`;
}