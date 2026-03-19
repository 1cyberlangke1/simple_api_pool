import fs from "fs";
import path from "path";
import type { AppConfig } from "./types.js";

/**
 * 配置存储器
 * @description 直接读写 setting.json，无 runtime.json 机制
 */
export class ConfigStore {
  private configPath: string;
  private currentConfig: AppConfig;

  /**
   * 初始化配置存储器
   * @param config 配置对象
   * @param configPath 配置文件路径（setting.json）
   */
  constructor(config: AppConfig, configPath: string) {
    this.configPath = configPath;
    this.currentConfig = config;
  }

  /**
   * 获取当前配置
   * @returns 当前生效的配置
   */
  getConfig(): AppConfig {
    return this.currentConfig;
  }

  /**
   * 更新当前配置并持久化到 setting.json
   * @param nextConfig 新的配置
   */
  updateConfig(nextConfig: AppConfig): void {
    this.currentConfig = nextConfig;
    // 确保目录存在
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(nextConfig, null, 2), "utf8");
  }

  /**
   * 获取配置文件路径
   * @returns 配置文件的完整路径
   */
  getConfigPath(): string {
    return this.configPath;
  }
}

/**
 * 获取默认配置文件路径
 * @param rootDir 根目录
 * @returns 配置文件路径（默认为 config/setting.json）
 */
export function getDefaultConfigPath(rootDir: string): string {
  return path.join(rootDir, "config", "setting.json");
}
