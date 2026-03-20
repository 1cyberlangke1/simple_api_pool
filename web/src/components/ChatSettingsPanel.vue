<template>
  <el-card class="settings-card">
    <template #header>
      <div class="card-header">
        <span>请求设置</span>
        <el-button text size="small" @click="showJsonEditor = !showJsonEditor">
          {{ showJsonEditor ? "隐藏" : "显示" }} JSON
        </el-button>
      </div>
    </template>

    <!-- 标准参数设置 -->
    <el-collapse v-model="activeCollapse">
      <!-- 基础参数 -->
      <el-collapse-item title="基础参数" name="basic">
        <div class="param-group">
          <!-- Temperature -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.temperature.enabled" label="temperature" />
            <el-slider
              v-model="settings.params.temperature.value"
              :min="0"
              :max="2"
              :step="0.1"
              :disabled="!settings.params.temperature.enabled"
              show-input
              class="param-slider"
            />
          </div>

          <!-- Max Tokens -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.max_tokens.enabled" label="max_tokens" />
            <el-input-number
              v-model="settings.params.max_tokens.value"
              :min="1"
              :max="128000"
              :disabled="!settings.params.max_tokens.enabled"
              class="param-input"
            />
          </div>

          <!-- Top P -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.top_p.enabled" label="top_p" />
            <el-slider
              v-model="settings.params.top_p.value"
              :min="0"
              :max="1"
              :step="0.1"
              :disabled="!settings.params.top_p.enabled"
              show-input
              class="param-slider"
            />
          </div>
        </div>
      </el-collapse-item>

      <!-- 高级参数 -->
      <el-collapse-item title="高级参数" name="advanced">
        <div class="param-group">
          <!-- Frequency Penalty -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.frequency_penalty.enabled" label="frequency_penalty" />
            <el-slider
              v-model="settings.params.frequency_penalty.value"
              :min="-2"
              :max="2"
              :step="0.1"
              :disabled="!settings.params.frequency_penalty.enabled"
              show-input
              class="param-slider"
            />
          </div>

          <!-- Presence Penalty -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.presence_penalty.enabled" label="presence_penalty" />
            <el-slider
              v-model="settings.params.presence_penalty.value"
              :min="-2"
              :max="2"
              :step="0.1"
              :disabled="!settings.params.presence_penalty.enabled"
              show-input
              class="param-slider"
            />
          </div>

          <!-- Stop Sequences -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.stop.enabled" label="stop" />
            <el-select
              v-model="settings.params.stop.value"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="输入停止序列"
              :disabled="!settings.params.stop.enabled"
              class="param-input"
            />
          </div>

          <!-- N -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.n.enabled" label="n" />
            <el-input-number
              v-model="settings.params.n.value"
              :min="1"
              :max="10"
              :disabled="!settings.params.n.enabled"
              class="param-input"
            />
          </div>

          <!-- Seed -->
          <div class="param-row">
            <el-checkbox v-model="settings.params.seed.enabled" label="seed" />
            <el-input-number
              v-model="settings.params.seed.value"
              :min="0"
              :disabled="!settings.params.seed.enabled"
              class="param-input"
            />
          </div>
        </div>
      </el-collapse-item>

      <!-- 工具 -->
      <el-collapse-item title="工具" name="tools">
        <el-select
          v-model="settings.tools"
          multiple
          placeholder="选择工具"
          style="width: 100%"
        >
          <el-option
            v-for="tool in availableTools"
            :key="tool.name"
            :label="tool.name"
            :value="tool.name"
          >
            <span>{{ tool.name }}</span>
            <span class="tool-desc">{{ tool.description?.slice(0, 30) }}</span>
          </el-option>
        </el-select>
      </el-collapse-item>

      <!-- 自定义参数 -->
      <el-collapse-item title="自定义参数" name="custom">
        <div class="custom-params">
          <div v-for="(param, index) in settings.customParams" :key="index" class="custom-param-row">
            <el-checkbox v-model="param.enabled" />
            <el-input v-model="param.key" placeholder="参数名" class="custom-key" />
            <el-input v-model="param.value" placeholder="参数值 (JSON)" class="custom-value" @blur="parseCustomValue(index)" />
            <el-button type="danger" text @click="removeCustomParam(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button type="primary" text @click="addCustomParam">
            <el-icon><Plus /></el-icon>
            添加参数
          </el-button>
        </div>
      </el-collapse-item>

      <!-- 额外请求体 -->
      <el-collapse-item title="额外请求体 (extra_body)" name="extraBody">
        <div class="extra-body-section">
          <p class="extra-body-hint">用于传递给上游的特殊参数，如 DeepSeek 的 reasoning_effort</p>
          <el-input
            v-model="extraBodyJson"
            type="textarea"
            :rows="5"
            placeholder='{"reasoning_effort": "high"}'
            @blur="parseExtraBody"
          />
          <div v-if="extraBodyError" class="json-error">{{ extraBodyError }}</div>
        </div>
      </el-collapse-item>
    </el-collapse>

    <!-- JSON 编辑器（消息） -->
    <el-collapse-transition>
      <div v-show="showJsonEditor" class="json-editor">
        <div class="json-header">
          <span>Messages JSON</span>
          <el-button size="small" @click="formatJson">格式化</el-button>
        </div>
        <el-input
          v-model="messagesJson"
          type="textarea"
          :rows="10"
          placeholder="手动编辑消息数组"
          @blur="parseMessagesJson"
        />
        <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<script setup lang="ts">
