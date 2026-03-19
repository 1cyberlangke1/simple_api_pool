import type { FastifyInstance } from "fastify";
import type { FastifyRequest, FastifyReply } from "fastify";
import { adminAuth } from "./auth.js";
import { HOUR_MS } from "../../core/types.js";

/**
 * 注册统计 API 路由
 * @param app Fastify 实例
 * @param adminToken 管理员令牌
 */
export function registerStatsRoutes(app: FastifyInstance, adminToken: string): void {
  /**
   * 获取分组汇总统计
   * @route GET /api/stats/summary
   * @query hours - 统计最近多少小时（默认 24）
   * @behavior 只返回当前存在的分组的统计信息
   */
  app.get<{ Querystring: { hours?: number } }>(
    "/api/stats/summary",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Querystring: { hours?: number } }>, reply: FastifyReply) => {
      const hours = request.query.hours ?? 24;
      const rawStats = request.server.runtime.statsStore.getGroupSummary(hours);
      
      // 过滤掉已删除的分组
      const validGroupNames = new Set(
        request.server.runtime.config.groups.map(g => g.name)
      );
      const stats = rawStats.filter(s => validGroupNames.has(s.group));
      
      return reply.send({ hours, stats });
    }
  );

  /**
   * 获取小时统计数据
   * @route GET /api/stats/hourly
   * @query group - 分组名称（可选）
   * @query hours - 统计最近多少小时（默认 24）
   * @behavior 只返回当前存在的分组的统计信息
   */
  app.get<{ Querystring: { group?: string; hours?: number } }>(
    "/api/stats/hourly",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Querystring: { group?: string; hours?: number } }>, reply: FastifyReply) => {
      const { group, hours = 24 } = request.query;
      const rawStats = request.server.runtime.statsStore.getHourlyStats(group, hours);
      
      // 如果没有指定分组，过滤掉已删除的分组
      if (!group) {
        const validGroupNames = new Set(
          request.server.runtime.config.groups.map(g => g.name)
        );
        const filteredStats = rawStats.filter(s => validGroupNames.has(s.group));
        return reply.send({ group, hours, stats: filteredStats });
      }
      
      return reply.send({ group, hours, stats: rawStats });
    }
  );

  /**
   * 获取图表数据
   * @route GET /api/stats/chart
   * @description 返回适合前端图表展示的数据格式，只包含存在的分组
   */
  app.get<{ Querystring: { hours?: number } }>(
    "/api/stats/chart",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Querystring: { hours?: number } }>, reply: FastifyReply) => {
      const hours = request.query.hours ?? 24;
      const rawHourlyStats = request.server.runtime.statsStore.getHourlyStats(undefined, hours);
      const rawGroupSummary = request.server.runtime.statsStore.getGroupSummary(hours);

      // 过滤掉已删除的分组
      const validGroupNames = new Set(
        request.server.runtime.config.groups.map(g => g.name)
      );
      const hourlyStats = rawHourlyStats.filter(s => validGroupNames.has(s.group));
      const groupSummary = rawGroupSummary.filter(s => validGroupNames.has(s.group));

      // 构建时间轴（最近 N 小时）
      const timeline: string[] = [];
      const now = new Date();
      for (let i = hours - 1; i >= 0; i--) {
        const hour = new Date(now.getTime() - i * HOUR_MS);
        timeline.push(`${String(hour.getHours()).padStart(2, "0")}:00`);
      }

      // 按分组组织数据
      const groupData: Record<string, { calls: number[]; successRate: number[] }> = {};
      const groupSet = new Set(groupSummary.map((g) => g.group));

      for (const group of groupSet) {
        groupData[group] = {
          calls: new Array(hours).fill(0),
          successRate: new Array(hours).fill(0),
        };
      }

      // 填充数据
      for (const stat of hourlyStats) {
        const hourIndex = timeline.findIndex((t) => {
          const statHour = stat.hour.split(" ")[1]?.slice(0, 5) ?? "";
          return statHour === t;
        });

        if (hourIndex >= 0 && groupData[stat.group]) {
          groupData[stat.group].calls[hourIndex] = stat.totalCalls;
          groupData[stat.group].successRate[hourIndex] = stat.successRate;
        }
      }

      return reply.send({
        timeline,
        groups: Array.from(groupSet),
        groupData,
        summary: groupSummary,
      });
    }
  );

  /**
   * 清理过期统计数据
   * @route DELETE /api/stats/cleanup
   * @query days - 保留天数（默认 30）
   */
  app.delete<{ Querystring: { days?: number } }>(
    "/api/stats/cleanup",
    { preHandler: adminAuth(adminToken) },
    async (request: FastifyRequest<{ Querystring: { days?: number } }>, reply: FastifyReply) => {
      const days = request.query.days ?? 30;
      request.server.runtime.statsStore.cleanup(days);
      return reply.send({ status: "ok", message: `Cleaned up stats older than ${days} days` });
    }
  );
}