<template>
  <el-dialog
    :model-value="visible"
    :title="editingGroup ? '编辑分组' : '新增分组'"
    :width="dialogWidth"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
      <!-- 功能说明 -->
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #title>
          <span>分组是将多个模型组合在一起的方式，客户端只需指定分组名即可使用</span>
        </template>
      </el-alert>

      <el-form-item label="分组名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="如 default、chat、code"
          :disabled="!!editingGroup"
        />
        <div class="form-hint">
          客户端将通过 <code>group/名称</code> 来使用此分组，如 <code>group/default</code>
        </div>
      </el-form-item>

      <el-form-item label="负载策略" prop="strategy">
        <el-select v-model="form.strategy" style="width: 100%">
          <el-option label="轮流使用（推荐）" value="round_robin">
            <div class="option-detail">
              <span class="option-label">轮流使用</span>
              <span class="option-desc">按顺序依次使用每个模型，平均分配请求</span>
            </div>
          </el-option>
          <el-option label="故障转移" value="failover">
            <div class="option-detail">
              <span class="option-label">故障转移</span>
              <span class="option-desc">按优先级顺序尝试，失败自动切换下一个模型</span>
            </div>
          </el-option>
          <el-option label="用完再换" value="exhaust">
            <div class="option-detail">
              <span class="option-label">用完再换</span>
              <span class="option-desc">一个模型的 Key 用完配额后再换下一个</span>
            </div>
          </el-option>
          <el-option label="随机选择" value="random">
            <div class="option-detail">
              <span class="option-label">随机选择</span>
              <span class="option-desc">每次请求随机选一个模型</span>
            </div>
          </el-option>
          <el-option label="按权重分配" value="weighted">
            <div class="option-detail">
              <span class="option-label">按权重分配</span>
              <span class="option-desc">根据设置的权重比例分配请求</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-hint">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
          当分组中有多个模型时，如何选择使用哪一个
        </div>
      </el-form-item>

      <!-- 路由配置 -->
      <el-form-item label="模型列表">
        <div class="routes-config">
          <div class="config-header">
            <span v-if="form.strategy === 'failover'">
              <el-tag type="warning" size="small">故障转移模式</el-tag>
              按列表顺序优先使用前面的模型，失败时自动切换下一个
            </span>
            <span v-else-if="form.strategy === 'weighted'">
              <el-tag type="info" size="small">权重模式</el-tag>
              根据每个模型的权重比例分配请求
            </span>
            <span v-else>选择要加入此分组的模型，可以设置不同的参数</span>
          </div>
          <div v-for="(route, idx) in form.routes" :key="idx" class="route-row">
            <!-- 排序按钮 -->
            <div class="sort-buttons">
              <el-button
                :icon="ArrowUp"
                circle
                size="small"
                :disabled="idx === 0"
                @click="moveRouteUp(idx)"
              />
              <el-button
                :icon="ArrowDown"
                circle
                size="small"
                :disabled="idx === form.routes.length - 1"
                @click="moveRouteDown(idx)"
              />
            </div>
            <!-- 优先级标识（故障转移模式） -->
            <el-tag v-if="form.strategy === 'failover'" size="small" :type="getPriorityTagType(idx)">
              {{ idx + 1 }}
            </el-tag>
            <el-select
              v-model="route.modelId"
              placeholder="选择模型"
              style="width: 200px"
            >
              <el-option
                v-for="m in modelOptions"
                :key="m"
                :label="m"
                :value="m"
              />
            </el-select>
            <el-tooltip content="留空则透传下游温度；温度越高回答越有创意，越低越稳定" placement="top">
              <el-input-number
                v-model="route.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                :precision="1"
                placeholder="透传"
                :controls="false"
                style="width: 100px"
              />
            </el-tooltip>
            <el-input-number
              v-if="form.strategy === 'weighted'"
              v-model="route.weight"
              :min="1"
              :max="100"
              placeholder="权重"
              style="width: 100px"
            />
            <el-button type="danger" :icon="Delete" circle @click="removeRoute(idx)" />
          </div>
          <el-button type="primary" text @click="addRoute">
            <el-icon><Plus /></el-icon>
            添加模型
          </el-button>
        </div>
      </el-form-item>

      <!-- 功能配置 -->
      <el-divider content-position="left">
        <span class="divider-text">高级功能（可选）</span>
      </el-divider>

      <el-form-item label="启用工具">
        <el-select
          v-model="form.features.tools"
          multiple
          filterable
          allow-create
          placeholder="选择要启用的工具"
          style="width: 100%"
        >
          <el-option
            v-for="tool in availableTools"
            :key="tool"
            :label="tool"
            :value="tool"
          />
        </el-select>
        <div class="form-hint">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
          工具可以让 AI 执行特定操作，如搜索、查天气等
        </div>
      </el-form-item>

      <el-form-item v-if="form.features.tools?.length" label="工具策略">
        <el-select
          v-model="form.features.toolRoutingStrategy"
          style="width: 100%"
          clearable
          placeholder="默认：优先本地执行"
        >
          <el-option label="优先本地执行" value="local_first">
            <div class="option-detail">
              <span class="option-label">优先本地</span>
              <span class="option-desc">优先使用本地工具，不支持时转发给上游</span>
            </div>
          </el-option>
          <el-option label="仅使用本地工具" value="local_only">
            <div class="option-detail">
              <span class="option-label">仅本地</span>
              <span class="option-desc">只使用本地工具，不支持则报错</span>
            </div>
          </el-option>
          <el-option label="全部转发上游" value="passthrough">
            <div class="option-detail">
              <span class="option-label">全部转发</span>
              <span class="option-desc">不使用本地工具，全部转发给上游处理</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="提示词增强">
        <el-collapse class="prompt-collapse">
          <el-collapse-item title="点击配置系统提示词增强功能">
            <div class="prompt-config">
              <el-form label-width="80px">
                <el-form-item label="当前时间">
                  <el-switch v-model="promptInject.enableTimestamp" />
                  <span class="switch-hint">在对话中注入当前时间</span>
                </el-form-item>
                <el-form-item label="农历日期">
                  <el-switch v-model="promptInject.enableLunar" />
                  <span class="switch-hint">在对话中注入农历日期</span>
                </el-form-item>
                <el-form-item label="天气信息">
                  <el-switch v-model="promptInject.enableWeather" />
                  <span class="switch-hint">在对话中注入当前天气</span>
                </el-form-item>
                <template v-if="promptInject.enableWeather">
                  <el-form-item label="位置坐标">
                    <div class="location-input">
                      <el-input-number
                        v-model="promptInject.latitude"
                        :precision="4"
                        :min="-90"
                        :max="90"
                        placeholder="纬度"
                        style="width: 120px"
                      />
                      <el-input-number
                        v-model="promptInject.longitude"
                        :precision="4"
                        :min="-180"
                        :max="180"
                        placeholder="经度"
                        style="width: 120px"
                      />
                    </div>
                  </el-form-item>
                </template>
              </el-form>
            </div>
          </el-collapse-item>
        </el-collapse>
        <div class="form-hint">
          可在 AI 对话开始时自动注入时间、天气等上下文信息
        </div>
      </el-form-item>

      <el-form-item label="截断检测">
        <el-switch v-model="truncationEnabled" />
        <span class="switch-hint">检测 AI 回复是否被截断，并在截断时自动提示</span>
      </el-form-item>

      <el-form-item label="响应缓存">
        <el-switch v-model="cacheEnabled" />
        <span class="switch-hint">缓存相同请求的响应，减少 API 调用</span>
      </el-form-item>

      <template v-if="cacheEnabled">
        <el-form-item label="缓存条目数">
          <el-input-number
            v-model="cacheConfig.maxEntries"
            :min="100"
            :max="100000"
            :step="100"
            style="width: 150px"
          />
          <span class="switch-hint">最多缓存多少条响应（默认 1000）</span>
        </el-form-item>
        <el-form-item label="缓存有效期">
          <el-input-number
            v-model="cacheConfig.ttl"
            :min="60"
            :max="86400"
            :step="60"
            style="width: 150px"
          />
          <span class="switch-hint">缓存过期时间（秒），留空则永不过期</span>
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ editingGroup ? "保存" : "添加" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 分组表单对话框
 * @description 创建和编辑分组配置，支持故障转移和模型排序
 */
