import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { HOUR_MS } from "./types.js";

/**
 * 分组调用统计
 * @description 记录每个分组（池子）每小时的调用次数和成功率
 */
export interface GroupHourlyStats {
  /** 分组名称 */
  group: string;
  /** 小时时间戳（YYYY-MM-DD HH:00:00） */
  hour: string;
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCalls: number;
  /** 失败次数 */
  failedCalls: number;
  /** 成功率（0-100） */
  successRate: number;
}

/**
 * 统计查询参数
 */
export interface StatsQuery {
  /** 分组名称（可选，不指定则返回所有分组） */
  group?: string;
  /** 开始时间（ISO 字符串） */
  startTime?: string;
  /** 结束时间（ISO 字符串） */
  endTime?: string;
  /** 限制返回条数 */
  limit?: number;
}

/**
 * 统计存储服务
 * @description 记录和查询分组调用统计数据
 * @example
 * const store = new StatsStore("./config/stats.sqlite");
 * store.recordCall("default", true);
 * const stats = store.getHourlyStats("default", 24);
 */
export class StatsStore {
  private db: Database.Database;
  /** 缓存的 prepared statement */
  private stmtRecordCall: Database.Statement;

  /**
   * 初始化统计存储
   * @param dbPath 数据库文件路径
   */
  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initTables();

    // 预编译常用语句
    this.stmtRecordCall = this.db.prepare(`
      INSERT INTO hourly_stats (group_name, hour, total_calls, success_calls, failed_calls, updated_at)
      VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(group_name, hour) DO UPDATE SET
        total_calls = total_calls + 1,
        success_calls = success_calls + ?,
        failed_calls = failed_calls + ?,
        updated_at = ?
    `);
  }

  /**
   * 初始化数据表
   * @description 创建统计表和索引
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hourly_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT NOT NULL,
        hour TEXT NOT NULL,
        total_calls INTEGER DEFAULT 0,
        success_calls INTEGER DEFAULT 0,
        failed_calls INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(group_name, hour)
      );

      CREATE INDEX IF NOT EXISTS idx_hourly_stats_group ON hourly_stats(group_name);
      CREATE INDEX IF NOT EXISTS idx_hourly_stats_hour ON hourly_stats(hour);
    `);
  }

  /**
   * 记录一次调用
   * @param group 分组名称
   * @param success 是否成功
   * @description 自动按小时聚合统计，使用预编译语句提高性能
   */
  recordCall(group: string, success: boolean): void {
    // 只创建一次 Date 对象，避免重复创建
    const now = new Date();
    const hour = this.formatHour(now);
    const timestamp = Math.floor(now.getTime() / 1000);

    // 使用缓存的预编译语句
    this.stmtRecordCall.run(
      group,
      hour,
      success ? 1 : 0,
      success ? 0 : 1,
      timestamp,
      success ? 1 : 0,
      success ? 0 : 1,
      timestamp
    );
  }

  /**
   * 将日期格式化为小时字符串
   * @param date 日期对象，不传则使用当前时间
   * @returns 格式: YYYY-MM-DD HH:00:00
   */
  private formatHour(date?: Date): string {
    const d = date ?? new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hour = String(d.getHours()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:00:00`;
  }

  /**
   * 获取小时统计数据
   * @param group 分组名称（可选，不指定则返回所有分组）
   * @param hours 返回最近多少小时的数据
   * @returns 统计数据数组
   */
  getHourlyStats(group?: string, hours: number = 24): GroupHourlyStats[] {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * HOUR_MS);

    // 注意：group 是 SQLite 保留关键字，必须用双引号转义
    let sql = `
      SELECT
        group_name as "group",
        hour,
        total_calls as totalCalls,
        success_calls as successCalls,
        failed_calls as failedCalls,
        CASE
          WHEN total_calls > 0 THEN ROUND(success_calls * 100.0 / total_calls, 2)
          ELSE 0
        END as successRate
      FROM hourly_stats
      WHERE hour >= ? AND hour <= ?
    `;

    const params: (string | number)[] = [
      this.formatHour(startTime),
      this.formatHour(endTime),
    ];

    if (group) {
      sql += " AND group_name = ?";
      params.push(group);
    }

    sql += " ORDER BY hour DESC, group_name ASC";

    if (hours > 0) {
      sql += " LIMIT ?";
      params.push(hours * 10); // 每小时最多 10 个分组
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as GroupHourlyStats[];
  }

  /**
   * 获取分组汇总统计
   * @param hours 统计最近多少小时
   * @returns 分组汇总数组
   */
  getGroupSummary(hours: number = 24): Array<{
    group: string;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    successRate: number;
    avgCallsPerHour: number;
  }> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * HOUR_MS);

    // 注意：group 是 SQLite 保留关键字，必须用双引号转义
    const sql = `
      SELECT
        group_name as "group",
        SUM(total_calls) as totalCalls,
        SUM(success_calls) as successCalls,
        SUM(failed_calls) as failedCalls,
        CASE
          WHEN SUM(total_calls) > 0 THEN ROUND(SUM(success_calls) * 100.0 / SUM(total_calls), 2)
          ELSE 0
        END as successRate,
        ROUND(SUM(total_calls) * 1.0 / ?, 2) as avgCallsPerHour
      FROM hourly_stats
      WHERE hour >= ? AND hour <= ?
      GROUP BY group_name
      ORDER BY totalCalls DESC
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(hours, this.formatHour(startTime), this.formatHour(endTime)) as Array<{
      group: string;
      totalCalls: number;
      successCalls: number;
      failedCalls: number;
      successRate: number;
      avgCallsPerHour: number;
    }>;
  }

  /**
   * 清理过期数据
   * @param daysToKeep 保留天数
   */
  cleanup(daysToKeep: number = 30): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    const stmt = this.db.prepare("DELETE FROM hourly_stats WHERE hour < ?");
    stmt.run(this.formatHour(cutoff));
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }
}
