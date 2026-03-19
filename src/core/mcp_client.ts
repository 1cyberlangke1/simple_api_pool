/**
 * MCP 客户端封装
 * @description 使用官方 @modelcontextprotocol/sdk 实现三种传输方式
 * @module mcp_client
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type {
  McpToolConfig,
  McpStdioConfig,
  McpSseConfig,
  McpHttpConfig,
  ToolDefinition,
} from "./types.js";

/**
 * 解析 MCP 工具调用结果
 * @description 从 MCP 结果中提取文本内容，尝试解析 JSON，否则返回原始文本
 * @param result MCP 调用结果
 * @returns 解析后的结果
 */
function parseMcpResult(result: { content?: unknown; toolResult?: unknown; [key: string]: unknown }): unknown {
  // 优先使用 content 字段
  const content = result.content;
  if (content !== undefined) {
    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      if (first && typeof first === "object" && "text" in first) {
        try {
          return JSON.parse((first as { text: string }).text);
        } catch {
          return (first as { text: string }).text;
        }
      }
    }
    return content;
  }
  // 回退到 toolResult 字段
  if (result.toolResult !== undefined) {
    return result.toolResult;
  }
  return result;
}

/**
 * MCP 客户端接口
 * @description 统一的 MCP 客户端操作接口
 */
export interface IMcpClient {
  /** 连接到 MCP 服务器 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 获取工具列表 */
  listTools(): Promise<ToolDefinition[]>;
  /** 调用工具 */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** 检查是否已连接 */
  isConnected(): boolean;
}

/**
 * MCP 客户端基类
 * @description 提供公共的状态管理和方法实现
 */
abstract class BaseMcpClient implements IMcpClient {
  protected connected = false;
  protected tools: ToolDefinition[] = [];
  /** MCP SDK 客户端实例（stdio 和 sse 传输方式使用） */
  protected client: Client | null = null;

  /** 获取工具列表 */
  async listTools(): Promise<ToolDefinition[]> {
    return this.tools;
  }

  /** 检查是否已连接 */
  isConnected(): boolean {
    return this.connected;
  }

  /** 重置状态 */
  protected reset(): void {
    this.connected = false;
    this.tools = [];
  }

  /**
   * 从 MCP 服务器获取工具列表
   * @description 使用 MCP SDK 的 listTools 方法获取工具，子类可覆盖此方法
   */
  protected async fetchTools(): Promise<void> {
    if (!this.client) {
      return;
    }
    const result = await this.client.listTools();
    this.tools = (result.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  }

  // 抽象方法由子类实现
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * MCP stdio 客户端
 * @description 通过子进程 stdio 与 MCP 服务通信
 * @example
 * const client = new McpStdioClient({
 *   type: "mcp",
 *   name: "my-tool",
 *   transport: "stdio",
 *   command: "node",
 *   args: ["server.js"]
 * });
 * await client.connect();
 * const tools = await client.listTools();
 */
export class McpStdioClient extends BaseMcpClient {
  private transport: StdioClientTransport | null = null;

  constructor(private config: McpStdioConfig) {
    super();
    this.client = new Client(
      { name: config.name, version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    try {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args ?? [],
        env: this.config.env,
        cwd: this.config.cwd,
      });

      await this.client!.connect(this.transport);
      await this.fetchTools();
      this.connected = true;
    } catch (err) {
      this.transport = null;
      throw new Error(`Failed to connect to MCP stdio server: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client!.close();
    this.transport = null;
    this.reset();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected || !this.client) {
      throw new Error("MCP client not connected");
    }

    const result = await this.client.callTool({ name, arguments: args });
    return parseMcpResult(result);
  }
}

/**
 * MCP SSE 客户端
 * @description 通过 Server-Sent Events 与 MCP 服务通信
 * @example
 * const client = new McpSseClient({
 *   type: "mcp",
 *   name: "my-tool",
 *   transport: "sse",
 *   endpoint: "https://mcp-server.example.com/sse"
 * });
 * await client.connect();
 */
export class McpSseClient extends BaseMcpClient {
  private transport: SSEClientTransport | null = null;

  constructor(private config: McpSseConfig) {
    super();
    this.client = new Client(
      { name: config.name, version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async connect(): Promise<void> {
    try {
      this.transport = new SSEClientTransport(
        new URL(this.config.endpoint),
        { requestInit: { headers: this.config.headers } }
      );

      await this.client!.connect(this.transport);
      await this.fetchTools();
      this.connected = true;
    } catch (err) {
      this.transport = null;
      throw new Error(`Failed to connect to MCP SSE server: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.client!.close();
    this.transport = null;
    this.reset();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected || !this.client) {
      throw new Error("MCP client not connected");
    }

    const result = await this.client.callTool({ name, arguments: args });
    return parseMcpResult(result);
  }
}

/**
 * MCP HTTP 客户端
 * @description 通过 HTTP 请求与 MCP 服务通信（自定义实现）
 * @example
 * const client = new McpHttpClient({
 *   type: "mcp",
 *   name: "my-tool",
 *   transport: "http",
 *   endpoint: "https://mcp-server.example.com/api"
 * });
 * await client.connect();
 */
export class McpHttpClient extends BaseMcpClient {
  constructor(private config: McpHttpConfig) {
    super();
  }

  async connect(): Promise<void> {
    try {
      await this.fetchTools();
      this.connected = true;
    } catch (err) {
      throw new Error(`Failed to connect to MCP HTTP endpoint: ${err}`);
    }
  }

  async disconnect(): Promise<void> {
    this.reset();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error("MCP HTTP client not connected");
    }

    const response = await fetch(`${this.config.endpoint}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(this.config.headers ?? {}),
      },
      body: JSON.stringify({ name, arguments: args }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    return await response.json();
  }

  /** 覆盖基类方法，使用 HTTP 方式获取工具列表 */
  protected override async fetchTools(): Promise<void> {
    const response = await fetch(`${this.config.endpoint}/tools`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(this.config.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as { tools: ToolDefinition[] };
    this.tools = data.tools ?? [];
  }
}

/**
 * 创建 MCP 客户端
 * @param config MCP 工具配置
 * @returns 对应传输类型的客户端实例
 * @throws 不支持的传输类型时抛出错误
 * @example
 * const client = createMcpClient({
 *   type: "mcp",
 *   name: "my-tool",
 *   transport: "stdio",
 *   command: "node",
 *   args: ["server.js"]
 * });
 */
export function createMcpClient(config: McpToolConfig): IMcpClient {
  switch (config.transport) {
    case "stdio":
      return new McpStdioClient(config as McpStdioConfig);
    case "sse":
      return new McpSseClient(config as McpSseConfig);
    case "http":
      return new McpHttpClient(config as McpHttpConfig);
    default:
      throw new Error(`Unsupported MCP transport: ${(config as { transport: string }).transport}`);
  }
}
