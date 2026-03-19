/**
 * 功能配置处理
 * @description 从分组配置获取功能配置，每个分组独立配置
 * @module routes/chat/feature_flags
 */

import type { AppConfig, PromptInjectConfig, TruncationConfig, ToolRoutingStrategy } from "../../core/types.js";

/**
 * 分组功能配置
 * @description 每个分组独立配置，不继承全局
 */
export interface GroupFeatures {
  /** 要注入的工具名称列表 */
  tools: string[];
  /** 工具路由策略 */
  toolRoutingStrategy: ToolRoutingStrategy;
  /** 提示词注入配置（未配置则不注入） */
  promptInject?: PromptInjectConfig;
  /** 截断检测配置（未配置则不检测） */
  truncation?: TruncationConfig;
  /** 是否启用缓存（通过分组名后缀 -cache 判断） */
  enableCache: boolean;
}

/**
 * 获取分组功能配置
 * @param groupId 分组 ID（可能包含 -cache 后缀）
 * @param runtime 运行时配置
 * @returns 功能配置
 */
export function getGroupFeatures(groupId: string | null, runtime: { config: AppConfig }): GroupFeatures {
  if (!groupId) {
    // 无分组，返回空配置
    return {
      tools: [],
      toolRoutingStrategy: "local_first",
      promptInject: undefined,
      truncation: undefined,
      enableCache: false,
    };
  }

  // 检查是否请求缓存版本（分组名以 -cache 结尾）
  const wantsCache = groupId.endsWith("-cache");
  const actualGroupId = wantsCache ? groupId.slice(0, -6) : groupId;

  // 查找分组配置
  const group = runtime.config.groups.find((g) => g.name === actualGroupId);
  const features = group?.features;

  return {
    tools: features?.tools ?? [],
    toolRoutingStrategy: features?.toolRoutingStrategy ?? "local_first",
    promptInject: features?.promptInject,
    truncation: features?.truncation,
    enableCache: wantsCache && runtime.config.cache.enable,
  };
}

/**
 * 解析分组 ID
 * @description 从请求的分组 ID 中提取实际分组名和是否请求缓存
 * @param groupId 请求的分组 ID（可能包含 -cache 后缀）
 * @returns 解析结果
 */
export function parseGroupId(groupId: string): { name: string; wantsCache: boolean } {
  const wantsCache = groupId.endsWith("-cache");
  const name = wantsCache ? groupId.slice(0, -6) : groupId;
  return { name, wantsCache };
}
