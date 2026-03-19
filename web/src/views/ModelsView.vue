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
              class="currency-switch"
            />
            <el-button type="primary" @click="showAddDialog">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新增模型</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="models" stripe v-loading="loading" class="desktop-table">
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

      <!-- 移动端卡片列表 -->
      <div class="mobile-list" v-loading="loading">
        <div v-for="model in models" :key="`${model.provider}/${model.name}`" class="mobile-item">
          <div class="item-header">
            <el-tag size="small">{{ model.provider }}/{{ model.name }}</el-tag>
            <div class="item-actions">
              <el-button type="primary" text size="small" @click="showEditDialog(model)">
                编辑
              </el-button>
              <el-popconfirm title="确定删除此模型？" @confirm="handleDelete(model.provider, model.name)">
                <template #reference>
                  <el-button type="danger" text size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
          <div class="item-info">
            <span>上游模型: {{ model.model }}</span>
            <el-tag :type="model.supportsTools !== false ? 'success' : 'danger'" size="small">
              {{ model.supportsTools !== false ? "支持工具" : "不支持工具" }}
            </el-tag>
          </div>
          <div v-if="model.pricing" class="item-price">
            <span>输入: {{ formatPrice(model.pricing.promptPer1k) }}</span>
            <span>输出: {{ formatPrice(model.pricing.completionPer1k) }}</span>
          </div>
          <div v-if="model.requestOverrides || model.extraBody" class="item-extra">
            <el-tag type="warning" size="small">已配置覆写</el-tag>
          </div>
        </div>
        <el-empty v-if="models.length === 0 && !loading" description="暂无模型" />
      </div>
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

/* 移动端列表默认隐藏 */
.mobile-list {
  display: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .rate-tag {
    display: none;
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-left {
    width: 100%;
  }

  .header-right {
    width: 100%;
    justify-content: space-between;
  }

  .currency-switch {
    flex: 1;
  }

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

.mobile-item .item-actions {
  display: flex;
  gap: 4px;
}

.mobile-item .item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.mobile-item .item-price {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.mobile-item .item-extra {
  margin-top: 8px;
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .price-cell {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>
