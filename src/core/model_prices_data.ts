/**
 * 内置模型价格数据
 * @description 模型价格数据库，数据来源: pydantic/genai-prices, pricepertoken.com
 * @module core/model_prices_data
 */

import type { ModelPriceData } from "./model_pricing.js";

/**
 * 内置模型价格数据
 * 价格单位: 美元/1M tokens
 * 更新日期: 2026-03
 */
export const BUILTIN_PRICES: ModelPriceData[] = [
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
