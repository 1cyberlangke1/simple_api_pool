<template>
  <el-dialog
    :model-value="visible"
    :title="editingModel ? '编辑模型' : '新增模型'"
    :width="dialogWidth"
    @update:model-value="$emit('update:visible', $event)"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <!-- 提供商选择 -->
      <el-form-item label="提供商" prop="provider">
        <el-select
          v-model="form.provider"
          placeholder="选择提供商"
          style="width: 100%"
          :disabled="!!editingModel"
          @change="onProviderChange"
        >
          <el-option
            v-for="p in providers"
            :key="p.name"
            :label="p.name"
            :value="p.name"
          />
        </el-select>
      </el-form-item>

      <!-- 模型名称 -->
      <el-form-item label="模型名称" prop="name">
        <div class="model-input-row">
          <el-input
            v-model="modelSearchKeyword"
            placeholder="输入模型名称或关键词搜索"
            clearable
            style="flex: 1"
            @keyup.enter="searchUpstreamModels"
          >
            <template #append>
              <el-button
                v-if="!editingModel && form.provider"
                :loading="loadingUpstream"
                @click="searchUpstreamModels"
              >
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
            </template>
          </el-input>
        </div>
        <div class="form-hint" v-if="!editingModel">
          选择提供商后输入关键词搜索，或直接输入完整模型名
        </div>
      </el-form-item>

      <!-- 搜索结果 -->
      <el-form-item v-if="upstreamModels.length > 0 && !editingModel" label="搜索结果">
        <div class="search-results">
          <el-scrollbar max-height="240px">
            <div
              v-for="m in upstreamModels"
              :key="m.id"
              :class="['search-result-item', { active: form.name === m.id }]"
              @click="selectModel(m.id)"
            >
              <div class="result-name">{{ m.id }}</div>
              <div v-if="m.owned_by" class="result-owner">{{ m.owned_by }}</div>
            </div>
          </el-scrollbar>
          <div class="search-footer">
            共 {{ upstreamModels.length }} 个模型
          </div>
        </div>
      </el-form-item>

      <!-- 选中的模型 -->
      <el-form-item v-if="form.name" label="已选模型">
        <el-tag closable @close="form.name = ''">{{ form.name }}</el-tag>
      </el-form-item>

      <!-- 上游模型 -->
      <el-form-item label="上游模型" prop="model">
        <el-input
          v-model="form.model"
          placeholder="实际调用的模型名，默认与模型名称相同"
        />
        <div class="form-hint">留空则使用模型名称作为上游模型</div>
      </el-form-item>

      <!-- 工具支持 -->
      <el-form-item label="支持工具">
        <el-switch v-model="form.supportsTools" />
      </el-form-item>

      <!-- 价格配置 -->
      <el-divider content-position="left">价格配置</el-divider>

      <el-form-item label="货币单位">
        <el-radio-group v-model="form.currency" @change="onCurrencyChange">
          <el-radio value="USD">美元 (USD)</el-radio>
          <el-radio value="CNY">人民币 (CNY)</el-radio>
        </el-radio-group>
        <el-button
          v-if="form.name"
          :loading="loadingPrice"
          type="primary"
          plain
          size="small"
          @click="fetchSuggestedPrice"
          style="margin-left: 16px"
        >
          <el-icon><Search /></el-icon>
          查询价格
        </el-button>
        <span v-if="exchangeRate" class="rate-hint">
          当前汇率: 1 USD = {{ exchangeRate.rate.toFixed(4) }} CNY
        </span>
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="输入价格">
            <el-input-number
              v-model="form.promptPer1k"
              :min="0"
              :precision="6"
              :step="0.001"
              style="width: 100%"
            >
              <template #prepend>{{ form.currency === "USD" ? "$" : "¥" }}</template>
              <template #append>/1K</template>
            </el-input-number>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="输出价格">
            <el-input-number
              v-model="form.completionPer1k"
              :min="0"
              :precision="6"
              :step="0.001"
              style="width: 100%"
            >
              <template #prepend>{{ form.currency === "USD" ? "$" : "¥" }}</template>
              <template #append>/1K</template>
            </el-input-number>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 建议价格列表 -->
      <SuggestedPricesList
        :items="suggestedPrices"
        @select="applySuggestedPrice"
      />

      <!-- 高级设置 -->
      <el-divider content-position="left">高级设置</el-divider>

      <el-collapse v-model="advancedPanelActive">
        <el-collapse-item title="参数覆写配置" name="overrides">
          <template #title>
            <div class="collapse-title">
              <span>参数覆写配置</span>
              <el-tag
                v-if="hasOverrides"
                type="warning"
                size="small"
                style="margin-left: 8px"
              >
                已配置
              </el-tag>
            </div>
          </template>

          <el-form-item label="请求参数覆写">
            <div class="json-editor-row">
              <el-input
                v-model="form.requestOverridesJson"
                type="textarea"
                :rows="4"
                placeholder='{"temperature": 0.7, "top_p": 0.9}'
                @blur="validateRequestOverrides"
              />
              <el-button
                type="primary"
                plain
                size="small"
                @click="formatRequestOverrides"
                style="margin-left: 8px"
              >
                格式化
              </el-button>
            </div>
            <div class="form-hint">
              覆写模型生成参数。<span class="text-danger">不可覆写 stream 和 model 字段。</span>
            </div>
            <div v-if="requestOverridesError" class="json-error">
              {{ requestOverridesError }}
            </div>
          </el-form-item>

          <el-form-item label="额外请求体">
            <div class="json-editor-row">
              <el-input
                v-model="form.extraBodyJson"
                type="textarea"
                :rows="4"
                placeholder='{"enable_thinking": true}'
                @blur="validateExtraBody"
              />
              <el-button
                type="primary"
                plain
                size="small"
                @click="formatExtraBody"
                style="margin-left: 8px"
              >
                格式化
              </el-button>
            </div>
            <div class="form-hint">追加到请求体根级别的额外字段。</div>
            <div v-if="extraBodyError" class="json-error">{{ extraBodyError }}</div>
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ editingModel ? "保存" : "添加" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 模型表单对话框
 * @description 处理模型的创建和编辑，包含价格配置和参数覆写
 * @emits submit - 提交表单数据
 * @emits update:visible - 更新对话框可见状态
 */
