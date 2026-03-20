<template>
  <!-- 桌面端表格 -->
  <el-table :data="tools" stripe v-loading="loading" class="desktop-table">
    <el-table-column prop="name" label="名称" width="180" />
    <el-table-column label="传输方式" width="120">
      <template #default="{ row }">
        <el-tag type="info" size="small">{{ row.transport?.toUpperCase() || "STDIO" }}</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="配置" min-width="200">
      <template #default="{ row }">
        <span v-if="row.transport === 'stdio'">
          {{ row.command }} {{ (row.args || []).join(" ") }}
        </span>
        <span v-else-if="row.transport === 'sse' || row.transport === 'http'">
          {{ row.endpoint }}
        </span>
        <span v-else>{{ row.command || row.endpoint || "-" }}</span>
      </template>
    </el-table-column>
    <el-table-column label="状态" width="100">
      <template #default>
        <el-tag type="success" size="small">已配置</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="140" fixed="right">
      <template #default="{ $index }">
        <el-button type="primary" text size="small" @click="$emit('edit', $index)">
          编辑
        </el-button>
        <el-button type="danger" text size="small" @click="$emit('delete', $index)">
          删除
        </el-button>
      </template>
    </el-table-column>
  </el-table>

  <!-- 移动端卡片列表 -->
  <div class="data-card-list" v-loading="loading">
    <div v-for="(tool, index) in tools" :key="tool.name" class="data-card">
      <div class="data-card__header">
        <div class="data-card__title">
          <span>{{ tool.name }}</span>
          <el-tag type="info" size="small">{{ tool.transport?.toUpperCase() || "STDIO" }}</el-tag>
        </div>
        <el-tag type="success" size="small">已配置</el-tag>
      </div>
      <div class="data-card__body">
        <div class="data-card__body-row">
          <span class="data-card__label">配置：</span>
          <span v-if="tool.transport === 'stdio'">
            {{ tool.command }} {{ (tool.args || []).join(" ") }}
          </span>
          <span v-else-if="tool.transport === 'sse' || tool.transport === 'http'">
            {{ tool.endpoint }}
          </span>
        </div>
      </div>
      <div class="data-card__footer">
        <el-button type="primary" text size="small" @click="$emit('edit', index)">
          编辑
        </el-button>
        <el-button type="danger" text size="small" @click="$emit('delete', index)">
          删除
        </el-button>
      </div>
    </div>
    <div v-if="tools.length === 0 && !loading" class="page-empty">
      <div class="page-empty__icon">
        <el-icon :size="24"><Connection /></el-icon>
      </div>
      <p class="page-empty__title">暂无 MCP 工具</p>
      <p class="page-empty__desc">点击上方按钮添加 MCP 工具</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MCP 工具表格组件
 * @description 显示 MCP 工具列表，支持编辑和删除
 */
import { Connection } from "@element-plus/icons-vue";

interface McpToolConfig {
  type: string;
  name: string;
  transport?: string;
  command?: string;
  args?: string[];
  endpoint?: string;
  [key: string]: unknown;
}

defineProps<{
  tools: McpToolConfig[];
  loading: boolean;
}>();

defineEmits<{
  (e: "edit", index: number): void;
  (e: "delete", index: number): void;
}>();
</script>

<style scoped>
@media (max-width: 768px) {
  .desktop-table {
    display: none;
  }
}

@media (min-width: 769px) {
  .data-card-list {
    display: none;
  }
}
</style>
