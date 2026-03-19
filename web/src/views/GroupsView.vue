<template>
  <div class="groups-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>分组配置</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            新增分组
          </el-button>
        </div>
      </template>

      <el-table :data="groups" stripe v-loading="loading">
        <el-table-column label="分组 ID" width="180">
          <template #default="{ row }">
            <el-tag type="success">group/{{ row.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="策略" width="120">
          <template #default="{ row }">
            <el-tag>{{ row.strategy || "round_robin" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="路由">
          <template #default="{ row }">
            <div v-for="(route, idx) in row.routes" :key="idx" class="route-item">
              <el-tag size="small">{{ route.modelId }}</el-tag>
              <span v-if="route.temperature" class="temp-badge">
                temp: {{ route.temperature }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="功能配置" width="200">
          <template #default="{ row }">
            <div class="feature-tags">
              <el-tag
                v-if="row.features?.tools?.length"
                size="small"
                type="success"
              >
                工具 ({{ row.features.tools.length }})
              </el-tag>
              <el-tag v-if="row.features?.promptInject" size="small" type="info">
                提示词
              </el-tag>
              <el-tag
                v-if="row.features?.truncation?.enable"
                size="small"
                type="warning"
              >
                截断
              </el-tag>
              <span v-if="!row.features" class="inherit-hint">无额外配置</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除此分组？" @confirm="handleDelete(row.name)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <GroupFormDialog
      v-model:visible="dialogVisible"
      :editing-group="editingGroup"
      :models="models"
      :available-tools="availableTools"
      @submitted="fetchGroups"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 分组配置视图
 * @description 管理分组的增删改查
 */
import { ref, onMounted, onActivated } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getGroups,
  deleteGroup,
  getModels,
  type GroupConfig,
  type ModelConfig,
} from "@/api/types";
import GroupFormDialog from "@/components/GroupFormDialog.vue";

const loading = ref(false);
const dialogVisible = ref(false);
const groups = ref<GroupConfig[]>([]);
const models = ref<ModelConfig[]>([]);
const editingGroup = ref<GroupConfig | null>(null);
const availableTools = ref<string[]>(["get_weather", "search_web"]);

onMounted(() => {
  fetchGroups();
  fetchModels();
});

onActivated(() => {
  fetchGroups();
  fetchModels();
});

async function fetchGroups() {
  loading.value = true;
  try {
    const { data } = await getGroups();
    groups.value = data;
  } finally {
    loading.value = false;
  }
}

async function fetchModels() {
  try {
    const { data } = await getModels();
    models.value = data;
  } catch {
    // ignore
  }
}

function showAddDialog() {
  editingGroup.value = null;
  dialogVisible.value = true;
}

function showEditDialog(group: GroupConfig) {
  editingGroup.value = group;
  dialogVisible.value = true;
}

async function handleDelete(name: string) {
  try {
    await deleteGroup(name);
    ElMessage.success("删除成功");
    await fetchGroups();
  } catch {
    // 错误已在拦截器中处理
  }
}
</script>

<style scoped>
.groups-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.route-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.temp-badge {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--border-color);
  padding: 2px 6px;
  border-radius: 4px;
  transition: background-color 0.3s, color 0.3s;
}

.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.inherit-hint {
  font-size: 12px;
  color: var(--text-secondary);
  font-style: italic;
}
</style>
