/**
 * 汇率服务
 * @description 提供美元/人民币汇率查询，支持在线获取和本地缓存
 */

import { HOUR_MS, DAY_MS, EXCHANGE_RATE_TIMEOUT_MS } from "./constants.js";
import { createModuleLogger } from "./logger.js";

const log = createModuleLogger("exchange-rate");

// ============================================================
// 类型定义
// ============================================================

/**
 * 汇率数据
 */
export interface ExchangeRateData {
  /** 基础货币 */
  base: string;
  /** 目标货币 */
  target: string;
  /** 汇率（1 基础货币 = ? 目标货币） */
  rate: number;
  /** 数据来源 */
  source: "online" | "fallback";
  /** 更新时间（Unix 时间戳） */
  updatedAt: number;
  /** 下次更新时间（Unix 时间戳） */
  nextUpdateAt: number;
}

/**
 * 汇率缓存
 */
interface RateCache {
  rate: number;
  updatedAt: number;
  source: "online" | "fallback";
}

// ============================================================
// 常量定义
// ============================================================

/**
 * 经验值汇率（当无法在线获取时使用）
 * 这些是基于历史数据的保守估计值
 */
const FALLBACK_RATES: Record<string, number> = {
  "USD-CNY": 7.25,  // 1 美元 ≈ 7.25 人民币
  "CNY-USD": 0.138, // 1 人民币 ≈ 0.138 美元
  "USD-EUR": 0.92,  // 1 美元 ≈ 0.92 欧元
  "EUR-USD": 1.09,  // 1 欧元 ≈ 1.09 美元
  "USD-GBP": 0.79,  // 1 美元 ≈ 0.79 英镑
  "GBP-USD": 1.27,  // 1 英镑 ≈ 1.27 美元
  "USD-JPY": 150,   // 1 美元 ≈ 150 日元
  "JPY-USD": 0.0067, // 1 日元 ≈ 0.0067 美元
};

/**
 * 免费汇率 API 端点列表
 */
const EXCHANGE_RATE_APIS = [
  {
    name: "exchangerate-api",
    url: "https://open.er-api.com/v6/latest/USD",
    parse: (data: Record<string, unknown>) => {
      const rates = data.rates as Record<string, number> | undefined;
      if (rates && rates.CNY) {
        return { USDCNY: rates.CNY };
      }
      return null;
    },
  },
  {
    name: "frankfurter",
    url: "https://api.frankfurter.app/latest?from=USD&to=CNY",
    parse: (data: Record<string, unknown>) => {
      const rates = data.rates as Record<string, number> | undefined;
      if (rates && rates.CNY) {
        return { USDCNY: rates.CNY };
      }
      return null;
    },
  },
  {
    name: "currency-api",
    url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    parse: (data: Record<string, unknown>) => {
      const usd = data.usd as Record<string, number> | undefined;
      if (usd && usd.cny) {
        return { USDCNY: usd.cny };
      }
      return null;
    },
  },
];

// ============================================================
// 汇率服务类
// ============================================================

/**
 * 汇率服务
 * @description 管理汇率获取、缓存和转换
 */
export class ExchangeRateService {
  private cache: Map<string, RateCache> = new Map();
  private updateInterval: number;
  private lastFetchAttempt: number = 0;
  private fetchCooldown: number;

  /**
   * 构造函数
   * @param updateIntervalMs 更新间隔（毫秒，默认24小时）
   * @param fetchCooldownMs 获取冷却时间（毫秒，默认1小时）
   */
  constructor(updateIntervalMs: number = DAY_MS, fetchCooldownMs: number = HOUR_MS) {
    this.updateInterval = updateIntervalMs;
    this.fetchCooldown = fetchCooldownMs;

    // 初始化时使用经验值
    this.initializeWithFallback();
  }

  /**
   * 使用经验值初始化缓存
   */
  private initializeWithFallback(): void {
    const now = Date.now();
    for (const [pair, rate] of Object.entries(FALLBACK_RATES)) {
      this.cache.set(pair, {
        rate,
        updatedAt: now,
        source: "fallback",
      });
    }
  }

