<template>
  <div class="groups-view">
    <el-card>
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>分组配置</span>
          </div>
          <div class="page-header__actions">
            <el-button type="primary" @click="showAddDialog">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新增分组</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="groups" stripe v-loading="loading" class="desktop-table">
        <el-table-column label="分组 ID" min-width="160">
          <template #default="{ row }">
            <el-tag type="success">group/{{ row.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="策略" min-width="100">
          <template #default="{ row }">
            <el-tag>{{ row.strategy || "round_robin" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="路由" min-width="200">
          <template #default="{ row }">
            <div v-for="(route, idx) in row.routes" :key="idx" class="route-item">
              <el-tooltip :content="route.modelId" placement="top" :show-after="500">
                <el-tag size="small" class="route-tag">{{ route.modelId }}</el-tag>
              </el-tooltip>
              <span v-if="route.temperature" class="temp-badge">
                temp: {{ route.temperature }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="功能配置" min-width="180">
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
              <el-tag
                v-if="row.features?.cache?.enable"
                size="small"
                type="primary"
              >
                缓存
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

      <!-- 移动端卡片列表 -->
      <div class="data-card-list" v-loading="loading">
        <div v-for="group in groups" :key="group.name" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">
              <el-tag type="success" size="small">group/{{ group.name }}</el-tag>
            </div>
            <div class="data-card__tags">
              <el-tag size="small">{{ group.strategy || "round_robin" }}</el-tag>
            </div>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row">
              <span class="data-card__label">路由：</span>
              <div class="data-card__tags">
                <el-tag v-for="(route, idx) in group.routes" :key="idx" size="small">
                  {{ route.modelId }}
                </el-tag>
              </div>
            </div>
            <div class="data-card__body-row">
              <div class="data-card__tags">
                <el-tag
                  v-if="group.features?.tools?.length"
                  size="small"
                  type="success"
                >
                  工具 ({{ group.features.tools.length }})
                </el-tag>
                <el-tag v-if="group.features?.promptInject" size="small" type="info">
                  提示词
                </el-tag>
                <el-tag
                  v-if="group.features?.truncation?.enable"
                  size="small"
                  type="warning"
                >
                  截断
                </el-tag>
                <el-tag
                  v-if="group.features?.cache?.enable"
                  size="small"
                  type="primary"
                >
                  缓存
                </el-tag>
              </div>
            </div>
          </div>
          <div class="data-card__footer">
            <el-button type="primary" text size="small" @click="showEditDialog(group)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除此分组？" @confirm="handleDelete(group.name)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        <div v-if="groups.length === 0 && !loading" class="page-empty">
          <div class="page-empty__icon">
            <el-icon :size="24"><Plus /></el-icon>
          </div>
          <p class="page-empty__title">暂无分组</p>
          <p class="page-empty__desc">创建分组来组织你的模型路由</p>
          <div class="page-empty__action">
            <el-button type="primary" @click="showAddDialog">新增分组</el-button>
          </div>
        </div>
      </div>
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
  getTools,
  type GroupConfig,
  type ModelConfig,
} from "@/api/types";
import GroupFormDialog from "@/components/GroupFormDialog.vue";

const loading = ref(false);
const dialogVisible = ref(false);
const groups = ref<GroupConfig[]>([]);
const models = ref<ModelConfig[]>([]);
const editingGroup = ref<GroupConfig | null>(null);
const availableTools = ref<string[]>([]);

onMounted(() => {
  fetchGroups();
  fetchModels();
  fetchTools();
});

onActivated(() => {
  fetchGroups();
  fetchModels();
  fetchTools();
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
  } catch (error) {
    console.error("获取模型列表失败:", error);
  }
}

async function fetchTools() {
  try {
    const { data } = await getTools();
    availableTools.value = data.tools.map((t) => t.name);
  } catch (error) {
    console.error("获取工具列表失败:", error);
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
  } catch (error) {
    console.error("删除分组失败:", error);
  }
}
</script>

<style scoped>
.groups-view {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
}

.route-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.route-tag {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.temp-badge {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--surface-secondary);
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
  color: var(--text-muted);
  font-style: italic;
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .btn-text {
    display: none;
  }

  .desktop-table {
    display: none;
  }
}
</style>