import { ref, reactive, watch, computed } from "vue";
import { Search } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  addModel,
  updateModel,
  getUpstreamModels,
  queryModelPrice,
  type ModelConfig,
  type ProviderConfig,
  type ModelPriceResult,
} from "@/api/types";
import SuggestedPricesList from "@/components/SuggestedPricesList.vue";

interface Props {
  visible: boolean;
  editingModel: ModelConfig | null;
  providers: ProviderConfig[];
  exchangeRate: { rate: number } | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "submitted"): void;
}>();

const submitting = ref(false);
const loadingUpstream = ref(false);
const loadingPrice = ref(false);
const formRef = ref();
const upstreamModels = ref<Array<{ id: string; owned_by?: string }>>([]);
const suggestedPrices = ref<ModelPriceResult[]>([]);
const advancedPanelActive = ref<string[]>([]);
const requestOverridesError = ref("");
const extraBodyError = ref("");
const modelSearchKeyword = ref("");

const form = reactive({
  provider: "",
  name: "",
  model: "",
  supportsTools: true,
  promptPer1k: 0,
  completionPer1k: 0,
  currency: "USD" as "USD" | "CNY",
  requestOverridesJson: "",
  extraBodyJson: "",
});

// 内部存储的美元价格
const internalPromptUSD = ref(0);
const internalCompletionUSD = ref(0);

// 计算是否有覆写配置
const hasOverrides = computed(
  () => !!(form.requestOverridesJson.trim() || form.extraBodyJson.trim())
);

/**
 * 响应式对话框宽度
 * @returns 根据屏幕宽度返回合适的对话框宽度
 */
const dialogWidth = computed(() => {
  if (typeof window === "undefined") return "600px";
  return window.innerWidth < 768 ? "95%" : "600px";
});

const rules = {
  provider: [{ required: true, message: "请选择提供商", trigger: "change" }],
  name: [{ required: true, message: "请输入模型名称", trigger: "blur" }],
};

