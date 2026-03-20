/**
 * 日志存储模块
 * @description 提供文件日志存储功能，支持大小限制和按日期轮转
 * @module log_store
 */

import fs from "fs";
import path from "path";

/**
 * 日志存储配置
 */
export interface LogStoreConfig {
  /** 日志目录路径 */
  logDir: string;
  /** 单个日志文件最大大小（字节），默认 10MB，0 表示禁用日志 */
  maxSize: number;
  /** 是否启用日志 */
  enabled: boolean;
}

/**
 * 日志条目
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  msg: string;
  data?: Record<string, unknown>;
}

/**
 * 日志文件信息
 */
export interface LogFileInfo {
  date: string;
  filename: string;
  size: number;
}

/**
 * 默认日志文件最大大小（10MB）
 */
export const DEFAULT_LOG_MAX_SIZE = 10 * 1024 * 1024;

/**
 * 日志存储类
 * @description 管理日志文件的写入和读取
 */
export class LogStore {
  private logDir: string;
  private maxSize: number;
  private enabled: boolean;
  private currentFileSize: number = 0;
  private writeStream: fs.WriteStream | null = null;
  private currentDate: string = "";

  /**
   * 创建日志存储实例
   * @param config 日志存储配置
   */
  constructor(config: LogStoreConfig) {
    this.logDir = config.logDir;
    this.maxSize = config.maxSize;
    this.enabled = config.enabled && config.maxSize > 0;

    if (this.enabled) {
      this.ensureLogDir();
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 获取当前日期字符串（YYYY-MM-DD）
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * 获取日志文件路径
   * @param date 日期字符串
   */
  private getLogFilePath(date: string): string {
    return path.join(this.logDir, `${date}.log`);
  }

  /**
   * 获取当前日志文件的写入流
   */
  private getWriteStream(): fs.WriteStream | null {
    if (!this.enabled) return null;

    const today = this.getCurrentDate();

    // 日期变化，创建新的日志文件
    if (today !== this.currentDate) {
      if (this.writeStream) {
        this.writeStream.end();
      }
      this.currentDate = today;
      this.currentFileSize = 0;
    }

    // 检查文件大小
    const logPath = this.getLogFilePath(today);
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      this.currentFileSize = stats.size;
    }

    // 如果超过最大大小，停止写入
    if (this.currentFileSize >= this.maxSize) {
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }
      return null;
    }

    // 创建新的写入流
    if (!this.writeStream) {
      this.writeStream = fs.createWriteStream(logPath, { flags: "a" });
    }

    return this.writeStream;
  }

  /**
   * 写入日志条目
   * @param entry 日志条目
   */
  write(entry: LogEntry): void {
    const stream = this.getWriteStream();
    if (!stream) return;

    const line = JSON.stringify(entry) + "\n";
    stream.write(line);
    this.currentFileSize += Buffer.byteLength(line);
  }

  /**
   * 写入原始日志行
   * @param line 日志行（JSON 字符串）
   */
  writeLine(line: string): void {
    const stream = this.getWriteStream();
    if (!stream) return;

    stream.write(line + "\n");
    this.currentFileSize += Buffer.byteLength(line) + 1;
  }

  /**
   * 获取日志文件列表
   * @returns 日志文件信息列表
   */
  getLogFiles(): LogFileInfo[] {
    if (!this.enabled || !fs.existsSync(this.logDir)) {
      return [];
    }

    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith(".log"))
      .map(filename => {
        const filePath = path.join(this.logDir, filename);
        const stats = fs.statSync(filePath);
        return {
          date: filename.replace(".log", ""),
          filename,
          size: stats.size,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return files;
  }

  /**
   * 读取指定日期的日志
   * @param date 日期字符串（YYYY-MM-DD）
   * @param offset 偏移行数（从最新的日志往前偏移，默认 0 表示从最新开始）
   * @param limit 读取行数
   * @returns 日志行列表（按时间顺序，最新的在末尾）
   */
  readLogs(date: string, offset: number = 0, limit: number = 1000): string[] {
    if (!this.enabled) return [];

    const logPath = this.getLogFilePath(date);
    if (!fs.existsSync(logPath)) {
      return [];
    }

    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim());

    // 从末尾开始读取最新的日志
    // offset=0 时返回最新的 limit 行
    // offset>0 时跳过最新的 offset 行，再返回 limit 行（用于加载更早的日志）
    const totalLines = lines.length;
    const endIdx = totalLines - offset;
    const startIdx = Math.max(0, endIdx - limit);

    return lines.slice(startIdx, endIdx);
  }

  /**
   * 获取日志文件大小
   * @param date 日期字符串
   * @returns 文件大小（字节）
   */
  getFileSize(date: string): number {
    const logPath = this.getLogFilePath(date);
    if (!fs.existsSync(logPath)) {
      return 0;
    }
    return fs.statSync(logPath).size;
  }

  /**
   * 清理旧日志文件
   * @param keepDays 保留天数
   */
  cleanOldLogs(keepDays: number = 30): void {
    if (!this.enabled || !fs.existsSync(this.logDir)) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    const files = fs.readdirSync(this.logDir)
      .filter(f => f.endsWith(".log"));

    for (const filename of files) {
      const dateStr = filename.replace(".log", "");
      const fileDate = new Date(dateStr);
      if (fileDate < cutoffDate) {
        fs.unlinkSync(path.join(this.logDir, filename));
      }
    }
  }

  /**
   * 关闭日志存储
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }
}