import { ref, reactive, computed, watch } from "vue";
import { Plus, Delete, QuestionFilled, ArrowUp, ArrowDown } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  addGroup,
  updateGroup,
  type GroupConfig,
  type ModelConfig,
  type GroupFeatureConfig,
  type ToolRoutingStrategy,
} from "@/api/types";

interface RouteForm {
  modelId: string;
  temperature?: number;
  weight?: number;
}

interface Props {
  visible: boolean;
  editingGroup: GroupConfig | null;
  models: ModelConfig[];
  availableTools: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "submitted"): void;
}>();

const submitting = ref(false);
const formRef = ref();
const truncationEnabled = ref(false);
const cacheEnabled = ref(false);

const cacheConfig = reactive({
  maxEntries: 1000 as number | undefined,
  ttl: undefined as number | undefined,
});

const form = reactive({
  name: "",
  strategy: "round_robin" as "exhaust" | "round_robin" | "random" | "weighted" | "failover",
  routes: [] as RouteForm[],
  features: {
    tools: [] as string[],
    toolRoutingStrategy: undefined as ToolRoutingStrategy | undefined,
  },
});

const promptInject = reactive({
  enableTimestamp: false,
  enableLunar: false,
  enableWeather: false,
  latitude: 39.9042,
  longitude: 116.4074,
});

