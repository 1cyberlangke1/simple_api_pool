/**
 * 统一日志模块
 * @description 提供统一的日志接口，使用 Pino 实现，支持文件输出
 * @module logger
 */

import pino from "pino";
import fs from "fs";
import path from "path";

/**
 * 日志级别
 */
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * 日志器接口
 * @note 支持两种调用方式：
 *   - log.info("message") - 只有消息
 *   - log.info({ field: value }, "message") - 数据对象 + 消息
 */
export interface Logger {
  trace(msg: string): void;
  trace(data: Record<string, unknown>, msg: string): void;
  debug(msg: string): void;
  debug(data: Record<string, unknown>, msg: string): void;
  info(msg: string): void;
  info(data: Record<string, unknown>, msg: string): void;
  warn(msg: string): void;
  warn(data: Record<string, unknown>, msg: string): void;
  error(msg: string): void;
  error(data: Record<string, unknown>, msg: string): void;
  fatal(msg: string): void;
  fatal(data: Record<string, unknown>, msg: string): void;
  child(bindings: { module?: string; plugin?: string }): Logger;
}

/**
 * 日志存储接口（简化版，用于日志模块）
 */
export interface ILogWriter {
  writeLine(line: string): void;
}

/** 全局日志写入器 */
let globalLogWriter: ILogWriter | null = null;

/**
 * 设置全局日志写入器
 * @param writer 日志写入器实例
 */
export function setLogWriter(writer: ILogWriter | null): void {
  globalLogWriter = writer;
}

/**
 * 创建文件输出流
 * @param logDir 日志目录
 * @param maxSize 最大文件大小
 * @returns 文件写入流
 */
export function createFileStream(logDir: string, maxSize: number): fs.WriteStream | null {
  if (maxSize <= 0) return null;

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0];
  const logPath = path.join(logDir, `${today}.log`);

  return fs.createWriteStream(logPath, { flags: "a" });
}

/**
 * Pino 日志器适配器
 * @description 将 Pino 日志器适配为项目统一接口，支持文件输出
 * @note 支持两种调用方式：
 *   - log.info("message") - 只有消息
 *   - log.info({ field: value }, "message") - 数据对象 + 消息
 */
class PinoLoggerAdapter implements Logger {
  constructor(private pino: pino.Logger) {}

  trace(arg1: string | Record<string, unknown>, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino.trace({}, arg1);
    } else {
      this.pino.trace(arg1, arg2!);
    }
  }

  debug(arg1: string | Record<string, unknown>, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino.debug({}, arg1);
    } else {
      this.pino.debug(arg1, arg2!);
    }
  }

  info(arg1: string | Record<string, unknown>, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino.info({}, arg1);
    } else {
      this.pino.info(arg1, arg2!);
    }
  }

  warn(arg1: string | Record<string, unknown>, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino.warn({}, arg1);
    } else {
      this.pino.warn(arg1, arg2!);
    }
  }

  error(arg1: string | Record<string, unknown>, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino.error({}, arg1);
    } else {
      this.pino.error(arg1, arg2!);
    }
  }

  fatal(arg1: string | Record<string, unknown>, arg2?: string): void {
    if (typeof arg1 === "string") {
      this.pino.fatal({}, arg1);
    } else {
      this.pino.fatal(arg1, arg2!);
    }
  }

  child(bindings: { module?: string; plugin?: string }): Logger {
    return new PinoLoggerAdapter(this.pino.child(bindings));
  }
}

/**
 * 自定义日志流
 * @description 同时写入控制台和文件
 */
class MultiStream {
  private consoleStream: pino.StreamEntry;
  private fileStream: fs.WriteStream | null = null;
  private maxSize: number;
  private logDir: string;
  private currentDate: string = "";
  private currentSize: number = 0;

  constructor(logDir: string, maxSize: number) {
    this.logDir = logDir;
    this.maxSize = maxSize;
    
    // 控制台流（使用 pino-pretty）
    const isDev = process.env.NODE_ENV !== "production";
    this.consoleStream = {
      level: "trace" as const,
      stream: isDev
        ? pino.transport({
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          })
        : process.stdout,
    };

    if (maxSize > 0) {
      this.ensureLogDir();
      this.rotateIfNeeded();
    }
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private rotateIfNeeded(): void {
    const today = new Date().toISOString().split("T")[0];
    
    if (today !== this.currentDate) {
      if (this.fileStream) {
        this.fileStream.end();
      }
      this.currentDate = today;
      this.currentSize = 0;
    }

    const logPath = path.join(this.logDir, `${today}.log`);
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      this.currentSize = stats.size;
    }

    if (this.currentSize < this.maxSize) {
      this.fileStream = fs.createWriteStream(logPath, { flags: "a" });
    } else {
      this.fileStream = null;
    }
  }

  write(data: string): void {
    // 写入控制台
    this.consoleStream.stream.write(data);

    // 写入文件
    if (this.maxSize > 0) {
      this.rotateIfNeeded();
      if (this.fileStream) {
        this.fileStream.write(data);
        this.currentSize += Buffer.byteLength(data);
      }
    }
  }
}

/**
 * 创建默认日志器
 * @description 根据环境创建合适的日志器
 */
function createDefaultLogger(): Logger {
  const level = (process.env.LOG_LEVEL as LogLevel) ?? "info";
  const logDir = process.env.LOG_DIR ?? "./logs";
  const maxSize = parseInt(process.env.LOG_MAX_SIZE ?? "10485760", 10); // 默认 10MB

  const multiStream = new MultiStream(logDir, maxSize);

  const pinoInstance = pino(
    { level },
    multiStream as unknown as pino.DestinationStream
  );

  return new PinoLoggerAdapter(pinoInstance);
}

/** 全局日志器实例 */
export const logger = createDefaultLogger();

/**
 * 创建模块日志器
 * @param moduleName 模块名称
 * @returns 带模块标签的日志器
 */
export function createModuleLogger(moduleName: string): Logger {
  return logger.child({ module: moduleName });
}

/**
 * 创建插件日志器
 * @param pluginName 插件名称
 * @returns 带插件标签的日志器
 */
export function createPluginLogger(pluginName: string): Logger {
  return logger.child({ plugin: pluginName });
}
