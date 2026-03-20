import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * Key 使用状态持久化数据
 * @description 仅持久化需要保留的状态
 */
export interface KeyUsageRecord {
  /** Key 别名（主键） */
  alias: string;
  /** 每日使用次数 */
  dailyCount: number;
  /** 每日计数重置日期 (YYYY-MM-DD) */
  dailyResetDate: string;
  /** 总消耗金额 */
  totalCost: number;
}

/**
 * Key 使用状态持久化存储
 * @description 持久化 Key 的使用状态，重启后恢复
 * @example
 * const store = new KeyUsageStore("./config/key_usage.sqlite");
 * store.set("my-key", { dailyCount: 5, dailyResetDate: "2024-01-15", totalCost: 0.05 });
 * const usage = store.get("my-key");
 */
export class KeyUsageStore {
  private db: Database.Database;
  private stmtGet: Database.Statement;
  private stmtSet: Database.Statement;
  private stmtGetAll: Database.Statement;

  /**
   * 初始化存储
   * @param dbPath 数据库文件路径
   */
  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initTables();

    // 预编译语句
    this.stmtGet = this.db.prepare("SELECT * FROM key_usage WHERE alias = ?");
    this.stmtSet = this.db.prepare(`
      INSERT INTO key_usage (alias, daily_count, daily_reset_date, total_cost, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(alias) DO UPDATE SET
        daily_count = ?,
        daily_reset_date = ?,
        total_cost = ?,
        updated_at = ?
    `);
    this.stmtGetAll = this.db.prepare("SELECT * FROM key_usage");
  }

  /**
   * 初始化数据表
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS key_usage (
        alias TEXT PRIMARY KEY,
        daily_count INTEGER DEFAULT 0,
        daily_reset_date TEXT DEFAULT '',
        total_cost REAL DEFAULT 0,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_key_usage_reset_date ON key_usage(daily_reset_date);
    `);
  }

  /**
   * 获取当前日期字符串
   * @returns YYYY-MM-DD 格式
   */
  private getCurrentDate(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  /**
   * 获取 Key 使用状态
   * @param alias Key 别名
   * @returns 使用状态，不存在返回 null
   */
  get(alias: string): KeyUsageRecord | null {
    const row = this.stmtGet.get(alias) as {
      alias: string;
      daily_count: number;
      daily_reset_date: string;
      total_cost: number;
    } | undefined;

    if (!row) return null;

    // 检查日期是否需要重置
    const today = this.getCurrentDate();
    const dailyCount = row.daily_reset_date === today ? row.daily_count : 0;

    return {
      alias: row.alias,
      dailyCount,
      dailyResetDate: today,
      totalCost: row.total_cost,
    };
  }

  /**
   * 设置 Key 使用状态
   * @param alias Key 别名
   * @param data 使用状态数据
   */
  set(alias: string, data: Omit<KeyUsageRecord, "alias">): void {
    const timestamp = Math.floor(Date.now() / 1000);
    this.stmtSet.run(
      alias,
      data.dailyCount,
      data.dailyResetDate,
      data.totalCost,
      timestamp,
      data.dailyCount,
      data.dailyResetDate,
      data.totalCost,
      timestamp
    );
  }

  /**
   * 获取所有 Key 使用状态
   * @returns 使用状态数组
   */
  getAll(): KeyUsageRecord[] {
    const rows = this.stmtGetAll.all() as Array<{
      alias: string;
      daily_count: number;
      daily_reset_date: string;
      total_cost: number;
    }>;

    const today = this.getCurrentDate();

    return rows.map((row) => ({
      alias: row.alias,
      dailyCount: row.daily_reset_date === today ? row.daily_count : 0,
      dailyResetDate: today,
      totalCost: row.total_cost,
    }));
  }

  /**
   * 删除 Key 使用状态
   * @param alias Key 别名
   */
  delete(alias: string): void {
    this.db.prepare("DELETE FROM key_usage WHERE alias = ?").run(alias);
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}
