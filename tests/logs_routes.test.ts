/**
 * logs_routes 单元测试
 * @description 测试日志管理路由 API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { registerLogsRoutes } from "../src/routes/admin/logs_routes.js";
import type { LogStore, LogFileInfo } from "../src/core/log_store.js";

// Mock LogStore
function createMockLogStore(): LogStore {
  return {
    getLogFiles: vi.fn(),
    readLogs: vi.fn(),
    getFileSize: vi.fn(),
    write: vi.fn(),
    writeLine: vi.fn(),
    cleanOldLogs: vi.fn(),
    close: vi.fn(),
  } as unknown as LogStore;
}

describe("logs_routes", () => {
  const adminToken = "test-admin-token";
  let app: ReturnType<typeof Fastify>;
  let mockLogStore: LogStore;

  beforeEach(async () => {
    app = Fastify();
    mockLogStore = createMockLogStore();
    registerLogsRoutes(app, adminToken, mockLogStore);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/logs", () => {
    it("should return log files list", async () => {
      const mockFiles: LogFileInfo[] = [
        { date: "2024-03-15", filename: "2024-03-15.log", size: 1024 },
        { date: "2024-03-14", filename: "2024-03-14.log", size: 512 },
      ];
      vi.mocked(mockLogStore.getLogFiles).mockReturnValue(mockFiles);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        files: mockFiles,
        total: 2,
      });
    });

    it("should return empty list when no log files", async () => {
      vi.mocked(mockLogStore.getLogFiles).mockReturnValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        files: [],
        total: 0,
      });
    });

    it("should reject request without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/logs",
      });

      expect(response.statusCode).toBe(401);
    });

    it("should reject request with invalid token", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/logs",
        headers: { authorization: "Bearer invalid-token" },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/logs/content", () => {
    it("should return log content for valid date", async () => {
      const mockLogs = ['{"level":"info","msg":"test"}', '{"level":"error","msg":"error"}'];
      vi.mocked(mockLogStore.readLogs).mockReturnValue(mockLogs);
      vi.mocked(mockLogStore.getFileSize).mockReturnValue(100);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs/content?date=2024-03-15",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        date: "2024-03-15",
        logs: mockLogs,
        offset: 0,
        limit: 1000,
        total: 2,
        fileSize: 100,
      });
      expect(mockLogStore.readLogs).toHaveBeenCalledWith("2024-03-15", 0, 1000);
    });

    it("should support pagination", async () => {
      vi.mocked(mockLogStore.readLogs).mockReturnValue([]);
      vi.mocked(mockLogStore.getFileSize).mockReturnValue(0);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs/content?date=2024-03-15&offset=100&limit=50",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      // query params are strings, route should convert to numbers
      expect(mockLogStore.readLogs).toHaveBeenCalledWith("2024-03-15", "100", "50");
    });

    it("should reject request without date parameter", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/logs/content",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "date parameter is required" });
    });

    it("should reject invalid date format", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/logs/content?date=2024/03/15",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid date format, expected YYYY-MM-DD" });
    });

    it("should reject date with wrong format", async () => {
      const invalidDates = [
        "2024-3-15", // 单数月份
        "2024-03-5", // 单数日期
        "24-03-15", // 短年份
        "2024-03-15-extra", // 额外字符
        "2024.03.15", // 点分隔
        "not-a-date", // 非日期
      ];

      for (const date of invalidDates) {
        const response = await app.inject({
          method: "GET",
          url: `/api/logs/content?date=${date}`,
          headers: { authorization: `Bearer ${adminToken}` },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error).toContain("invalid date format");
      }
    });

    it("should return empty array when no logs for date", async () => {
      vi.mocked(mockLogStore.readLogs).mockReturnValue([]);
      vi.mocked(mockLogStore.getFileSize).mockReturnValue(0);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs/content?date=2024-03-15",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().logs).toEqual([]);
    });

    it("should reject request without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/logs/content?date=2024-03-15",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /api/logs/config", () => {
    it("should return log configuration", async () => {
      const mockFiles: LogFileInfo[] = [
        { date: "2024-03-15", filename: "2024-03-15.log", size: 1024 },
        { date: "2024-03-14", filename: "2024-03-14.log", size: 512 },
      ];
      vi.mocked(mockLogStore.getLogFiles).mockReturnValue(mockFiles);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs/config",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        enabled: true,
        totalFiles: 2,
        totalSize: 1536,
      });
    });

    it("should return zero stats when no files", async () => {
      vi.mocked(mockLogStore.getLogFiles).mockReturnValue([]);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs/config",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        enabled: true,
        totalFiles: 0,
        totalSize: 0,
      });
    });

    it("should reject request without auth", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/logs/config",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("edge cases", () => {
    it("should handle large file sizes correctly", async () => {
      const mockFiles: LogFileInfo[] = [
        { date: "2024-03-15", filename: "2024-03-15.log", size: 1024 * 1024 * 100 }, // 100MB
      ];
      vi.mocked(mockLogStore.getLogFiles).mockReturnValue(mockFiles);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs/config",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().totalSize).toBe(1024 * 1024 * 100);
    });

    it("should handle many log files", async () => {
      const mockFiles: LogFileInfo[] = Array.from({ length: 100 }, (_, i) => ({
        date: `2024-03-${String(i + 1).padStart(2, "0")}`,
        filename: `2024-03-${String(i + 1).padStart(2, "0")}.log`,
        size: 1024,
      }));
      vi.mocked(mockLogStore.getLogFiles).mockReturnValue(mockFiles);

      const response = await app.inject({
        method: "GET",
        url: "/api/logs",
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().total).toBe(100);
    });
  });
});
