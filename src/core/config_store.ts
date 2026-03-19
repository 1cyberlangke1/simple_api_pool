import fs from "fs";
import path from "path";
import type { AppConfig } from "./types.js";

/**
 * 配置存储器
 * @description 支持读取基础配置与运行时覆盖，并提供持久化更新能力
 */
export class ConfigStore {
  private baseConfig: AppConfig;
  private runtimePath: string;
  private currentConfig: AppConfig;

  /**
   * 初始化配置存储器
   * @param baseConfig 基础配置
   * @param runtimePath 运行时配置文件路径
   */
  constructor(baseConfig: AppConfig, runtimePath: string) {
    this.baseConfig = baseConfig;
    this.runtimePath = runtimePath;
    this.currentConfig = this.mergeWithRuntime();
  }

  /**
   * 获取当前配置
   * @returns 当前生效的配置
   */
  getConfig(): AppConfig {
    return this.currentConfig;
  }

  /**
   * 更新当前配置并持久化
   * @param nextConfig 新的配置
   */
  updateConfig(nextConfig: AppConfig): void {
    this.currentConfig = nextConfig;
    // 确保目录存在
    const dir = path.dirname(this.runtimePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.runtimePath, JSON.stringify(nextConfig, null, 2), "utf8");
  }

  /**
   * 合并运行时覆盖配置
   * @returns 若存在 runtime.json 则返回运行时配置，否则返回基础配置
   */
  private mergeWithRuntime(): AppConfig {
    if (!fs.existsSync(this.runtimePath)) {
      return this.baseConfig;
    }
    const raw = fs.readFileSync(this.runtimePath, "utf8");
    const runtimeConfig = JSON.parse(raw) as AppConfig;
    return runtimeConfig;
  }

  /**
   * 获取运行时配置文件路径
   * @returns 运行时配置文件的完整路径
   */
  getRuntimePath(): string {
    return this.runtimePath;
  }
}

/**
 * 生成默认运行时配置路径
 * @param rootDir 根目录
 * @returns 运行时配置文件路径（默认为 config/runtime.json）
 */
export function getDefaultRuntimePath(rootDir: string): string {
  return path.join(rootDir, "config", "runtime.json");
}