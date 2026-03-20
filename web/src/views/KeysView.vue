<template>
  <div class="keys-view">
    <el-card>
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>API Key 管理</span>
          </div>
          <div class="header-buttons page-header__actions">
            <el-input
              v-model="searchText"
              placeholder="搜索别名/提供商"
              :prefix-icon="Search"
              clearable
              size="small"
              class="search-input"
              @input="handleSearchChange"
            />
            <el-button type="success" @click="showBatchImportDialog" class="action-btn">
              <el-icon><Upload /></el-icon>
              <span class="btn-text">批量导入</span>
            </el-button>
            <el-button
              type="danger"
              :disabled="selectedKeys.length === 0"
              @click="handleBatchDelete"
              class="action-btn"
            >
              <el-icon><Delete /></el-icon>
              <span class="btn-text">删除 ({{ selectedKeys.length }})</span>
            </el-button>
            <el-button type="primary" @click="showAddDialog" class="action-btn">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新增</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table
        :data="filteredKeys"
        stripe
        v-loading="loading"
        @selection-change="handleSelectionChange"
        class="desktop-table"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="alias" label="别名" min-width="160" />
        <el-table-column prop="provider" label="提供商" width="100" />
        <el-table-column label="Key" min-width="180">
          <template #default="{ row }">
            <span class="key-mask">{{ maskKey(row.key) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="限定模型" min-width="120">
          <template #default="{ row }">
            <el-tag v-if="row.model" size="small">{{ row.model }}</el-tag>
            <span v-else class="text-muted">全部</span>
          </template>
        </el-table-column>
        <el-table-column label="配额" min-width="120">
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

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="totalKeys > 0">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="totalKeys"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>

      <!-- 移动端卡片列表 -->
      <div class="data-card-list" v-loading="loading">
        <div v-for="key in filteredKeys" :key="key.alias" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">
              <span>{{ key.alias }}</span>
              <el-tag size="small" type="info">{{ key.provider }}</el-tag>
            </div>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row" style="font-family: monospace; font-size: 12px;">
              {{ maskKey(key.key) }}
              <el-tag v-if="key.model" size="small">{{ key.model }}</el-tag>
            </div>
            <div class="data-card__body-row">
              <el-tag :type="getQuotaTagType(key.quota.type)" size="small">
                {{ getQuotaLabel(key.quota) }}
              </el-tag>
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
                <span class="data-card__label">${{ (key.remainingTotal || 0).toFixed(4) }}</span>
              </template>
            </div>
          </div>
          <div class="data-card__footer">
            <el-button type="primary" text size="small" @click="showEditDialog(key)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除此 Key？" @confirm="handleDelete(key.alias)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        <div v-if="filteredKeys.length === 0 && !loading" class="page-empty">
          <div class="page-empty__icon">
            <el-icon :size="24"><Plus /></el-icon>
          </div>
          <p class="page-empty__title">暂无 Key</p>
          <p class="page-empty__desc">添加 API Key 来开始管理</p>
          <div class="page-empty__action">
            <el-button type="primary" @click="showAddDialog">新增 Key</el-button>
          </div>
        </div>
      </div>

      <!-- 移动端分页 -->
      <div class="pagination-wrapper pagination-mobile" v-if="totalKeys > 0">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="totalKeys"
          layout="total, prev, pager, next"
          :small="true"
          @current-change="handlePageChange"
        />
      </div>
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

const { getQuotaLabel, getQuotaTagType } = useQuota();
const { maskKey } = useKey();

// 分页配置
const pageSize = ref(20);
const currentPage = ref(1);

/**
 * 搜索过滤后的 Key 列表
 */
const searchedKeys = computed(() => {
  if (!searchText.value.trim()) return keys.value;

  const search = searchText.value.toLowerCase();
  return keys.value.filter((key) => {
    return (
      key.alias.toLowerCase().includes(search) ||
      key.provider.toLowerCase().includes(search)
    );
  });
});

/**
 * 分页后的 Key 列表
 */
const filteredKeys = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return searchedKeys.value.slice(start, end);
});

/**
 * 总条目数
 */
const totalKeys = computed(() => searchedKeys.value.length);

/**
 * 页码变化处理
 */
function handlePageChange(page: number) {
  currentPage.value = page;
}

/**
 * 每页条数变化处理
 */
function handleSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1; // 重置到第一页
}

/**
 * 搜索变化时重置分页
 */
function handleSearchChange() {
  currentPage.value = 1;
}

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
  gap: var(--page-gap);
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

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0 0;
}

.pagination-mobile {
  display: none;
}

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .header-buttons {
    width: 100%;
    justify-content: flex-start;
  }

  .search-input {
    width: min(100%, 240px);
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .header-buttons {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .search-input {
    width: 100%;
    order: -1;
  }

  .btn-text {
    display: none;
  }

  .desktop-table {
    display: none;
  }

  .pagination-wrapper:not(.pagination-mobile) {
    display: none;
  }

  .pagination-mobile {
    justify-content: center;
  }
}
</style>