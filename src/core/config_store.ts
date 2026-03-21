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
   * @description 使用原子写入：先写入临时文件，成功后重命名，确保数据一致性
   * @param nextConfig 新的配置
   * @throws {Error} 写入失败时抛出异常，内存状态保持不变
   */
  updateConfig(nextConfig: AppConfig): void {
    // 确保目录存在
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 原子写入：先写入临时文件
    const tempPath = `${this.configPath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(nextConfig, null, 2), "utf8");
      // 成功后重命名为目标文件（原子操作）
      fs.renameSync(tempPath, this.configPath);
      // 文件写入成功后才更新内存状态
      this.currentConfig = nextConfig;
    } catch (err) {
      // 清理临时文件
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // 忽略清理失败
      }
      throw err;
    }
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
