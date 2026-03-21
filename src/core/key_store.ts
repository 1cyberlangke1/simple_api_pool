import type {
  KeyConfig,
  KeyState,
  KeySelectionStrategy,
  IKeySelectionStrategy,
} from "./types.js";
import { isKeyAvailable } from "./types.js";
import { createKeyStrategy } from "./strategies.js";
import { KeyUsageStore } from "./key_usage_store.js";

/**
 * 获取当前日期字符串
 * @returns YYYY-MM-DD 格式
 */
function getCurrentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Key 管理器
 * @description 支持可插拔策略的 Key 存储与选择
 */
export class KeyStore {
  /** Key 状态存储 */
  private keys: Map<string, KeyState> = new Map();
  /** 提供商到 Key 别名的映射 */
  private providerKeys: Map<string, string[]> = new Map();
  /** 策略实例缓存 */
  private strategies: Map<string, IKeySelectionStrategy> = new Map();
  /** 持久化存储（可选） */
  private usageStore: KeyUsageStore | null = null;

  /**
   * 初始化 KeyStore
   * @param keyConfigs Key 配置数组
   * @param usageStore 可选的使用状态持久化存储
   */
  constructor(keyConfigs: KeyConfig[], usageStore?: KeyUsageStore) {
    this.usageStore = usageStore ?? null;

    // 加载持久化状态
    const persistedUsage = usageStore ? usageStore.getAll() : [];
    const usageMap = new Map(persistedUsage.map((u) => [u.alias, u]));

    const today = getCurrentDate();

    for (const config of keyConfigs) {
      this.addKey(config);

      // 恢复持久化状态
      const persisted = usageMap.get(config.alias);
      if (persisted && config.quota.type !== "infinite") {
        const key = this.keys.get(config.alias)!;
        // 恢复 total 消耗
        if (config.quota.type === "total") {
          key.usage.totalCost = persisted.totalCost;
        }
        // 恢复 daily 计数（检查日期是否过期）
        if (config.quota.type === "daily") {
          key.usage.dailyCount = persisted.dailyResetDate === today ? persisted.dailyCount : 0;
          key.dailyResetDate = today;
        }
      }
    }
  }

  /**
   * 获取指定别名的 Key 状态
   */
  getKey(alias: string): KeyState | null {
    return this.keys.get(alias) ?? null;
  }

  /**
   * 列出所有 Key
   */
  listKeys(): KeyState[] {
    return Array.from(this.keys.values());
  }

  /**
   * 列出指定提供商的所有 Key
   */
  listKeysByProvider(provider: string): KeyState[] {
    const aliases = this.providerKeys.get(provider) ?? [];
    return aliases.map((alias) => this.keys.get(alias)).filter(Boolean) as KeyState[];
  }

  /**
   * 添加 Key
   * @description 如果 alias 已存在，先移除旧记录再添加新记录，避免 providerKeys 重复
   */
  addKey(config: KeyConfig): void {
    // 如果 alias 已存在，先从 providerKeys 中移除旧记录
    const existing = this.keys.get(config.alias);
    if (existing) {
      const oldProviderKeys = this.providerKeys.get(existing.provider);
      if (oldProviderKeys) {
        const idx = oldProviderKeys.indexOf(config.alias);
        if (idx !== -1) {
          oldProviderKeys.splice(idx, 1);
        }
        // 如果数组为空，移除该 provider 条目
        if (oldProviderKeys.length === 0) {
          this.providerKeys.delete(existing.provider);
        }
      }
    }

    const state: KeyState = {
      ...config,
      usage: {
        dailyCount: 0,
        totalCost: 0,
      },
      available: true,
      lastUsedAt: null,
    };

    this.keys.set(config.alias, state);

    if (!this.providerKeys.has(config.provider)) {
      this.providerKeys.set(config.provider, []);
    }
    this.providerKeys.get(config.provider)!.push(config.alias);
  }

  /**
   * 更新 Key
   */
  updateKey(alias: string, config: KeyConfig): boolean {
    const existing = this.keys.get(alias);
    if (!existing) return false;

    // 保留使用状态
    const state: KeyState = {
      ...config,
      usage: existing.usage,
      available: existing.available,
      lastUsedAt: existing.lastUsedAt,
    };

    this.keys.set(alias, state);

    // 如果提供商变更，更新索引
    if (existing.provider !== config.provider) {
      this.removeFromProviderIndex(alias, existing.provider);
      if (!this.providerKeys.has(config.provider)) {
        this.providerKeys.set(config.provider, []);
      }
      this.providerKeys.get(config.provider)!.push(alias);
    }

    return true;
  }

