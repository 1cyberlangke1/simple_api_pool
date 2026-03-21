<template>
  <!-- 桌面端表格 -->
  <el-table :data="tools" stripe v-loading="loading" class="desktop-table">
    <el-table-column prop="name" label="名称" width="180" />
    <el-table-column label="类型" width="100">
      <template #default="{ row }">
        <el-tag :type="row.toolType === 'js' ? 'success' : 'warning'" size="small">
          {{ row.toolType === "js" ? "JS" : "MCP" }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column prop="description" label="描述" />
    <el-table-column label="状态" width="100">
      <template #default="{ row }">
        <el-tag v-if="row.toolType === 'js'" :type="row.enabled ? 'success' : 'info'" size="small">
          {{ row.enabled ? "启用" : "禁用" }}
        </el-tag>
        <el-tag v-else type="success" size="small">已配置</el-tag>
      </template>
    </el-table-column>
    <el-table-column label="更新时间" width="180">
      <template #default="{ row }">
        <span v-if="row.toolType === 'js'">{{ formatDate(row.updatedAt) }}</span>
        <span v-else class="text-muted">-</span>
      </template>
    </el-table-column>
    <el-table-column label="操作" width="200" fixed="right">
      <template #default="{ row }">
        <template v-if="row.toolType === 'js'">
          <el-button type="primary" text size="small" @click="$emit('edit-js', row)">
            编辑
          </el-button>
          <el-button type="warning" text size="small" @click="$emit('test-js', row)">
            测试
          </el-button>
          <el-popconfirm title="确定删除此工具？" @confirm="handleDeleteJs(row)">
            <template #reference>
              <el-button type="danger" text size="small">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
        <template v-else>
          <el-tag size="small" type="info">配置文件管理</el-tag>
        </template>
      </template>
    </el-table-column>
  </el-table>

  <!-- 移动端卡片列表 -->
  <div class="data-card-list" v-loading="loading">
    <div v-for="tool in tools" :key="tool.name" class="data-card">
      <div class="data-card__header">
        <div class="data-card__title">
          <span>{{ tool.name }}</span>
          <el-tag :type="tool.toolType === 'js' ? 'success' : 'warning'" size="small">
            {{ tool.toolType === "js" ? "JS" : "MCP" }}
          </el-tag>
        </div>
        <div class="data-card__tags">
          <el-tag
            v-if="tool.toolType === 'js'"
            :type="tool.enabled ? 'success' : 'info'"
            size="small"
          >
            {{ tool.enabled ? "启用" : "禁用" }}
          </el-tag>
        </div>
      </div>
      <div class="data-card__body">
        <div class="data-card__body-row">{{ tool.description || "-" }}</div>
        <div v-if="tool.toolType === 'js'" class="data-card__body-row">
          <span class="data-card__label">更新于 {{ formatDate(tool.updatedAt) }}</span>
        </div>
      </div>
      <div v-if="tool.toolType === 'js'" class="data-card__footer">
        <el-button type="primary" text size="small" @click="$emit('edit-js', tool)">
          编辑
        </el-button>
        <el-button type="warning" text size="small" @click="$emit('test-js', tool)">
          测试
        </el-button>
        <el-popconfirm title="确定删除此工具？" @confirm="handleDeleteJs(tool)">
          <template #reference>
            <el-button type="danger" text size="small">删除</el-button>
          </template>
        </el-popconfirm>
      </div>
    </div>
    <div v-if="tools.length === 0 && !loading" class="page-empty">
      <div class="page-empty__icon">
        <el-icon :size="24"><Tools /></el-icon>
      </div>
      <p class="page-empty__title">暂无工具</p>
      <p class="page-empty__desc">创建 JS 工具或配置 MCP 工具</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 工具表格组件
 * @description 显示 JS 和 MCP 工具列表
 */
import { Tools } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

interface ToolItem {
  name: string;
  description?: string;
  toolType: "js" | "mcp";
  enabled?: boolean;
  updatedAt?: number;
  id?: string;
}

defineProps<{
  tools: ToolItem[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: "edit-js", tool: ToolItem): void;
  (e: "test-js", tool: ToolItem): void;
  (e: "delete-js", id: string): void;
}>();

function handleDeleteJs(tool: ToolItem) {
  if (!tool.id) {
    ElMessage.warning("文件工具请在配置文件中删除");
    return;
  }
  emit("delete-js", tool.id);
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString("zh-CN");
}
</script>

<style scoped>
.text-muted {
  color: var(--text-muted);
}

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
