import type { GroupConfig, GroupRouteConfig, ModelConfig, ProviderConfig } from "./types.js";

/**
 * 模型注册表
 * @description 解析 modelId 并选择路由，支持单模型和分组模型
 */
export class ModelRegistry {
  private providers: Map<string, ProviderConfig> = new Map();
  private models: Map<string, ModelConfig> = new Map();
  private groups: Map<string, GroupConfig> = new Map();
  private groupIndex: Map<string, number> = new Map();
  private groupActive: Map<string, GroupRouteConfig | null> = new Map();

  /**
   * 初始化模型注册表
   * @param providers 提供商配置数组
   * @param models 模型配置数组
   * @param groups 分组配置数组
   */
  constructor(providers: ProviderConfig[], models: ModelConfig[], groups: GroupConfig[]) {
    providers.forEach((provider) => this.providers.set(provider.name, provider));
    models.forEach((model) => this.models.set(this.getModelId(model), model));
    groups.forEach((group) => this.groups.set(this.getGroupId(group.name), group));
  }

  /**
   * 获取模型 ID
   * @param model 模型配置
   * @returns modelId 字符串（格式: provider/name）
   */
  getModelId(model: ModelConfig): string {
    return `${model.provider}/${model.name}`;
  }

  /**
   * 获取分组 ID
   * @param groupName 分组名称
   * @returns groupId 字符串（格式: group/name）
   */
  getGroupId(groupName: string): string {
    return `group/${groupName}`;
  }

  /**
   * 列出所有模型 ID
   * @param includeCacheVariants 是否包含 -cache 变体
   * @returns 所有模型 ID 数组（包含单模型和分组模型）
   */
  listAllModelIds(includeCacheVariants: boolean = true): string[] {
    const baseIds = [...this.models.keys(), ...this.groups.keys()];
    
    if (!includeCacheVariants) {
      return baseIds;
    }

    // 为每个分组添加 -cache 变体
    const cacheVariants: string[] = [];
    for (const id of this.groups.keys()) {
      cacheVariants.push(`${id}-cache`);
    }

    return [...baseIds, ...cacheVariants];
  }

  /**
   * 获取模型配置
   * @param modelId 模型 ID
   * @returns 模型配置，不存在则返回 null
   */
  getModel(modelId: string): ModelConfig | null {
    return this.models.get(modelId) ?? null;
  }

  /**
   * 获取提供商配置
   * @param providerName 提供商名称
   * @returns 提供商配置，不存在则返回 null
   */
  getProvider(providerName: string): ProviderConfig | null {
    return this.providers.get(providerName) ?? null;
  }

  /**
   * 判断是否为分组模型
   * @description 支持 group/{name} 和 group/{name}-cache 两种格式
   * @param modelId 模型 ID
   * @returns 是否为分组模型
   */
  isGroup(modelId: string): boolean {
    // 直接匹配
    if (this.groups.has(modelId)) {
      return true;
    }
    
    // 检查是否为 -cache 变体
    if (modelId.endsWith("-cache")) {
      const baseGroupId = modelId.slice(0, -6);
      return this.groups.has(baseGroupId);
    }
    
    return false;
  }

  /**
   * 获取分组配置
   * @param groupId 分组 ID（支持 -cache 后缀）
   * @returns 分组配置，不存在则返回 null
   */
  getGroup(groupId: string): GroupConfig | null {
    // 直接匹配
    if (this.groups.has(groupId)) {
      return this.groups.get(groupId) ?? null;
    }
    
    // 检查是否为 -cache 变体
    if (groupId.endsWith("-cache")) {
      const baseGroupId = groupId.slice(0, -6);
      return this.groups.get(baseGroupId) ?? null;
    }
    
    return null;
  }