  /**
   * 删除 Key
   */
  deleteKey(alias: string): boolean {
    const state = this.keys.get(alias);
    if (!state) return false;

    this.keys.delete(alias);
    this.removeFromProviderIndex(alias, state.provider);

    // 删除持久化数据
    this.usageStore?.delete(alias);

    return true;
  }

  /**
   * 从提供商索引中移除
   */
  private removeFromProviderIndex(alias: string, provider: string): void {
    const keys = this.providerKeys.get(provider);
    if (keys) {
      this.providerKeys.set(
        provider,
        keys.filter((a) => a !== alias)
      );
    }
  }

  /**
   * 重置每日配额计数
   */
  resetDaily(): void {
    for (const state of this.keys.values()) {
      state.usage.dailyCount = 0;
    }
  }

  /**
   * 按提供商重置每日配额计数
   * @param provider 提供商名称
   */
  resetDailyByProvider(provider: string): void {
    const aliases = this.providerKeys.get(provider);
    if (!aliases) return;
    
    for (const alias of aliases) {
      const state = this.keys.get(alias);
      if (state) {
        state.usage.dailyCount = 0;
      }
    }
  }

  /**
   * 扣减 Key 的配额
   * @param alias Key 别名
   * @param cost 成本（用于 total 类型配额）
   */
  applyCost(alias: string, cost: number): void {
    const state = this.keys.get(alias);
    if (!state) return;

    // 更新使用时间
    state.lastUsedAt = Date.now();

    const { quota, usage } = state;
    const today = getCurrentDate();

    switch (quota.type) {
      case "daily":
        // 检查日期是否变化，需要重置计数
        if (state.dailyResetDate !== today) {
          usage.dailyCount = 0;
          state.dailyResetDate = today;
        }
        usage.dailyCount++;
        // 持久化 daily 状态
        this.usageStore?.set(alias, {
          dailyCount: usage.dailyCount,
          dailyResetDate: today,
          totalCost: usage.totalCost,
        });
        break;
      case "total":
        usage.totalCost += cost;
        // 持久化 total 状态
        this.usageStore?.set(alias, {
          dailyCount: usage.dailyCount,
          dailyResetDate: state.dailyResetDate ?? today,
          totalCost: usage.totalCost,
        });
        if (usage.totalCost >= quota.limit) {
          // 配额耗尽，删除 Key
          this.deleteKey(alias);
        }
        break;
    }
  }

  /**
   * 选择可用 Key
   * @param provider 提供商名称
   * @param strategy 选择策略
   * @param model 可选的模型过滤
   */
  pickKey(
    provider: string,
    strategy: KeySelectionStrategy | string,
    model?: string
  ): KeyState | null {
    // 直接使用索引获取别名列表，避免中间数组
    const aliases = this.providerKeys.get(provider);
    if (!aliases || aliases.length === 0) return null;

    // 单次遍历完成所有过滤（模型 + 可用性）
    const availableKeys: KeyState[] = [];
    for (const alias of aliases) {
      const key = this.keys.get(alias);
      if (!key) continue;
      
      // 模型过滤
      if (model && key.model && key.model !== model) continue;
      
      // 可用性检查
      if (!isKeyAvailable(key)) continue;
      
      availableKeys.push(key);
    }

    if (availableKeys.length === 0) return null;

    // 获取或创建策略实例
    const strategyInstance = this.getStrategy(strategy);
    return strategyInstance.select(availableKeys);
  }

  /**
   * 获取策略实例（带缓存）
   */
  private getStrategy(strategy: KeySelectionStrategy | string): IKeySelectionStrategy {
    // 内置策略检查
    const builtInStrategies: KeySelectionStrategy[] = ["exhaust", "round_robin", "random", "weighted"];
    
    if (!this.strategies.has(strategy)) {
      if (builtInStrategies.includes(strategy as KeySelectionStrategy)) {
        this.strategies.set(strategy, createKeyStrategy(strategy as KeySelectionStrategy));
      } else {
        // 自定义策略必须预先注册
        throw new Error(`Unknown strategy: ${strategy}. Register it using registerStrategy() first.`);
      }
    }
    return this.strategies.get(strategy)!;
  }

  /**
   * 注册自定义策略
   */
  registerStrategy(strategy: IKeySelectionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * 获取 Key 统计信息
   */
  getStats(): {
    total: number;
    available: number;
    byProvider: Record<string, number>;
  } {
    const allKeys = this.listKeys();
    const availableKeys = allKeys.filter((k) => isKeyAvailable(k));

    const byProvider: Record<string, number> = {};
    for (const [provider, aliases] of this.providerKeys) {
      byProvider[provider] = aliases.length;
    }

    return {
      total: allKeys.length,
      available: availableKeys.length,
      byProvider,
    };
  }
}