const rules = {
  name: [{ required: true, message: "请输入分组名称", trigger: "blur" }],
};

const modelOptions = computed(() => {
  return props.models.map((m) => `${m.provider}/${m.name}`);
});

/**
 * 响应式对话框宽度
 * @returns 根据屏幕宽度返回合适的对话框宽度
 */
const dialogWidth = computed(() => {
  if (typeof window === "undefined") return "750px";
  return window.innerWidth < 768 ? "95%" : "750px";
});

/**
 * 获取优先级标签类型
 * @param idx 路由索引
 * @returns 标签类型
 */
function getPriorityTagType(idx: number): "danger" | "warning" | "info" {
  if (idx === 0) return "danger";
  if (idx === 1) return "warning";
  return "info";
}

watch(
  () => props.editingGroup,
  (group) => {
    if (group) {
      loadGroupData(group);
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

function loadGroupData(group: GroupConfig) {
  Object.assign(form, {
    name: group.name,
    // 兼容旧配置：如果 failover 为 true，使用 failover 策略
    strategy: group.failover ? "failover" : (group.strategy || "round_robin"),
    routes: group.routes.map((r) => ({
      modelId: r.modelId,
      temperature: r.temperature,
      weight: r.weight,
    })),
    features: {
      tools: group.features?.tools ?? [],
      toolRoutingStrategy: group.features?.toolRoutingStrategy,
    },
  });

  if (group.features?.promptInject) {
    promptInject.enableTimestamp = group.features.promptInject.enableTimestamp ?? false;
    promptInject.enableLunar = group.features.promptInject.enableLunar ?? false;
    promptInject.enableWeather = group.features.promptInject.enableWeather ?? false;
    if (group.features.promptInject.weather) {
      promptInject.latitude = group.features.promptInject.weather.latitude;
      promptInject.longitude = group.features.promptInject.weather.longitude;
    }
  }

  truncationEnabled.value = group.features?.truncation?.enable ?? false;

  // 加载缓存配置
  cacheEnabled.value = group.features?.cache?.enable ?? false;
  cacheConfig.maxEntries = group.features?.cache?.maxEntries ?? 1000;
  cacheConfig.ttl = group.features?.cache?.ttl;
}

function resetForm() {
  Object.assign(form, {
    name: "",
    strategy: "round_robin",
    routes: [{ modelId: "" }],
    features: { tools: [], toolRoutingStrategy: undefined },
  });

  Object.assign(promptInject, {
    enableTimestamp: false,
    enableLunar: false,
    enableWeather: false,
    latitude: 39.9042,
    longitude: 116.4074,
  });

  truncationEnabled.value = false;
  cacheEnabled.value = false;
  cacheConfig.maxEntries = 1000;
  cacheConfig.ttl = undefined;
}

function addRoute() {
  form.routes.push({ modelId: "" });
}

function removeRoute(idx: number) {
  form.routes.splice(idx, 1);
}

/**
 * 上移路由
 * @param idx 路由索引
 */
function moveRouteUp(idx: number) {
  if (idx <= 0) return;
  const temp = form.routes[idx];
  form.routes[idx] = form.routes[idx - 1];
  form.routes[idx - 1] = temp;
}

/**
 * 下移路由
 * @param idx 路由索引
 */
function moveRouteDown(idx: number) {
  if (idx >= form.routes.length - 1) return;
  const temp = form.routes[idx];
  form.routes[idx] = form.routes[idx + 1];
  form.routes[idx + 1] = temp;
}

async function handleSubmit() {
  await formRef.value?.validate();

  const validRoutes = form.routes.filter((r) => r.modelId);
  if (validRoutes.length === 0) {
    ElMessage.warning("请至少添加一个有效路由");
    return;
  }

  submitting.value = true;
  try {
    const features = buildFeatures();
    const config: GroupConfig = {
      name: form.name,
      strategy: form.strategy,
      routes: validRoutes.map((r) => ({
        modelId: r.modelId,
        ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
        ...(r.weight !== undefined && r.weight > 0 ? { weight: r.weight } : {}),
      })),
      ...(Object.keys(features).length > 0 ? { features } : {}),
    };

    if (props.editingGroup) {
      await updateGroup(form.name, config);
    } else {
      await addGroup(config);
    }

    ElMessage.success(props.editingGroup ? "更新成功" : "添加成功");
    emit("update:visible", false);
    emit("submitted");
  } finally {
    submitting.value = false;
  }
}

function buildFeatures(): GroupFeatureConfig {
  const features: GroupFeatureConfig = {};

  if (form.features.tools && form.features.tools.length > 0) {
    features.tools = form.features.tools;
    if (form.features.toolRoutingStrategy) {
      features.toolRoutingStrategy = form.features.toolRoutingStrategy;
    }
  }

  if (
    promptInject.enableTimestamp ||
    promptInject.enableLunar ||
    promptInject.enableWeather
  ) {
    features.promptInject = {
      enableTimestamp: promptInject.enableTimestamp,
      enableLunar: promptInject.enableLunar,
      enableWeather: promptInject.enableWeather,
    };
    if (promptInject.enableWeather) {
      features.promptInject.weather = {
        provider: "open-meteo",
        latitude: promptInject.latitude,
        longitude: promptInject.longitude,
      };
    }
  }

  if (truncationEnabled.value) {
    features.truncation = { enable: true };
  }

  // 添加缓存配置
  if (cacheEnabled.value) {
    features.cache = {
      enable: true,
      ...(cacheConfig.maxEntries ? { maxEntries: cacheConfig.maxEntries } : {}),
      ...(cacheConfig.ttl ? { ttl: cacheConfig.ttl } : {}),
    };
  }

  return features;
}
</script>

<style scoped>
.routes-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-header {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.config-header .el-tag {
  margin-right: 6px;
}

.route-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sort-buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sort-buttons .el-button {
  width: 24px;
  height: 24px;
  padding: 0;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
  display: flex;
  align-items: flex-start;
  gap: 4px;
  line-height: 1.4;
}

.form-hint code {
  background: var(--border-color);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  color: var(--primary-color);
}

.help-icon {
  font-size: 14px;
  color: var(--primary-color);
  cursor: help;
  flex-shrink: 0;
  margin-top: 2px;
}

.divider-text {
  font-size: 13px;
  color: var(--text-muted);
}

.option-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-weight: 500;
  color: var(--text-color);
}

.option-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.prompt-collapse {
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  width: 100%;
}

.prompt-collapse :deep(.el-collapse-item__header) {
  background: var(--border-light);
  padding: 0 16px;
  font-size: 13px;
}

.prompt-config {
  padding: 12px;
}

.switch-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.location-input {
  display: flex;
  gap: 12px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .route-row {
    flex-wrap: wrap;
  }

  .sort-buttons {
    flex-direction: row;
    order: -1;
    width: 100%;
    justify-content: flex-end;
  }

  .route-row .el-tag {
    order: -1;
  }

  .route-row .el-select {
    width: 100% !important;
    min-width: unset !important;
  }

  .route-row .el-input-number {
    width: calc(50% - 4px) !important;
    min-width: unset !important;
  }

  .route-row .el-button:last-child {
    width: 100%;
    margin-top: 8px;
  }

  .location-input {
    flex-direction: column;
    gap: 8px;
  }

  .location-input .el-input-number {
    width: 100% !important;
  }

  :deep(.el-form-item__label) {
    width: 80px !important;
  }

  :deep(.el-form-item__content) {
    flex-wrap: wrap;
  }
}
</style>