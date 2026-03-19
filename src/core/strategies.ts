/**
 * 策略模式实现
 * @description 提供 Key 选择和模型分组选择策略
 * @module strategies
 */

import type {
  KeyState,
  KeySelectionStrategy,
  IKeySelectionStrategy,
  GroupRouteConfig,
  ModelGroupStrategy,
  IModelGroupStrategy,
} from "./types.js";
import { isKeyAvailable } from "./types.js";
import { KEY_MAX_FAILURES } from "./constants.js";

// ============================================================
// Key 选择策略实现
// ============================================================

/**
 * 用尽策略
 * @description 使用一个 Key 直到配额耗尽或不可用，然后切换到下一个
 * @behavior 适合按配额计费的场景，最大化利用每个 Key
 */
export class ExhaustStrategy implements IKeySelectionStrategy {
  readonly name: KeySelectionStrategy = "exhaust";

  /**
   * 选择可用的 Key
   * @param keys Key 状态数组
   * @returns 第一个可用的 Key，无可用则返回 null
   */
  select(keys: KeyState[]): KeyState | null {
    for (const key of keys) {
      if (isKeyAvailable(key)) {
        return key;
      }
    }
    return null;
  }
}

/**
 * 轮询策略
 * @description 按顺序循环选择 Key，实现负载均衡
 * @behavior 适合均匀分配请求的场景
 */
export class RoundRobinStrategy implements IKeySelectionStrategy {
  readonly name: KeySelectionStrategy = "round_robin";

  private currentIndex = 0;

  /**
   * 选择下一个可用的 Key
   * @param keys Key 状态数组
   * @returns 下一个可用的 Key，全部不可用则返回 null
   * @complexity O(n) - 最坏情况需要遍历所有 Key
   */
  select(keys: KeyState[]): KeyState | null {
    if (keys.length === 0) return null;

    const startIndex = this.currentIndex;
    let attempts = 0;

    while (attempts < keys.length) {
      const key = keys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % keys.length;

      if (isKeyAvailable(key)) {
        return key;
      }
      attempts++;
    }

    // 重置索引
    this.currentIndex = startIndex;
    return null;
  }

  /**
   * 重置轮询索引
   * @description 将索引重置为 0，从头开始轮询
   */
  reset(): void {
    this.currentIndex = 0;
  }
}

/**
 * 随机策略
 * @description 随机选择一个可用的 Key
 * @behavior 适合简单负载均衡场景
 */
export class RandomStrategy implements IKeySelectionStrategy {
  readonly name: KeySelectionStrategy = "random";

  /**
   * 随机选择一个可用的 Key
   * @param keys Key 状态数组
   * @returns 随机选择的一个可用 Key，无可用则返回 null
   */
  select(keys: KeyState[]): KeyState | null {
    const availableKeys = keys.filter((k) => isKeyAvailable(k));
    if (availableKeys.length === 0) return null;

    const index = Math.floor(Math.random() * availableKeys.length);
    return availableKeys[index];
  }
}

/**
 * 加权随机策略
 * @description 根据 Key 的权重随机选择，权重越高被选中概率越大
 * @behavior 适合不同 Key 有不同配额或性能的场景
 * @example
 * // Key A 权重 3，Key B 权重 1
 * // 则 Key A 被选中概率为 75%，Key B 为 25%
 */
export class WeightedStrategy implements IKeySelectionStrategy {
  readonly name: KeySelectionStrategy = "weighted";

  /**
   * 加权随机选择一个可用的 Key
   * @param keys Key 状态数组，每个 Key 可以通过 metadata.weight 设置权重
   * @returns 根据权重随机选择的一个可用 Key，无可用则返回 null
   */
  select(keys: KeyState[]): KeyState | null {
    const availableKeys = keys.filter((k) => isKeyAvailable(k));
    if (availableKeys.length === 0) return null;

    // 计算总权重
    const totalWeight = availableKeys.reduce((sum, key) => {
      const weight = (key.metadata?.weight as number) ?? 1;
      return sum + weight;
    }, 0);

    // 随机选择
    let random = Math.random() * totalWeight;
    for (const key of availableKeys) {
      const weight = (key.metadata?.weight as number) ?? 1;
      random -= weight;
      if (random <= 0) {
        return key;
      }
    }

    return availableKeys[0];
  }
}