/**
 * 聊天设置面板
 * @description 管理请求参数和 JSON 编辑
 */
import { ref, reactive, watch } from "vue";
import { Delete, Plus } from "@element-plus/icons-vue";
import type { Message, ToolInfo, ChatSettings } from "./types";
import { createDefaultSettings } from "./types";

interface Props {
  messages: Message[];
  availableTools: ToolInfo[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:messages", value: Message[]): void;
}>();

const showJsonEditor = ref(false);
const messagesJson = ref("");
const jsonError = ref("");
const extraBodyJson = ref("{}");
const extraBodyError = ref("");
const activeCollapse = ref(["basic"]);

const settings = reactive<ChatSettings>(createDefaultSettings());

/**
 * 构建请求体参数
 * @description 根据 settings 构建实际发送的参数对象
 */
function buildRequestParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // 处理标准参数
  const paramMap: Record<keyof typeof settings.params, string> = {
    temperature: "temperature",
    max_tokens: "max_tokens",
    top_p: "top_p",
    frequency_penalty: "frequency_penalty",
    presence_penalty: "presence_penalty",
    stop: "stop",
    n: "n",
    seed: "seed",
    response_format: "response_format",
  };

  for (const [key, fieldName] of Object.entries(paramMap)) {
    const config = settings.params[key as keyof typeof settings.params];
    if (config.enabled) {
      params[fieldName] = config.value;
    }
  }

  // 处理自定义参数
  for (const param of settings.customParams) {
    if (param.enabled && param.key) {
      params[param.key] = param.value;
    }
  }

  // 处理工具
  if (settings.tools.length > 0) {
    params.tools = settings.tools.map((name) => ({
      type: "function",
      function: { name },
    }));
  }

  return params;
}

/**
 * 获取额外请求体
 */
function getExtraBody(): Record<string, unknown> {
  return { ...settings.extraBody };
}

/**
 * 添加自定义参数
 */
function addCustomParam() {
  settings.customParams.push({
    key: "",
    value: "",
    enabled: true,
  });
}

/**
 * 移除自定义参数
 */
function removeCustomParam(index: number) {
  settings.customParams.splice(index, 1);
}

/**
 * 解析自定义参数值（JSON）
 */
function parseCustomValue(index: number) {
  const param = settings.customParams[index];
  if (typeof param.value === "string" && param.value.trim()) {
    try {
      param.value = JSON.parse(param.value);
    } catch {
      // 保持原值
    }
  }
}

/**
 * 解析额外请求体
 */
function parseExtraBody() {
  if (!extraBodyJson.value.trim()) {
    settings.extraBody = {};
    extraBodyError.value = "";
    return;
  }

  try {
    settings.extraBody = JSON.parse(extraBodyJson.value);
    extraBodyError.value = "";
  } catch {
    extraBodyError.value = "JSON 格式错误";
  }
}

/**
 * 格式化 JSON
 */
function formatJson() {
  try {
    const parsed = JSON.parse(messagesJson.value);
    messagesJson.value = JSON.stringify(parsed, null, 2);
    jsonError.value = "";
  } catch {
    jsonError.value = "JSON 格式错误";
  }
}

/**
 * 解析消息 JSON
 */
function parseMessagesJson() {
  if (!messagesJson.value.trim()) return;

  try {
    const parsed = JSON.parse(messagesJson.value);
    if (Array.isArray(parsed)) {
      emit("update:messages", parsed);
      jsonError.value = "";
    } else {
      jsonError.value = "必须是消息数组";
    }
  } catch {
    jsonError.value = "JSON 格式错误";
  }
}

// 同步 messages 到 JSON 编辑器
watch(
  () => props.messages,
  () => {
    messagesJson.value = JSON.stringify(props.messages, null, 2);
  },
  { deep: true, immediate: true }
);

// 同步 extraBody 到编辑器
watch(
  () => settings.extraBody,
  () => {
    extraBodyJson.value = JSON.stringify(settings.extraBody, null, 2);
  },
  { deep: true }
);

// 暴露设置和方法给父组件
defineExpose({
  settings,
  buildRequestParams,
  getExtraBody,
});
</script>

<style scoped>
.settings-card {
  max-height: 400px;
  display: flex;
  flex-direction: column;
}

.settings-card :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.param-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.param-row :deep(.el-checkbox) {
  min-width: 140px;
  margin-right: 0;
}

.param-slider {
  flex: 1;
}

.param-input {
  flex: 1;
}

.tool-desc {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: color 0.3s;
}

.custom-params {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-param-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.custom-key {
  width: 120px;
}

.custom-value {
  flex: 1;
}

.extra-body-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.extra-body-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.json-editor {
  margin-top: 12px;
}

.json-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 500;
}

.json-error {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 4px;
}

:deep(.el-collapse-item__header) {
  font-weight: 500;
}

/* 移动端响应式 */
@media (max-width: 768px) {
  .param-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .param-row :deep(.el-checkbox) {
    min-width: auto;
    width: 100%;
  }

  .param-slider,
  .param-input {
    width: 100%;
  }

  .custom-param-row {
    flex-wrap: wrap;
  }

  .custom-key {
    width: 100%;
  }
}
</style>