import crypto from "crypto";
import type { FastifyRequest, FastifyReply, preValidationAsyncHookHandler } from "fastify";

/**
 * 管理端鉴权中间件
 * @description 使用常量时间比较 Token，防止时序攻击
 * @param adminToken 管理员 Token
 * @returns Fastify preHandler 函数
 */
export function adminAuth(adminToken: string): preValidationAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const alt = (request.headers["x-admin-token"] as string | undefined) ?? "";

    // 使用常量时间比较，防止时序攻击
    if (!safeCompare(token, adminToken) && !safeCompare(alt, adminToken)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
  };
}

/**
 * 常量时间字符串比较
 * @description 使用 crypto.timingSafeEqual 进行安全比较，防止时序攻击
 * @param a 待比较字符串
 * @param b 目标字符串
 * @returns 是否相等
 */
export function safeCompare(a: string, b: string): boolean {
  // 长度不同时直接返回 false，但仍然进行常量时间操作
  if (a.length !== b.length) {
    // 使用固定长度的假比较来保持常量时间
    const fakeBuffer = Buffer.alloc(32);
    try {
      crypto.timingSafeEqual(fakeBuffer, fakeBuffer);
    } catch {
      // ignore
    }
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}