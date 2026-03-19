import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * 健康检查处理器
 * @description 返回服务状态、启动时间和可用分组列表
 * @returns {object} status - 服务状态
 * @returns {string} timestamp - 当前时间
 * @returns {string} startTime - 服务启动时间 (ISO 8601)
 * @returns {string[]} groups - 可用分组列表（对外模型池）
 */
export async function healthHandler(request: FastifyRequest, reply: FastifyReply) {
  const runtime = request.server.runtime;

  // 使用系统本地时区时间
  const now = new Date();
  const localTime = now.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // 只返回分组名称，不暴露上游模型
  const groups = runtime.config.groups.map((g) => g.name);

  return reply.send({
    status: "ok",
    timestamp: localTime,
    startTime: runtime.startTime,
    groups,
  });
}
