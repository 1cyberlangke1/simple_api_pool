<template>
  <div class="providers-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>提供商配置</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            新增提供商
          </el-button>
        </div>
      </template>

      <el-table :data="providers" stripe v-loading="loading">
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
</style>
