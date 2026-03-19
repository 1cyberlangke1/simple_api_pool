<template>
  <div class="providers-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>提供商配置</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            <span class="btn-text">新增提供商</span>
          </el-button>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="providers" stripe v-loading="loading" class="desktop-table">
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column prop="baseUrl" label="Base URL" />
        <el-table-column label="流式模式" width="120">
          <template #default="{ row }">
            <el-tag :type="getStreamModeTagType(row.streamMode)">
              {{ getStreamModeLabel(row.streamMode) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="轮询策略" width="120">
          <template #default="{ row }">
            <el-tag>{{ row.strategy || "round_robin" }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="RPM 限制" width="100">
          <template #default="{ row }">
            {{ row.rpmLimit || "无限制" }}
          </template>
        </el-table-column>
        <el-table-column label="超时" width="100">
          <template #default="{ row }">
            {{ row.timeoutMs ? `${row.timeoutMs / 1000}s` : "默认" }}
          </template>
        </el-table-column>
        <el-table-column label="重置时间" width="100">
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

      <!-- 移动端卡片列表 -->
      <div class="mobile-list" v-loading="loading">
        <div v-for="provider in providers" :key="provider.name" class="mobile-item">
          <div class="item-header">
            <span class="item-name">{{ provider.name }}</span>
            <div class="item-actions">
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
          <div class="item-url">{{ provider.baseUrl }}</div>
          <div class="item-tags">
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
        <el-empty v-if="providers.length === 0 && !loading" description="暂无提供商" />
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
import { ref, onMounted, onActivated } from "vue";
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

function getStreamModeTagType(
  mode?: StreamMode
): "" | "success" | "warning" | "info" {
  const types: Record<StreamMode, "" | "success" | "warning" | "info"> = {
    none: "",
    fake_stream: "warning",
    fake_non_stream: "success",
  };
  return types[mode || "none"] || "";
}
</script>

<style scoped>
.providers-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 移动端列表默认隐藏 */
.mobile-list {
  display: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .btn-text {
    display: none;
  }

  /* 显示移动端列表 */
  .mobile-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 隐藏桌面端表格 */
  .desktop-table {
    display: none;
  }
}

/* 移动端卡片样式 */
.mobile-item {
  padding: 12px;
  background: var(--border-light);
  border-radius: 8px;
  transition: background-color 0.3s;
}

.mobile-item .item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.mobile-item .item-name {
  font-weight: 600;
  font-size: 14px;
}

.mobile-item .item-actions {
  display: flex;
  gap: 4px;
}

.mobile-item .item-url {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
  margin-bottom: 8px;
  word-break: break-all;
}

.mobile-item .item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>