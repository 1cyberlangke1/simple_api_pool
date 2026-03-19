/**
 * 工具注册表
 * @description 支持动态加载本地或 MCP 工具，以及运行时注册
 * @module tool_registry
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { LocalToolConfig, McpToolConfig, ToolDefinition, ToolHandler, LocalToolModule, IToolRegistry } from "./types.js";
import { createMcpClient, type IMcpClient } from "./mcp_client.js";
import { ToolNotFoundError, McpClientError } from "./errors.js";
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("tool-registry");

/**
 * 工具注册表
 * @description 支持动态加载本地或 MCP 工具，以及运行时注册
 * @example
 * const registry = new ToolRegistry();
 * await registry.loadLocal({ type: "local", name: "my-tool", modulePath: "./tools/my-tool.js" });
 * await registry.loadMcp({ type: "mcp", name: "mcp-tool", transport: "stdio", command: "node", args: ["server.js"] });
 */
export class ToolRegistry implements ToolHandler, IToolRegistry {
  private tools: ToolDefinition[] = [];
  private handlers: Map<string, (args: unknown) => Promise<unknown>> = new Map();
  private mcpClients: Map<string, IMcpClient> = new Map();

  /**
   * 加载本地工具模块
   * @param config 本地工具配置
   * @returns Promise<void>
   * @throws 模块文件不存在或加载失败时抛出错误
   * @behavior
   * - 支持相对路径和绝对路径
   * - 自动解析 .ts 和 .js 扩展名
   * - 加载模块中的所有工具定义
   * @complexity O(n) - n 为工具数量
   */
  async loadLocal(config: LocalToolConfig): Promise<void> {
    const rootPath = path.isAbsolute(config.modulePath)
      ? config.modulePath
      : path.resolve(process.cwd(), config.modulePath);

    const candidates = [rootPath];
    if (rootPath.endsWith(".ts")) candidates.push(rootPath.replace(/\.ts$/, ".js"));
    if (rootPath.endsWith(".js")) candidates.push(rootPath.replace(/\.js$/, ".ts"));
    candidates.push(path.resolve(process.cwd(), "dist", config.modulePath));

    const absolutePath = candidates.find((p) => fs.existsSync(p));
    if (!absolutePath) {
      throw new Error(`Tool module not found: ${config.modulePath}`);
    }

    const moduleUrl = pathToFileURL(absolutePath).toString();
    const mod = (await import(moduleUrl)) as LocalToolModule;

    for (const tool of mod.tools) {
      this.tools.push(tool);
      this.handlers.set(tool.name, async (args: unknown) => mod.callTool(tool.name, args));
    }
  }

  /**
   * 加载 MCP 工具
   * @param config MCP 工具配置
   * @returns Promise<void>
   * @throws 连接失败时抛出错误
   * @behavior
   * - 支持 stdio、SSE、HTTP 三种传输方式
   * - 自动连接并获取工具列表
   * - 缓存客户端实例以便后续调用
   */
  async loadMcp(config: McpToolConfig): Promise<void> {
    const client = createMcpClient(config);
    await client.connect();

    const tools = await client.listTools();
    for (const tool of tools) {
      this.tools.push(tool);
      this.handlers.set(tool.name, async (args: unknown) => client.callTool(tool.name, args as Record<string, unknown>));
    }

    // 缓存客户端实例
    this.mcpClients.set(config.name, client);
  }

  /**
   * 运行时注册工具
   * @param tool 工具定义
   * @param handler 执行处理器
   */
  register(tool: ToolDefinition, handler: (args: unknown) => Promise<unknown>): void {
    this.tools.push(tool);
    this.handlers.set(tool.name, handler);
  }

  /**
   * 注销工具
   * @param name 工具名称
   * @returns 是否成功注销
   */
  unregister(name: string): boolean {
    const index = this.tools.findIndex((t) => t.name === name);
    if (index === -1) return false;
    this.tools.splice(index, 1);
    this.handlers.delete(name);
    return true;
  }

  /**
   * 获取 OpenAI tools 结构
   * @returns OpenAI 格式的工具数组
   */
  getOpenAITools(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: object };
  }> {
    return this.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as object,
      },
    }));
  }

  /**
   * 根据工具名称列表获取 OpenAI tools 结构
   * @param names 工具名称列表
   * @returns OpenAI 格式的工具数组（仅包含指定名称的工具）
   */
  getToolsByNames(names: string[]): Array<{
    type: "function";
    function: { name: string; description: string; parameters: object };
  }> {
    const nameSet = new Set(names);
    return this.tools
      .filter((tool) => nameSet.has(tool.name))
      .map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema as object,
        },
      }));
  }

  /**
   * 检查工具是否存在
   * @param name 工具名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * 获取所有工具名称
   * @returns 工具名称数组
   */
  listNames(): string[] {
    return this.tools.map((t) => t.name);
  }

  /**
   * 执行工具调用
   * @param name 工具名称
   * @param args 工具参数
   * @returns 工具执行结果
   * @throws 工具不存在或执行失败时抛出错误
   */
  async call(name: string, args: unknown): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new ToolNotFoundError(name);
    }
    return await handler(args);
  }

  /**
   * 关闭所有 MCP 客户端连接
   * @description 清理所有资源，包括 MCP 客户端、工具定义和处理器
   * @returns Promise<void>
   */
  async close(): Promise<void> {
    for (const [name, client] of this.mcpClients) {
      try {
        await client.disconnect();
      } catch (err) {
        log.warn({ error: err }, `Failed to disconnect MCP client: ${name}`);
      }
    }
    this.mcpClients.clear();
    this.tools = [];
    this.handlers.clear();
  }
}