/**
 * 创建 Key 选择策略实例
 * @param strategy 策略名称
 * @returns 策略实例
 */
export function createKeyStrategy(strategy: KeySelectionStrategy): IKeySelectionStrategy {
  switch (strategy) {
    case "exhaust":
      return new ExhaustStrategy();
    case "round_robin":
      return new RoundRobinStrategy();
    case "random":
      return new RandomStrategy();
    case "weighted":
      return new WeightedStrategy();
    default:
      return new RoundRobinStrategy();
  }
}

// ============================================================
// 模型分组策略实现
// ============================================================

/**
 * 轮询分组策略
 * @description 按顺序循环选择分组中的路由
 */
export class RoundRobinGroupStrategy implements IModelGroupStrategy {
  readonly name: ModelGroupStrategy = "round_robin";

  private currentIndex = 0;

  /**
   * 选择下一个路由
   * @param routes 路由配置数组
   * @returns 下一个路由配置
   */
  select(routes: GroupRouteConfig[]): GroupRouteConfig | null {
    if (routes.length === 0) return null;

    const route = routes[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % routes.length;
    return route;
  }
}

/**
 * 随机分组策略
 * @description 随机选择分组中的一个路由
 */
export class RandomGroupStrategy implements IModelGroupStrategy {
  readonly name: ModelGroupStrategy = "random";

  /**
   * 随机选择一个路由
   * @param routes 路由配置数组
   * @returns 随机选择的路由配置
   */
  select(routes: GroupRouteConfig[]): GroupRouteConfig | null {
    if (routes.length === 0) return null;

    const index = Math.floor(Math.random() * routes.length);
    return routes[index];
  }
}

/**
 * 用尽分组策略
 * @description 使用一个路由直到连续失败次数达到阈值，然后切换到下一个
 * @behavior 适合自动故障转移场景
 */
export class ExhaustGroupStrategy implements IModelGroupStrategy {
  readonly name: ModelGroupStrategy = "exhaust";

  private currentIndex = 0;
  private failureCount = 0;
  private readonly maxFailures = KEY_MAX_FAILURES;

  /**
   * 选择当前活跃的路由
   * @param routes 路由配置数组
   * @returns 当前路由配置，连续失败次数达到阈值时自动切换
   */
  select(routes: GroupRouteConfig[]): GroupRouteConfig | null {
    if (routes.length === 0) return null;

    // 自动切换到下一个路由（当连续失败次数达到阈值时）
    if (this.failureCount >= this.maxFailures) {
      this.currentIndex = (this.currentIndex + 1) % routes.length;
      this.failureCount = 0;
    }

    return routes[this.currentIndex];
  }

  /**
   * 报告失败
   * @description 增加失败计数，达到阈值后会触发路由切换
   */
  reportFailure(): void {
    this.failureCount++;
  }

  /**
   * 报告成功
   * @description 重置失败计数
   */
  reportSuccess(): void {
    this.failureCount = 0;
  }
}

/**
 * 加权随机分组策略
 * @description 根据路由权重随机选择，权重越高被选中概率越大
 */
export class WeightedGroupStrategy implements IModelGroupStrategy {
  readonly name: ModelGroupStrategy = "weighted";

  /**
   * 加权随机选择一个路由
   * @param routes 路由配置数组，每个路由可以通过 weight 设置权重
   * @returns 根据权重随机选择的路由配置
   */
  select(routes: GroupRouteConfig[]): GroupRouteConfig | null {
    if (routes.length === 0) return null;

    // 计算总权重
    const totalWeight = routes.reduce((sum, route) => {
      return sum + (route.weight ?? 1);
    }, 0);

    // 随机选择
    let random = Math.random() * totalWeight;
    for (const route of routes) {
      random -= route.weight ?? 1;
      if (random <= 0) {
        return route;
      }
    }

    return routes[0];
  }
}

/**
 * 创建分组策略实例
 * @param strategy 策略名称
 * @returns 策略实例
 */
export function createGroupStrategy(strategy: ModelGroupStrategy): IModelGroupStrategy {
  switch (strategy) {
    case "round_robin":
      return new RoundRobinGroupStrategy();
    case "random":
      return new RandomGroupStrategy();
    case "exhaust":
      return new ExhaustGroupStrategy();
    case "weighted":
      return new WeightedGroupStrategy();
    default:
      return new RoundRobinGroupStrategy();
  }
}
