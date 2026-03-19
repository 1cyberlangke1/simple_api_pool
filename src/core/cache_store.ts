import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import { HOUR_MS, DAY_MS } from "./types.js";

/**
 * 缓存配置
 */
export interface CacheConfig {
  dbPath: string;
  maxEntries: number;
  /** 缓存过期时间（秒） */
  ttl?: number;
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  /** 缓存条目数量 */
  entries: number;
  /** 最大条目数 */
  maxEntries: number;
  /** 数据库文件大小（字节） */
  dbSizeBytes: number;
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
 * 缓存存储
 * @description 使用 SQLite 持久化并限制数量，支持命中率统计和 TTL 过期
 */
export class CacheStore {
  private db: Database.Database;
  private maxEntries: number;
  private ttl: number | null;
  private hits: number = 0;
  private misses: number = 0;
  private hits24h: number = 0;
  private misses24h: number = 0;
  private statsResetTime: number = Date.now();
  /** 定时器引用，用于 close() 时清理 */
  private statsTimer: NodeJS.Timeout | null = null;
  /** TTL 清理定时器 */
  private ttlTimer: NodeJS.Timeout | null = null;

  /** 缓存的 prepared statements */
  private stmtGet: Database.Statement;
  private stmtUpdateAccess: Database.Statement;
  private stmtSet: Database.Statement;
  private stmtDelete: Database.Statement;
  private stmtCount: Database.Statement;

  constructor(config: CacheConfig) {
    this.db = new Database(config.dbPath);
    this.maxEntries = Math.max(1, config.maxEntries);
    this.ttl = config.ttl ? config.ttl * 1000 : null; // 转换为毫秒

    this.db.exec(
      "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at INTEGER NOT NULL, last_access INTEGER NOT NULL)"
    );

    // 预编译常用语句
    this.stmtGet = this.db.prepare("SELECT response, created_at FROM cache WHERE key = ?");
    this.stmtUpdateAccess = this.db.prepare("UPDATE cache SET last_access = ? WHERE key = ?");
    this.stmtSet = this.db.prepare(
      "INSERT INTO cache (key, response, created_at, last_access) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET response=excluded.response, created_at=excluded.created_at, last_access=excluded.last_access"
    );
    this.stmtDelete = this.db.prepare("DELETE FROM cache WHERE key = ?");
    this.stmtCount = this.db.prepare("SELECT COUNT(*) as count FROM cache");

    // 每小时重置 24 小时统计
    this.statsTimer = setInterval(() => this.reset24hStats(), HOUR_MS);

    // 如果设置了 TTL，每小时清理过期条目
    if (this.ttl) {
      this.ttlTimer = setInterval(() => this.cleanupExpired(), HOUR_MS);
    }
  }

  /**
   * 获取缓存
   * @description 如果设置了 TTL，会检查条目是否过期
   */
  get(key: string): Record<string, unknown> | null {
    const row = this.stmtGet.get(key) as
      | { response: string; created_at: number }
      | undefined;

    if (!row) {
      this.misses++;
      this.misses24h++;
      return null;
    }

    // 检查 TTL 过期
    if (this.ttl) {
      const expiresAt = row.created_at + this.ttl;
      if (Date.now() > expiresAt) {
        // 条目已过期，删除并返回 null
        this.stmtDelete.run(key);
        this.misses++;
        this.misses24h++;
        return null;
      }
    }

    this.hits++;
    this.hits24h++;
    this.stmtUpdateAccess.run(Date.now(), key);
    return JSON.parse(row.response) as Record<string, unknown>;
  }

  /**
   * 写入缓存
   */
  set(key: string, response: Record<string, unknown>): void {
    const now = Date.now();
    this.stmtSet.run(key, JSON.stringify(response), now, now);
    this.prune();
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    const result = this.stmtDelete.run(key);
    return result.changes > 0;
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.db.exec("DELETE FROM cache");
  }

  /**
   * 获取缓存数量
   */
  size(): number {
    const row = this.stmtCount.get() as { count: number };
    return row?.count ?? 0;
  }

  /**
   * 获取过期条目数量
   */
  getExpiredCount(): number {
    if (!this.ttl) return 0;
    
    const cutoff = Date.now() - this.ttl;
    const row = this.db.prepare("SELECT COUNT(*) as count FROM cache WHERE created_at < ?").get(cutoff) as { count: number };
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
   * 获取缓存统计信息
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const total24h = this.hits24h + this.misses24h;

    return {
      entries: this.size(),
      maxEntries: this.maxEntries,
      dbSizeBytes: this.getDbSize(),
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      hits24h: this.hits24h,
      misses24h: this.misses24h,
      hitRate24h: total24h > 0 ? this.hits24h / total24h : 0,
      expiredEntries: this.getExpiredCount(),
    };
  }

  /**
   * 重置 24 小时统计
   */
  private reset24hStats(): void {
    const now = Date.now();
    // 只在超过 24 小时后重置
    if (now - this.statsResetTime >= DAY_MS) {
      this.hits24h = 0;
      this.misses24h = 0;
      this.statsResetTime = now;
    }
  }

  /**
   * 清理过期条目
   */
  private cleanupExpired(): void {
    if (!this.ttl) return;
    
    const cutoff = Date.now() - this.ttl;
    this.db.prepare("DELETE FROM cache WHERE created_at < ?").run(cutoff);
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

  /**
   * 生成缓存键
   */
  static buildKey(payload: unknown): string {
    const stable = stableStringify(payload);
    return crypto.createHash("sha256").update(stable).digest("hex");
  }

  /**
   * 裁剪缓存大小
   */
  private prune(): void {
    const count = this.size();
    if (count <= this.maxEntries) return;
    const removeCount = count - this.maxEntries;
    this.db
      .prepare("DELETE FROM cache WHERE key IN (SELECT key FROM cache ORDER BY last_access ASC LIMIT ?)")
      .run(removeCount);
  }
}

/**
 * 稳定序列化
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  const inner = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",");
  return `{${inner}}`;
}