  /**
   * 从分组中选择路由
   * @param groupId 分组 ID（支持 -cache 后缀，支持 group/ 前缀或纯分组名）
   * @returns 分组路由配置，根据策略选择
   */
  pickGroupRoute(groupId: string): GroupRouteConfig | null {
    // 处理 -cache 后缀
    let actualGroupId = groupId;
    if (groupId.endsWith("-cache")) {
      actualGroupId = groupId.slice(0, -6);
    }
    
    // 处理 group/ 前缀（如果没有则添加）
    const groupKey = actualGroupId.startsWith("group/") 
      ? actualGroupId 
      : `group/${actualGroupId}`;
    
    const group = this.groups.get(groupKey);
    if (!group || group.routes.length === 0) return null;
    const strategy = group.strategy ?? "round_robin";

    if (strategy === "random") {
      return this.pickRandomRoute(group.routes);
    }

    if (strategy === "exhaust") {
      return this.pickExhaustRoute(groupKey, group.routes);
    }

    if (strategy === "weighted") {
      return this.pickWeightedRoute(group.routes);
    }

    // round_robin (default)
    return this.pickRoundRobinRoute(groupKey, group.routes);
  }

  /**
   * 随机选择路由
   */
  private pickRandomRoute(routes: GroupRouteConfig[]): GroupRouteConfig | null {
    const idx = Math.floor(Math.random() * routes.length);
    return routes[idx] ?? null;
  }

  /**
   * 耗尽策略选择路由
   */
  private pickExhaustRoute(groupKey: string, routes: GroupRouteConfig[]): GroupRouteConfig | null {
    const active = this.groupActive.get(groupKey);
    if (active) return active;
    const first = routes[0];
    if (first) {
      this.groupActive.set(groupKey, first);
    }
    return first ?? null;
  }

  /**
   * 加权选择路由
   * @description 根据路由权重随机选择，权重越高被选中概率越大
   */
  private pickWeightedRoute(routes: GroupRouteConfig[]): GroupRouteConfig | null {
    if (routes.length === 0) return null;
    if (routes.length === 1) return routes[0] ?? null;

    // 计算总权重
    let totalWeight = 0;
    for (const route of routes) {
      totalWeight += Math.max(0, route.weight ?? 1);
    }

    if (totalWeight === 0) {
      // 所有权重都为 0，使用默认权重
      totalWeight = routes.length;
    }

    // 加权随机选择
    let random = Math.random() * totalWeight;
    for (const route of routes) {
      const weight = Math.max(0, route.weight ?? 1);
      random -= weight;
      if (random <= 0) {
        return route;
      }
    }

    // 兜底：返回最后一个
    return routes[routes.length - 1] ?? null;
  }

  /**
   * 轮询选择路由
   */
  private pickRoundRobinRoute(groupKey: string, routes: GroupRouteConfig[]): GroupRouteConfig | null {
    const idx = this.groupIndex.get(groupKey) ?? 0;
    const route = routes[idx % routes.length];
    this.groupIndex.set(groupKey, (idx + 1) % routes.length);
    return route ?? null;
  }

  /**
   * 报告路由失败（用于 exhaust 策略切换）
   * @param groupId 分组 ID
   */
  reportRouteFailure(groupId: string): void {
    // 确保 groupKey 格式正确
    const groupKey = groupId.startsWith("group/") ? groupId : `group/${groupId}`;
    const group = this.groups.get(groupKey);
    if (!group || group.strategy !== "exhaust") return;

    const current = this.groupActive.get(groupKey);
    if (!current) return;

    // 找到当前路由的索引
    const currentIdx = group.routes.findIndex((r) => r.modelId === current.modelId);
    if (currentIdx === -1) return;

    // 切换到下一个路由
    const nextIdx = (currentIdx + 1) % group.routes.length;
    const nextRoute = group.routes[nextIdx];
    if (nextRoute) {
      this.groupActive.set(groupKey, nextRoute);
    }
  }

  /**
   * 重置路由状态
   * @param groupId 分组 ID（可选，不传则重置所有）
   */
  resetRouteState(groupId?: string): void {
    if (groupId) {
      // 确保 groupKey 格式正确
      const groupKey = groupId.startsWith("group/") ? groupId : `group/${groupId}`;
      this.groupIndex.delete(groupKey);
      this.groupActive.delete(groupKey);
    } else {
      this.groupIndex.clear();
      this.groupActive.clear();
    }
  }
}