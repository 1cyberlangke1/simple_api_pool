<template>
  <div class="models-view">
    <el-card>
      <template #header>
        <div class="card-header page-header">
          <div class="header-left page-header__meta">
            <span>模型配置</span>
            <el-tag size="small" type="info">共 {{ models.length }} 条</el-tag>
            <div v-if="exchangeRate" class="rate-display">
              <el-tag size="small" :type="exchangeRate.source === 'online' ? 'success' : 'warning'">
                汇率: 1 USD = {{ exchangeRate.rate.toFixed(4) }} CNY
              </el-tag>
              <el-button type="primary" text size="small" @click="showRateDialog = true" style="margin-left: 4px">
                编辑
              </el-button>
            </div>
          </div>
          <div class="header-right page-header__actions">
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
      <el-table :data="paginatedModels" stripe v-loading="loading" class="desktop-table">
        <el-table-column label="模型 ID" min-width="170">
          <template #default="{ row }">
            <el-tag>{{ row.provider }}/{{ row.name }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="上游模型" min-width="140" />
        <el-table-column label="工具支持" min-width="100">
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
        <el-table-column label="覆写配置" min-width="100">
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
            <div class="action-buttons">
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
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper" v-if="models.length > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="models.length"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>

      <!-- 移动端卡片列表 -->
      <div class="data-card-list" v-loading="loading">
        <div v-for="model in paginatedModels" :key="`${model.provider}/${model.name}`" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">
              <el-tag size="small">{{ model.provider }}/{{ model.name }}</el-tag>
            </div>
            <el-tag :type="model.supportsTools !== false ? 'success' : 'danger'" size="small">
              {{ model.supportsTools !== false ? "工具" : "无工具" }}
            </el-tag>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row">
              <span class="data-card__label">上游模型：</span>
              <span>{{ model.model }}</span>
            </div>
            <div v-if="model.pricing" class="data-card__body-row">
              <span class="data-card__label">价格：</span>
              <span>输入 {{ formatPrice(model.pricing.promptPer1k) }} · 输出 {{ formatPrice(model.pricing.completionPer1k) }}</span>
            </div>
            <div v-if="model.requestOverrides || model.extraBody" class="data-card__body-row">
              <el-tag type="warning" size="small">已配置覆写</el-tag>
            </div>
          </div>
          <div class="data-card__footer">
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
        <div v-if="models.length === 0 && !loading" class="page-empty">
          <div class="page-empty__icon">
            <el-icon :size="24"><Plus /></el-icon>
          </div>
          <p class="page-empty__title">暂无模型</p>
          <p class="page-empty__desc">添加模型配置来开始使用</p>
          <div class="page-empty__action">
            <el-button type="primary" @click="showAddDialog">新增模型</el-button>
          </div>
        </div>
      </div>

      <!-- 移动端分页 -->
      <div class="pagination-wrapper pagination-mobile" v-if="models.length > pageSize">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="models.length"
          layout="prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
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

    <!-- 汇率编辑对话框 -->
    <el-dialog v-model="showRateDialog" title="设置汇率" width="400px">
      <el-form label-width="100px">
        <el-form-item label="当前汇率">
          <span v-if="exchangeRate">1 USD = {{ exchangeRate.rate.toFixed(4) }} CNY</span>
          <span v-else>未获取</span>
          <el-tag v-if="exchangeRate" :type="exchangeRate.source === 'online' ? 'success' : 'warning'" size="small" style="margin-left: 8px">
            {{ exchangeRate.source === 'online' ? '在线' : '备用' }}
          </el-tag>
        </el-form-item>
        <el-form-item label="新汇率">
          <el-input-number
            v-model="newRate"
            :precision="4"
            :step="0.01"
            :min="0.01"
            :max="100"
            style="width: 200px"
          />
          <span style="margin-left: 8px">CNY/USD</span>
        </el-form-item>
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            <span>设置的汇率将被视为今日在线获取，有效期 24 小时</span>
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showRateDialog = false">取消</el-button>
        <el-button type="primary" @click="handleSetRate" :loading="rateLoading">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 模型配置视图
 * @description 管理模型的增删改查，支持价格查询和货币转换
 */
import { ref, computed, onMounted, onActivated } from "vue";
import { Plus } from "@element-plus/icons-vue";
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

/** 分页配置 */
const pageSize = ref(20);
const currentPage = ref(1);

/** 汇率编辑相关 */
const showRateDialog = ref(false);
const newRate = ref(7.25);
const rateLoading = ref(false);

/** 分页后的模型列表 */
const paginatedModels = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return models.value.slice(start, end);
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

const { showCNY, exchangeRate, fetchExchangeRate, updateExchangeRate, formatPrice } = useCurrency();

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

/**
 * 设置新汇率
 */
async function handleSetRate(): Promise<void> {
  if (newRate.value <= 0) {
    ElMessage.warning("请输入有效的汇率");
    return;
  }
  rateLoading.value = true;
  try {
    const success = await updateExchangeRate(newRate.value);
    if (success) {
      showRateDialog.value = false;
    }
  } finally {
    rateLoading.value = false;
  }
}

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
  gap: var(--page-gap);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.header-right {
  display: flex;
  align-items: center;
}

.rate-display {
  display: flex;
  align-items: center;
}

.text-muted {
  color: var(--text-secondary);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.price-cell {
  display: flex;
  align-items: center;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  padding: 16px 0;
}

.pagination-mobile {
  justify-content: center;
}

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .header-left,
  .header-right {
    width: 100%;
  }

  .header-right {
    justify-content: flex-start;
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
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

  .desktop-table {
    display: none;
  }
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .price-cell {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .rate-display {
    flex-wrap: wrap;
  }
}
</style>