  /**
   * 获取汇率
   * @param base 基础货币代码
   * @param target 目标货币代码
   * @returns 汇率数据（优先级：有效的在线缓存 -> 过期的在线缓存 -> 经验值）
   */
  async getRate(base: string, target: string): Promise<ExchangeRateData> {
    // 相同货币直接返回 1:1
    if (base.toUpperCase() === target.toUpperCase()) {
      return {
        base: base.toUpperCase(),
        target: target.toUpperCase(),
        rate: 1,
        source: "fallback",
        updatedAt: Date.now(),
        nextUpdateAt: Date.now() + this.updateInterval,
      };
    }

    const pair = `${base.toUpperCase()}-${target.toUpperCase()}`;
    const reversePair = `${target.toUpperCase()}-${base.toUpperCase()}`;

    // 检查缓存是否有效
    const cached = this.cache.get(pair);
    if (cached && this.isCacheValid(cached)) {
      return this.createExchangeRateData(cached, pair);
    }

    // 如果是反向查询，可以从正向汇率计算
    const cachedReverse = this.cache.get(reversePair);
    if (cachedReverse && this.isCacheValid(cachedReverse)) {
      const invertedRate = 1 / cachedReverse.rate;
      const invertedCache: RateCache = {
        rate: invertedRate,
        updatedAt: cachedReverse.updatedAt,
        source: cachedReverse.source,
      };
      return this.createExchangeRateData(invertedCache, pair);
    }

    // 尝试在线获取
    if (this.shouldAttemptFetch()) {
      await this.fetchOnlineRate();
    }

    // 优先使用在线缓存（即使过期），其次使用经验值
    const finalCache = this.getBestAvailableCache(pair);
    return this.createExchangeRateData(finalCache, pair);
  }

  /**
   * 获取最佳可用缓存
   * @param pair 货币对
   * @returns 缓存数据（优先返回在线缓存，其次经验值）
   */
  private getBestAvailableCache(pair: string): RateCache {
    const cached = this.cache.get(pair);

    // 如果有在线获取的缓存（即使过期），优先使用
    if (cached && cached.source === "online") {
      return cached;
    }

    // 否则使用经验值
    return this.getFallbackRate(pair);
  }

  /**
   * 获取 USD/CNY 汇率
   * @returns 美元兑人民币汇率数据
   */
  async getUSDCNY(): Promise<ExchangeRateData> {
    return this.getRate("USD", "CNY");
  }

  /**
   * 货币转换
   * @param amount 金额
   * @param from 源货币
   * @param to 目标货币
   * @returns 转换后的金额
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) {
      return amount;
    }

    const rateData = await this.getRate(from, to);
    return amount * rateData.rate;
  }

  /**
   * 美元转人民币
   * @param usd 美元金额
   * @returns 人民币金额
   */
  async USDToCNY(usd: number): Promise<number> {
    return this.convert(usd, "USD", "CNY");
  }

  /**
   * 人民币转美元
   * @param cny 人民币金额
   * @returns 美元金额
   */
  async CNYToUSD(cny: number): Promise<number> {
    return this.convert(cny, "CNY", "USD");
  }

  /**
   * 强制刷新汇率
   * @returns 是否成功获取
   */
  async refresh(): Promise<boolean> {
    return this.fetchOnlineRate();
  }

  /**
   * 手动设置汇率
   * @param base 基础货币
   * @param target 目标货币
   * @param rate 汇率
   * @description 手动设置的汇率视为在线获取，有效期24小时
   */
  setRate(base: string, target: string, rate: number): void {
    const now = Date.now();
    const pair = `${base.toUpperCase()}-${target.toUpperCase()}`;
    const reversePair = `${target.toUpperCase()}-${base.toUpperCase()}`;

    // 设置正向汇率
    this.cache.set(pair, {
      rate,
      updatedAt: now,
      source: "online",
    });

    // 设置反向汇率
    this.cache.set(reversePair, {
      rate: 1 / rate,
      updatedAt: now,
      source: "online",
    });

    log.info({ rate: `1 ${base} = ${rate} ${target}` }, "Exchange rate manually set");
  }

