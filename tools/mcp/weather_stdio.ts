#!/usr/bin/env node
/**
 * 模拟天气 MCP 服务器 (stdio 传输)
 * 输入: 通过 stdin 接收 JSON-RPC 请求
 * 输出: 通过 stdout 返回 JSON-RPC 响应
 * 行为: 提供模拟天气查询工具
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * 模拟天气数据
 */
const WEATHER_DATA: Record<string, { temp: number; condition: string; humidity: number }> = {
  "北京": { temp: 22, condition: "晴", humidity: 45 },
  "上海": { temp: 26, condition: "多云", humidity: 60 },
  "广州": { temp: 30, condition: "阴", humidity: 75 },
  "深圳": { temp: 29, condition: "小雨", humidity: 80 },
  "成都": { temp: 24, condition: "多云", humidity: 55 },
  "杭州": { temp: 25, condition: "晴", humidity: 50 },
  "武汉": { temp: 27, condition: "晴", humidity: 48 },
  "西安": { temp: 20, condition: "多云", humidity: 42 },
};

/**
 * 获取模拟天气
 * 输入: 城市名
 * 输出: 天气信息对象
 * 行为: 查找城市数据，未找到则返回随机数据
 */
function getMockWeather(city: string) {
  const data = WEATHER_DATA[city];
  if (data) {
    return { city, ...data, source: "mock" };
  }
  // 随机生成天气数据
  return {
    city,
    temp: Math.floor(Math.random() * 30) + 10,
    condition: ["晴", "多云", "阴", "小雨"][Math.floor(Math.random() * 4)],
    humidity: Math.floor(Math.random() * 50) + 30,
    source: "random",
  };
}

// 创建服务器实例
const server = new Server(
  { name: "weather-stdio", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 注册工具列表处理器
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_weather",
      description: "获取指定城市的天气信息（模拟数据）",
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

// 注册工具调用处理器
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

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP server (stdio) started");
}

main().catch((err) => {
  console.error("Server error:", err);
  process.exit(1);
});