// 监听编辑模型变化
watch(
  () => props.editingModel,
  (model) => {
    if (model) {
      loadModelData(model);
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

// 监听搜索关键词变化，自动更新 form.name
watch(modelSearchKeyword, (val) => {
  // 编辑模式下不自动更新
  if (!props.editingModel) {
    form.name = val.trim();
  }
});

/**
 * 加载模型数据到表单
 * @param model 模型配置
 */
function loadModelData(model: ModelConfig) {
  const promptUSD = model.pricing?.promptPer1k || 0;
  const completionUSD = model.pricing?.completionPer1k || 0;

  internalPromptUSD.value = promptUSD;
  internalCompletionUSD.value = completionUSD;

  const requestOverridesJson = model.requestOverrides
    ? JSON.stringify(model.requestOverrides, null, 2)
    : "";
  const extraBodyJson = model.extraBody
    ? JSON.stringify(model.extraBody, null, 2)
    : "";

  advancedPanelActive.value =
    model.requestOverrides || model.extraBody ? ["overrides"] : [];

  // 编辑模式下显示模型名称
  modelSearchKeyword.value = model.name;

  Object.assign(form, {
    provider: model.provider,
    name: model.name,
    model: model.model,
    supportsTools: model.supportsTools !== false,
    promptPer1k: promptUSD,
    completionPer1k: completionUSD,
    currency: "USD",
    requestOverridesJson,
    extraBodyJson,
  });
}

/**
 * 重置表单
 */
function resetForm() {
  upstreamModels.value = [];
  suggestedPrices.value = [];
  advancedPanelActive.value = [];
  requestOverridesError.value = "";
  extraBodyError.value = "";
  modelSearchKeyword.value = "";

  Object.assign(form, {
    provider: "",
    name: "",
    model: "",
    supportsTools: true,
    promptPer1k: 0,
    completionPer1k: 0,
    currency: "USD",
    requestOverridesJson: "",
    extraBodyJson: "",
  });

  internalPromptUSD.value = 0;
  internalCompletionUSD.value = 0;
}

/**
 * 关闭对话框
 */
function handleClose() {
  resetForm();
  formRef.value?.resetFields();
}

/**
 * 搜索上游模型（带关键词过滤）
 */
async function searchUpstreamModels() {
  if (!form.provider) {
    ElMessage.warning("请先选择提供商");
    return;
  }

  loadingUpstream.value = true;
  try {
    const { data } = await getUpstreamModels(form.provider);
    const allModels = data.models || [];

    // 根据关键词过滤
    const keyword = modelSearchKeyword.value.trim().toLowerCase();
    if (keyword) {
      upstreamModels.value = allModels.filter((m: { id: string }) =>
        m.id.toLowerCase().includes(keyword)
      );
    } else {
      upstreamModels.value = allModels;
    }

    if (upstreamModels.value.length > 0) {
      ElMessage.success(`找到 ${upstreamModels.value.length} 个匹配模型`);
    } else {
      ElMessage.info("未找到匹配的模型");
    }
  } finally {
    loadingUpstream.value = false;
  }
}

/**
 * 选择模型
 * @param modelId 模型 ID
 */
function selectModel(modelId: string) {
  modelSearchKeyword.value = modelId;
  form.name = modelId;
  suggestedPrices.value = [];
}

/**
 * 查询建议价格
 */
async function fetchSuggestedPrice() {
  if (!form.name) {
    ElMessage.warning("请先输入模型名称");
    return;
  }

  loadingPrice.value = true;
  suggestedPrices.value = [];

  try {
    const { data } = await queryModelPrice(form.name, form.provider, 5);
    suggestedPrices.value = data.results || [];

    if (suggestedPrices.value.length === 0) {
      ElMessage.info("未找到匹配的价格信息");
    } else {
      ElMessage.success(`找到 ${suggestedPrices.value.length} 个匹配结果`);
    }
  } finally {
    loadingPrice.value = false;
  }
}

/**
 * 应用建议价格
 * @param item 价格结果
 */
function applySuggestedPrice(item: ModelPriceResult) {
  internalPromptUSD.value = item.price.promptPer1k;
  internalCompletionUSD.value = item.price.completionPer1k;

  if (form.currency === "USD") {
    form.promptPer1k = item.price.promptPer1k;
    form.completionPer1k = item.price.completionPer1k;
  } else {
    form.promptPer1k = item.price.promptPer1kCNY;
    form.completionPer1k = item.price.completionPer1kCNY;
  }

  if (item.price.supportsTools !== undefined) {
    form.supportsTools = item.price.supportsTools;
  }

  ElMessage.success("价格已自动填充");
  suggestedPrices.value = [];
}

/**
 * 货币切换时的转换
 */
function onCurrencyChange() {
  if (!props.exchangeRate) return;

  const rate = props.exchangeRate.rate;

  if (form.currency === "CNY") {
    form.promptPer1k = internalPromptUSD.value * rate;
    form.completionPer1k = internalCompletionUSD.value * rate;
  } else {
    form.promptPer1k = internalPromptUSD.value;
    form.completionPer1k = internalCompletionUSD.value;
  }
}

/**
 * 验证请求参数覆写 JSON
 * @returns 是否有效
 */
function validateRequestOverrides(): boolean {
  requestOverridesError.value = "";
  if (!form.requestOverridesJson.trim()) return true;

  try {
    const parsed = JSON.parse(form.requestOverridesJson);
    const forbiddenFields = ["stream", "model"];
    const hasForbidden = forbiddenFields.some((f) => f in parsed);
    if (hasForbidden) {
      requestOverridesError.value = `禁止覆写字段: ${forbiddenFields.join(", ")}`;
      return false;
    }
    return true;
  } catch {
    requestOverridesError.value = "JSON 格式无效";
    return false;
  }
}

/**
 * 验证额外请求体 JSON
 * @returns 是否有效
 */
function validateExtraBody(): boolean {
  extraBodyError.value = "";
  if (!form.extraBodyJson.trim()) return true;

  try {
    JSON.parse(form.extraBodyJson);
    return true;
  } catch {
    extraBodyError.value = "JSON 格式无效";
    return false;
  }
}

/**
 * 格式化请求参数覆写 JSON
 */
function formatRequestOverrides() {
  if (!form.requestOverridesJson.trim()) return;
  try {
    const parsed = JSON.parse(form.requestOverridesJson);
    form.requestOverridesJson = JSON.stringify(parsed, null, 2);
    validateRequestOverrides();
  } catch {
    requestOverridesError.value = "JSON 格式无效，无法格式化";
  }
}

/**
 * 格式化额外请求体 JSON
 */
function formatExtraBody() {
  if (!form.extraBodyJson.trim()) return;
  try {
    const parsed = JSON.parse(form.extraBodyJson);
    form.extraBodyJson = JSON.stringify(parsed, null, 2);
    validateExtraBody();
  } catch {
    extraBodyError.value = "JSON 格式无效，无法格式化";
  }
}

function onProviderChange() {
  upstreamModels.value = [];
  suggestedPrices.value = [];
  modelSearchKeyword.value = "";
  form.name = "";
  form.model = "";
}

/**
 * 提交表单
 */
async function handleSubmit() {
  await formRef.value?.validate();

  if (!validateRequestOverrides() || !validateExtraBody()) {
    ElMessage.error("请修正 JSON 格式错误");
    return;
  }

  submitting.value = true;
  try {
    const upstreamModel = form.model || form.name;

    let promptUSD = form.promptPer1k;
    let completionUSD = form.completionPer1k;

    if (form.currency === "CNY" && props.exchangeRate) {
      promptUSD = form.promptPer1k / props.exchangeRate.rate;
      completionUSD = form.completionPer1k / props.exchangeRate.rate;
    }

    // 解析 JSON 字段（验证后再解析以防输入被修改）
    let requestOverrides: Record<string, unknown> | undefined;
    let extraBody: Record<string, unknown> | undefined;
    
    try {
      requestOverrides = form.requestOverridesJson.trim()
        ? JSON.parse(form.requestOverridesJson)
        : undefined;
      extraBody = form.extraBodyJson.trim()
        ? JSON.parse(form.extraBodyJson)
        : undefined;
    } catch {
      ElMessage.error("JSON 格式错误，请检查输入");
      return;
    }

    const config: ModelConfig = {
      provider: form.provider,
      name: form.name,
      model: upstreamModel,
      supportsTools: form.supportsTools,
      pricing: {
        promptPer1k: promptUSD || undefined,
        completionPer1k: completionUSD || undefined,
      },
      requestOverrides,
      extraBody,
    };

    if (props.editingModel) {
      await updateModel(form.provider, form.name, config);
    } else {
      await addModel(config);
    }

    ElMessage.success(props.editingModel ? "更新成功" : "添加成功");
    emit("update:visible", false);
    emit("submitted");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.provider-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.model-input-row {
  display: flex;
  align-items: center;
  width: 100%;
}

.search-results {
  width: 100%;
  border: 1px solid var(--border-light);
  border-radius: var(--card-radius-sm);
  overflow: hidden;
}

.search-result-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
  transition: background-color 0.2s;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background-color: var(--bg-secondary);
}

.search-result-item.active {
  background-color: var(--primary-light);
}

.result-name {
  font-family: var(--font-mono);
  font-size: 13px;
}

.result-owner {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.search-footer {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-muted);
  background-color: var(--bg-secondary);
}

.owned-by {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

.rate-hint {
  margin-left: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.collapse-title {
  display: flex;
  align-items: center;
}

.json-editor-row {
  display: flex;
  align-items: flex-start;
  width: 100%;
}

.json-editor-row .el-textarea {
  flex: 1;
}

.json-error {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 4px;
}

.text-danger {
  color: #f56c6c;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .model-input-row {
    flex-wrap: wrap;
  }

  .model-input-row .el-button {
    margin-left: 0;
    margin-top: 8px;
    width: 100%;
  }

  .json-editor-row {
    flex-wrap: wrap;
  }

  .json-editor-row .el-button {
    margin-left: 0;
    margin-top: 8px;
  }

  :deep(.el-form-item__label) {
    width: 80px !important;
  }

  :deep(.el-row) {
    flex-direction: column;
  }

  :deep(.el-col) {
    max-width: 100%;
    flex: 0 0 100%;
  }
}
</style>