  /**
   * 获取当前缓存状态
   * @returns 所有缓存的汇率信息
   */
  getCacheStatus(): Array<{ pair: string; rate: number; source: string; updatedAt: Date }> {
    const result: Array<{ pair: string; rate: number; source: string; updatedAt: Date }> = [];

    for (const [pair, cache] of this.cache) {
      result.push({
        pair,
        rate: cache.rate,
        source: cache.source,
        updatedAt: new Date(cache.updatedAt),
      });
    }

    return result;
  }

  /**
   * 检查缓存是否有效
   * @param cache 缓存数据
   * @returns 是否未过期
   */
  private isCacheValid(cache: RateCache): boolean {
    return Date.now() - cache.updatedAt < this.updateInterval;
  }

  /**
   * 判断是否应该尝试在线获取
   * @returns 是否在冷却时间内
   */
  private shouldAttemptFetch(): boolean {
    return Date.now() - this.lastFetchAttempt > this.fetchCooldown;
  }

  /**
   * 从在线 API 获取汇率
   * @returns 是否成功获取
   */
  private async fetchOnlineRate(): Promise<boolean> {
    this.lastFetchAttempt = Date.now();

    for (const api of EXCHANGE_RATE_APIS) {
      try {
        const response = await fetch(api.url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(EXCHANGE_RATE_TIMEOUT_MS),
        });

        if (!response.ok) {
          continue;
        }

        const data = (await response.json()) as Record<string, unknown>;
        const parsed = api.parse(data);

        if (parsed && parsed.USDCNY) {
          const now = Date.now();
          const cacheData: RateCache = {
            rate: parsed.USDCNY,
            updatedAt: now,
            source: "online",
          };

          this.cache.set("USD-CNY", cacheData);
          this.cache.set("CNY-USD", {
            rate: 1 / parsed.USDCNY,
            updatedAt: now,
            source: "online",
          });

          log.info({ rate: `1 USD = ${parsed.USDCNY} CNY` }, `Successfully fetched rate from ${api.name}`);
          return true;
        }
      } catch (error) {
        log.warn({ error }, `Failed to fetch from ${api.name}`);
        continue;
      }
    }

    log.warn("All APIs failed, using fallback rates");
    return false;
  }

  /**
   * 获取经验值汇率
   * @param pair 货币对
   * @returns 缓存数据
   */
  private getFallbackRate(pair: string): RateCache {
    const rate = FALLBACK_RATES[pair];
    if (rate) {
      return {
        rate,
        updatedAt: Date.now(),
        source: "fallback",
      };
    }

    // 如果没有直接的经验值，尝试反向计算
    const [base, target] = pair.split("-");
    const reversePair = `${target}-${base}`;
    const reverseRate = FALLBACK_RATES[reversePair];

    if (reverseRate) {
      return {
        rate: 1 / reverseRate,
        updatedAt: Date.now(),
        source: "fallback",
      };
    }

    // 完全未知，返回 1:1
    log.warn(`Unknown currency pair: ${pair}, using 1:1`);
    return {
      rate: 1,
      updatedAt: Date.now(),
      source: "fallback",
    };
  }

  /**
   * 创建汇率数据对象
   * @param cache 缓存数据
   * @param pair 货币对
   * @returns ExchangeRateData 对象
   */
  private createExchangeRateData(cache: RateCache, pair: string): ExchangeRateData {
    const [base, target] = pair.split("-");
    return {
      base: base!,
      target: target!,
      rate: cache.rate,
      source: cache.source,
      updatedAt: cache.updatedAt,
      nextUpdateAt: cache.updatedAt + this.updateInterval,
    };
  }
}

// ============================================================
// 单例管理：使用延迟初始化工厂函数
// ============================================================

let _instance: ExchangeRateService | null = null;

/**
 * 获取 ExchangeRateService 单例
 * @description 延迟初始化，避免模块加载时创建实例
 */
export function getExchangeRateService(): ExchangeRateService {
  if (!_instance) {
    _instance = new ExchangeRateService();
  }
  return _instance;
}

/**
 * 重置单例（用于测试）
 */
export function resetExchangeRateService(): void {
  _instance = null;
}

// 兼容旧代码：导出单例实例（使用 Proxy 实现延迟初始化）
export const exchangeRateService = new Proxy({} as ExchangeRateService, {
  get(_target, prop) {
    return Reflect.get(getExchangeRateService(), prop);
  },
});
