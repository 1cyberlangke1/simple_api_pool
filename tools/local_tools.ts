import type { ToolDefinition } from "../src/core/types";

/**
 * 本地工具列表
 * 输入: 无
 * 输出: 工具定义数组
 * 行为: 提供给工具注册表注入
 */
export const tools: ToolDefinition[] = [
  {
    name: "echo",
    description: "原样返回输入内容",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "要返回的文本" },
      },
      required: ["text"],
    },
  },
  {
    name: "fibonacci",
    description: "计算斐波那契数列的第 n 项",
    inputSchema: {
      type: "object",
      properties: {
        n: {
          type: "integer",
          description: "要计算的项数（从 0 开始，0 返回 0，1 返回 1）",
          minimum: 0,
          maximum: 50,
        },
      },
      required: ["n"],
    },
  },
];

/**
 * 工具调用入口
 * 输入: 工具名与参数
 * 输出: 工具执行结果
 * 行为: 根据 name 分发到本地实现
 */
export async function callTool(name: string, args: unknown): Promise<unknown> {
  if (name === "echo") {
    const input = args as { text: string };
    return { text: input.text };
  }

  if (name === "fibonacci") {
    const input = args as { n: number };
    const n = Math.max(0, Math.min(50, Math.floor(input.n)));
    return {
      n,
      fibonacci: computeFibonacci(n),
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * 计算斐波那契数
 * 输入: 项数 n (0-50)
 * 输出: 第 n 项的斐波那契数
 * 行为: 使用迭代法计算，避免递归栈溢出
 */
function computeFibonacci(n: number): number {
  if (n <= 1) return n;
  let prev = 0;
  let curr = 1;
  for (let i = 2; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }
  return curr;
}
