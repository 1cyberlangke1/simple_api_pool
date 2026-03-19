<template>
  <div class="models-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span>模型配置</span>
            <el-tag
              v-if="exchangeRate"
              size="small"
              type="info"
              class="rate-tag"
            >
              汇率: 1 USD = {{ exchangeRate.rate.toFixed(4) }} CNY
              <el-icon
                v-if="exchangeRate.source === 'fallback'"
                :size="12"
                style="margin-left: 4px"
              >
                <Warning />
              </el-icon>
            </el-tag>
          </div>
          <div class="header-right">
            <el-switch
              v-model="showCNY"
              active-text="人民币"
              inactive-text="美元"
              style="margin-right: 16px"
            />
            <el-button type="primary" @click="showAddDialog">
              <el-icon><Plus /></el-icon>
              新增模型
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="models" stripe v-loading="loading">
        <el-table-column label="模型 ID" width="180">
          <template #default="{ row }">
            <el-tag>{{ row.provider }}/{{ row.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="上游模型" width="150" />
        <el-table-column label="工具支持" width="100">
          <template #default="{ row }">
            <el-tag :type="row.supportsTools !== false ? 'success' : 'danger'">
              {{ row.supportsTools !== false ? "支持" : "不支持" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="价格 (每 1K token)">
          <template #default="{ row }">
            <template v-if="row.pricing">
              <div class="price-cell">
                <span>输入: {{ formatPrice(row.pricing.promptPer1k) }}</span>
                <el-divider direction="vertical" />
                <span>输出: {{ formatPrice(row.pricing.completionPer1k) }}</span>
              </div>
            </template>
            <span v-else class="text-muted">未配置</span>
          </template>
        </el-table-column>
        <el-table-column label="覆写配置" width="100">
          <template #default="{ row }">
            <el-tag
              v-if="row.requestOverrides || row.extraBody"
              type="warning"
              size="small"
            >
              已配置
            </el-tag>
            <span v-else class="text-muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-popconfirm
              title="确定删除此模型？"
              @confirm="handleDelete(row.provider, row.name)"
            >
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <ModelFormDialog
      v-model:visible="dialogVisible"
      :editing-model="editingModel"
      :providers="providers"
      :exchange-rate="exchangeRate"
      @submitted="fetchModels"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 模型配置视图
 * @description 管理模型的增删改查，支持价格查询和货币转换
 */
import { ref, onMounted, onActivated } from "vue";
import { Plus, Warning } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getModels,
  deleteModel,
  getProviders,
  type ModelConfig,
  type ProviderConfig,
} from "@/api/types";
import { useCurrency } from "@/composables";
import ModelFormDialog from "@/components/ModelFormDialog.vue";

const loading = ref(false);
const dialogVisible = ref(false);
const models = ref<ModelConfig[]>([]);
const providers = ref<ProviderConfig[]>([]);
const editingModel = ref<ModelConfig | null>(null);

const { showCNY, exchangeRate, fetchExchangeRate, formatPrice } = useCurrency();

onMounted(() => {
  fetchModels();
  fetchProviders();
  fetchExchangeRate();
});

onActivated(() => {
  fetchModels();
  fetchProviders();
  fetchExchangeRate();
});

async function fetchModels() {
  loading.value = true;
  try {
    const { data } = await getModels();
    models.value = data;
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

function showAddDialog() {
  editingModel.value = null;
  dialogVisible.value = true;
}

function showEditDialog(model: ModelConfig) {
  editingModel.value = model;
  dialogVisible.value = true;
}

async function handleDelete(provider: string, name: string) {
  try {
    await deleteModel(provider, name);
    ElMessage.success("删除成功");
    await fetchModels();
  } catch {
    // 错误已在拦截器中处理
  }
}
</script>

<style scoped>
.models-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
}

.rate-tag {
  display: flex;
  align-items: center;
}

.text-muted {
  color: var(--text-secondary);
}

.price-cell {
  display: flex;
  align-items: center;
}
</style>