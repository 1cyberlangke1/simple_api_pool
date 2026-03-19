import type { TruncationConfig } from "./types.js";

/**
 * 默认终止符号
 */
export const DEFAULT_TRUNCATION_SUFFIX = "__END_OF_RESPONSE__";

/**
 * 默认截断检测提示词
 * @description 注入到最新用户消息末尾，要求模型在响应末尾添加终止符号
 */
export const DEFAULT_TRUNCATION_PROMPT = `[系统指令]请在完成回答后，另起一行输出终止符号 "{suffix}" 以表示响应完整。这是自动化检测用途，请勿在正文中提及。`;

/**
 * 截断检测服务
 * @description 支持自定义配置的截断检测功能
 */
export class TruncationService {
  private suffix: string;
  private prompt: string;
  private enabled: boolean;

  /**
   * 创建截断检测服务实例
   * @param config 截断配置
   */
  constructor(config: TruncationConfig) {
    this.enabled = config.enable;
    this.suffix = config.suffix || DEFAULT_TRUNCATION_SUFFIX;
    this.prompt = config.prompt || DEFAULT_TRUNCATION_PROMPT;
  }

  /**
   * 更新配置
   * @param config 新配置
   */
  updateConfig(config: TruncationConfig): void {
    this.enabled = config.enable;
    this.suffix = config.suffix || DEFAULT_TRUNCATION_SUFFIX;
    this.prompt = config.prompt || DEFAULT_TRUNCATION_PROMPT;
  }

  /**
   * 获取当前终止符号
   */
  getSuffix(): string {
    return this.suffix;
  }

  /**
   * 获取当前提示词
   */
  getPrompt(): string {
    return this.prompt.replace(/{suffix}/g, this.suffix);
  }

  /**
   * 是否启用截断检测
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 注入截断检测提示词到最新用户消息
   * @param messages 消息数组
   * @returns 更新后的消息数组
   */
  injectPrompt(messages: Array<{ role: string; content: unknown }>): Array<{ role: string; content: string }> {
    if (!this.enabled || messages.length === 0) {
      return this.normalizeMessages(messages);
    }

    const prompt = this.getPrompt();
    const normalized = this.normalizeMessages(messages);

    // 找到最后一条用户消息
    for (let i = normalized.length - 1; i >= 0; i--) {
      if (normalized[i]!.role === "user") {
        // 在用户消息末尾注入提示词
        normalized[i]!.content = `${normalized[i]!.content}\n\n${prompt}`;
        break;
      }
    }

    return normalized;
  }

  /**
   * 验证并清理截断标记
   * @param content 模型输出内容
   * @returns 清理截断标记后的文本
   * @throws 当响应被截断（缺少结束标记）时抛出 "TRUNCATED" 错误
   */
  stripSuffix(content: string): string {
    if (!this.enabled) {
      return content;
    }

    // 查找终止符号位置（可能在任何位置）
    const suffixIndex = content.lastIndexOf(this.suffix);

    if (suffixIndex === -1) {
      throw new Error("TRUNCATED");
    }

    // 返回终止符号之前的内容，并去除可能的尾随空白
    return content.slice(0, suffixIndex).trimEnd();
  }

  /**
   * 标准化消息数组
   */
  private normalizeMessages(
    messages: Array<{ role: string; content: unknown }>
  ): Array<{ role: string; content: string }> {
    return messages.map((msg) => ({
      ...msg,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
    }));
  }
}

// 创建默认实例（用于兼容旧代码）
let defaultService: TruncationService | null = null;

/**
 * 初始化默认截断服务
 * @param config 截断配置
 */
export function initTruncationService(config: TruncationConfig): void {
  defaultService = new TruncationService(config);
}

/**
 * 获取默认截断服务
 */
export function getTruncationService(): TruncationService | null {
  return defaultService;
}

/**
 * 重置截断服务（用于测试）
 */
export function resetTruncationService(): void {
  defaultService = null;
}

/**
 * 获取当前终止符号（兼容旧 API）
 */
export function getTruncationSuffix(): string {
  return defaultService?.getSuffix() ?? DEFAULT_TRUNCATION_SUFFIX;
}

/**
 * 注入截断检测提示词（兼容旧 API）
 * @param content 原始内容
 * @param suffix 自定义终止符号（可选）
 * @param prompt 自定义提示词（可选）
 * @returns 注入提示词后的内容
 */
export function addTruncationPrompt(content: string, suffix?: string, prompt?: string): string {
  const actualSuffix = suffix ?? DEFAULT_TRUNCATION_SUFFIX;
  const actualPrompt = prompt ?? DEFAULT_TRUNCATION_PROMPT;
  const formattedPrompt = actualPrompt.replace(/{suffix}/g, actualSuffix);
  return `${content}\n\n${formattedPrompt}`;
}

/**
 * 验证并清理截断标记（兼容旧 API）
 * @param content 模型输出内容
 * @param suffix 自定义终止符号（可选）
 * @returns 清理截断标记后的文本
 * @throws 当响应被截断时抛出 "TRUNCATED" 错误
 */
export function stripTruncationSuffix(content: string, suffix?: string): string {
  const actualSuffix = suffix ?? DEFAULT_TRUNCATION_SUFFIX;
  
  // 查找终止符号位置
  const suffixIndex = content.lastIndexOf(actualSuffix);

  if (suffixIndex === -1) {
    throw new Error("TRUNCATED");
  }

  // 返回终止符号之前的内容
  return content.slice(0, suffixIndex).trimEnd();
}

// 向后兼容的常量
export const TRUNCATION_SUFFIX = DEFAULT_TRUNCATION_SUFFIX;
