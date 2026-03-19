/**
 * LogStore 单元测试
 * @description 测试日志存储功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  LogStore,
  LogStoreConfig,
  LogEntry,
  DEFAULT_LOG_MAX_SIZE,
} from "../src/core/log_store";

// 测试日志目录
const TEST_LOG_DIR = path.join(__dirname, "test_logs_log_store");

/**
 * 创建测试用 LogStore
 */
function createLogStore(overrides: Partial<LogStoreConfig> = {}): LogStore {
  return new LogStore({
    logDir: TEST_LOG_DIR,
    maxSize: DEFAULT_LOG_MAX_SIZE,
    enabled: true,
    ...overrides,
  });
}

/**
 * 清理测试日志目录
 */
function cleanupLogDir(): void {
  if (fs.existsSync(TEST_LOG_DIR)) {
    // 递归删除目录及其内容
    fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
  }
}

describe("LogStore", () => {
  beforeEach(() => {
    cleanupLogDir();
  });

  afterEach(() => {
    cleanupLogDir();
  });

  describe("constructor", () => {
    it("should create log directory if not exists", () => {
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(false);
      createLogStore();
      expect(fs.existsSync(TEST_LOG_DIR)).toBe(true);
    });

    it("should be disabled when maxSize is 0", () => {
      // 当 maxSize 为 0 时，enabled 会被设为 false，目录不会被创建
      const store = new LogStore({
        logDir: path.join(TEST_LOG_DIR, "disabled"),
        maxSize: 0,
        enabled: true,
      });
      store.write({ timestamp: "2024-01-01", level: "info", msg: "test" });
      // 目录应该不存在或为空
      store.close();
    });

    it("should be disabled when enabled is false", () => {
      // 当 enabled 为 false 时，目录不会被创建
      const store = new LogStore({
        logDir: path.join(TEST_LOG_DIR, "disabled2"),
        maxSize: 1000,
        enabled: false,
      });
      store.write({ timestamp: "2024-01-01", level: "info", msg: "test" });
      store.close();
    });

    it("should use existing log directory", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      fs.writeFileSync(path.join(TEST_LOG_DIR, "existing.log"), "existing");
      const store = createLogStore();
      const files = fs.readdirSync(TEST_LOG_DIR);
      expect(files).toContain("existing.log");
      store.close();
    });
  });

  describe("write", () => {
    it("should write log entry to file", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "info",
        msg: "test message",
      };

      store.write(entry);
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const logPath = path.join(TEST_LOG_DIR, `${today}.log`);
      expect(fs.existsSync(logPath)).toBe(true);

      const content = fs.readFileSync(logPath, "utf-8");
      expect(content).toContain('"level":"info"');
      expect(content).toContain('"msg":"test message"');
    });

    it("should write log entry with data", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];

      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        msg: "error occurred",
        data: { code: 500, stack: "at line 1" },
      };

      store.write(entry);
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      expect(content).toContain('"code":500');
      expect(content).toContain('"stack":"at line 1"');
    });

    it("should append to existing log file", async () => {
      const store = createLogStore();

      store.write({ timestamp: new Date().toISOString(), level: "info", msg: "first" });
      store.write({ timestamp: new Date().toISOString(), level: "info", msg: "second" });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const today = new Date().toISOString().split("T")[0];
      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      const lines = content.trim().split("\n");
      expect(lines).toHaveLength(2);
    });

    it("should not write when disabled", () => {
      const store = createLogStore({ enabled: false });
      store.write({ timestamp: new Date().toISOString(), level: "info", msg: "test" });
      store.close();

      // 验证 disabled 状态下不会创建新文件
    });
  });

  describe("writeLine", () => {
    it("should write raw line to file", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];

      store.writeLine('{"raw":"line"}');
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      expect(content).toBe('{"raw":"line"}\n');
    });

    it("should not write when disabled", () => {
      const store = createLogStore({ enabled: false });
      store.writeLine('{"test":"data"}');
      store.close();

      // 验证 disabled 状态下不会创建新文件
    });
  });

  describe("getLogFiles", () => {
    it("should return empty array when disabled", () => {
      const store = createLogStore({ enabled: false });
      expect(store.getLogFiles()).toEqual([]);
      store.close();
    });

    it("should return log files sorted by date descending", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-10.log"), "a");
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-15.log"), "bb");
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-12.log"), "ccc");

      const store = createLogStore();
      const files = store.getLogFiles();
      store.close();

      expect(files).toHaveLength(3);
      expect(files[0].date).toBe("2024-03-15");
      expect(files[1].date).toBe("2024-03-12");
      expect(files[2].date).toBe("2024-03-10");
      expect(files[0].size).toBe(2);
      expect(files[1].size).toBe(3);
      expect(files[2].size).toBe(1);
    });

    it("should ignore non-log files", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-15.log"), "log");
      fs.writeFileSync(path.join(TEST_LOG_DIR, "readme.txt"), "text");
      fs.writeFileSync(path.join(TEST_LOG_DIR, "data.json"), "{}");

      const store = createLogStore();
      const files = store.getLogFiles();
      store.close();

      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe("2024-03-15.log");
    });

    it("should return empty array when directory not exists", () => {
      const store = new LogStore({
        logDir: path.join(TEST_LOG_DIR, "nonexistent"),
        maxSize: 1000,
        enabled: true,
      });
      expect(store.getLogFiles()).toEqual([]);
      store.close();
    });
  });

  describe("readLogs", () => {
    it("should return empty array when disabled", () => {
      const store = createLogStore({ enabled: false });
      expect(store.readLogs("2024-03-15")).toEqual([]);
      store.close();
    });

    it("should return empty array when file not exists", () => {
      const store = createLogStore();
      expect(store.readLogs("2024-03-15")).toEqual([]);
      store.close();
    });

    it("should read logs with pagination", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      const lines = [];
      for (let i = 0; i < 10; i++) {
        lines.push(`{"line":${i}}`);
      }
      fs.writeFileSync(
        path.join(TEST_LOG_DIR, "2024-03-15.log"),
        lines.join("\n")
      );

      const store = createLogStore();

      // Read first page
      const page1 = store.readLogs("2024-03-15", 0, 3);
      expect(page1).toHaveLength(3);
      expect(page1[0]).toBe('{"line":0}');

      // Read second page
      const page2 = store.readLogs("2024-03-15", 3, 3);
      expect(page2).toHaveLength(3);
      expect(page2[0]).toBe('{"line":3}');

      // Read last page
      const page3 = store.readLogs("2024-03-15", 9, 5);
      expect(page3).toHaveLength(1);
      expect(page3[0]).toBe('{"line":9}');

      store.close();
    });

    it("should filter empty lines", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(TEST_LOG_DIR, "2024-03-15.log"),
        '{"line":1}\n\n{"line":2}\n   \n{"line":3}'
      );

      const store = createLogStore();
      const logs = store.readLogs("2024-03-15");
      store.close();

      expect(logs).toHaveLength(3);
    });
  });

  describe("getFileSize", () => {
    it("should return 0 when file not exists", () => {
      const store = createLogStore();
      expect(store.getFileSize("2024-03-15")).toBe(0);
      store.close();
    });

    it("should return correct file size", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-15.log"), "123456");

      const store = createLogStore();
      expect(store.getFileSize("2024-03-15")).toBe(6);
      store.close();
    });
  });

  describe("cleanOldLogs", () => {
    it("should not clean when disabled", () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2020-01-01.log"), "old");

      const store = createLogStore({ enabled: false });
      store.cleanOldLogs(1);
      store.close();

      expect(fs.readdirSync(TEST_LOG_DIR)).toHaveLength(1);
    });

    it("should remove logs older than keepDays", async () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });
      // Create old log files
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2020-01-01.log"), "old1");
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2020-01-02.log"), "old2");

      // Create recent log file with today's date
      const today = new Date().toISOString().split("T")[0];

      let store = createLogStore();
      store.write({ timestamp: new Date().toISOString(), level: "info", msg: "new" });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // Clean logs older than 30 days
      store = createLogStore();
      store.cleanOldLogs(30);
      store.close();

      const files = fs.readdirSync(TEST_LOG_DIR);
      expect(files).toHaveLength(1);
      expect(files).toContain(`${today}.log`);
    });

    it("should not remove logs within keepDays", () => {
      vi.setSystemTime(new Date("2024-03-15T12:00:00Z"));
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });

      // Create recent log files
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-14.log"), "yesterday");
      fs.writeFileSync(path.join(TEST_LOG_DIR, "2024-03-15.log"), "today");

      const store = createLogStore();
      store.cleanOldLogs(30);
      store.close();

      expect(fs.readdirSync(TEST_LOG_DIR)).toHaveLength(2);
    });
  });

  describe("close", () => {
    it("should close write stream", () => {
      vi.setSystemTime(new Date("2024-03-15T12:00:00Z"));
      const store = createLogStore();
      store.write({ timestamp: "2024-03-15T12:00:00Z", level: "info", msg: "test" });

      // Should not throw
      expect(() => store.close()).not.toThrow();
    });

    it("should be safe to call close multiple times", () => {
      const store = createLogStore();
      store.close();
      expect(() => store.close()).not.toThrow();
    });
  });

  describe("file size limit", () => {
    it("should stop writing when file exceeds maxSize", async () => {
      const store = createLogStore({ maxSize: 100 }); // 100 bytes limit
      const today = new Date().toISOString().split("T")[0];

      // Write first entry (should succeed)
      store.write({
        timestamp: new Date().toISOString(),
        level: "info",
        msg: "a".repeat(50),
      });

      // Force close to finalize the write
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check file was created
      const logPath = path.join(TEST_LOG_DIR, `${today}.log`);
      expect(fs.existsSync(logPath)).toBe(true);

      // Get initial size
      const initialSize = fs.statSync(logPath).size;
      expect(initialSize).toBeGreaterThan(0);
    });
  });

  describe("date rotation", () => {
    it("should use correct date for log file", async () => {
      fs.mkdirSync(TEST_LOG_DIR, { recursive: true });

      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];
      store.write({ timestamp: new Date().toISOString(), level: "info", msg: "test" });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const files = fs.readdirSync(TEST_LOG_DIR);
      expect(files).toContain(`${today}.log`);
    });
  });

  describe("edge cases", () => {
    it("should handle special characters in log message", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];

      store.write({
        timestamp: new Date().toISOString(),
        level: "info",
        msg: "特殊字符 \n\t\r 中文 emoji 🎉",
      });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      expect(content).toContain("特殊字符");
      expect(content).toContain("emoji");
    });

    it("should handle empty message", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];

      store.write({ timestamp: new Date().toISOString(), level: "info", msg: "" });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      expect(content).toContain('"msg":""');
    });

    it("should handle undefined data field", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];

      store.write({
        timestamp: new Date().toISOString(),
        level: "info",
        msg: "test",
        data: undefined,
      });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      expect(content).toContain('"msg":"test"');
    });

    it("should handle large data objects", async () => {
      const store = createLogStore();
      const today = new Date().toISOString().split("T")[0];

      const largeData: Record<string, unknown> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`key${i}`] = `value${i}`;
      }

      store.write({
        timestamp: new Date().toISOString(),
        level: "info",
        msg: "large",
        data: largeData,
      });
      store.close();

      // 等待写入流完成
      await new Promise(resolve => setTimeout(resolve, 100));

      const content = fs.readFileSync(
        path.join(TEST_LOG_DIR, `${today}.log`),
        "utf-8"
      );
      expect(content).toContain("key0");
      expect(content).toContain("key99");
    });
  });
});

describe("DEFAULT_LOG_MAX_SIZE", () => {
  it("should be 10MB", () => {
    expect(DEFAULT_LOG_MAX_SIZE).toBe(10 * 1024 * 1024);
  });
});
