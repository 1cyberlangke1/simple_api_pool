#!/usr/bin/env node
/**
 * 模拟天气 MCP 服务器 (HTTP 传输) - 测试用
 * 
 * 用途: 用于测试 MCP 协议集成，非生产环境使用
 * 用户应配置外部 MCP 服务器而非本地编写
 * 
 * 输入: 通过 HTTP POST /call 接收请求
 * 输出: 通过 HTTP 响应返回结果
 * 行为: 提供模拟天气查询工具，最简 HTTP 实现
 */

import http from "http";
import { URL } from "url";

/**
 * 模拟天气数据（HTTP 格式 - 包含更多详细信息）
 */
const WEATHER_DATA: Record<string, { temp: number; condition: string; humidity: number; wind: string; aqi: number; suggestion: string }> = {
  "北京": { temp: 22, condition: "晴", humidity: 45, wind: "东北风 3级", aqi: 75, suggestion: "适宜户外活动" },
  "上海": { temp: 26, condition: "多云", humidity: 60, wind: "东风 2级", aqi: 52, suggestion: "空气质量良好" },
  "广州": { temp: 30, condition: "阴", humidity: 75, wind: "南风 2级", aqi: 68, suggestion: "注意防晒" },
  "深圳": { temp: 29, condition: "小雨", humidity: 80, wind: "东南风 3级", aqi: 45, suggestion: "记得带伞" },
  "成都": { temp: 24, condition: "多云", humidity: 55, wind: "西风 1级", aqi: 82, suggestion: "适宜散步" },
  "杭州": { temp: 25, condition: "晴", humidity: 50, wind: "东风 2级", aqi: 38, suggestion: "空气清新，适合运动" },
};

/**
 * 工具定义
 */
const TOOLS = [
  {
    name: "get_weather",
    description: "获取指定城市的详细天气信息（HTTP 传输，包含 AQI 和建议）",
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
];

/**
 * 获取模拟天气
 * 输入: 城市名
 * 输出: 详细天气信息对象（HTTP 格式，包含 AQI 和生活建议）
 * 行为: 查找城市数据，未找到则返回随机数据
 */
function getMockWeather(city: string) {
  const data = WEATHER_DATA[city];
  if (data) {
    return {
      city,
      ...data,
      source: "mock-http",
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    city,
    temp: Math.floor(Math.random() * 30) + 10,
    condition: ["晴", "多云", "阴", "小雨"][Math.floor(Math.random() * 4)],
    humidity: Math.floor(Math.random() * 50) + 30,
    wind: ["东风", "西风", "南风", "北风"][Math.floor(Math.random() * 4)] + ` ${Math.floor(Math.random() * 5) + 1}级`,
    aqi: Math.floor(Math.random() * 100) + 20,
    suggestion: "天气一般，注意防护",
    source: "random-http",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 处理工具调用
 * 输入: 工具名和参数
 * 输出: 工具执行结果
 * 行为: 根据工具名分发处理
 */
function handleToolCall(name: string, args: Record<string, unknown>) {
  if (name === "get_weather") {
    const { city } = args as { city: string };
    return getMockWeather(city);
  }
  throw new Error(`Unknown tool: ${name}`);
}

// 创建 HTTP 服务器
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost`);

  // CORS 头
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 获取工具列表
  if (url.pathname === "/tools" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ tools: TOOLS }));
    return;
  }

  // 调用工具
  if (url.pathname === "/call" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const { name, arguments: args } = JSON.parse(body);
        const result = handleToolCall(name, args || {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  // 健康检查
  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", name: "weather-http" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// 启动服务器
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3200;
httpServer.listen(PORT, () => {
  console.log(`Weather MCP server (HTTP) started on http://localhost:${PORT}`);
  console.log(`  GET  /tools  - 获取工具列表`);
  console.log(`  POST /call   - 调用工具`);
  console.log(`  GET  /health - 健康检查`);
});
