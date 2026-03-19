import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * 健康检查处理器
 * @description 返回服务状态、启动时间、可用模型和分组列表
 * @returns {object} status - 服务状态
 * @returns {string} timestamp - 当前时间
 * @returns {string} startTime - 服务启动时间 (ISO 8601)
 * @returns {string[]} models - 可用模型列表（不包含分组）
 * @returns {string[]} groups - 可用分组列表
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

  // 获取所有模型 ID 并分离模型和分组
  const allModelIds = runtime.modelRegistry.listAllModelIds(runtime.config.cache.enable);
  
  // 分离模型和分组
  const models: string[] = [];
  const groups: string[] = [];
  
  for (const id of allModelIds) {
    if (id.startsWith("group/")) {
      // 移除 "group/" 前缀和 "-cache" 后缀
      let groupName = id.slice(6); // 移除 "group/"
      if (groupName.endsWith("-cache")) {
        groupName = groupName.slice(0, -6); // 移除 "-cache"
      }
      // 避免重复添加（分组可能有 -cache 变体）
      if (!groups.includes(groupName)) {
        groups.push(groupName);
      }
    } else {
      models.push(id);
    }
  }

  return reply.send({
    status: "ok",
    timestamp: localTime,
    startTime: runtime.startTime,
    models,
    groups,
  });
}