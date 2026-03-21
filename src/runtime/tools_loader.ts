/**
 * 工具加载器
 * @description 管理 JS 工具和文件工具的加载与注册
 * @module runtime/tools_loader
 */

import type { ToolDefinition } from "../core/types.js";
import { createModuleLogger } from "../core/logger.js";
import { JsSandbox } from "../core/js_sandbox.js";
import { JsToolStore, type StoredJsTool } from "../core/js_tool_store.js";
import { FileToolLoader, type JsonToolFile, type LoadedFileTool } from "../core/file_tool_loader.js";
import { ToolRegistry } from "../core/tool_registry.js";

const log = createModuleLogger("tools-loader");

/**
 * 工具加载器配置
 */
export interface ToolsLoaderConfig {
  /** JS 沙箱执行器 */
  jsSandbox: JsSandbox;
  /** JS 工具存储 */
  jsToolStore: JsToolStore;
  /** 文件工具加载器 */
  fileToolLoader: FileToolLoader;
  /** 工具注册表 */
  toolRegistry: ToolRegistry;
}

/**
 * 所有工具集合
 */
export interface AllToolsResult {
  /** 数据库工具 */
  dbTools: StoredJsTool[];
  /** 文件工具 */
  fileTools: LoadedFileTool[];
}

/**
 * 工具加载器
 * @description 管理 JS 工具的加载、注册和刷新
 */
export class ToolsLoader {
  private jsSandbox: JsSandbox;
  private jsToolStore: JsToolStore;
  private fileToolLoader: FileToolLoader;
  private toolRegistry: ToolRegistry;

  constructor(config: ToolsLoaderConfig) {
    this.jsSandbox = config.jsSandbox;
    this.jsToolStore = config.jsToolStore;
    this.fileToolLoader = config.fileToolLoader;
    this.toolRegistry = config.toolRegistry;
  }

  /**
   * 加载所有工具
   * @description 加载数据库工具和文件工具到工具注册表
   */
  async loadAll(): Promise<void> {
    // 加载数据库中的工具
    const jsTools = this.jsToolStore.getAll(true);
    for (const tool of jsTools) {
      this.registerJsTool(tool);
    }
    log.info(`Loaded ${jsTools.length} JS tools from database`);

    // 加载文件工具
    const fileTools = this.fileToolLoader.getAllTools();
    for (const tool of fileTools) {
      this.registerFileTool(tool);
    }
    log.info(`Loaded ${fileTools.length} JS tools from files`);
  }

  /**
   * 注册单个 JS 工具到工具注册表
   * @param tool JS 工具定义
   */
  registerJsTool(tool: StoredJsTool): void {
    const toolDef: ToolDefinition = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };

    const handler = async (args: unknown): Promise<unknown> => {
      const result = await this.jsSandbox.execute(tool.code, args as Record<string, unknown>);
      if (!result.success) {
        throw new Error(result.error ?? "JS tool execution failed");
      }
      return result.result;
    };

    this.toolRegistry.updateOrRegister(toolDef, handler);
  }

  /**
   * 注册文件工具到工具注册表
   * @param tool 文件工具定义
   */
  registerFileTool(tool: LoadedFileTool): void {
    const toolDef: ToolDefinition = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };

    const handler = async (args: unknown): Promise<unknown> => {
      // 如果工具需要网络访问，创建专用的沙箱
      const sandbox = tool.allowNetwork
        ? new JsSandbox({
            timeout: 60000,
            allowedDir: "./file",
            allowNetwork: true,
            allowedDomains: tool.allowedDomains ?? [],
          })
        : this.jsSandbox;

      const result = await sandbox.execute(tool.code, args as Record<string, unknown>);
      if (!result.success) {
        throw new Error(result.error ?? "JS tool execution failed");
      }
      return result.result;
    };

    this.toolRegistry.updateOrRegister(toolDef, handler);
  }

  /**
   * 刷新单个 JS 工具
   * @description 当工具被创建或更新时调用
   * @param name 工具名称
   */
  refreshJsTool(name: string): void {
    // 先检查数据库工具
    const dbTool = this.jsToolStore.getByName(name);
    if (dbTool && dbTool.enabled) {
      this.registerJsTool(dbTool);
      log.info(`JS tool "${name}" refreshed from database`);
      return;
    }

    // 再检查文件工具
    const fileTool = this.fileToolLoader.getTool(name);
    if (fileTool) {
      this.registerFileTool(fileTool);
      log.info(`JS tool "${name}" refreshed from file`);
      return;
    }

    // 工具不存在，从注册表中移除
    this.toolRegistry.unregister(name);
    log.info(`JS tool "${name}" removed from registry`);
  }

  /**
   * 刷新文件工具
   * @description 文件变化时调用
   * @param name 工具名称
   */
  refreshFileTool(name: string): void {
    const tool = this.fileToolLoader.getTool(name);
    if (tool) {
      this.registerFileTool(tool);
      log.info(`File tool "${name}" refreshed`);
    } else {
      this.toolRegistry.unregister(name);
      log.info(`File tool "${name}" removed`);
    }
  }

  /**
   * 获取所有工具（合并数据库和文件工具）
   */
  getAllTools(): AllToolsResult {
    return {
      dbTools: this.jsToolStore.getAll(false),
      fileTools: this.fileToolLoader.getAllTools(),
    };
  }

  /**
   * 保存工具到文件
   * @param tool 工具定义
   * @returns 保存的文件路径
   */
  saveFileTool(tool: JsonToolFile): string {
    const filePath = this.fileToolLoader.saveToolToFile(tool);
    // 立即注册到工具注册表
    const loadedTool = this.fileToolLoader.getTool(tool.name);
    if (loadedTool) {
      this.registerFileTool(loadedTool);
    }
    return filePath;
  }

  /**
   * 删除文件工具
   * @param name 工具名称
   * @returns 是否删除成功
   */
  deleteFileTool(name: string): boolean {
    const result = this.fileToolLoader.deleteToolFile(name);
    if (result) {
      this.toolRegistry.unregister(name);
    }
    return result;
  }

  /**
   * 移除 JS 工具
   * @description 当工具被删除时调用
   * @param name 工具名称
   */
  removeJsTool(name: string): void {
    this.toolRegistry.unregister(name);
    log.info(`JS tool "${name}" removed`);
  }
}
