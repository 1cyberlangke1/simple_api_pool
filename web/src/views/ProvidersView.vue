<template>
  <div class="providers-view">
    <el-card>
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>提供商配置</span>
            <el-tag size="small" type="info">共 {{ providers.length }} 条</el-tag>
          </div>
          <div class="page-header__actions">
            <el-button type="primary" @click="showAddDialog">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新增提供商</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="paginatedProviders" stripe v-loading="loading" class="desktop-table">
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column prop="baseUrl" label="Base URL" />
        <el-table-column label="流式模式" min-width="120">
          <template #default="{ row }">
            <el-tag :type="getStreamModeTagType(row.streamMode)">
              {{ getStreamModeLabel(row.streamMode) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="轮询策略" min-width="120">
          <template #default="{ row }">
            <el-tag>{{ row.strategy || "round_robin" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="RPM 限制" min-width="100">
          <template #default="{ row }">
            {{ row.rpmLimit || "无限制" }}
          </template>
        </el-table-column>
        <el-table-column label="超时" min-width="100">
          <template #default="{ row }">
            {{ row.timeoutMs ? `${row.timeoutMs / 1000}s` : "默认" }}
          </template>
        </el-table-column>
        <el-table-column label="重置时间" min-width="100">
          <template #default="{ row }">
            <el-tag type="info">{{ row.resetTime || "00:00" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除此提供商？" @confirm="handleDelete(row.name)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="providers.length > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="providers.length"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>

      <!-- 移动端卡片列表 -->
      <div class="data-card-list" v-loading="loading">
        <div v-for="provider in paginatedProviders" :key="provider.name" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">{{ provider.name }}</div>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row" style="font-family: monospace; font-size: 12px; word-break: break-all;">
              {{ provider.baseUrl }}
            </div>
            <div class="data-card__body-row">
              <div class="data-card__tags">
                <el-tag :type="getStreamModeTagType(provider.streamMode)" size="small">
                  {{ getStreamModeLabel(provider.streamMode) }}
                </el-tag>
                <el-tag size="small">{{ provider.strategy || "round_robin" }}</el-tag>
                <el-tag v-if="provider.rpmLimit" type="warning" size="small">
                  {{ provider.rpmLimit }} RPM
                </el-tag>
                <el-tag v-if="provider.resetTime" type="info" size="small">
                  重置: {{ provider.resetTime }}
                </el-tag>
              </div>
            </div>
          </div>
          <div class="data-card__footer">
            <el-button type="primary" text size="small" @click="showEditDialog(provider)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除此提供商？" @confirm="handleDelete(provider.name)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        <div v-if="providers.length === 0 && !loading" class="page-empty">
          <div class="page-empty__icon">
            <el-icon :size="24"><Plus /></el-icon>
          </div>
          <p class="page-empty__title">暂无提供商</p>
          <p class="page-empty__desc">添加一个 API 提供商来开始配置</p>
          <div class="page-empty__action">
            <el-button type="primary" @click="showAddDialog">新增提供商</el-button>
          </div>
        </div>
      </div>

      <!-- 移动端分页 -->
      <div class="pagination-wrapper pagination-mobile" v-if="providers.length > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="providers.length"
          layout="prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <ProviderFormDialog
      v-model:visible="dialogVisible"
      :editing-provider="editingProvider"
      @submitted="fetchProviders"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 提供商配置视图
 * @description 管理提供商的增删改查
 */
import { ref, computed, onMounted, onActivated } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getProviders,
  deleteProvider,
  type ProviderConfig,
  type StreamMode,
} from "@/api/types";
import ProviderFormDialog from "@/components/ProviderFormDialog.vue";

const loading = ref(false);
const dialogVisible = ref(false);
const providers = ref<ProviderConfig[]>([]);
const editingProvider = ref<ProviderConfig | null>(null);

/** 分页配置 */
const pageSize = ref(20);
const currentPage = ref(1);

/** 分页后的提供商列表 */
const paginatedProviders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return providers.value.slice(start, end);
});

/**
 * 页码变化处理
 * @param page 新页码
 */
function handlePageChange(page: number): void {
  currentPage.value = page;
}

/**
 * 每页数量变化处理
 * @param size 新的每页数量
 */
function handleSizeChange(size: number): void {
  pageSize.value = size;
  currentPage.value = 1;
}

onMounted(() => {
  fetchProviders();
});

onActivated(() => {
  fetchProviders();
});

async function fetchProviders() {
  loading.value = true;
  try {
    const { data } = await getProviders();
    providers.value = data;
  } finally {
    loading.value = false;
  }
}

function showAddDialog() {
  editingProvider.value = null;
  dialogVisible.value = true;
}

function showEditDialog(provider: ProviderConfig) {
  editingProvider.value = provider;
  dialogVisible.value = true;
}

async function handleDelete(name: string) {
  try {
    await deleteProvider(name);
    ElMessage.success("删除成功");
    await fetchProviders();
  } catch {
    // 错误已在拦截器中处理
  }
}

function getStreamModeLabel(mode?: StreamMode): string {
  const labels: Record<StreamMode, string> = {
    none: "默认",
    fake_stream: "伪流式",
    fake_non_stream: "伪非流式",
  };
  return labels[mode || "none"] || "默认";
}

/**
 * 获取流式模式标签类型
 * @param mode 流式模式
 * @returns ElTag type 属性值
 */
function getStreamModeTagType(
  mode?: StreamMode
): "success" | "warning" | "info" | undefined {
  const types: Record<StreamMode, "success" | "warning" | "info" | undefined> = {
    none: undefined,
    fake_stream: "warning",
    fake_non_stream: "success",
  };
  return types[mode || "none"];
}
</script>

<style scoped>
.providers-view {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}

.pagination-mobile {
  justify-content: center;
}

@media (max-width: 900px) {
  .page-header__actions {
    width: 100%;
  }
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