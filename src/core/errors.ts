/**
 * 自定义错误类型
 * @description 定义项目中使用的自定义错误类型，便于错误处理和调试
 * @module errors
 */

/**
 * 配置验证错误
 * @description 配置验证失败时抛出
 */
export class ConfigValidationError extends Error {
  constructor(
    public readonly errors: string[]
  ) {
    super(`Config validation failed:\n${errors.join("\n")}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Key 耗尽错误
 * @description 所有 Key 都不可用时抛出
 */
export class KeyExhaustedException extends Error {
  constructor(
    public readonly provider: string,
    public readonly reason: string
  ) {
    super(`No available keys for provider "${provider}": ${reason}`);
    this.name = "KeyExhaustedException";
  }
}

/**
 * 上游错误
 * @description 上游 API 返回错误时抛出
 */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly provider?: string
  ) {
    super(`Upstream error: ${status} ${body}`);
    this.name = "UpstreamError";
  }
}

/**
 * 工具未找到错误
 * @description 请求的工具不存在时抛出
 */
export class ToolNotFoundError extends Error {
  constructor(
    public readonly toolName: string
  ) {
    super(`Tool not found: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

/**
 * 模型未找到错误
 * @description 请求的模型不存在时抛出
 */
export class ModelNotFoundError extends Error {
  constructor(
    public readonly modelName: string,
    public readonly provider?: string
  ) {
    super(`Model not found: ${modelName}${provider ? ` (provider: ${provider})` : ""}`);
    this.name = "ModelNotFoundError";
  }
}

/**
 * 分组未找到错误
 * @description 请求的分组不存在时抛出
 */
export class GroupNotFoundError extends Error {
  constructor(
    public readonly groupName: string
  ) {
    super(`Group not found: ${groupName}`);
    this.name = "GroupNotFoundError";
  }
}

/**
 * 限流错误
 * @description 超过速率限制时抛出
 */
export class RateLimitExceededError extends Error {
  constructor(
    public readonly provider: string,
    public readonly rpm: number
  ) {
    super(`Rate limit exceeded for provider "${provider}" (${rpm} RPM)`);
    this.name = "RateLimitExceededError";
  }
}

/**
 * MCP 客户端错误
 * @description MCP 连接或操作失败时抛出
 */
export class McpClientError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly operation: string,
    public readonly cause?: Error
  ) {
    super(`MCP client error for "${toolName}" during ${operation}: ${cause?.message ?? "unknown"}`);
    this.name = "McpClientError";
  }
}

/**
 * 判断是否为自定义错误
 * @param error 错误对象
 * @returns 是否为自定义错误类型
 */
export function isCustomError(error: unknown): boolean {
  return (
    error instanceof ConfigValidationError ||
    error instanceof KeyExhaustedException ||
    error instanceof UpstreamError ||
    error instanceof ToolNotFoundError ||
    error instanceof ModelNotFoundError ||
    error instanceof GroupNotFoundError ||
    error instanceof RateLimitExceededError ||
    error instanceof McpClientError
  );
}

/**
 * 获取错误的 HTTP 状态码
 * @param error 错误对象
 * @returns HTTP 状态码
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof UpstreamError) {
    return error.status;
  }
  if (error instanceof ToolNotFoundError || error instanceof ModelNotFoundError || error instanceof GroupNotFoundError) {
    return 404;
  }
  if (error instanceof ConfigValidationError) {
    return 400;
  }
  if (error instanceof RateLimitExceededError) {
    return 429;
  }
  if (error instanceof KeyExhaustedException) {
    return 503;
  }
  return 500;
}
