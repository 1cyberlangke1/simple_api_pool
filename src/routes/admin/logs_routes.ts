/**
 * 日志管理路由
 * @description 提供日志查询 API
 * @module routes/admin/logs_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import type { LogFileInfo } from "../../core/log_store.js";

/**
 * 日志查询参数
 */
interface LogQueryParams {
  date?: string;
  offset?: number;
  limit?: number;
}

/**
 * 注册日志管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员 Token
 */
export function registerLogsRoutes(
  app: FastifyInstance,
  adminToken: string,
): void {
    // 获取日志文件列表
    app.get(
      "/api/logs",
      { preHandler: adminAuth(adminToken) },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const store = app.runtime.logStore;
        const files = store.getLogFiles();
        return reply.send({
          files,
          total: files.length,
        });
      }
    );
  
    // 获取指定日期的日志内容
    app.get<{ Querystring: LogQueryParams }>(
      "/api/logs/content",
      { preHandler: adminAuth(adminToken) },
      async (
        request: FastifyRequest<{ Querystring: LogQueryParams }>,
        reply: FastifyReply
      ) => {
        const store = app.runtime.logStore;
        const { date, offset = 0, limit = 1000 } = request.query;
  
        if (!date) {
          return reply.status(400).send({ error: "date parameter is required" });
        }
  
        // 验证日期格式
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return reply.status(400).send({ error: "invalid date format, expected YYYY-MM-DD" });
        }
  
        const logs = store.readLogs(date, offset, limit);
        const fileSize = store.getFileSize(date);
  
        return reply.send({
          date,
          logs,
          offset,
          limit,
          total: logs.length,
          fileSize,
        });
      }
    );
  
    // 获取日志配置
    app.get(
      "/api/logs/config",
      { preHandler: adminAuth(adminToken) },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const store = app.runtime.logStore;
        const logConfig = app.runtime.config.log;
        const files = store.getLogFiles();
        const totalSize = files.reduce((sum: number, f: LogFileInfo) => sum + f.size, 0);
  
        return reply.send({
          enabled: logConfig?.enabled ?? true,
          maxSizeMB: logConfig?.maxSizeMB ?? 10,
          keepDays: logConfig?.keepDays ?? 30,
          totalFiles: files.length,
          totalSize,
        });
      }
    );
  
    // 清理旧日志
    app.post(
      "/api/logs/clean",
      { preHandler: adminAuth(adminToken) },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const store = app.runtime.logStore;
        const logConfig = app.runtime.config.log;
        const keepDays = logConfig?.keepDays ?? 30;
        
        store.cleanOldLogs(keepDays);
        
        return reply.send({
          success: true,
          message: `Cleaned logs older than ${keepDays} days`,
        });
      }
    );
  }
