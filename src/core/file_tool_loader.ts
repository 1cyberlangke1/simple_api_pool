/**
 * 文件工具加载器
 * @description 从文件系统加载 JSON 格式的工具定义，支持热重载
 * @module file_tool_loader
 */

import fs from "fs";
import path from "path";
import type { JSONSchema7 } from "json-schema";
import { LOGGER as log } from "./logger.js";

/**
 * JSON 工具文件定义格式
 */
export interface JsonToolFile {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
  /** 输入 schema */
  inputSchema: JSONSchema7;
  /** 工具代码 */
  code: string;
  /** 是否允许网络请求 */
  allowNetwork?: boolean;
  /** 允许的域名列表 */
  allowedDomains?: string[];
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

/**
 * 加载的工具定义
 */
export interface LoadedFileTool extends JsonToolFile {
  /** 文件路径 */
  filePath: string;
  /** 加载时间 */
  loadedAt: number;
}

/**
 * 文件工具加载器
 * @description 监控工具目录，自动加载和重载 JSON 工具文件
 */
export class FileToolLoader {
  private toolsDir: string;
  private tools: Map<string, LoadedFileTool> = new Map();
  private watcher: fs.FSWatcher | null = null;
  private fileMtimes: Map<string, number> = new Map();

  /**
   * 创建文件工具加载器
   * @param toolsDir 工具目录路径
   */
  constructor(toolsDir: string) {
    this.toolsDir = path.resolve(toolsDir);
  }

  /**
   * 初始化加载器
   * @description 加载所有工具并启动文件监控
   */
  init(): void {
    // 确保目录存在
    if (!fs.existsSync(this.toolsDir)) {
      fs.mkdirSync(this.toolsDir, { recursive: true });
      log.info({ dir: this.toolsDir }, "Created tools directory");
    }

    // 初始加载所有工具
    this.loadAllTools();

    // 启动文件监控
    this.startWatcher();
  }

  /**
   * 加载所有工具文件
   */
  private loadAllTools(): void {
    const files = this.getJsonFiles(this.toolsDir);
    
    for (const file of files) {
      this.loadToolFile(file);
    }

    log.info({ count: this.tools.size, dir: this.toolsDir }, "Loaded file tools");
  }

  /**
   * 获取目录下所有 JSON 文件
   */
  private getJsonFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // 递归扫描子目录
        files.push(...this.getJsonFiles(fullPath));
      } else if (entry.name.endsWith(".json")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * 加载单个工具文件
   * @param filePath 文件路径
   * @returns 是否加载成功
   */
  private loadToolFile(filePath: string): boolean {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const toolDef = JSON.parse(content) as JsonToolFile;

      // 验证必要字段
      if (!toolDef.name || !toolDef.description || !toolDef.code || !toolDef.inputSchema) {
        log.warn({ file: filePath }, "Invalid tool file: missing required fields");
        return false;
      }

      // 记录文件修改时间
      const stat = fs.statSync(filePath);
      this.fileMtimes.set(filePath, stat.mtimeMs);

      // 存储工具定义
      const loadedTool: LoadedFileTool = {
        ...toolDef,
        enabled: toolDef.enabled ?? true, // 默认启用
        filePath,
        loadedAt: Date.now(),
      };

      this.tools.set(toolDef.name, loadedTool);
      log.info({ name: toolDef.name, file: filePath }, "Loaded tool from file");
      return true;
    } catch (error) {
      log.error({ file: filePath, error: String(error) }, "Failed to load tool file");
      return false;
    }
  }

  /**
   * 启动文件监控
   */
  private startWatcher(): void {
    try {
      this.watcher = fs.watch(
        this.toolsDir,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (!filename || !filename.endsWith(".json")) return;

          const filePath = path.join(this.toolsDir, filename);

          // 延迟处理，避免编辑器保存时的多次触发
          setTimeout(() => {
            this.handleFileChange(filePath);
          }, 100);
        }
      );

      log.info({ dir: this.toolsDir }, "Started file watcher for tools");
    } catch (error) {
      log.warn({ error: String(error) }, "Failed to start file watcher, hot reload disabled");
    }
  }

  /**
   * 处理文件变化
   * @param filePath 文件路径
   */
  private handleFileChange(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      // 文件被删除，移除对应工具
      for (const [name, tool] of this.tools) {
        if (tool.filePath === filePath) {
          this.tools.delete(name);
          log.info({ name, file: filePath }, "Removed tool (file deleted)");
          break;
        }
      }
      this.fileMtimes.delete(filePath);
      return;
    }

    // 检查修改时间，避免重复处理
    const stat = fs.statSync(filePath);
    const lastMtime = this.fileMtimes.get(filePath) ?? 0;

    if (stat.mtimeMs <= lastMtime) {
      return; // 没有实际变化
    }

    // 重新加载工具
    this.loadToolFile(filePath);
  }

  /**
   * 获取所有加载的工具
   * @returns 工具列表
   */
  getAllTools(): LoadedFileTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取指定工具
   * @param name 工具名称
   * @returns 工具定义或 undefined
   */
  getTool(name: string): LoadedFileTool | undefined {
    return this.tools.get(name);
  }

  /**
   * 重新加载所有工具
   */
  reloadAll(): void {
    this.tools.clear();
    this.fileMtimes.clear();
    this.loadAllTools();
  }

  /**
   * 重新加载指定工具
   * @param name 工具名称
   * @returns 是否重载成功
   */
  reloadTool(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    return this.loadToolFile(tool.filePath);
  }

  /**
   * 保存工具到文件
   * @param tool 工具定义
   * @returns 保存的文件路径
   */
  saveToolToFile(tool: JsonToolFile): string {
    const filePath = path.join(this.toolsDir, `${tool.name}.json`);
    
    // 格式化 JSON 输出
    const content = JSON.stringify(tool, null, 2);
    fs.writeFileSync(filePath, content, "utf-8");

    // 更新内存中的工具
    const loadedTool: LoadedFileTool = {
      ...tool,
      filePath,
      loadedAt: Date.now(),
    };
    this.tools.set(tool.name, loadedTool);

    // 更新修改时间记录
    const stat = fs.statSync(filePath);
    this.fileMtimes.set(filePath, stat.mtimeMs);

    log.info({ name: tool.name, file: filePath }, "Saved tool to file");
    return filePath;
  }

  /**
   * 删除工具文件
   * @param name 工具名称
   * @returns 是否删除成功
   */
  deleteToolFile(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;

    try {
      fs.unlinkSync(tool.filePath);
      this.tools.delete(name);
      this.fileMtimes.delete(tool.filePath);
      log.info({ name, file: tool.filePath }, "Deleted tool file");
      return true;
    } catch (error) {
      log.error({ name, error: String(error) }, "Failed to delete tool file");
      return false;
    }
  }

  /**
   * 关闭加载器
   */
  close(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.tools.clear();
    this.fileMtimes.clear();
  }
}
