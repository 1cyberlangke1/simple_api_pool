<template>
  <div class="dashboard">
    <!-- 统计卡片 -->
    <el-row :gutter="20">
      <el-col :span="6">
        <StatCard
          :icon="OfficeBuilding"
          icon-class="providers"
          :value="stats.providers"
          label="提供商"
        />
      </el-col>
      <el-col :span="6">
        <StatCard
          :icon="Document"
          icon-class="models"
          :value="stats.models"
          label="模型"
        />
      </el-col>
      <el-col :span="6">
        <StatCard :icon="Key" icon-class="keys" :value="stats.keys" label="API Key" />
      </el-col>
      <el-col :span="6">
        <StatCard :icon="Grid" icon-class="groups" :value="stats.groups" label="分组" />
      </el-col>
    </el-row>

    <!-- 调用统计图表 -->
    <el-card class="chart-card">
      <template #header>
        <div class="card-header">
          <span>调用统计（最近 24 小时）</span>
          <div class="chart-actions">
            <ConnectionStatus :state="sseState" />
            <el-select
              v-model="chartHours"
              size="small"
              style="width: 120px; margin-left: 12px"
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
      <CallChart :data="chartData" />
    </el-card>

    <!-- 缓存统计卡片 -->
    <CacheStatsCard
      v-if="cacheStats.enabled"
      :stats="cacheStats.stats"
      @refresh="fetchCacheStats"
    />

    <!-- 服务状态 -->
    <el-card class="health-card">
      <template #header>
        <div class="card-header">
          <span>服务状态</span>
          <ConnectionStatus :state="sseState" />
        </div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="状态">
          <el-tag :type="health.status === 'ok' ? 'success' : 'danger'">
            {{ health.status }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="运行时间">
          <span class="uptime">{{ formattedUptime }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="可用模型" :span="2">
          <el-tag
            v-for="model in health.models?.slice(0, 10)"
            :key="model"
            class="model-tag"
          >
            {{ model }}
          </el-tag>
          <el-tag v-if="health.models?.length > 10" type="info">
            +{{ health.models.length - 10 }} 更多
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- Key 状态概览 -->
    <el-card class="keys-card">
      <template #header>
        <div class="card-header">
          <span>Key 状态概览</span>
          <div class="keys-header-actions">
            <el-input
              v-model="keySearch"
              placeholder="搜索别名/提供商/模型"
              :prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
            />
            <ConnectionStatus :state="sseState" />
          </div>
        </div>
      </template>
      <el-table :data="paginatedKeys" stripe>
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
          small
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 仪表盘视图
 * @description 显示系统概览、统计图表和 Key 状态
 * @优化 使用 SSE 替代轮询，只在后端有更新时才刷新数据
 */
import { ref, reactive, onMounted, onUnmounted, h, computed } from "vue";
import { OfficeBuilding, Document, Key, Grid, Search } from "@element-plus/icons-vue";
import axios from "axios";
import {
  getKeys,
  getCacheStats,
  getStatsChart,
  type KeyState,
  type CacheStatsResponse,
  type ChartData,
} from "@/api/types";
import { useQuota } from "@/composables";
import StatCard from "@/components/StatCard.vue";
import CacheStatsCard from "@/components/CacheStatsCard.vue";
import CallChart from "@/components/CallChart.vue";

const { getQuotaLabel, getQuotaTagType } = useQuota();

const stats = reactive({
  providers: 0,
  models: 0,
  keys: 0,
  groups: 0,
});

const health = reactive({
  status: "ok",
  timestamp: "",
  startTime: "", // 服务启动时间 (ISO 8601)
  models: [] as string[],
});

// 运行时间（前端计算，减轻后端负担）
const uptime = ref(0); // 运行秒数
const formattedUptime = ref("--");

/**
 * 格式化运行时间为可读字符串
 * @param seconds 总秒数
 * @returns 格式化的时间字符串 (如 "2天 3小时 15分 30秒")
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0 || days > 0) parts.push(`${hours}小时`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}分`);
  parts.push(`${secs}秒`);

  return parts.join(" ");
}

/**
 * 更新运行时间（纯前端计算，不请求后端）
 */
function updateUptime(): void {
  if (!health.startTime) return;
  
  const startMs = new Date(health.startTime).getTime();
  const nowMs = Date.now();
  uptime.value = Math.floor((nowMs - startMs) / 1000);
  formattedUptime.value = formatUptime(uptime.value);
}

const keys = ref<KeyState[]>([]);

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

const cacheStats = ref<CacheStatsResponse>({ enabled: false, stats: null });
const chartHours = ref(24);
const chartData = ref<ChartData>({
  timeline: [],
  groups: [],
  groupData: {},
  summary: [],
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
    console.error("[SSE] No authentication token");
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
    console.error("[SSE] Connection error");
    
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

onMounted(async () => {
  // 初始加载所有数据
  await Promise.all([
    fetchHealth(),
    fetchKeys(),
    fetchCacheStats(),
    fetchChartStats(),
  ]);

  // 连接 SSE
  connectSSE();
  
  // 启动运行时间定时器（每秒更新，纯前端计算）
  uptimeTimer = setInterval(updateUptime, 1000);
});

onUnmounted(() => {
  disconnectSSE();
  // 清除运行时间定时器
  if (uptimeTimer) {
    clearInterval(uptimeTimer);
    uptimeTimer = null;
  }
});

async function fetchHealth() {
  try {
    const { data } = await axios.get("/health");
    health.status = data.status;
    health.timestamp = data.timestamp;
    health.startTime = data.startTime || "";
    health.models = data.models || [];
    const modelList = data.models.filter((m: string) => !m.startsWith("group/"));
    stats.providers = new Set(modelList.map((m: string) => m.split("/")[0])).size;
    stats.models = modelList.length;
    stats.groups = data.models.filter((m: string) => m.startsWith("group/")).length;
    
    // 初始化运行时间
    updateUptime();
  } catch {
    health.status = "error";
  }
}

async function fetchKeys() {
  try {
    const { data } = await getKeys();
    keys.value = data;
    stats.keys = data.length;
  } catch {
    // ignore
  }
}

async function fetchCacheStats() {
  try {
    const { data } = await getCacheStats();
    cacheStats.value = data;
  } catch {
    // ignore
  }
}

async function fetchChartStats() {
  try {
    const { data } = await getStatsChart(chartHours.value);
    chartData.value = data;
  } catch {
    // ignore
  }
}
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
</style>
