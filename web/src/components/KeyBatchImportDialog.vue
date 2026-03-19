<template>
  <el-dialog
    :model-value="visible"
    title="批量导入 Key"
    width="600px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-form-item label="提供商" prop="provider">
        <el-select v-model="form.provider" placeholder="选择提供商" style="width: 100%">
          <el-option
            v-for="p in providers"
            :key="p.name"
            :label="p.name"
            :value="p.name"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Key 列表" prop="keys">
        <el-input
          v-model="form.keys"
          type="textarea"
          :rows="8"
          placeholder="输入多个 Key，每行一个或使用自定义分隔符"
        />
      </el-form-item>
      <el-form-item label="分隔符">
        <el-input v-model="form.delimiter" placeholder="默认为换行符">
          <template #append>
            <el-button @click="form.delimiter = '\n'">换行</el-button>
          </template>
        </el-input>
        <div class="form-hint">常用分隔符：换行符、逗号、空格、分号等</div>
      </el-form-item>
      <el-form-item label="配额类型" prop="quotaType">
        <el-select v-model="form.quotaType" style="width: 100%">
          <el-option label="无限配额" value="infinite" />
          <el-option label="每日限制" value="daily" />
          <el-option label="总金额" value="total" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="form.quotaType !== 'infinite'" label="配额限制" prop="quotaLimit">
        <el-input-number v-model="form.quotaLimit" :min="1" style="width: 100%" />
      </el-form-item>
      <el-form-item label="预览">
        <div class="preview-box">
          <span>共 {{ previewKeyCount }} 个 Key</span>
          <div v-if="previewKeys.length > 0" class="preview-list">
            <el-tag
              v-for="(k, i) in previewKeys.slice(0, 5)"
              :key="i"
              size="small"
              class="preview-tag"
            >
              {{ k }}
            </el-tag>
            <span v-if="previewKeys.length > 5" class="more-hint">
              ... 等 {{ previewKeys.length }} 个
            </span>
          </div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleImport" :loading="submitting">
        导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * Key 批量导入对话框
 * @description 批量导入 API Key
 */
import { ref, reactive, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import { batchImportKeys, type ProviderConfig } from "@/api/types";

interface Props {
  visible: boolean;
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
  provider: "",
  keys: "",
  delimiter: "\n",
  quotaType: "infinite" as "infinite" | "daily" | "total",
  quotaLimit: 100,
});

const rules = {
  provider: [{ required: true, message: "请选择提供商", trigger: "change" }],
  keys: [{ required: true, message: "请输入 Key 列表", trigger: "blur" }],
};

const previewKeys = computed(() => {
  if (!form.keys) return [];
  const delimiter = form.delimiter || "\n";
  return form.keys
    .split(delimiter)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
});

const previewKeyCount = computed(() => previewKeys.value.length);

watch(
  () => props.visible,
  (val) => {
    if (!val) {
      resetForm();
    }
  }
);

function resetForm() {
  Object.assign(form, {
    provider: "",
    keys: "",
    delimiter: "\n",
    quotaType: "infinite",
    quotaLimit: 100,
  });
}

async function handleImport() {
  await formRef.value?.validate();

  if (previewKeyCount.value === 0) {
    ElMessage.warning("没有有效的 Key");
    return;
  }

  submitting.value = true;
  try {
    const { data } = await batchImportKeys({
      provider: form.provider,
      keys: form.keys,
      delimiter: form.delimiter,
      quotaType: form.quotaType,
      quotaLimit: form.quotaLimit,
    });

    ElMessage.success(`成功导入 ${data.success}/${data.total} 个 Key`);
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
}

.preview-box {
  background: var(--border-light);
  padding: 12px;
  border-radius: 4px;
  width: 100%;
}

.preview-list {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.preview-tag {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.more-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 4px;
}
</style>
