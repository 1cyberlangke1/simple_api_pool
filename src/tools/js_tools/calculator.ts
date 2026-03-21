/**
 * 计算器工具
 * @description 执行基本数学运算，支持加减乘除和幂运算
 * @module tools/js_tools/calculator
 */

import type { JSONSchema7 } from "json-schema";

/**
 * 工具定义接口
 */
export interface JsToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  code: string;
  category: string;
  tags: string[];
}

/**
 * 计算器工具定义
 */
export const CALCULATOR_TOOL: JsToolDefinition = {
  name: "calculator",
  description: "执行基本数学运算，支持加减乘除和幂运算",
  category: "工具",
  tags: ["数学", "计算"],

  inputSchema: {
    type: "object",
    properties: {
      a: {
        type: "number",
        description: "第一个操作数",
      },
      b: {
        type: "number",
        description: "第二个操作数",
      },
      operator: {
        type: "string",
        enum: ["+", "-", "*", "/", "**", "%"],
        description: "运算符: + (加), - (减), * (乘), / (除), ** (幂), % (取模)",
      },
    },
    required: ["a", "b", "operator"],
  },

  code: `// 计算器工具
// 输入: a (数字), b (数字), operator (运算符)
// 输出: 计算结果

const { a, b, operator } = args;

// 验证输入
if (typeof a !== 'number' || typeof b !== 'number') {
  throw new Error('a 和 b 必须是数字');
}

// 根据运算符执行计算
var result;
switch (operator) {
  case '+':
    result = a + b;
    break;
  case '-':
    result = a - b;
    break;
  case '*':
    result = a * b;
    break;
  case '/':
    if (b === 0) {
      throw new Error('除数不能为零');
    }
    result = a / b;
    break;
  case '**':
    result = Math.pow(a, b);
    break;
  case '%':
    if (b === 0) {
      throw new Error('取模的除数不能为零');
    }
    result = a % b;
    break;
  default:
    throw new Error('不支持的运算符: ' + operator);
}

return {
  expression: a + ' ' + operator + ' ' + b,
  result: result,
  operator: operator
};`,
};

export default CALCULATOR_TOOL;
