<template>
  <div class="keys-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>API Key 管理</span>
          <div class="header-buttons">
            <el-input
              v-model="searchText"
              placeholder="搜索别名/提供商"
              :prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
            />
            <el-button type="success" @click="showBatchImportDialog">
              <el-icon><Upload /></el-icon>
              批量导入
            </el-button>
            <el-button
              type="danger"
              :disabled="selectedKeys.length === 0"
              @click="handleBatchDelete"
            >
              <el-icon><Delete /></el-icon>
              批量删除 ({{ selectedKeys.length }})
            </el-button>
            <el-button type="primary" @click="showAddDialog">
              <el-icon><Plus /></el-icon>
              新增 Key
            </el-button>
          </div>
        </div>
      </template>

      <el-table
        :data="filteredKeys"
        stripe
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="alias" label="别名" width="180" />
        <el-table-column prop="provider" label="提供商" width="100" />
        <el-table-column label="Key" width="200">
          <template #default="{ row }">
            <span class="key-mask">{{ maskKey(row.key) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="限定模型" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.model" size="small">{{ row.model }}</el-tag>
            <span v-else class="text-muted">全部</span>
          </template>
        </el-table-column>
        <el-table-column label="配额" width="140">
          <template #default="{ row }">
            <el-tag :type="getQuotaTagType(row.quota.type)" size="small">
              {{ getQuotaLabel(row.quota) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="使用状态" min-width="150">
          <template #default="{ row }">
            <template v-if="row.quota.type === 'daily'">
              <el-progress
                :percentage="Math.min(((row.usedToday || 0) / row.quota.limit) * 100, 100)"
                :status="(row.usedToday || 0) >= row.quota.limit ? 'exception' : undefined"
                :stroke-width="8"
              />
              <span class="progress-text">{{ row.usedToday || 0 }} / {{ row.quota.limit }}</span>
            </template>
            <template v-else-if="row.quota.type === 'total'">
              <el-progress
                :percentage="Math.min(((row.remainingTotal || 0) / row.quota.limit) * 100, 100)"
                :status="(row.remainingTotal || 0) <= 0 ? 'exception' : undefined"
                :stroke-width="8"
              />
              <span class="progress-text">${{ (row.remainingTotal || 0).toFixed(4) }} 剩余</span>
            </template>
            <template v-else>
              <span class="text-muted">无限制</span>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除此 Key？" @confirm="handleDelete(row.alias)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <KeyFormDialog
      v-model:visible="dialogVisible"
      :editing-key="editingKey"
      :providers="providers"
      @submitted="fetchKeys"
    />

    <!-- 批量导入对话框 -->
    <KeyBatchImportDialog
      v-model:visible="batchImportVisible"
      :providers="providers"
      @submitted="fetchKeys"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * API Key 管理视图
 * @description 管理API Key 的增删改查
 */
import { ref, onMounted, onActivated, computed } from "vue";
import { Plus, Upload, Delete, Search } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getKeys,
  deleteKey,
  batchDeleteKeys,
  getProviders,
  type KeyState,
  type ProviderConfig,
} from "@/api/types";
import { useQuota, useKey } from "@/composables";
import KeyFormDialog from "@/components/KeyFormDialog.vue";
import KeyBatchImportDialog from "@/components/KeyBatchImportDialog.vue";

const loading = ref(false);
const dialogVisible = ref(false);
const batchImportVisible = ref(false);
const keys = ref<KeyState[]>([]);
const providers = ref<ProviderConfig[]>([]);
const selectedKeys = ref<KeyState[]>([]);
const editingKey = ref<KeyState | null>(null);
const searchText = ref("");

/**
 * 过滤后的 Key 列表（根据搜索条件）
 */
const filteredKeys = computed(() => {
  if (!searchText.value.trim()) return keys.value;
  
  const search = searchText.value.toLowerCase();
  return keys.value.filter((key) => {
    return (
      key.alias.toLowerCase().includes(search) ||
      key.provider.toLowerCase().includes(search)
    );
  });
});

const { getQuotaLabel, getQuotaTagType } = useQuota();
const { maskKey } = useKey();

onMounted(() => {
  fetchKeys();
  fetchProviders();
});

onActivated(() => {
  fetchKeys();
  fetchProviders();
});

async function fetchKeys() {
  loading.value = true;
  try {
    const { data } = await getKeys();
    keys.value = data;
  } finally {
    loading.value = false;
  }
}

async function fetchProviders() {
  try {
    const { data } = await getProviders();
    providers.value = data;
  } catch {
    // ignore
  }
}

function handleSelectionChange(selection: KeyState[]) {
  selectedKeys.value = selection;
}

function showAddDialog() {
  editingKey.value = null;
  dialogVisible.value = true;
}

function showEditDialog(key: KeyState) {
  editingKey.value = key;
  dialogVisible.value = true;
}

function showBatchImportDialog() {
  batchImportVisible.value = true;
}

async function handleDelete(alias: string) {
  try {
    await deleteKey(alias);
    ElMessage.success("删除成功");
    await fetchKeys();
  } catch {
    // 错误已在拦截器中处理
  }
}

async function handleBatchDelete() {
  if (selectedKeys.value.length === 0) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedKeys.value.length} 个 Key 吗？`,
      "批量删除确认",
      { type: "warning" }
    );

    const aliases = selectedKeys.value.map((k) => k.alias);
    const { data } = await batchDeleteKeys(aliases);
    ElMessage.success(`成功删除 ${data.deleted}/${data.total} 个 Key`);
    selectedKeys.value = [];
    await fetchKeys();
  } catch {
    // 用户取消或错误已在拦截器中处理
  }
}
</script>

<style scoped>
.keys-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  width: 160px;
}

.key-mask {
  font-family: monospace;
  color: var(--text-secondary);
}

.text-muted {
  color: var(--text-secondary);
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 8px;
}
</style>
