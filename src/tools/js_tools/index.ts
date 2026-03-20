/**
 * JS 工具示例索引
 * @description 自动扫描并导入 js_tools 目录下的所有工具定义
 * @module tools/js_tools
 */

import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";

/**
 * 工具定义接口
 */
export interface JsToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  code: string;
  category: string;
  tags: string[];
}

/** 缓存的工具列表 */
let cachedTools: JsToolDefinition[] | null = null;

/**
 * 自动扫描并加载所有工具定义
 * @description 扫描 js_tools 目录下的所有 .ts 文件（排除 index.ts）
 * @returns 工具定义数组
 */
export async function loadJsToolExamples(): Promise<JsToolDefinition[]> {
  if (cachedTools) {
    return cachedTools;
  }

  const toolsDir = path.dirname(fileURLToPath(import.meta.url));
  const files = fs.readdirSync(toolsDir);
  const tools: JsToolDefinition[] = [];

  for (const file of files) {
    // 跳过 index.ts 和非 .ts 文件
    if (file === "index.ts" || !file.endsWith(".ts")) {
      continue;
    }

    try {
      const modulePath = pathToFileURL(path.join(toolsDir, file)).toString();
      const module = await import(modulePath);

      // 查找导出的工具定义（优先找 default，其次找以 Tool 结尾的导出）
      if (module.default && isToolDefinition(module.default)) {
        tools.push(module.default);
      } else {
        // 查找所有以 Tool 结尾的导出
        for (const key of Object.keys(module)) {
          if (key.endsWith("Tool") && isToolDefinition(module[key])) {
            tools.push(module[key]);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load js tool: ${file}`, error);
    }
  }

  cachedTools = tools;
  return tools;
}

/**
 * 检查对象是否为有效的工具定义
 */
function isToolDefinition(obj: unknown): obj is JsToolDefinition {
  if (!obj || typeof obj !== "object") return false;
  const def = obj as Record<string, unknown>;
  return (
    typeof def.name === "string" &&
    typeof def.description === "string" &&
    typeof def.code === "string" &&
    typeof def.inputSchema === "object"
  );
}

/**
 * 清除缓存（用于开发时热重载）
 */
export function clearToolCache(): void {
  cachedTools = null;
}

/**
 * 获取示例工具列表（同步版本，返回缓存）
 * @returns 示例工具数组
 */
export function getJsToolExamples(): JsToolDefinition[] {
  return cachedTools ?? [];
}

// 导出类型
export type { JsToolDefinition as JsToolExample };