<template>
  <el-card class="cache-card">
    <template #header>
      <div class="card-header page-header">
        <div class="page-header__meta">
          <span>缓存统计</span>
          <el-tag v-if="selectedGroup" size="small" type="warning" closable @close="clearSelection">
            {{ selectedGroup }}
          </el-tag>
        </div>
        <div class="page-header__actions compact-toolbar">
          <el-button size="small" @click="clearSelection" :disabled="!selectedGroup">
            <span class="btn-text">显示全部</span>
          </el-button>
          <el-button type="danger" size="small" @click="handleClearCache" :loading="clearingCache">
            清空缓存
          </el-button>
        </div>
      </div>
    </template>

    <!-- 无分组缓存时显示总览 -->
    <div v-if="!stats || stats.length === 0" class="empty-cache">
      <el-empty description="暂无启用了缓存的分组" />
    </div>

    <!-- 分组缓存列表 -->
    <div v-else class="cache-groups">
      <div
        v-for="group in stats"
        :key="group.groupName"
        :class="['cache-group-item', { active: selectedGroup === group.groupName }]"
        @click="selectGroup(group.groupName)"
      >
        <div class="group-header">
          <div class="group-info">
            <el-tag type="success" size="small">{{ group.groupName }}</el-tag>
            <span class="group-entries">{{ group.entries }} / {{ group.maxEntries }}</span>
          </div>
          <div class="group-hit-rate" :class="getHitRateClass(group.hitRate)">
            {{ formatHitRate(group.hitRate) }}
          </div>
        </div>
        <div class="group-stats">
          <div class="stat-item">
            <span class="stat-value">{{ formatNumber(group.hits24h) }}</span>
            <span class="stat-label">24h命中</span>
          </div>
          <div class="stat-item">
            <span class="stat-value miss">{{ formatNumber(group.misses24h) }}</span>
            <span class="stat-label">24h未命中</span>
          </div>
          <div class="stat-item">
            <span class="stat-value" :class="getHitRateClass(group.hitRate24h)">
              {{ formatHitRate(group.hitRate24h) }}
            </span>
            <span class="stat-label">24h命中率</span>
          </div>
          <div v-if="group.ttl" class="stat-item">
            <span class="stat-value">{{ group.ttl }}s</span>
            <span class="stat-label">TTL</span>
          </div>
        </div>
        <div class="group-progress">
          <el-progress
            :percentage="getUsagePercent(group)"
            :color="getUsageColor(group)"
            :stroke-width="6"
            :show-text="false"
          />
          <span class="usage-text">{{ getUsagePercent(group).toFixed(0) }}% 使用</span>
        </div>
      </div>
    </div>

    <!-- 底部汇总 -->
    <div v-if="stats && stats.length > 0" class="cache-summary">
      <div class="summary-item">
        <span class="summary-value">{{ totalEntries }}</span>
        <span class="summary-label">总条目</span>
      </div>
      <div class="summary-item">
        <span class="summary-value">{{ formatBytes(dbSizeBytes) }}</span>
        <span class="summary-label">占用空间</span>
      </div>
      <div class="summary-item">
        <span class="summary-value" :class="getHitRateClass(totalHitRate)">
          {{ formatHitRate(totalHitRate) }}
        </span>
        <span class="summary-label">总命中率</span>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { clearCache, type GroupCacheStats } from "@/api/types";
import { useFormatters } from "@/composables";

/**
 * 缓存统计卡片组件
 * @description 按分组显示缓存统计，支持与柱状图联动
 * @param stats 各分组缓存统计数据数组
 * @param dbSizeBytes 数据库文件大小（字节）
 * @param modelValue 当前选中的分组名称（用于 v-model）
 * @emit update:modelValue 选中的分组变化
 * @emit refresh 刷新事件
 */

const props = defineProps<{
  stats: GroupCacheStats[] | null;
  dbSizeBytes?: number;
  modelValue?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string | null];
  refresh: [];
}>();

const clearingCache = ref(false);
const { formatBytes, formatHitRate, formatNumber } = useFormatters();

// 当前选中的分组
const selectedGroup = computed({
  get: () => props.modelValue ?? null,
  set: (value) => emit("update:modelValue", value),
});

// 计算汇总统计
const totalEntries = computed(() => {
  if (!props.stats) return 0;
  return props.stats.reduce((sum, s) => sum + s.entries, 0);
});

const dbSizeBytes = computed(() => props.dbSizeBytes ?? 0);

const totalHitRate = computed(() => {
  if (!props.stats || props.stats.length === 0) return 0;
  const totalHits = props.stats.reduce((sum, s) => sum + s.hits, 0);
  const totalMisses = props.stats.reduce((sum, s) => sum + s.misses, 0);
  const total = totalHits + totalMisses;
  return total > 0 ? totalHits / total : 0;
});

/**
 * 获取命中率样式类
 */
function getHitRateClass(rate: number): string {
  if (rate >= 0.5) return "high";
  if (rate >= 0.2) return "medium";
  return "low";
}

/**
 * 获取使用率百分比
 */
function getUsagePercent(group: GroupCacheStats): number {
  if (group.maxEntries === 0) return 0;
  return (group.entries / group.maxEntries) * 100;
}

/**
 * 获取使用率颜色
 */
function getUsageColor(group: GroupCacheStats): string {
  const percent = getUsagePercent(group);
  if (percent >= 90) return "#F56C6C";
  if (percent >= 70) return "#E6A23C";
  return "#67C23A";
}

/**
 * 选择分组
 */
function selectGroup(groupName: string) {
  if (selectedGroup.value === groupName) {
    // 点击已选中的分组，取消选择
    selectedGroup.value = null;
  } else {
    selectedGroup.value = groupName;
  }
}

/**
 * 清除选择
 */
function clearSelection() {
  selectedGroup.value = null;
}

async function handleClearCache() {
  try {
    await ElMessageBox.confirm(
      "确定要清空所有缓存吗？这将删除所有缓存的响应数据。",
      "清空缓存确认",
      { type: "warning" }
    );

    clearingCache.value = true;
    await clearCache();
    ElMessage.success("缓存已清空");
    emit("refresh");
  } catch {
    // 用户取消或错误
  } finally {
    clearingCache.value = false;
  }
}
</script>

<style scoped>
.empty-cache {
  padding: 20px;
}

.cache-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cache-group-item {
  background: var(--surface-secondary);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cache-group-item:hover {
  border-color: var(--primary-color);
  transform: translateX(4px);
}

.cache-group-item.active {
  border-color: var(--primary-color);
  background: var(--surface-accent);
  box-shadow: 0 0 0 2px rgba(201, 107, 51, 0.2);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.group-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-entries {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.group-hit-rate {
  font-size: 14px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.group-hit-rate.high {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.1);
}

.group-hit-rate.medium {
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.1);
}

.group-hit-rate.low {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.1);
}

.group-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.stat-value.miss {
  color: #f56c6c;
}

.stat-value.high {
  color: #67c23a;
}

.stat-value.medium {
  color: #e6a23c;
}

.stat-value.low {
  color: #f56c6c;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted);
}

.group-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-progress :deep(.el-progress) {
  flex: 1;
}

.usage-text {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 60px;
  text-align: right;
}

.cache-summary {
  display: flex;
  justify-content: space-around;
  padding: 14px 0 0;
  margin-top: 14px;
  border-top: 1px solid var(--border-light);
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.summary-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color);
}

.summary-label {
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .group-stats {
    flex-wrap: wrap;
    gap: 12px;
  }

  .cache-summary {
    flex-wrap: wrap;
    gap: 16px;
  }
}
</style>
