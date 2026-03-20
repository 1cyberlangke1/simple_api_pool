<template>
  <el-card class="cache-card">
    <template #header>
      <div class="card-header page-header">
        <div class="page-header__meta">
          <span>缓存统计</span>
        </div>
        <div class="page-header__actions compact-toolbar">
          <el-button type="danger" size="small" @click="handleClearCache" :loading="clearingCache">
            清空缓存
          </el-button>
        </div>
      </div>
    </template>
    <div class="info-grid info-grid--3">
      <div class="info-grid__item">
        <div class="info-grid__value">{{ stats?.entries ?? 0 }} / {{ stats?.maxEntries ?? 0 }}</div>
        <div class="info-grid__label">缓存条目</div>
      </div>
      <div class="info-grid__item">
        <div class="info-grid__value">{{ formatBytes(stats?.dbSizeBytes ?? 0) }}</div>
        <div class="info-grid__label">占用空间</div>
      </div>
      <div class="info-grid__item">
        <div class="info-grid__value hit">{{ formatHitRate(stats?.hitRate ?? 0) }}</div>
        <div class="info-grid__label">总命中率</div>
      </div>
      <div class="info-grid__item">
        <div class="info-grid__value hit">{{ formatHitRate(stats?.hitRate24h ?? 0) }}</div>
        <div class="info-grid__label">24小时命中率</div>
      </div>
      <div class="info-grid__item">
        <div class="info-grid__value">{{ formatNumber(stats?.hits24h ?? 0) }}</div>
        <div class="info-grid__label">24小时命中</div>
      </div>
      <div class="info-grid__item">
        <div class="info-grid__value miss">{{ formatNumber(stats?.misses24h ?? 0) }}</div>
        <div class="info-grid__label">24小时未命中</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { clearCache, type CacheStats } from "@/api/types";
import { useFormatters } from "@/composables";

/**
 * 缓存统计卡片组件
 * @description 显示缓存统计数据和清空缓存功能
 * @param stats 缓存统计数据
 * @emit refresh 刷新事件
 */

defineProps<{
  stats: CacheStats | null;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const clearingCache = ref(false);
const { formatBytes, formatHitRate, formatNumber } = useFormatters();

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
.info-grid__value.hit {
  color: #67c23a;
}

.info-grid__value.miss {
  color: #f56c6c;
}
</style>
