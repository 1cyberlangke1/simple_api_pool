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
 * @description 返回所有可用模型（包括分组模型和带 -cache 后缀的分组）
 */
export async function listModelsHandler(request: FastifyRequest, reply: FastifyReply): Promise<ModelsResponse> {
  const runtime = request.server.runtime;
  // listAllModelIds 已经包含 -cache 变体（如果缓存启用）
  const allModelIds = runtime.modelRegistry.listAllModelIds(runtime.config.cache.enable);

  const data: Array<{ id: string; object: "model" }> = allModelIds.map((id) => ({
    id,
    object: "model" as const,
  }));

  return reply.send({
    object: "list",
    data,
  });
}
