#!/usr/bin/env node
/**
 * 模拟天气 MCP 服务器 (SSE 传输)
 * 输入: 通过 HTTP POST 接收请求
 * 输出: 通过 SSE 返回响应
 * 行为: 提供模拟天气查询工具，支持 SSE 传输
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "http";
import { URL } from "url";

/**
 * 模拟天气数据
 */
const WEATHER_DATA: Record<string, { temp: number; condition: string; humidity: number; wind: string }> = {
  "北京": { temp: 22, condition: "晴", humidity: 45, wind: "东北风 3级" },
  "上海": { temp: 26, condition: "多云", humidity: 60, wind: "东风 2级" },
  "广州": { temp: 30, condition: "阴", humidity: 75, wind: "南风 2级" },
  "深圳": { temp: 29, condition: "小雨", humidity: 80, wind: "东南风 3级" },
  "成都": { temp: 24, condition: "多云", humidity: 55, wind: "西风 1级" },
  "杭州": { temp: 25, condition: "晴", humidity: 50, wind: "东风 2级" },
};

/**
 * 获取模拟天气
 * 输入: 城市名
 * 输出: 天气信息对象（SSE 格式，包含风力信息）
 * 行为: 查找城市数据，未找到则返回随机数据
 */
function getMockWeather(city: string) {
  const data = WEATHER_DATA[city];
  if (data) {
    return { city, ...data, source: "mock-sse" };
  }
  return {
    city,
    temp: Math.floor(Math.random() * 30) + 10,
    condition: ["晴", "多云", "阴", "小雨"][Math.floor(Math.random() * 4)],
    humidity: Math.floor(Math.random() * 50) + 30,
    wind: ["东风", "西风", "南风", "北风"][Math.floor(Math.random() * 4)] + ` ${Math.floor(Math.random() * 5) + 1}级`,
    source: "random-sse",
  };
}

// 存储活跃的传输层
const transports: Map<string, SSEServerTransport> = new Map();

// 创建 HTTP 服务器
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost`);

  // SSE 端点
  if (url.pathname === "/sse" && req.method === "GET") {
    const transport = new SSEServerTransport("/message", res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    res.on("close", () => {
      transports.delete(sessionId);
    });

    const server = createServer();
    await server.connect(transport);
    return;
  }

  // 消息端点
  if (url.pathname === "/message" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400);
      res.end("Missing sessionId");
      return;
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      res.writeHead(404);
      res.end("Session not found");
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        await transport.handlePostMessage(req, res, body);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

/**
 * 创建 MCP 服务器实例
 */
function createServer() {
  const server = new Server(
    { name: "weather-sse", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_weather",
        description: "获取指定城市的天气信息（SSE 传输，包含风力数据）",
        inputSchema: {
          type: "object",
          properties: {
            city: {
              type: "string",
              description: "城市名称，如：北京、上海、广州",
            },
          },
          required: ["city"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "get_weather") {
      const { city } = args as { city: string };
      const weather = getMockWeather(city);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(weather, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

// 启动服务器
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3100;
httpServer.listen(PORT, () => {
  console.log(`Weather MCP server (SSE) started on http://localhost:${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});
