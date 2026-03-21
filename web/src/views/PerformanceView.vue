<template>
  <div class="performance section-stack">
    <!-- 性能概览卡片 -->
    <el-row :gutter="20">
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card">
          <div class="metric-card__icon requests">
            <el-icon :size="24"><DataLine /></el-icon>
          </div>
          <div class="metric-card__content">
            <div class="metric-card__value">{{ formatNumber(metrics.totalRequests) }}</div>
            <div class="metric-card__label">总请求</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card">
          <div class="metric-card__icon success">
            <el-icon :size="24"><CircleCheck /></el-icon>
          </div>
          <div class="metric-card__content">
            <div class="metric-card__value">{{ formatNumber(metrics.successRequests) }}</div>
            <div class="metric-card__label">成功请求</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card">
          <div class="metric-card__icon error">
            <el-icon :size="24"><CircleClose /></el-icon>
          </div>
          <div class="metric-card__content">
            <div class="metric-card__value">{{ formatNumber(metrics.failedRequests) }}</div>
            <div class="metric-card__label">失败请求</div>
          </div>
        </div>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <div class="metric-card">
          <div class="metric-card__icon slow">
            <el-icon :size="24"><Warning /></el-icon>
          </div>
          <div class="metric-card__content">
            <div class="metric-card__value">{{ formatNumber(metrics.slowRequests) }}</div>
            <div class="metric-card__label">慢请求 (>{{ metrics.slowRequestThreshold }}ms)</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 响应时间统计 -->
    <el-card class="stats-card">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>响应时间统计</span>
            <span class="window-info">统计窗口: {{ metrics.windowSeconds }}秒</span>
          </div>
          <div class="page-header__actions">
            <el-button type="primary" size="small" @click="refreshMetrics" :loading="loading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-button type="danger" size="small" @click="handleReset" :loading="resetting">
              <el-icon><Delete /></el-icon>
              重置
            </el-button>
          </div>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :xs="12" :sm="8" :md="4">
          <div class="time-stat">
            <div class="time-stat__label">平均</div>
            <div class="time-stat__value">{{ metrics.avgResponseTime.toFixed(1) }}<span class="unit">ms</span></div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="time-stat">
            <div class="time-stat__label">最小</div>
            <div class="time-stat__value">{{ metrics.minResponseTime }}<span class="unit">ms</span></div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="time-stat">
            <div class="time-stat__label">最大</div>
            <div class="time-stat__value">{{ metrics.maxResponseTime }}<span class="unit">ms</span></div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="time-stat highlight">
            <div class="time-stat__label">P95</div>
            <div class="time-stat__value">{{ metrics.p95ResponseTime.toFixed(1) }}<span class="unit">ms</span></div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="time-stat highlight">
            <div class="time-stat__label">P99</div>
            <div class="time-stat__value">{{ metrics.p99ResponseTime.toFixed(1) }}<span class="unit">ms</span></div>
          </div>
        </el-col>
        <el-col :xs="12" :sm="8" :md="4">
          <div class="time-stat">
            <div class="time-stat__label">成功率</div>
            <div class="time-stat__value">{{ successRate }}<span class="unit">%</span></div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 内存使用 -->
    <el-card class="memory-card">
      <template #header>
        <div class="card-header">
          <span>内存使用</span>
          <span class="uptime-info">运行时间: {{ formatUptime(metrics.uptime) }}</span>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :xs="24" :sm="12" :md="6">
          <div class="memory-stat">
            <div class="memory-stat__label">堆已用</div>
            <div class="memory-stat__value">{{ formatBytes(metrics.memory.heapUsed) }}</div>
            <el-progress
              :percentage="heapUsedPercent"
              :status="heapUsedPercent > 80 ? 'exception' : undefined"
              :stroke-width="8"
            />
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="memory-stat">
            <div class="memory-stat__label">堆总量</div>
            <div class="memory-stat__value">{{ formatBytes(metrics.memory.heapTotal) }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="memory-stat">
            <div class="memory-stat__label">外部内存</div>
            <div class="memory-stat__value">{{ formatBytes(metrics.memory.external) }}</div>
          </div>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <div class="memory-stat">
            <div class="memory-stat__label">RSS</div>
            <div class="memory-stat__value">{{ formatBytes(metrics.memory.rss) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 路由性能 -->
    <el-card class="routes-card">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>路由性能</span>
            <el-input
              v-model="routeSearch"
              placeholder="搜索路由"
              :prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
            />
          </div>
        </div>
      </template>

      <!-- 移动端卡片列表 -->
      <div class="route-list mobile-only">
        <div v-for="route in filteredRoutes" :key="route.route + route.method" class="route-item">
          <div class="route-item__header">
            <el-tag :type="getMethodTagType(route.method)" size="small">{{ route.method }}</el-tag>
            <span class="route-item__path">{{ route.route }}</span>
          </div>
          <div class="route-item__stats">
            <div class="route-item__stat">
              <span class="label">请求</span>
              <span class="value">{{ route.count }}</span>
            </div>
            <div class="route-item__stat">
              <span class="label">平均</span>
              <span class="value">{{ route.avgTime.toFixed(1) }}ms</span>
            </div>
            <div class="route-item__stat">
              <span class="label">错误</span>
              <span class="value" :class="{ error: route.errors > 0 }">{{ route.errors }}</span>
            </div>
          </div>
          <el-progress
            v-if="route.errors > 0"
            :percentage="(1 - route.errorRate) * 100"
            :stroke-width="6"
            status="exception"
          />
        </div>
      </div>

      <!-- 桌面端表格 -->
      <el-table :data="filteredRoutes" stripe class="desktop-table">
        <el-table-column label="方法" width="80">
          <template #default="{ row }">
            <el-tag :type="getMethodTagType(row.method)" size="small">{{ row.method }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="route" label="路由" min-width="200" show-overflow-tooltip />
        <el-table-column label="请求数" width="100" sortable>
          <template #default="{ row }">
            <span class="count-badge">{{ formatNumber(row.count) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="平均时间" width="120" sortable>
          <template #default="{ row }">
            <span :class="{ 'slow-text': row.avgTime > metrics.slowRequestThreshold }">
              {{ row.avgTime.toFixed(1) }}ms
            </span>
          </template>
        </el-table-column>
        <el-table-column label="最小/最大" width="130">
          <template #default="{ row }">
            {{ row.minTime }}ms / {{ row.maxTime }}ms
          </template>
        </el-table-column>
        <el-table-column label="错误" width="80" sortable>
          <template #default="{ row }">
            <span :class="{ 'error-text': row.errors > 0 }">{{ row.errors }}</span>
          </template>
        </el-table-column>
        <el-table-column label="错误率" width="100">
          <template #default="{ row }">
            <el-progress
              v-if="row.errors > 0"
              :percentage="(1 - row.errorRate) * 100"
              :stroke-width="6"
              status="exception"
            />
            <span v-else class="success-text">0%</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 性能监控视图
 * @description 显示系统性能指标和路由性能统计
 * @behavior 自动定时刷新性能数据
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import {
  DataLine,
  CircleCheck,
  CircleClose,
  Warning,
  Refresh,
  Delete,
  Search,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getPerformanceMetrics,
  getPerformanceRoutes,
  resetPerformance,
  type PerformanceMetrics,
  type RouteMetrics,
} from "@/api/types";

/** 性能指标 */
const metrics = ref<PerformanceMetrics>({
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  avgResponseTime: 0,
  maxResponseTime: 0,
  minResponseTime: 0,
  p95ResponseTime: 0,
  p99ResponseTime: 0,
  slowRequests: 0,
  slowRequestThreshold: 100,
  memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
  uptime: 0,
  windowSeconds: 60,
});

/** 路由性能数据 */
const routes = ref<RouteMetrics[]>([]);

/** 加载状态 */
const loading = ref(false);
const resetting = ref(false);

/** 路由搜索 */
const routeSearch = ref("");

/** 刷新定时器 */
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 成功率
 */
const successRate = computed(() => {
  if (metrics.value.totalRequests === 0) return "0.0";
  return ((metrics.value.successRequests / metrics.value.totalRequests) * 100).toFixed(1);
});

/**
 * 堆使用百分比
 */
const heapUsedPercent = computed(() => {
  if (metrics.value.memory.heapTotal === 0) return 0;
  return Math.round((metrics.value.memory.heapUsed / metrics.value.memory.heapTotal) * 100);
});

/**
 * 过滤后的路由列表
 */
const filteredRoutes = computed(() => {
  if (!routeSearch.value.trim()) return routes.value;
  const search = routeSearch.value.toLowerCase();
  return routes.value.filter(
    (route) =>
      route.route.toLowerCase().includes(search) ||
      route.method.toLowerCase().includes(search)
  );
});

/**
 * 格式化数字
 */
function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + " " + units[i];
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

/**
 * 获取方法标签类型
 */
function getMethodTagType(method: string): "primary" | "success" | "warning" | "danger" | "info" {
  const types: Record<string, "primary" | "success" | "warning" | "danger" | "info"> = {
    GET: "primary",
    POST: "success",
    PUT: "warning",
    DELETE: "danger",
    PATCH: "info",
  };
  return types[method] || "info";
}

/**
 * 刷新性能指标
 */
async function refreshMetrics(): Promise<void> {
  loading.value = true;
  try {
    const [metricsRes, routesRes] = await Promise.all([
      getPerformanceMetrics(),
      getPerformanceRoutes(),
    ]);
    if (metricsRes.data.success) {
      metrics.value = metricsRes.data.data;
    }
    if (routesRes.data.success) {
      routes.value = routesRes.data.data;
    }
  } catch (error) {
    console.error("Failed to refresh performance metrics:", error);
    ElMessage.error("获取性能数据失败");
  } finally {
    loading.value = false;
  }
}

/**
 * 重置性能统计
 */
async function handleReset(): Promise<void> {
  try {
    await ElMessageBox.confirm("确定要重置性能统计数据吗？此操作不可恢复。", "确认重置", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    resetting.value = true;
    await resetPerformance();
    ElMessage.success("性能统计已重置");
    await refreshMetrics();
  } catch (error) {
    if (error !== "cancel") {
      console.error("Failed to reset performance:", error);
      ElMessage.error("重置失败");
    }
  } finally {
    resetting.value = false;
  }
}

onMounted(() => {
  refreshMetrics();
  // 每 5 秒自动刷新
  refreshTimer = setInterval(refreshMetrics, 5000);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<style scoped>
.performance {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 卡片入场动画 */
.performance > * {
  animation: fadeIn 0.4s ease-out forwards;
}

.performance > *:nth-child(1) { animation-delay: 0.05s; }
.performance > *:nth-child(2) { animation-delay: 0.1s; }
.performance > *:nth-child(3) { animation-delay: 0.15s; }
.performance > *:nth-child(4) { animation-delay: 0.2s; }

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

/* 指标卡片 */
.metric-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--glass-bg);
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  transition: all var(--transition-normal);
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.metric-card__icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.metric-card__icon.requests {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.metric-card__icon.success {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
}

.metric-card__icon.error {
  background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
}

.metric-card__icon.slow {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.metric-card__content {
  flex: 1;
}

.metric-card__value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color);
  line-height: 1.2;
}

.metric-card__label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* 卡片头部 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-header > span:first-child {
  font-weight: 600;
  font-size: 15px;
}

.window-info,
.uptime-info {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 8px;
}

.search-input {
  width: 200px;
  margin-left: 12px;
}

/* 响应时间统计 */
.stats-card,
.memory-card,
.routes-card {
  border-radius: 16px;
}

.time-stat {
  text-align: center;
  padding: 16px;
  background: var(--border-light);
  border-radius: 12px;
}

.time-stat.highlight {
  background: linear-gradient(135deg, rgba(201, 107, 51, 0.1) 0%, rgba(201, 107, 51, 0.05) 100%);
  border: 1px solid rgba(201, 107, 51, 0.2);
}

.time-stat__label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.time-stat__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-color);
}

.time-stat__value .unit {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-left: 2px;
}

/* 内存统计 */
.memory-stat {
  text-align: center;
  padding: 16px;
}

.memory-stat__label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.memory-stat__value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 12px;
}

/* 路由表格 */
.count-badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--border-light);
  border-radius: 4px;
  font-weight: 500;
}

.slow-text {
  color: var(--warning-color, #e6a23c);
  font-weight: 600;
}

.error-text {
  color: var(--danger-color, #f56c6c);
  font-weight: 600;
}

.success-text {
  color: var(--success-color, #67c23a);
}

/* 移动端路由列表 */
.mobile-only {
  display: none;
}

.route-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.route-item {
  padding: 16px;
  background: var(--border-light);
  border-radius: 12px;
}

.route-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.route-item__path {
  font-family: "JetBrains Mono", "Consolas", monospace;
  font-size: 13px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-item__stats {
  display: flex;
  gap: 16px;
}

.route-item__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.route-item__stat .label {
  font-size: 11px;
  color: var(--text-muted);
}

.route-item__stat .value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.route-item__stat .value.error {
  color: var(--danger-color, #f56c6c);
}

/* 响应式 */
@media (max-width: 768px) {
  .performance {
    gap: 16px;
  }

  .metric-card {
    padding: 16px;
  }

  .metric-card__value {
    font-size: 24px;
  }

  .metric-card__icon {
    width: 44px;
    height: 44px;
  }

  .search-input {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
  }

  .card-header {
    flex-wrap: wrap;
  }

  .time-stat__value {
    font-size: 20px;
  }

  .mobile-only {
    display: flex;
  }

  .desktop-table {
    display: none;
  }
}
</style>
