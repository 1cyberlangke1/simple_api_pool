/**
 * Key 工具函数 Composable
 * @description 提供 Key 相关的格式化和工具函数
 */
export function useKey() {
  /**
   * 遮蔽 Key 显示
   * @param key 原始 Key
   * @returns 遮蔽后的 Key（只显示前4位和后4位）
   */
  function maskKey(key: string): string {
    if (key.length <= 8) return "****";
    return key.slice(0, 4) + "****" + key.slice(-4);
  }

  /**
   * 验证 Key 格式
   * @param key Key 字符串
   * @returns 是否有效
   */
  function isValidKey(key: string): boolean {
    return key.length >= 8 && key.length <= 200;
  }

  /**
   * 生成默认别名
   * @param provider 提供商名称
   * @returns 默认别名
   */
  function generateAlias(provider: string): string {
    return `${provider}_key_${Date.now()}`;
  }

  return {
    maskKey,
    isValidKey,
    generateAlias,
  };
}
