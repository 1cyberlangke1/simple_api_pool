<template>
  <el-dialog
    :model-value="visible"
    :title="editingKey ? '编辑 Key' : '新增 Key'"
    width="550px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-form-item label="别名" prop="alias">
        <el-input
          v-model="form.alias"
          placeholder="给这个 Key 起个名字，方便识别"
          :disabled="!!editingKey"
        />
        <div class="form-hint">例如：openai-main、claude-backup</div>
      </el-form-item>
      <el-form-item label="提供商" prop="provider">
        <el-select v-model="form.provider" placeholder="选择这个 Key 属于哪个平台" style="width: 100%">
          <el-option
            v-for="p in providers"
            :key="p.name"
            :label="p.name"
            :value="p.name"
          />
        </el-select>
        <div class="form-hint">提供商是 API 服务的来源平台</div>
      </el-form-item>
      <el-form-item label="API Key" prop="key">
        <el-input v-model="form.key" placeholder="从平台获取的密钥，如 sk-xxx" show-password />
        <div class="form-hint">从提供商平台复制您的 API 密钥</div>
      </el-form-item>
      <el-form-item label="限定模型">
        <el-input v-model="form.model" placeholder="留空表示可用于所有模型" />
        <div class="form-hint">某些 Key 可能只能使用特定模型，可在此限制</div>
      </el-form-item>
      <el-form-item label="配额类型" prop="quotaType">
        <el-select v-model="form.quotaType" style="width: 100%">
          <el-option label="不限制" value="infinite">
            <div class="quota-option">
              <span class="quota-label">不限制</span>
              <span class="quota-desc">无使用上限</span>
            </div>
          </el-option>
          <el-option label="每日限制" value="daily">
            <div class="quota-option">
              <span class="quota-label">每日限制</span>
              <span class="quota-desc">每天最多调用次数，次日重置</span>
            </div>
          </el-option>
          <el-option label="总金额限制" value="total">
            <div class="quota-option">
              <span class="quota-label">总金额限制</span>
              <span class="quota-desc">累计消费不超过设定金额（美元）</span>
            </div>
          </el-option>
        </el-select>
        <div class="form-hint">
          <template v-if="form.quotaType === 'daily'">
            适合有每日调用限制的 Key，到达限制后当天不再使用
          </template>
          <template v-else-if="form.quotaType === 'total'">
            适合预付费或固定预算的 Key，超出金额后停止使用
          </template>
          <template v-else>
            不限制使用量，适合无限制或后付费的 Key
          </template>
        </div>
      </el-form-item>
      <el-form-item v-if="form.quotaType !== 'infinite'" label="配额限制" prop="quotaLimit">
        <el-input-number v-model="form.quotaLimit" :min="1" style="width: 100%">
          <template #append>{{ form.quotaType === 'daily' ? '次/天' : '美元' }}</template>
        </el-input-number>
        <div class="form-hint" v-if="form.quotaType === 'daily'">
          建议设置为平台每日限额的 80%-90%，预留缓冲空间
        </div>
        <div class="form-hint" v-else-if="form.quotaType === 'total'">
          当累计消费达到此金额时，该 Key 将停止使用
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ editingKey ? "保存" : "添加" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * Key 表单对话框
 * @description 创建和编辑 API Key
 */
import { ref, reactive, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  addKey,
  updateKey,
  type KeyState,
  type KeyConfig,
  type QuotaConfig,
  type ProviderConfig,
} from "@/api/types";

interface Props {
  visible: boolean;
  editingKey: KeyState | null;
  providers: ProviderConfig[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "submitted"): void;
}>();

const submitting = ref(false);
const formRef = ref();

const form = reactive({
  alias: "",
  provider: "",
  key: "",
  model: "",
  quotaType: "infinite" as "infinite" | "daily" | "total",
  quotaLimit: 100,
});

const rules = {
  alias: [{ required: true, message: "请输入别名", trigger: "blur" }],
  provider: [{ required: true, message: "请选择提供商", trigger: "change" }],
  key: [{ required: true, message: "请输入 API Key", trigger: "blur" }],
};

watch(
  () => props.editingKey,
  (key) => {
    if (key) {
      loadKeyData(key);
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

function loadKeyData(key: KeyState) {
  Object.assign(form, {
    alias: key.alias,
    provider: key.provider,
    key: key.key,
    model: key.model || "",
    quotaType: key.quota.type,
    quotaLimit: key.quota.limit || 100,
  });
}

function resetForm() {
  Object.assign(form, {
    alias: "",
    provider: "",
    key: "",
    model: "",
    quotaType: "infinite",
    quotaLimit: 100,
  });
}

async function handleSubmit() {
  await formRef.value?.validate();

  submitting.value = true;
  try {
    const quota: QuotaConfig =
      form.quotaType === "infinite"
        ? { type: "infinite" }
        : { type: form.quotaType, limit: form.quotaLimit };

    const config: KeyConfig = {
      alias: form.alias,
      provider: form.provider,
      key: form.key,
      model: form.model || undefined,
      quota,
    };

    if (props.editingKey) {
      await updateKey(form.alias, config);
    } else {
      await addKey(config);
    }

    ElMessage.success(props.editingKey ? "更新成功" : "添加成功");
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
}

.quota-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.quota-label {
  font-weight: 500;
  color: var(--text-color);
}

.quota-desc {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
