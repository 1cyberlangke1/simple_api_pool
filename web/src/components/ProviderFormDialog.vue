<template>
  <el-dialog
    :model-value="visible"
    :title="editingProvider ? '编辑提供商' : '新增提供商'"
    :width="dialogWidth"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <!-- 基本信息提示 -->
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #title>
          <span>提供商是 API 服务的来源平台，如 OpenAI、Claude、Gemini 等</span>
        </template>
      </el-alert>

      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="给提供商起个名字，如 openai、claude"
          :disabled="!!editingProvider"
        />
        <div class="form-hint">建议使用简洁的英文名称，方便后续配置引用</div>
      </el-form-item>
      <el-form-item label="Base URL" prop="baseUrl">
        <el-input v-model="form.baseUrl" placeholder="API 地址，如 https://api.openai.com/v1" />
        <div class="form-hint">
          这是提供商的 API 接口地址，通常以 <code>/v1</code> 结尾
          <el-tooltip content="从提供商的开发者文档中获取此地址" placement="top">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
      </el-form-item>

      <!-- 高级设置折叠面板 -->
      <el-divider content-position="left">
        <span class="divider-text">高级设置（可选）</span>
      </el-divider>

      <el-form-item label="流式模式" prop="streamMode">
        <el-select v-model="form.streamMode" style="width: 100%">
          <el-option label="保持原样（推荐）" value="none">
            <div class="option-detail">
              <span class="option-label">保持原样</span>
              <span class="option-desc">不转换，客户端请求什么就返回什么</span>
            </div>
          </el-option>
          <el-option label="模拟流式输出" value="fake_stream">
            <div class="option-detail">
              <span class="option-label">模拟流式输出</span>
              <span class="option-desc">供应商不支持流式时，将结果分段返回</span>
            </div>
          </el-option>
          <el-option label="等待完整响应" value="fake_non_stream">
            <div class="option-detail">
              <span class="option-label">等待完整响应</span>
              <span class="option-desc">供应商只支持流式时，等待完成后一次性返回</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-hint">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
          大多数情况下选择"保持原样"即可
        </div>
      </el-form-item>
      <el-form-item label="轮询策略" prop="strategy">
        <el-select v-model="form.strategy" style="width: 100%">
          <el-option label="轮流使用" value="round_robin">
            <div class="option-detail">
              <span class="option-label">轮流使用</span>
              <span class="option-desc">按顺序依次使用每个 Key，平均分配请求</span>
            </div>
          </el-option>
          <el-option label="用完再换" value="exhaust">
            <div class="option-detail">
              <span class="option-label">用完再换</span>
              <span class="option-desc">一个 Key 用完配额后再换下一个</span>
            </div>
          </el-option>
          <el-option label="随机选择" value="random">
            <div class="option-detail">
              <span class="option-label">随机选择</span>
              <span class="option-desc">每次请求随机选一个 Key</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-hint">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
          当有多个 Key 时，如何选择使用哪一个
        </div>
      </el-form-item>
      <el-form-item label="RPM 限制">
        <el-input-number
          v-model="form.rpmLimit"
          :min="0"
          placeholder="0 表示无限制"
          style="width: 100%"
        />
        <div class="form-hint">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
          每分钟最大请求数（Requests Per Minute），0 表示不限制。设置后可避免触发平台限流
        </div>
      </el-form-item>
      <el-form-item label="超时时间">
        <el-input-number
          v-model="form.timeoutMs"
          :min="5000"
          :step="5000"
          style="width: 100%"
        >
          <template #append>毫秒</template>
        </el-input-number>
        <div class="form-hint">
          请求超时时间，建议 30-120 秒。复杂任务可能需要更长等待时间
        </div>
      </el-form-item>
      <el-form-item label="重置时间">
        <el-select v-model="form.resetTime" placeholder="选择重置时间" style="width: 100%">
          <el-option
            v-for="time in resetTimeOptions"
            :key="time"
            :label="time"
            :value="time"
          />
        </el-select>
        <div class="form-hint">
          <el-icon class="help-icon"><QuestionFilled /></el-icon>
          每日配额重置时间，默认午夜 00:00。某些平台可能在其他时间重置
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ editingProvider ? "保存" : "添加" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 提供商表单对话框
 * @description 创建和编辑提供商配置
 */
import { ref, reactive, watch, computed } from "vue";
import { ElMessage } from "element-plus";
import { QuestionFilled } from "@element-plus/icons-vue";
import {
  addProvider,
  updateProvider,
  type ProviderConfig,
  type StreamMode,
} from "@/api/types";

interface Props {
  visible: boolean;
  editingProvider: ProviderConfig | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "submitted"): void;
}>();

const submitting = ref(false);
const formRef = ref();

const form = reactive({
  name: "",
  baseUrl: "",
  streamMode: "none" as StreamMode,
  strategy: "round_robin" as "exhaust" | "round_robin" | "random",
  rpmLimit: 0,
  timeoutMs: 90000,
  resetTime: "00:00",
});

const resetTimeOptions = (() => {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    options.push(`${h.toString().padStart(2, "0")}:00`);
    options.push(`${h.toString().padStart(2, "0")}:30`);
  }
  return options;
})();

const rules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  baseUrl: [{ required: true, message: "请输入 Base URL", trigger: "blur" }],
};

/**
 * 响应式对话框宽度
 * @returns 根据屏幕宽度返回合适的对话框宽度
 */
const dialogWidth = computed(() => {
  if (typeof window === "undefined") return "600px";
  return window.innerWidth < 768 ? "95%" : "600px";
});

watch(
  () => props.editingProvider,
  (provider) => {
    if (provider) {
      Object.assign(form, {
        name: provider.name,
        baseUrl: provider.baseUrl,
        streamMode: provider.streamMode || "none",
        strategy: provider.strategy || "round_robin",
        rpmLimit: provider.rpmLimit || 0,
        timeoutMs: provider.timeoutMs || 90000,
        resetTime: provider.resetTime || "00:00",
      });
    } else {
      Object.assign(form, {
        name: "",
        baseUrl: "",
        streamMode: "none",
        strategy: "round_robin",
        rpmLimit: 0,
        timeoutMs: 90000,
        resetTime: "00:00",
      });
    }
  },
  { immediate: true }
);

async function handleSubmit() {
  await formRef.value?.validate();

  submitting.value = true;
  try {
    const config: ProviderConfig = {
      name: form.name,
      baseUrl: form.baseUrl,
      streamMode: form.streamMode === "none" ? undefined : form.streamMode,
      strategy: form.strategy,
      rpmLimit: form.rpmLimit || undefined,
      timeoutMs: form.timeoutMs || undefined,
      resetTime: form.resetTime === "00:00" ? undefined : form.resetTime,
    };

    if (props.editingProvider) {
      await updateProvider(form.name, config);
    } else {
      await addProvider(config);
    }

    ElMessage.success(props.editingProvider ? "更新成功" : "添加成功");
    emit("update:visible", false);
    emit("submitted");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
  line-height: 1.4;
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.form-hint code {
  background: var(--border-color);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.divider-text {
  font-size: 13px;
  color: var(--text-muted);
}

.help-icon {
  font-size: 14px;
  color: var(--primary-color);
  cursor: help;
  flex-shrink: 0;
  margin-top: 2px;
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

/* 移动端适配 */
@media (max-width: 768px) {
  :deep(.el-form-item__label) {
    width: 80px !important;
  }
}
</style>
