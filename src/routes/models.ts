import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * 模型列表响应类型
 */
interface ModelsResponse {
  object: "list";
  data: Array<{
    id: string;
    object: "model";
  }>;
}

/**
 * 模型列表处理器
 * @description 返回对外可用的分组模型（不暴露上游模型）
 * @behavior 只返回分组，分组是用户实际使用的模型池
 */
export async function listModelsHandler(request: FastifyRequest, reply: FastifyReply): Promise<ModelsResponse> {
  const runtime = request.server.runtime;
  const cacheEnabled = runtime.config.cache.enable;

  // 只获取分组 ID，不暴露上游模型
  const groupIds = runtime.config.groups.map((g) => `group/${g.name}`);
  
  // 如果启用缓存，添加 -cache 变体
  if (cacheEnabled) {
    const cacheVariants = groupIds.map((id) => `${id}-cache`);
    groupIds.push(...cacheVariants);
  }

  const data: Array<{ id: string; object: "model" }> = groupIds.map((id) => ({
    id,
    object: "model" as const,
  }));

  return reply.send({
    object: "list",
    data,
  });
}