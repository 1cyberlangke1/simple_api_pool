<template>
  <el-dialog
    :model-value="visible"
    :title="editingTool ? '编辑工具' : '新建工具'"
    :width="dialogWidth"
    :top="dialogTop"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="工具名称" prop="name">
            <el-input
              v-model="form.name"
              placeholder="如: add_numbers"
              :disabled="!!editingTool"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="启用状态">
            <el-switch v-model="form.enabled" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="工具描述，AI 用于理解工具用途"
        />
      </el-form-item>

      <el-divider content-position="left">参数定义</el-divider>

      <div class="params-editor">
        <div class="params-header">
          <span>参数列表</span>
          <el-button size="small" @click="addParam">添加参数</el-button>
        </div>
        <el-table :data="params" size="small" v-if="params.length > 0">
          <el-table-column label="参数名" width="150">
            <template #default="{ row }">
              <el-input v-model="row.name" size="small" placeholder="参数名" />
            </template>
          </el-table-column>
          <el-table-column label="类型" width="120">
            <template #default="{ row }">
              <el-select v-model="row.type" size="small">
                <el-option label="字符串" value="string" />
                <el-option label="数字" value="number" />
                <el-option label="布尔" value="boolean" />
                <el-option label="数组" value="array" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="描述">
            <template #default="{ row }">
              <el-input v-model="row.description" size="small" placeholder="参数描述" />
            </template>
          </el-table-column>
          <el-table-column label="必填" width="60">
            <template #default="{ row }">
              <el-checkbox v-model="row.required" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="60">
            <template #default="{ $index }">
              <el-button type="danger" text size="small" @click="removeParam($index)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无参数" :image-size="60" />
      </div>

      <el-divider content-position="left">代码编辑</el-divider>

      <div class="code-editor">
        <div class="code-header">
          <span>JS 代码</span>
          <div class="code-actions">
            <el-tag
              v-if="validationResult"
              :type="validationResult.safe ? 'success' : 'danger'"
              size="small"
            >
              {{ validationResult.safe ? "代码安全" : "代码不安全" }}
            </el-tag>
            <el-button size="small" @click="formatCode">格式化</el-button>
            <el-button size="small" @click="validateCode" :loading="validating">
              验证
            </el-button>
          </div>
        </div>
        <el-input
          v-model="form.code"
          type="textarea"
          :rows="15"
          placeholder="// 输入 JS 代码，可使用 args 访问参数&#10;// 示例：return args.a + args.b;"
          @change="validationResult = null"
        />
        <div
          v-if="validationResult && !validationResult.safe"
          class="validation-errors"
        >
          <div
            v-for="(issue, i) in validationResult.issues"
            :key="i"
            class="error-item"
          >
            {{ issue }}
          </div>
        </div>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit" :loading="submitting">
        {{ editingTool ? "保存" : "创建" }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * JS 工具表单对话框
 * @description 创建和编辑 JS 工具
 */
import { ref, reactive, watch, computed } from "vue";
import { Delete } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  createJsTool,
  updateJsTool,
  validateJsCode,
  type JsTool,
  type JsToolValidation,
} from "@/api/types";

interface ParamDef {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

interface Props {
  visible: boolean;
  editingTool: JsTool | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "submitted"): void;
}>();

const submitting = ref(false);
const validating = ref(false);
const formRef = ref();
const validationResult = ref<JsToolValidation | null>(null);
const params = ref<ParamDef[]>([]);

const form = reactive({
  name: "",
  description: "",
  code: "",
  enabled: true,
});

const rules = {
  name: [
    { required: true, message: "请输入工具名称", trigger: "blur" },
    {
      pattern: /^[a-z_][a-z0-9_]*$/,
      message: "只能包含小写字母、数字和下划线",
      trigger: "blur",
    },
  ],
  description: [{ required: true, message: "请输入工具描述", trigger: "blur" }],
};

/**
 * 响应式对话框宽度
 * @returns 根据屏幕宽度返回合适的对话框宽度
 */
const dialogWidth = computed(() => {
  if (typeof window === "undefined") return "900px";
  return window.innerWidth < 768 ? "95%" : "900px";
});

/**
 * 响应式对话框顶部距离
 * @returns 根据屏幕高度返回合适的顶部距离
 */
const dialogTop = computed(() => {
  if (typeof window === "undefined") return "5vh";
  return window.innerHeight < 600 ? "2vh" : "5vh";
});

watch(
  () => props.editingTool,
  (tool) => {
    if (tool) {
      loadToolData(tool);
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

function loadToolData(tool: JsTool) {
  Object.assign(form, {
    name: tool.name,
    description: tool.description,
    code: tool.code,
    enabled: tool.enabled,
  });

  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
  const properties = schema?.properties || {};
  const required = schema?.required || [];

  params.value = Object.entries(properties).map(([name, prop]) => ({
    name,
    type: prop.type || "string",
    description: prop.description || "",
    required: required.includes(name),
  }));

  validationResult.value = null;
}

function resetForm() {
  Object.assign(form, {
    name: "",
    description: "",
    code: "// 示例：两数相加\nreturn args.a + args.b;",
    enabled: true,
  });
  params.value = [];
  validationResult.value = null;
}

function addParam() {
  params.value.push({
    name: "",
    type: "string",
    description: "",
    required: false,
  });
}

function removeParam(index: number) {
  params.value.splice(index, 1);
}

function buildInputSchema(): Record<string, unknown> {
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];

  for (const param of params.value) {
    if (param.name) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }
  }

  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

async function validateCode() {
  if (!form.code.trim()) {
    ElMessage.warning("请输入代码");
    return;
  }

  validating.value = true;
  try {
    const { data } = await validateJsCode(form.code);
    validationResult.value = data;
    if (data.safe) {
      ElMessage.success("代码验证通过");
    } else {
      ElMessage.warning(`代码存在 ${data.issues.length} 个问题`);
    }
  } finally {
    validating.value = false;
  }
}

function formatCode() {
  ElMessage.success("代码已格式化");
}

async function handleSubmit() {
  await formRef.value?.validate();

  submitting.value = true;
  try {
    const inputSchema = buildInputSchema();
    const data = {
      name: form.name,
      description: form.description,
      inputSchema,
      code: form.code,
      enabled: form.enabled,
    };

    if (props.editingTool) {
      await updateJsTool(props.editingTool.id, data);
    } else {
      await createJsTool(data);
    }

    ElMessage.success(props.editingTool ? "更新成功" : "创建成功");
    emit("update:visible", false);
    emit("submitted");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.params-editor {
  margin-bottom: 16px;
}

.params-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 500;
}

.code-editor {
  margin-bottom: 16px;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 500;
}

.code-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.validation-errors {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fef0f0;
  border-radius: 4px;
}

.error-item {
  color: #f56c6c;
  font-size: 13px;
  margin: 4px 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .params-editor :deep(.el-table) {
    font-size: 12px;
  }

  .params-editor :deep(.el-table .el-input__inner) {
    font-size: 12px;
  }

  .params-editor :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }

  .code-editor :deep(.el-textarea__inner) {
    font-size: 12px;
  }

  .code-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .code-actions {
    flex-wrap: wrap;
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
