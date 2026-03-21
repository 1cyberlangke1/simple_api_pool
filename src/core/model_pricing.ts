/**
 * 模型价格服务
 * @description 从开源数据源获取模型价格，支持模糊匹配，支持美元和人民币双货币
 */

import type { PricingConfig } from "./types.js";
import { DAY_MS } from "./types.js";
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("model-pricing");

// ============================================================
// 类型定义
// ============================================================

/**
 * 模型价格数据（来自 genai-prices 或类似数据源）
 */
export interface ModelPriceData {
  /** 提供商ID，如 openai, anthropic */
  providerId: string;
  /** 模型ID，如 gpt-4o, claude-3-opus */
  modelId: string;
  /** 显示名称 */
  displayName?: string;
  /** 输入价格（每 1M tokens，美元） */
  inputPricePer1M: number;
  /** 输出价格（每 1M tokens，美元） */
  outputPricePer1M: number;
  /** 上下文窗口大小 */
  contextWindow?: number;
  /** 是否支持工具调用 */
  supportsTools?: boolean;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 匹配结果
 */
export interface PriceMatchResult {
  /** 匹配到的价格数据 */
  price: ModelPriceData;
  /** 匹配得分 (0-1，越高越好) */
  score: number;
  /** 匹配类型 */
  matchType: "exact" | "provider_exact" | "fuzzy";
}

/**
 * 价格查询选项
 */
export interface PriceQueryOptions {
  /** 提供商名称（可选，用于更精确匹配） */
  provider?: string;
  /** 模型名称 */
  model: string;
  /** 是否返回多个匹配结果 */
  multiMatch?: boolean;
  /** 最大返回数量 */
  limit?: number;
}

// ============================================================
// 内置价格数据库
// ============================================================

/**
 * 内置模型价格数据
 * 数据来源: pydantic/genai-prices, pricepertoken.com
 * 价格单位: 美元/1M tokens
 * 更新日期: 2026-03
 */
const BUILTIN_PRICES: ModelPriceData[] = [
  // OpenAI 模型
  { providerId: "openai", modelId: "gpt-4o", inputPricePer1M: 2.5, outputPricePer1M: 10, contextWindow: 128000, supportsTools: true },
  { providerId: "openai", modelId: "gpt-4o-mini", inputPricePer1M: 0.15, outputPricePer1M: 0.6, contextWindow: 128000, supportsTools: true },
  { providerId: "openai", modelId: "gpt-4-turbo", inputPricePer1M: 10, outputPricePer1M: 30, contextWindow: 128000, supportsTools: true },
  { providerId: "openai", modelId: "gpt-4", inputPricePer1M: 30, outputPricePer1M: 60, contextWindow: 8192, supportsTools: true },
  { providerId: "openai", modelId: "gpt-4-32k", inputPricePer1M: 60, outputPricePer1M: 120, contextWindow: 32768, supportsTools: true },
  { providerId: "openai", modelId: "gpt-3.5-turbo", inputPricePer1M: 0.5, outputPricePer1M: 1.5, contextWindow: 16385, supportsTools: true },
  { providerId: "openai", modelId: "gpt-3.5-turbo-16k", inputPricePer1M: 3, outputPricePer1M: 4, contextWindow: 16385, supportsTools: true },
  { providerId: "openai", modelId: "o1", inputPricePer1M: 15, outputPricePer1M: 60, contextWindow: 200000, supportsTools: false },
  { providerId: "openai", modelId: "o1-mini", inputPricePer1M: 1.1, outputPricePer1M: 4.4, contextWindow: 128000, supportsTools: false },
  { providerId: "openai", modelId: "o1-preview", inputPricePer1M: 15, outputPricePer1M: 60, contextWindow: 128000, supportsTools: false },
  { providerId: "openai", modelId: "o3-mini", inputPricePer1M: 1.1, outputPricePer1M: 4.4, contextWindow: 200000, supportsTools: true },
  
  // Anthropic 模型
  { providerId: "anthropic", modelId: "claude-3-5-sonnet-20241022", inputPricePer1M: 3, outputPricePer1M: 15, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-3-5-sonnet-20240620", inputPricePer1M: 3, outputPricePer1M: 15, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-3-5-haiku-20241022", inputPricePer1M: 0.8, outputPricePer1M: 4, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-3-opus-20240229", inputPricePer1M: 15, outputPricePer1M: 75, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-3-sonnet-20240229", inputPricePer1M: 3, outputPricePer1M: 15, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-3-haiku-20240307", inputPricePer1M: 0.25, outputPricePer1M: 1.25, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-2.1", inputPricePer1M: 8, outputPricePer1M: 24, contextWindow: 200000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-2", inputPricePer1M: 8, outputPricePer1M: 24, contextWindow: 100000, supportsTools: true },
  { providerId: "anthropic", modelId: "claude-instant-1.2", inputPricePer1M: 0.8, outputPricePer1M: 2.4, contextWindow: 100000, supportsTools: true },

  // Google 模型
  { providerId: "google", modelId: "gemini-2.0-flash", inputPricePer1M: 0.1, outputPricePer1M: 0.4, contextWindow: 1048576, supportsTools: true },
  { providerId: "google", modelId: "gemini-2.0-flash-lite", inputPricePer1M: 0.075, outputPricePer1M: 0.3, contextWindow: 1048576, supportsTools: true },
  { providerId: "google", modelId: "gemini-1.5-pro", inputPricePer1M: 1.25, outputPricePer1M: 5, contextWindow: 2097152, supportsTools: true },
  { providerId: "google", modelId: "gemini-1.5-flash", inputPricePer1M: 0.075, outputPricePer1M: 0.3, contextWindow: 1048576, supportsTools: true },
  { providerId: "google", modelId: "gemini-1.0-pro", inputPricePer1M: 0.5, outputPricePer1M: 1.5, contextWindow: 32760, supportsTools: true },

  // DeepSeek 模型
  { providerId: "deepseek", modelId: "deepseek-chat", inputPricePer1M: 0.27, outputPricePer1M: 1.1, contextWindow: 64000, supportsTools: true },
  { providerId: "deepseek", modelId: "deepseek-reasoner", inputPricePer1M: 0.55, outputPricePer1M: 2.19, contextWindow: 64000, supportsTools: false },
  { providerId: "deepseek", modelId: "deepseek-r1", inputPricePer1M: 0.55, outputPricePer1M: 2.19, contextWindow: 64000, supportsTools: false },

  // Mistral 模型
  { providerId: "mistral", modelId: "mistral-large-latest", inputPricePer1M: 2, outputPricePer1M: 6, contextWindow: 128000, supportsTools: true },
  { providerId: "mistral", modelId: "mistral-medium-latest", inputPricePer1M: 2.7, outputPricePer1M: 8.1, contextWindow: 32000, supportsTools: true },
  { providerId: "mistral", modelId: "mistral-small-latest", inputPricePer1M: 0.2, outputPricePer1M: 0.6, contextWindow: 128000, supportsTools: true },
  { providerId: "mistral", modelId: "codestral-latest", inputPricePer1M: 0.3, outputPricePer1M: 0.9, contextWindow: 256000, supportsTools: true },
  { providerId: "mistral", modelId: "ministral-8b-latest", inputPricePer1M: 0.1, outputPricePer1M: 0.1, contextWindow: 128000, supportsTools: true },

  // Groq 模型
  { providerId: "groq", modelId: "llama-3.3-70b-versatile", inputPricePer1M: 0.59, outputPricePer1M: 0.79, contextWindow: 128000, supportsTools: true },
  { providerId: "groq", modelId: "llama-3.1-70b-versatile", inputPricePer1M: 0.59, outputPricePer1M: 0.79, contextWindow: 131072, supportsTools: true },
  { providerId: "groq", modelId: "llama-3.1-8b-instant", inputPricePer1M: 0.05, outputPricePer1M: 0.08, contextWindow: 131072, supportsTools: true },
  { providerId: "groq", modelId: "mixtral-8x7b-32768", inputPricePer1M: 0.24, outputPricePer1M: 0.24, contextWindow: 32768, supportsTools: true },

  // xAI 模型
  { providerId: "xai", modelId: "grok-2-1212", inputPricePer1M: 2, outputPricePer1M: 10, contextWindow: 131072, supportsTools: true },
  { providerId: "xai", modelId: "grok-2-vision-1212", inputPricePer1M: 2, outputPricePer1M: 10, contextWindow: 32768, supportsTools: true },
  { providerId: "xai", modelId: "grok-beta", inputPricePer1M: 5, outputPricePer1M: 15, contextWindow: 131072, supportsTools: true },

  // Meta Llama 模型
  { providerId: "meta", modelId: "llama-3.3-70b-instruct", inputPricePer1M: 0.6, outputPricePer1M: 0.6, contextWindow: 128000, supportsTools: true },
  { providerId: "meta", modelId: "llama-3.2-90b-vision-instruct", inputPricePer1M: 0.9, outputPricePer1M: 0.9, contextWindow: 131072, supportsTools: true },
  { providerId: "meta", modelId: "llama-3.2-11b-vision-instruct", inputPricePer1M: 0.055, outputPricePer1M: 0.055, contextWindow: 128000, supportsTools: true },
  { providerId: "meta", modelId: "llama-3.2-3b-instruct", inputPricePer1M: 0.03, outputPricePer1M: 0.05, contextWindow: 128000, supportsTools: true },
  { providerId: "meta", modelId: "llama-3.2-1b-instruct", inputPricePer1M: 0.02, outputPricePer1M: 0.02, contextWindow: 128000, supportsTools: true },

  // 阿里云通义千问
  { providerId: "qwen", modelId: "qwen-max", inputPricePer1M: 2.4, outputPricePer1M: 9.6, contextWindow: 32768, supportsTools: true },
  { providerId: "qwen", modelId: "qwen-plus", inputPricePer1M: 0.8, outputPricePer1M: 2, contextWindow: 131072, supportsTools: true },
  { providerId: "qwen", modelId: "qwen-turbo", inputPricePer1M: 0.3, outputPricePer1M: 0.6, contextWindow: 131072, supportsTools: true },
  { providerId: "qwen", modelId: "qwen-long", inputPricePer1M: 0.5, outputPricePer1M: 2, contextWindow: 1000000, supportsTools: true },
  { providerId: "qwen", modelId: "qwen-vl-max", inputPricePer1M: 3, outputPricePer1M: 9, contextWindow: 32768, supportsTools: false },

  // 智谱 AI
  { providerId: "zhipu", modelId: "glm-4-plus", inputPricePer1M: 50, outputPricePer1M: 50, contextWindow: 128000, supportsTools: true },
  { providerId: "zhipu", modelId: "glm-4", inputPricePer1M: 100, outputPricePer1M: 100, contextWindow: 128000, supportsTools: true },
  { providerId: "zhipu", modelId: "glm-4-flash", inputPricePer1M: 0.1, outputPricePer1M: 0.1, contextWindow: 128000, supportsTools: true },
  { providerId: "zhipu", modelId: "glm-4-air", inputPricePer1M: 1, outputPricePer1M: 1, contextWindow: 128000, supportsTools: true },

  // Moonshot AI
  { providerId: "moonshot", modelId: "moonshot-v1-8k", inputPricePer1M: 12, outputPricePer1M: 12, contextWindow: 8192, supportsTools: true },
  { providerId: "moonshot", modelId: "moonshot-v1-32k", inputPricePer1M: 24, outputPricePer1M: 24, contextWindow: 32768, supportsTools: true },
  { providerId: "moonshot", modelId: "moonshot-v1-128k", inputPricePer1M: 60, outputPricePer1M: 60, contextWindow: 131072, supportsTools: true },

  // 字节跳动豆包
  { providerId: "doubao", modelId: "doubao-pro-32k", inputPricePer1M: 0.8, outputPricePer1M: 2, contextWindow: 32768, supportsTools: true },
  { providerId: "doubao", modelId: "doubao-pro-128k", inputPricePer1M: 5, outputPricePer1M: 9, contextWindow: 128000, supportsTools: true },
  { providerId: "doubao", modelId: "doubao-lite-32k", inputPricePer1M: 0.3, outputPricePer1M: 0.6, contextWindow: 32768, supportsTools: true },

  // 百度文心一言
  { providerId: "baidu", modelId: "ernie-4.0-8k", inputPricePer1M: 120, outputPricePer1M: 120, contextWindow: 8192, supportsTools: true },
  { providerId: "baidu", modelId: "ernie-3.5-8k", inputPricePer1M: 12, outputPricePer1M: 12, contextWindow: 8192, supportsTools: true },
  { providerId: "baidu", modelId: "ernie-speed-8k", inputPricePer1M: 1, outputPricePer1M: 2, contextWindow: 8192, supportsTools: true },

  // Cohere 模型
  { providerId: "cohere", modelId: "command-r-plus", inputPricePer1M: 2.5, outputPricePer1M: 10, contextWindow: 128000, supportsTools: true },
  { providerId: "cohere", modelId: "command-r", inputPricePer1M: 0.5, outputPricePer1M: 1.5, contextWindow: 128000, supportsTools: true },
  { providerId: "cohere", modelId: "command", inputPricePer1M: 1, outputPricePer1M: 2, contextWindow: 4096, supportsTools: true },
  { providerId: "cohere", modelId: "command-light", inputPricePer1M: 0.38, outputPricePer1M: 0.38, contextWindow: 4096, supportsTools: true },

  // Perplexity 模型
  { providerId: "perplexity", modelId: "llama-3.1-sonar-small-128k-online", inputPricePer1M: 0.2, outputPricePer1M: 0.2, contextWindow: 127072, supportsTools: false },
  { providerId: "perplexity", modelId: "llama-3.1-sonar-large-128k-online", inputPricePer1M: 1, outputPricePer1M: 1, contextWindow: 127072, supportsTools: false },
  { providerId: "perplexity", modelId: "llama-3.1-sonar-huge-128k-online", inputPricePer1M: 5, outputPricePer1M: 5, contextWindow: 127072, supportsTools: false },

  // Together AI 模型
  { providerId: "together", modelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo", inputPricePer1M: 0.88, outputPricePer1M: 0.88, contextWindow: 131072, supportsTools: true },
  { providerId: "together", modelId: "mistralai/Mixtral-8x7B-Instruct-v0.1", inputPricePer1M: 0.6, outputPricePer1M: 0.6, contextWindow: 32768, supportsTools: true },

  // Fireworks AI 模型
  { providerId: "fireworks", modelId: "accounts/fireworks/models/llama-v3p1-70b-instruct", inputPricePer1M: 0.9, outputPricePer1M: 0.9, contextWindow: 131072, supportsTools: true },
  { providerId: "fireworks", modelId: "accounts/fireworks/models/llama-v3p1-8b-instruct", inputPricePer1M: 0.2, outputPricePer1M: 0.2, contextWindow: 131072, supportsTools: true },

  // OpenRouter (聚合平台)
  { providerId: "openrouter", modelId: "openai/gpt-4o", inputPricePer1M: 2.5, outputPricePer1M: 10, contextWindow: 128000, supportsTools: true },
  { providerId: "openrouter", modelId: "anthropic/claude-3.5-sonnet", inputPricePer1M: 3, outputPricePer1M: 15, contextWindow: 200000, supportsTools: true },
  { providerId: "openrouter", modelId: "google/gemini-pro", inputPricePer1M: 0.5, outputPricePer1M: 1.5, contextWindow: 91728, supportsTools: true },
  { providerId: "openrouter", modelId: "meta-llama/llama-3.3-70b-instruct", inputPricePer1M: 0.35, outputPricePer1M: 0.4, contextWindow: 131072, supportsTools: true },
  { providerId: "openrouter", modelId: "deepseek/deepseek-chat", inputPricePer1M: 0.14, outputPricePer1M: 0.28, contextWindow: 64000, supportsTools: true },
  { providerId: "openrouter", modelId: "qwen/qwen-2.5-72b-instruct", inputPricePer1M: 0.35, outputPricePer1M: 0.4, contextWindow: 131072, supportsTools: true },
];

// ============================================================
// 模型价格服务类
// ============================================================

/**
 * 模型价格服务
 * @description 提供模型价格的查询和模糊匹配功能，支持查询缓存和预构建索引
 */
export class ModelPricingService {
  private prices: ModelPriceData[];
  private lastUpdate: number;
  private updateInterval: number;
  /** 查询结果缓存，键为 "provider|model" 格式 */
  private queryCache: Map<string, PriceMatchResult[]> = new Map();
  /** 预构建的标准化索引，避免重复计算 */
  private normalizedIndex: Array<{
    price: ModelPriceData;
    normalizedModel: string;
    normalizedProvider: string;
  }>;
  /** 缓存最大条目数 */
  private static readonly MAX_CACHE_SIZE = 1000;

  /**
   * 构造函数
   * @param updateIntervalMs 更新间隔（毫秒，默认24小时）
   */
  constructor(updateIntervalMs: number = DAY_MS) {
    this.prices = [...BUILTIN_PRICES];
    this.lastUpdate = Date.now();
    this.updateInterval = updateIntervalMs;
    // 预构建标准化索引
    this.normalizedIndex = this.buildNormalizedIndex();
  }

  /**
   * 构建标准化索引
   * @description 预先计算所有模型和提供商的标准化名称，避免查询时重复计算
   */
  private buildNormalizedIndex(): Array<{
    price: ModelPriceData;
    normalizedModel: string;
    normalizedProvider: string;
  }> {
    return this.prices.map((price) => ({
      price,
      normalizedModel: this.normalizeModelName(price.modelId),
      normalizedProvider: this.normalizeProviderName(price.providerId),
    }));
  }

  /**
   * 获取所有价格数据
   * @returns 所有内置价格数据
   */
  getAllPrices(): ModelPriceData[] {
    return [...this.prices];
  }

  /**
   * 获取支持的提供商列表
   * @returns 所有支持的提供商 ID 数组
   */
  getSupportedProviders(): string[] {
    const providers = new Set(this.prices.map((p) => p.providerId));
    return Array.from(providers).sort();
  }

  /**
   * 查询模型价格
   * @param options 查询选项
   * @returns 匹配结果数组
   */
  queryPrice(options: PriceQueryOptions): PriceMatchResult[] {
    const { provider, model, multiMatch = false, limit = 5 } = options;
    
    // 构建缓存键
    const cacheKey = `${provider ?? ""}|${model}`;
    
    // 检查缓存
    const cached = this.queryCache.get(cacheKey);
    if (cached) {
      if (multiMatch) {
        return cached.slice(0, limit);
      }
      return cached.length > 0 ? [cached[0]!] : [];
    }

    // 执行查询
    const normalizedModel = this.normalizeModelName(model);
    const normalizedProvider = provider ? this.normalizeProviderName(provider) : null;

    const results: PriceMatchResult[] = [];

    // 使用预构建索引
    for (const item of this.normalizedIndex) {
      const { price, normalizedModel: normalizedPriceModel, normalizedProvider: normalizedPriceProvider } = item;

      // 计算匹配得分
      let score = 0;
      let matchType: PriceMatchResult["matchType"] = "fuzzy";

      if (normalizedProvider) {
        // 指定了提供商时的匹配逻辑
        if (normalizedPriceProvider === normalizedProvider) {
          if (normalizedPriceModel === normalizedModel) {
            score = 1.0;
            matchType = "exact";
          } else if (normalizedPriceModel.includes(normalizedModel) || normalizedModel.includes(normalizedPriceModel)) {
            score = 0.8;
            matchType = "provider_exact";
          } else {
            const fuzzyScore = this.fuzzyMatch(normalizedModel, normalizedPriceModel);
            if (fuzzyScore > 0.5) {
              score = fuzzyScore * 0.7;
            }
          }
        }
      } else {
        // 未指定提供商时的匹配逻辑
        if (normalizedPriceModel === normalizedModel) {
          score = 0.95; // 没有提供商信息时，精确匹配得分略低
          matchType = "exact";
        } else if (normalizedPriceModel.includes(normalizedModel) || normalizedModel.includes(normalizedPriceModel)) {
          score = 0.7;
          matchType = "fuzzy";
        } else {
          const fuzzyScore = this.fuzzyMatch(normalizedModel, normalizedPriceModel);
          if (fuzzyScore > 0.5) {
            score = fuzzyScore * 0.5;
          }
        }
      }

      if (score > 0) {
        results.push({ price, score, matchType });
      }
    }

    // 按得分降序排序
    results.sort((a, b) => b.score - a.score);

    // 存入缓存（限制缓存大小）
    if (this.queryCache.size >= ModelPricingService.MAX_CACHE_SIZE) {
      // 删除最早的缓存条目
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) {
        this.queryCache.delete(firstKey);
      }
    }
    this.queryCache.set(cacheKey, results);

    // 返回结果
    if (multiMatch) {
      return results.slice(0, limit);
    } else {
      return results.length > 0 ? [results[0]!] : [];
    }
  }

  /**
   * 获取单个最佳匹配
   * @param model 模型名称
   * @param provider 可选的提供商名称
   * @returns 最佳匹配的价格数据，无匹配则返回 null
   */
  getBestMatch(model: string, provider?: string): ModelPriceData | null {
    const results = this.queryPrice({ model, provider, multiMatch: false });
    return results.length > 0 ? results[0]!.price : null;
  }

  /**
   * 将价格转换为 PricingConfig 格式
   * @param price 价格数据（每1M tokens）
   * @returns PricingConfig（每1K tokens）
   */
  toPricingConfig(price: ModelPriceData): PricingConfig {
    return {
      promptPer1k: price.inputPricePer1M / 1000,
      completionPer1k: price.outputPricePer1M / 1000,
    };
  }

  /**
   * 标准化模型名称
   * @param name 原始模型名称
   * @returns 标准化后的名称（转小写，移除常见后缀和特殊字符）
   */
  private normalizeModelName(name: string): string {
    // 合并所有替换为单次正则匹配，避免多次中间字符串创建
    return name
      .toLowerCase()
      .replace(/[-_.:\/]|latest|instruct|turbo|preview|\d{8}/g, "")
      .trim();
  }

  /**
   * 标准化提供商名称
   * @param name 原始提供商名称
   * @returns 标准化后的名称（转小写，处理别名）
   */
  private normalizeProviderName(name: string): string {
    const normalized = name.toLowerCase().replace(/[-_.]/g, "");

    // 处理提供商别名
    const aliases: Record<string, string> = {
      openai: "openai",
      anthropic: "anthropic",
      google: "google",
      googleai: "google",
      gemini: "google",
      deepseek: "deepseek",
      mistral: "mistral",
      mistralai: "mistral",
      groq: "groq",
      xai: "xai",
      x: "xai",
      meta: "meta",
      facebook: "meta",
      qwen: "qwen",
      alibaba: "qwen",
      aliyun: "qwen",
      tongyi: "qwen",
      zhipu: "zhipu",
      zhipuai: "zhipu",
      moonshot: "moonshot",
      kimi: "moonshot",
      doubao: "doubao",
      bytedance: "doubao",
      baidu: "baidu",
      ernie: "baidu",
      wenxin: "baidu",
      cohere: "cohere",
      perplexity: "perplexity",
      together: "together",
      togetherai: "together",
      fireworks: "fireworks",
      fireworksai: "fireworks",
      openrouter: "openrouter",
    };

    return aliases[normalized] || normalized;
  }

  /**
   * 模糊匹配算法
   * @param str1 第一个字符串
   * @param str2 第二个字符串
   * @returns 匹配得分 (0-1)
   */
  private fuzzyMatch(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // 检查是否互相包含
    if (str1.includes(str2)) return str2.length / str1.length;
    if (str2.includes(str1)) return str1.length / str2.length;

    // 计算最长公共子序列
    const lcs = this.longestCommonSubsequence(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);

    return lcs / maxLen;
  }

  /**
   * 最长公共子序列长度
   * @description 使用滚动数组优化，空间复杂度 O(min(m,n))
   * @param str1 第一个字符串
   * @param str2 第二个字符串
   * @returns LCS 长度
   */
  private longestCommonSubsequence(str1: string, str2: string): number {
    // 确保 str2 是较短的字符串，减少空间使用
    if (str1.length < str2.length) {
      [str1, str2] = [str2, str1];
    }

    const m = str1.length;
    const n = str2.length;

    // 使用两行滚动数组，空间复杂度 O(n)
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      // 交换数组引用，避免复制
      [prev, curr] = [curr, prev];
    }

    return prev[n];
  }

  /**
   * 检查是否需要更新价格数据
   * @returns 是否需要更新
   */
  needsUpdate(): boolean {
    return Date.now() - this.lastUpdate > this.updateInterval;
  }

  /**
   * 更新最后更新时间
   */
  markUpdated(): void {
    this.lastUpdate = Date.now();
  }

  /**
   * 从外部 API 获取最新价格数据
   * @returns 是否成功获取
   */
  async fetchOnlinePrices(): Promise<boolean> {
    const PRICE_APIS = [
      {
        name: "genai-prices-jsdelivr",
        url: "https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices_and_context_window.json",
      },
      {
        name: "genai-prices-unpkg",
        url: "https://unpkg.com/litellm/model_prices_and_context_window.json",
      },
    ];

    for (const api of PRICE_APIS) {
      try {
        const response = await fetch(api.url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          log.warn({ status: response.status }, `${api.name} returned non-OK status`);
          continue;
        }

        const data = (await response.json()) as Record<string, unknown>;

        if (data && typeof data === "object") {
          const newPrices: ModelPriceData[] = [];
          let count = 0;

          for (const [modelId, modelData] of Object.entries(data)) {
            if (!modelData || typeof modelData !== "object") continue;

            const md = modelData as Record<string, unknown>;
            const inputPrice = md.input_cost_per_token as number | undefined;
            const outputPrice = md.output_cost_per_token as number | undefined;

            if (inputPrice === undefined || outputPrice === undefined) continue;

            // 转换为每 1M tokens 的价格
            const inputPricePer1M = inputPrice * 1_000_000;
            const outputPricePer1M = outputPrice * 1_000_000;

            // 解析提供商
            const providerId = this.extractProvider(modelId);

            newPrices.push({
              providerId,
              modelId,
              displayName: (md.model_name as string) ?? modelId,
              inputPricePer1M,
              outputPricePer1M,
              contextWindow: md.max_input_tokens as number | undefined,
              supportsTools: md.supports_function_calling === true,
            });
            count++;
          }

          if (count > 0) {
            // 合并内置价格和在线价格（在线价格优先）
            const priceMap = new Map<string, ModelPriceData>();

            // 先添加内置价格
            for (const p of BUILTIN_PRICES) {
              priceMap.set(`${p.providerId}/${p.modelId}`, p);
            }

            // 再添加在线价格（覆盖同名）
            for (const p of newPrices) {
              priceMap.set(`${p.providerId}/${p.modelId}`, p);
            }

            this.prices = Array.from(priceMap.values());
            this.normalizedIndex = this.buildNormalizedIndex();
            this.queryCache.clear();
            this.lastUpdate = Date.now();

            log.info({ count, source: api.name }, "Successfully fetched online prices");
            return true;
          }
        }
      } catch (error) {
        log.warn({ error, api: api.name }, "Failed to fetch online prices");
        continue;
      }
    }

    log.warn("All price APIs failed, using built-in prices");
    return false;
  }

  /**
   * 从模型 ID 提取提供商名称
   * @param modelId 模型 ID
   * @returns 提供商 ID
   */
  private extractProvider(modelId: string): string {
    // 常见的提供商前缀
    const providerPrefixes: Array<{ prefix: string; provider: string }> = [
      { prefix: "openai/", provider: "openai" },
      { prefix: "anthropic/", provider: "anthropic" },
      { prefix: "google/", provider: "google" },
      { prefix: "gemini/", provider: "google" },
      { prefix: "deepseek/", provider: "deepseek" },
      { prefix: "mistral/", provider: "mistral" },
      { prefix: "mistralai/", provider: "mistral" },
      { prefix: "groq/", provider: "groq" },
      { prefix: "xai/", provider: "xai" },
      { prefix: "meta/", provider: "meta" },
      { prefix: "meta-llama/", provider: "meta" },
      { prefix: "qwen/", provider: "qwen" },
      { prefix: "alibaba/", provider: "qwen" },
      { prefix: "zhipu/", provider: "zhipu" },
      { prefix: "moonshot/", provider: "moonshot" },
      { prefix: "doubao/", provider: "doubao" },
      { prefix: "baidu/", provider: "baidu" },
      { prefix: "cohere/", provider: "cohere" },
      { prefix: "perplexity/", provider: "perplexity" },
      { prefix: "together/", provider: "together" },
      { prefix: "fireworks/", provider: "fireworks" },
      { prefix: "openrouter/", provider: "openrouter" },
    ];

    for (const { prefix, provider } of providerPrefixes) {
      if (modelId.toLowerCase().startsWith(prefix)) {
        return provider;
      }
    }

    // 无法识别的提供商，使用模型名作为提供商
    return modelId.split("/")[0]?.toLowerCase() ?? "unknown";
  }
}

// ============================================================
// 单例管理：使用延迟初始化工厂函数
// ============================================================

let _instance: ModelPricingService | null = null;

/**
 * 获取 ModelPricingService 单例
 * @description 延迟初始化，避免模块加载时创建实例
 */
export function getModelPricingService(): ModelPricingService {
  if (!_instance) {
    _instance = new ModelPricingService();
  }
  return _instance;
}

/**
 * 重置单例（用于测试）
 */
export function resetModelPricingService(): void {
  _instance = null;
}

// 兼容旧代码：导出单例实例（使用 getter 实现延迟初始化）
export const modelPricingService = new Proxy({} as ModelPricingService, {
  get(_target, prop) {
    return Reflect.get(getModelPricingService(), prop);
  },
});
