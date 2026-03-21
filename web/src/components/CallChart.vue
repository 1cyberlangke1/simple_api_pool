<template>
  <div class="call-chart">
    <!-- 无数据提示 -->
    <div v-if="!data.summary || data.summary.length === 0" class="no-data">
      <el-empty description="暂无调用统计数据" />
    </div>

    <template v-else>
      <!-- 汇总表格 -->
      <el-table :data="data.summary" stripe style="margin-bottom: 20px">
        <el-table-column prop="group" label="分组" width="180">
          <template #default="{ row }">
            <el-tag type="success">{{ row.group || "default" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalCalls" label="总调用" width="100">
          <template #default="{ row }">
            {{ formatNumber(row.totalCalls) }}
          </template>
        </el-table-column>
        <el-table-column prop="successCalls" label="成功" width="100">
          <template #default="{ row }">
            <span class="success-text">{{ formatNumber(row.successCalls) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="failedCalls" label="失败" width="100">
          <template #default="{ row }">
            <span :class="row.failedCalls > 0 ? 'fail-text' : ''">
              {{ formatNumber(row.failedCalls) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="successRate" label="成功率" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="row.successRate"
              :color="getProgressColor(row.successRate / 100)"
              :stroke-width="12"
              :show-text="false"
            />
            <span class="progress-label">
              {{ row.successRate.toFixed(1) }}%
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="avgCallsPerHour" label="平均每小时">
          <template #default="{ row }">
            {{ row.avgCallsPerHour.toFixed(1) }}
          </template>
        </el-table-column>
      </el-table>

      <!-- 条形图 -->
      <div class="bar-chart-container">
        <div class="chart-title">每小时调用次数分布</div>
        <div class="bar-chart">
          <div class="chart-y-axis">
            <div v-for="tick in yTicks" :key="tick" class="y-tick">{{ tick }}</div>
          </div>
          <div class="chart-content">
            <div
              v-for="(hour, idx) in data.timeline"
              :key="hour"
              class="bar-column"
            >
              <div class="bar-group">
                <div
                  v-for="group in data.groups"
                  :key="group"
                  class="bar"
                  :style="getBarStyle(group, idx)"
                  :title="getBarTooltip(group, idx)"
                />
              </div>
              <div class="x-label">{{ formatHour(hour) }}</div>
            </div>
          </div>
        </div>
        <div class="chart-legend">
          <div
            v-for="group in data.groups"
            :key="group"
            :class="['legend-item', { highlighted: !highlightGroup || highlightGroup === group }]"
          >
            <div class="legend-color" :style="{ background: getGroupColor(group) }" />
            <span>{{ group || "default" }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * 调用统计图表组件
 * @description 显示调用统计表格和条形图
 */
import { computed } from "vue";
import { useFormatters } from "@/composables";
import type { ChartData } from "@/api/types";

interface Props {
  data: ChartData;
  highlightGroup?: string | null;
}

const props = defineProps<Props>();
const { formatNumber, formatHour } = useFormatters();

// 分组颜色
const groupColors = [
  "#409EFF",
  "#67C23A",
  "#E6A23C",
  "#F56C6C",
  "#909399",
  "#00d4aa",
  "#9b59b6",
  "#3498db",
  "#e74c3c",
  "#1abc9c",
];

// 计算图表 Y 轴刻度
const chartYAxis = computed(() => {
  let maxVal = 0;
  for (const group of props.data.groups) {
    const data = props.data.groupData[group];
    if (data) {
      maxVal = Math.max(maxVal, ...data.calls);
    }
  }
  const maxTick = Math.ceil(maxVal / 10) * 10 || 10;
  const step = maxTick / 5;
  return {
    maxTick,
    ticks: [
      maxTick,
      maxTick - step,
      maxTick - step * 2,
      maxTick - step * 3,
      maxTick - step * 4,
      0,
    ],
  };
});

const yTicks = computed(() => chartYAxis.value.ticks);
const chartMaxValue = computed(() => chartYAxis.value.maxTick);

function getGroupColor(group: string): string {
  const idx = props.data.groups.indexOf(group);
  return groupColors[idx % groupColors.length];
}

function getBarStyle(group: string, idx: number): Record<string, string> {
  const data = props.data.groupData[group];
  if (!data) return { height: "0px" };

  const value = data.calls[idx] || 0;
  const maxVal = chartMaxValue.value || 10;
  const height = (value / maxVal) * 100;

  // 如果有高亮分组，非高亮的分组降低透明度
  const isHighlighted = !props.highlightGroup || props.highlightGroup === group;
  const opacity = isHighlighted ? "1" : "0.3";

  return {
    height: `${height}%`,
    background: getGroupColor(group),
    minHeight: value > 0 ? "2px" : "0px",
    opacity,
  };
}

function getBarTooltip(group: string, idx: number): string {
  const data = props.data.groupData[group];
  if (!data) return "";

  const calls = data.calls[idx] || 0;
  const rate = data.successRate[idx] || 0;
  const hour = props.data.timeline[idx] || "";

  return `${group || "default"} @ ${formatHour(hour)}\n调用: ${calls}\n成功率: ${rate.toFixed(1)}%`;
}

function getProgressColor(rate: number): string {
  if (rate >= 0.95) return "#67C23A";
  if (rate >= 0.8) return "#E6A23C";
  return "#F56C6C";
}
</script>

<style scoped>
.no-data {
  padding: 40px;
  text-align: center;
}

.progress-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.success-text {
  color: #67c23a;
  font-weight: 500;
}

.fail-text {
  color: #f56c6c;
  font-weight: 500;
}

.bar-chart-container {
  margin-top: 20px;
}

.chart-title {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.bar-chart {
  display: flex;
  height: 200px;
  border-left: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.chart-y-axis {
  width: 50px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0 8px;
}

.y-tick {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}

.chart-content {
  flex: 1;
  display: flex;
  align-items: flex-end;
  padding: 0 4px;
  gap: 2px;
  overflow-x: auto;
}

.bar-column {
  flex: 1;
  min-width: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar-group {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 1px;
  padding: 0 2px;
}

.bar {
  width: 8px;
  min-height: 0;
  border-radius: 2px 2px 0 0;
  transition: height 0.3s ease;
  cursor: pointer;
}

.bar:hover {
  opacity: 0.8;
}

.x-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
  white-space: nowrap;
}

.chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  justify-content: center;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.3;
  transition: opacity 0.2s ease;
}

.legend-item.highlighted {
  opacity: 1;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
</style>
