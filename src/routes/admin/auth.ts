import type { FastifyRequest, FastifyReply, preValidationAsyncHookHandler } from "fastify";

/**
 * 管理端鉴权中间件
 * @param adminToken 管理员 Token
 * @returns Fastify preHandler 函数
 */
export function adminAuth(adminToken: string): preValidationAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const alt = (request.headers["x-admin-token"] as string | undefined) ?? "";

    if (token !== adminToken && alt !== adminToken) {
      return reply.status(401).send({ error: "unauthorized" });
    }
  };
}
