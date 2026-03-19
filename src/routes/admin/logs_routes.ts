/**
 * 日志管理路由
 * @description 提供日志查询 API
 * @module routes/admin/logs_routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import { LogStore, type LogFileInfo } from "../../core/log_store.js";

/**
 * 日志查询参数
 */
interface LogQueryParams {
  date?: string;
  offset?: number;
  limit?: number;
}

// 全局 LogStore 实例
let globalLogStore: LogStore | null = null;

/**
 * 获取 LogStore 实例
 */
function getLogStore(): LogStore {
  if (!globalLogStore) {
    const logDir = process.env.LOG_DIR ?? "./logs";
    const maxSize = parseInt(process.env.LOG_MAX_SIZE ?? "10485760", 10);
    globalLogStore = new LogStore({
      logDir,
      maxSize,
      enabled: maxSize > 0,
    });
  }
  return globalLogStore;
}

/**
 * 注册日志管理路由
 * @param app Fastify 实例
 * @param adminToken 管理员 Token
 * @param logStore 可选的日志存储实例，如果不提供则自动创建
 */
export function registerLogsRoutes(
  app: FastifyInstance,
  adminToken: string,
  logStore?: LogStore
): void {
    // 使用传入的实例或获取全局实例
    const store = logStore ?? getLogStore();
  
    // 获取日志文件列表
    app.get(
      "/api/logs",
      { preHandler: adminAuth(adminToken) },
      async (_request: FastifyRequest, reply: FastifyReply) => {
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
        const files = store.getLogFiles();
        const totalSize = files.reduce((sum: number, f: LogFileInfo) => sum + f.size, 0);
  
        return reply.send({
          enabled: true,
          totalFiles: files.length,
          totalSize,
        });
      }
    );
  }
