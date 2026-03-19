<script setup lang="ts">
/**
 * 建议价格列表组件
 * @description 显示匹配的价格信息，支持点击自动填充
 */

import { InfoFilled } from "@element-plus/icons-vue";
import type { ModelPriceResult } from "@/api/types";
import { useCurrency } from "@/composables";

defineProps<{
  items: ModelPriceResult[];
}>();

const emit = defineEmits<{
  select: [item: ModelPriceResult];
}>();

const { formatPrice } = useCurrency();

function formatContextWindow(size: number): string {
  if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
  if (size >= 1000) return `${(size / 1000).toFixed(0)}K`;
  return `${size}`;
}

function getMatchTypeTag(type: string): "success" | "primary" | "info" {
  switch (type) {
    case "exact": return "success";
    case "provider_exact": return "primary";
    default: return "info";
  }
}
</script>

<template>
  <div v-if="items.length > 0" class="suggested-prices">
    <div class="suggested-title">
      <el-icon><InfoFilled /></el-icon>
      找到 {{ items.length }} 个匹配的价格信息，点击自动填充：
    </div>
    <div class="suggested-list">
      <div
        v-for="item in items"
        :key="item.price.modelId"
        class="suggested-item"
        @click="emit('select', item)"
      >
        <div class="suggested-main">
          <el-tag :type="getMatchTypeTag(item.matchType)" size="small">
            {{ item.price.providerId }}/{{ item.price.modelId }}
          </el-tag>
          <span class="match-score">匹配度: {{ (item.score * 100).toFixed(0) }}%</span>
        </div>
        <div class="suggested-price">
          输入: {{ formatPrice(item.price.promptPer1k, item.price.promptPer1kCNY) }} |
          输出: {{ formatPrice(item.price.completionPer1k, item.price.completionPer1kCNY) }}
        </div>
        <div v-if="item.price.contextWindow" class="suggested-context">
          上下文: {{ formatContextWindow(item.price.contextWindow) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.suggested-prices {
  margin-top: 16px;
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 8px;
}

.suggested-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.suggested-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.suggested-item {
  padding: 10px 12px;
  background-color: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.suggested-item:hover {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.suggested-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.match-score {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.suggested-price {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.suggested-context {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
</style>