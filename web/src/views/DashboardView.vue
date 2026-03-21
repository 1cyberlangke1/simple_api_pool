<template>
  <div class="dashboard section-stack">
    <!-- 统计卡片 -->
    <el-row :gutter="20">
      <el-col :xs="24" :sm="12" :md="6">
        <StatCard
          :icon="OfficeBuilding"
          icon-class="providers"
          :value="stats.providers"
          label="提供商"
        />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <StatCard
          :icon="Document"
          icon-class="models"
          :value="stats.models"
          label="模型"
        />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <StatCard :icon="Key" icon-class="keys" :value="stats.keys" label="API Key" />
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <StatCard :icon="Grid" icon-class="groups" :value="stats.groups" label="分组" />
      </el-col>
    </el-row>

    <!-- 调用统计图表 -->
    <el-card class="chart-card">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>调用统计（最近 24 小时）</span>
          </div>
          <div class="chart-actions page-header__actions">
            <ConnectionStatus :state="sseState" />
            <el-select
              v-model="chartHours"
              size="small"
              class="chart-select"
              @change="fetchChartStats"
            >
              <el-option label="最近 6 小时" :value="6" />
              <el-option label="最近 12 小时" :value="12" />
              <el-option label="最近 24 小时" :value="24" />
              <el-option label="最近 48 小时" :value="48" />
            </el-select>
          </div>
        </div>
      </template>
      <CallChart :data="filteredChartData" :highlight-group="selectedGroup" />
    </el-card>

    <!-- 缓存统计卡片 -->
    <CacheStatsCard
      v-if="cacheStats.enabled"
      :stats="cacheStats.stats"
      :db-size-bytes="cacheStats.dbSizeBytes"
      v-model="selectedGroup"
      @refresh="fetchCacheStats"
    />

    <!-- 服务状态 -->
    <el-card class="health-card">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>服务状态</span>
          </div>
          <div class="page-header__actions compact-toolbar">
            <ConnectionStatus :state="sseState" />
          </div>
        </div>
      </template>
      <el-descriptions :column="descColumn" border>
        <el-descriptions-item label="状态">
          <el-tag :type="health.status === 'ok' ? 'success' : 'danger'">
            {{ health.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="运行时间">
          <span class="uptime">{{ formattedUptime }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="可用分组" :span="descColumn">
          <div class="model-tags">
            <el-tag
              v-for="group in health.groups?.slice(0, 10)"
              :key="group"
              class="model-tag"
              type="success"
            >
              {{ group }}
            </el-tag>
            <el-tag v-if="health.groups?.length > 10" type="info">
              +{{ health.groups.length - 10 }} 更多
            </el-tag>
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- Key 状态概览 -->
    <el-card class="keys-card">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>Key 状态概览</span>
          </div>
          <div class="keys-header-actions page-header__actions">
            <el-input
              v-model="keySearch"
              placeholder="搜索别名/提供商/模型"
              :prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
            />
            <ConnectionStatus :state="sseState" class="desktop-only" />
          </div>
        </div>
      </template>
      
      <!-- 移动端卡片列表 -->
      <div class="data-card-list mobile-keys-list">
        <div v-for="key in paginatedKeys" :key="key.alias" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">
              <span>{{ key.alias }}</span>
            </div>
            <el-tag :type="getQuotaTagType(key.quota.type)" size="small">
              {{ getQuotaLabel(key.quota) }}
            </el-tag>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row">
              <span class="data-card__label">{{ key.provider }}</span>
              <span v-if="key.model">{{ key.model }}</span>
            </div>
            <div class="data-card__body-row">
              <template v-if="key.quota.type === 'daily'">
                <el-progress
                  :percentage="Math.min(((key.usedToday || 0) / (key.quota.limit || 1)) * 100, 100)"
                  :status="(key.usedToday || 0) >= (key.quota.limit || 1) ? 'exception' : undefined"
                  :stroke-width="6"
                  style="flex: 1; min-width: 60px;"
                />
                <span class="data-card__label">{{ key.usedToday || 0 }} / {{ key.quota.limit || 0 }}</span>
              </template>
              <template v-else-if="key.quota.type === 'total'">
                <el-progress
                  :percentage="Math.min(((key.remainingTotal || 0) / (key.quota.limit || 1)) * 100, 100)"
                  :status="(key.remainingTotal || 0) <= 0 ? 'exception' : undefined"
                  :stroke-width="6"
                  style="flex: 1; min-width: 60px;"
                />
                <span class="data-card__label">${{ (key.remainingTotal || 0).toFixed(4) }} 剩余</span>
              </template>
              <template v-else>
                <span class="data-card__label">无限制</span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 桌面端表格 -->
      <el-table :data="paginatedKeys" stripe class="desktop-table">
        <el-table-column prop="alias" label="别名" width="120" />
        <el-table-column prop="provider" label="提供商" width="100" />
        <el-table-column prop="model" label="模型" width="120">
          <template #default="{ row }">
            {{ row.model || "全部" }}
          </template>
        </el-table-column>
        <el-table-column label="配额类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getQuotaTagType(row.quota.type)">
              {{ getQuotaLabel(row.quota) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用状态">
          <template #default="{ row }">
            <template v-if="row.quota.type === 'daily'">
              <el-progress
                :percentage="Math.min(((row.usedToday || 0) / row.quota.limit) * 100, 100)"
                :status="(row.usedToday || 0) >= row.quota.limit ? 'exception' : undefined"
              />
              <span class="progress-text">
                {{ row.usedToday || 0 }} / {{ row.quota.limit }}
              </span>
            </template>
            <template v-else-if="row.quota.type === 'total'">
              <el-progress
                :percentage="Math.min(((row.remainingTotal || 0) / row.quota.limit) * 100, 100)"
                :status="(row.remainingTotal || 0) <= 0 ? 'exception' : undefined"
              />
              <span class="progress-text">
                ${{ (row.remainingTotal || 0).toFixed(4) }} 剩余
              </span>
            </template>
            <template v-else>
              <span class="progress-text">无限制</span>
            </template>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div v-if="filteredKeys.length > pageSize" class="pagination-wrapper">
        <span class="pagination-info">
          共 {{ filteredKeys.length }} 条，显示 {{ (currentPage - 1) * pageSize + 1 }}-{{ Math.min(currentPage * pageSize, filteredKeys.length) }} 条
        </span>
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="filteredKeys.length"
          layout="prev, pager, next"
          size="small"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 仪表盘视图
 * @description 显示系统概览、统计图表和 Key 状态
 * @behavior 使用 SSE 替代轮询，只在后端有更新时才刷新数据
 */
import { ref, onMounted, onUnmounted, h, computed, watch } from "vue";
import { OfficeBuilding, Document, Key, Grid, Search } from "@element-plus/icons-vue";
import {
  useQuota,
  useDashboardData,
  useUptime,
} from "@/composables";
import StatCard from "@/components/StatCard.vue";
import CacheStatsCard from "@/components/CacheStatsCard.vue";
import CallChart from "@/components/CallChart.vue";

const { getQuotaLabel, getQuotaTagType } = useQuota();

// 使用 composables 管理数据
const {
  stats,
  health,
  keys,
  cacheStats,
  chartData,
  chartHours,
  fetchHealth,
  fetchKeys,
  fetchCacheStats,
  fetchChartStats,
  fetchConfig,
} = useDashboardData();

// 使用 composable 管理运行时间
const { formattedUptime, updateUptime } = useUptime();

/** 描述列表列数（响应式） */
const descColumn = ref(2);
const windowWidth = ref(window.innerWidth);

/**
 * 更新响应式变量（根据窗口宽度）
 */
function updateResponsive(): void {
  const width = window.innerWidth;
  windowWidth.value = width;
  descColumn.value = width < 900 ? 1 : 2;
}

// Key 状态表格分页和搜索
const keySearch = ref("");
const currentPage = ref(1);
const pageSize = 10;

/**
 * 过滤后的 Key 列表（根据搜索条件）
 */
const filteredKeys = computed(() => {
  if (!keySearch.value.trim()) return keys.value;
  
  const search = keySearch.value.toLowerCase();
  return keys.value.filter((key) => {
    return (
      key.alias.toLowerCase().includes(search) ||
      key.provider.toLowerCase().includes(search) ||
      (key.model?.toLowerCase().includes(search) ?? false)
    );
  });
});

/**
 * 分页后的 Key 列表
 */
const paginatedKeys = computed(() => {
  const start = (currentPage.value - 1) * pageSize;
  const end = start + pageSize;
  return filteredKeys.value.slice(start, end);
});

// 选中的分组（用于缓存统计与柱状图联动）
const selectedGroup = ref<string | null>(null);

/**
 * 过滤后的图表数据（根据选中的分组过滤）
 */
const filteredChartData = computed(() => {
  // 未选中分组时返回全部数据
  if (!selectedGroup.value) {
    return chartData.value;
  }

  const group = selectedGroup.value;
  const data = chartData.value;

  // 如果选中的分组不在数据中，返回空数据
  if (!data.groups.includes(group)) {
    return {
      timeline: data.timeline,
      groups: [],
      groupData: {},
      summary: [],
    };
  }

  // 只返回选中的分组数据
  return {
    timeline: data.timeline,
    groups: [group],
    groupData: {
      [group]: data.groupData[group] || { calls: [], successRate: [] },
    },
    summary: data.summary.filter((s) => s.group === group),
  };
});

// SSE 连接状态
const sseState = ref<"connecting" | "connected" | "disconnected" | "error">("disconnected");

// SSE 连接实例
let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let uptimeTimer: ReturnType<typeof setInterval> | null = null;
const RECONNECT_INTERVAL = 5000;

/**
 * SSE 连接状态指示器组件
 */
const ConnectionStatus = ({ state }: { state: string }) => {
  const statusConfig = {
    connecting: { color: "#E6A23C", text: "连接中..." },
    connected: { color: "#67C23A", text: "实时更新" },
    disconnected: { color: "#909399", text: "已断开" },
    error: { color: "#F56C6C", text: "连接错误" },
  };
  const config = statusConfig[state as keyof typeof statusConfig] || statusConfig.disconnected;
  
  return h("span", {
    class: "sse-status",
    style: { color: config.color },
  }, config.text);
};

/**
 * 连接 SSE
 */
function connectSSE(): void {
  if (eventSource) {
    eventSource.close();
  }

  sseState.value = "connecting";

  // 构建 URL，添加 token 作为查询参数
  // 直接从 localStorage 读取 token，避免 Pinia store 初始化顺序问题
  const token = localStorage.getItem("admin_token");
  if (!token) {
    sseState.value = "error";
    return;
  }
  const url = new URL("/admin/sse/stats", window.location.origin);
  url.searchParams.set("token", token);

  eventSource = new EventSource(url.toString());

  eventSource.onopen = () => {
    sseState.value = "connected";
    console.log("[SSE] Connected");
  };

  eventSource.onerror = () => {
    sseState.value = "error";

    // 自动重连
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSSE, RECONNECT_INTERVAL);
  };

  // 监听请求完成事件，刷新统计数据
  eventSource.addEventListener("request:complete", () => {
    console.log("[SSE] Request complete, refreshing stats...");
    refreshStats();
  });

  // 监听缓存事件，刷新缓存统计
  eventSource.addEventListener("request:cache:hit", () => {
    fetchCacheStats();
  });

  eventSource.addEventListener("request:cache:miss", () => {
    fetchCacheStats();
  });

  // 监听 Key 选择事件，刷新 Key 状态
  eventSource.addEventListener("request:key:select", () => {
    fetchKeys();
  });

  // 监听请求开始事件
  eventSource.addEventListener("request:start", () => {
    // 可用于显示实时请求活动
  });

  // 监听请求错误事件
  eventSource.addEventListener("request:error", (e: MessageEvent) => {
    console.log("[SSE] Request error:", e.data);
  });

  // 监听配置变更事件，实时刷新统计数据
  eventSource.addEventListener("config:provider:changed", (e: MessageEvent) => {
    console.log("[SSE] Provider config changed:", e.data);
    fetchConfig();
  });

  eventSource.addEventListener("config:model:changed", (e: MessageEvent) => {
    console.log("[SSE] Model config changed:", e.data);
    fetchConfig();
  });

  eventSource.addEventListener("config:key:changed", (e: MessageEvent) => {
    console.log("[SSE] Key config changed:", e.data);
    fetchKeys();
    fetchConfig();
  });

  eventSource.addEventListener("config:group:changed", (e: MessageEvent) => {
    console.log("[SSE] Group config changed:", e.data);
    fetchConfig();
    fetchHealth();
  });
}

/**
 * 断开 SSE
 */
function disconnectSSE(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  sseState.value = "disconnected";
}

/**
 * 刷新统计数据（图表和健康状态）
 */
async function refreshStats(): Promise<void> {
  await Promise.all([
    fetchHealth(),
    fetchChartStats(),
  ]);
}

// 监听健康状态变化，更新运行时间
watch(
  () => health.startTime,
  () => {
    updateUptime(health.startTime, sseState.value === "connected");
  }
);

// 监听 SSE 状态变化，更新运行时间
watch(sseState, (state) => {
  updateUptime(health.startTime, state === "connected");
});

onMounted(async () => {
  // 初始化响应式变量
  updateResponsive();
  window.addEventListener("resize", updateResponsive);
  
  // 初始加载所有数据
  await Promise.all([
    fetchHealth(),
    fetchKeys(),
    fetchCacheStats(),
    fetchChartStats(),
    fetchConfig(),
  ]);

  // 连接 SSE
  connectSSE();
  
  // 启动运行时间定时器（每秒更新，纯前端计算）
  uptimeTimer = setInterval(() => {
    updateUptime(health.startTime, sseState.value === "connected");
  }, 1000);
});

onUnmounted(() => {
  disconnectSSE();
  // 清除运行时间定时器
  if (uptimeTimer) {
    clearInterval(uptimeTimer);
    uptimeTimer = null;
  }
  // 移除事件监听
  window.removeEventListener("resize", updateResponsive);
});
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 卡片入场动画 */
.dashboard > * {
  animation: fadeIn 0.4s ease-out forwards;
}

.dashboard > *:nth-child(1) { animation-delay: 0.05s; }
.dashboard > *:nth-child(2) { animation-delay: 0.1s; }
.dashboard > *:nth-child(3) { animation-delay: 0.15s; }
.dashboard > *:nth-child(4) { animation-delay: 0.2s; }

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 卡片头部 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header > span:first-child {
  font-weight: 600;
  font-size: 15px;
}

.chart-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: flex-end;
}

.chart-select {
  width: 120px;
}

/* SSE 状态指示器 */
.sse-status {
  font-size: 12px;
  padding: 4px 10px;
  background: var(--border-light);
  border-radius: 12px;
  font-weight: 500;
}

/* 图表卡片 */
.chart-card,
.health-card,
.keys-card {
  border-radius: 16px;
  transition: all var(--transition-normal);
}

.chart-card:hover,
.health-card:hover,
.keys-card:hover {
  transform: translateY(-2px);
}

/* 模型标签 */
.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.model-tag {
  margin: 3px;
  border-radius: 6px;
  font-weight: 500;
  transition: all var(--transition-fast);
}

.model-tag:hover {
  transform: scale(1.05);
}

/* 进度条文字 */
.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
  font-weight: 500;
}

/* 运行时间 */
.uptime {
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary-color);
  letter-spacing: 0.5px;
}

/* 描述列表美化 */
:deep(.el-descriptions) {
  border-radius: 12px;
  overflow: hidden;
}

:deep(.el-descriptions__label) {
  font-weight: 600;
  color: var(--text-secondary);
}

:deep(.el-descriptions__content) {
  color: var(--text-color);
}

/* 表格美化 */
:deep(.el-table) {
  border-radius: 12px;
  overflow: hidden;
}

:deep(.el-table th.el-table__cell) {
  background: var(--border-light);
  font-weight: 600;
}

/* Key 表格头部 */
.keys-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search-input {
  width: 180px;
}

/* 分页 */
.pagination-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.pagination-info {
  font-size: 13px;
  color: var(--text-secondary);
}

/* 移动端 Key 列表默认隐藏 */
.mobile-keys-list {
  display: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .dashboard {
    gap: 20px;
  }

  .search-input {
    width: min(100%, 220px);
  }

  .chart-select {
    width: 100px;
  }

  .keys-header-actions,
  .chart-actions {
    width: 100%;
    justify-content: flex-start;
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .dashboard {
    gap: 16px;
  }

  .card-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .card-header > span:first-child {
    font-size: 14px;
  }

  .chart-actions {
    width: 100%;
    justify-content: space-between;
  }

  .chart-select {
    width: 100px;
  }

  .search-input {
    width: 100%;
    flex: 1;
  }

  .keys-header-actions {
    width: 100%;
  }

  .desktop-only {
    display: none;
  }

  /* 显示移动端 Key 列表 */
  .mobile-keys-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 隐藏桌面端表格 */
  .desktop-table {
    display: none;
  }

  .pagination-info {
    display: none;
  }

  .pagination-wrapper {
    justify-content: center;
  }
}

/* 移动端 Key 卡片样式 */
.mobile-key-item {
  padding: 12px;
  background: var(--border-light);
  border-radius: 8px;
  transition: background-color 0.3s;
}

.mobile-key-item .key-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.mobile-key-item .key-alias {
  font-weight: 600;
  font-size: 14px;
}

.mobile-key-item .key-info {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.mobile-key-item .key-usage {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .dashboard {
    gap: 12px;
  }

  .uptime {
    font-size: 12px;
  }

  .sse-status {
    font-size: 11px;
    padding: 3px 8px;
  }
}
</style>