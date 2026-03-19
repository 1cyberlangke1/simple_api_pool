<template>
  <el-dialog
    :model-value="visible"
    :title="editIndex === -1 ? '添加 MCP 工具' : '编辑 MCP 工具'"
    :width="dialogWidth"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form :model="form" label-width="100px">
      <el-form-item label="名称">
        <el-input v-model="form.name" placeholder="工具名称，如 weather" />
      </el-form-item>

      <el-form-item label="传输方式">
        <el-radio-group v-model="form.transport">
          <el-radio label="stdio">Stdio</el-radio>
          <el-radio label="sse">SSE</el-radio>
          <el-radio label="http">HTTP</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- Stdio 配置 -->
      <template v-if="form.transport === 'stdio'">
        <el-form-item label="命令">
          <el-input v-model="form.command" placeholder="node / python / npx" />
        </el-form-item>
        <el-form-item label="参数">
          <el-select
            v-model="form.args"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="添加命令行参数"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="环境变量">
          <el-input
            v-model="form.envStr"
            type="textarea"
            :rows="3"
            placeholder="KEY=value&#10;API_KEY=xxx"
          />
          <div class="form-hint">每行一个环境变量，格式: KEY=value</div>
        </el-form-item>
        <el-form-item label="工作目录">
          <el-input v-model="form.cwd" placeholder="留空使用当前目录" />
        </el-form-item>
      </template>

      <!-- SSE 配置 -->
      <template v-if="form.transport === 'sse'">
        <el-form-item label="SSE 端点">
          <el-input v-model="form.endpoint" placeholder="https://example.com/sse" />
        </el-form-item>
        <el-form-item label="请求头">
          <el-input
            v-model="form.headersStr"
            type="textarea"
            :rows="2"
            placeholder="Authorization: Bearer xxx"
          />
          <div class="form-hint">每行一个请求头，格式: Header-Name: value</div>
        </el-form-item>
        <el-form-item label="重连间隔">
          <el-input-number v-model="form.reconnectInterval" :min="1000" :step="1000" />
          <span class="form-hint" style="margin-left: 8px">毫秒</span>
        </el-form-item>
      </template>

      <!-- HTTP 配置 -->
      <template v-if="form.transport === 'http'">
        <el-form-item label="HTTP 端点">
          <el-input v-model="form.endpoint" placeholder="https://example.com/api" />
        </el-form-item>
        <el-form-item label="请求头">
          <el-input
            v-model="form.headersStr"
            type="textarea"
            :rows="2"
            placeholder="Authorization: Bearer xxx"
          />
        </el-form-item>
        <el-form-item label="超时时间">
          <el-input-number v-model="form.timeout" :min="1000" :step="1000" />
          <span class="form-hint" style="margin-left: 8px">毫秒</span>
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * MCP 工具编辑对话框
 * @description 添加和编辑 MCP 工具配置
 */
import { reactive, watch, computed } from "vue";
import { ElMessage } from "element-plus";
import {
  type McpStdioConfig,
  type McpSseConfig,
  type McpHttpConfig,
} from "@/api/types";

interface Props {
  visible: boolean;
  editIndex: number;
  tool: McpStdioConfig | McpSseConfig | McpHttpConfig | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:visible", value: boolean): void;
  (e: "save", tool: McpStdioConfig | McpSseConfig | McpHttpConfig): void;
}>();

const form = reactive({
  name: "",
  transport: "stdio" as "stdio" | "sse" | "http",
  command: "",
  args: [] as string[],
  envStr: "",
  cwd: "",
  endpoint: "",
  headersStr: "",
  reconnectInterval: 5000,
  timeout: 30000,
});

/**
 * 响应式对话框宽度
 * @returns 根据屏幕宽度返回合适的对话框宽度
 */
const dialogWidth = computed(() => {
  if (typeof window === "undefined") return "600px";
  return window.innerWidth < 768 ? "95%" : "600px";
});

watch(
  () => props.tool,
  (tool) => {
    if (tool) {
      loadToolData(tool);
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

function loadToolData(tool: McpStdioConfig | McpSseConfig | McpHttpConfig) {
  form.name = tool.name;
  form.transport = tool.transport;

  if (tool.transport === "stdio") {
    form.command = tool.command;
    form.args = tool.args ?? [];
    form.envStr = tool.env
      ? Object.entries(tool.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : "";
    form.cwd = tool.cwd ?? "";
  } else if (tool.transport === "sse") {
    form.endpoint = tool.endpoint;
    form.headersStr = tool.headers
      ? Object.entries(tool.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : "";
    form.reconnectInterval = tool.reconnectInterval ?? 5000;
  } else {
    form.endpoint = tool.endpoint;
    form.headersStr = tool.headers
      ? Object.entries(tool.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : "";
    form.timeout = tool.timeout ?? 30000;
  }
}

function resetForm() {
  form.name = "";
  form.transport = "stdio";
  form.command = "";
  form.args = [];
  form.envStr = "";
  form.cwd = "";
  form.endpoint = "";
  form.headersStr = "";
  form.reconnectInterval = 5000;
  form.timeout = 30000;
}

function parseKeyValueString(
  str: string,
  separator: ":" | "="
): Record<string, string> | undefined {
  if (!str.trim()) return undefined;
  const result: Record<string, string> = {};
  const pattern =
    separator === ":" ? /^([^:]+):\s*(.+)$/ : /^([^=]+)=(.*)$/;
  for (const line of str.split("\n")) {
    const match = line.match(pattern);
    if (match) {
      result[match[1].trim()] = match[2].trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function handleSave() {
  if (!form.name.trim()) {
    ElMessage.warning("请输入工具名称");
    return;
  }

  let tool: McpStdioConfig | McpSseConfig | McpHttpConfig;

  if (form.transport === "stdio") {
    if (!form.command.trim()) {
      ElMessage.warning("请输入命令");
      return;
    }
    tool = {
      type: "mcp",
      name: form.name,
      transport: "stdio",
      command: form.command,
      args: form.args.length > 0 ? form.args : undefined,
      env: parseKeyValueString(form.envStr, "="),
      cwd: form.cwd || undefined,
    };
  } else if (form.transport === "sse") {
    if (!form.endpoint.trim()) {
      ElMessage.warning("请输入 SSE 端点");
      return;
    }
    tool = {
      type: "mcp",
      name: form.name,
      transport: "sse",
      endpoint: form.endpoint,
      headers: parseKeyValueString(form.headersStr, ":"),
      reconnectInterval: form.reconnectInterval,
    };
  } else {
    if (!form.endpoint.trim()) {
      ElMessage.warning("请输入 HTTP 端点");
      return;
    }
    tool = {
      type: "mcp",
      name: form.name,
      transport: "http",
      endpoint: form.endpoint,
      headers: parseKeyValueString(form.headersStr, ":"),
      timeout: form.timeout,
    };
  }

  emit("save", tool);
  emit("update:visible", false);
}
</script>

<style scoped>
.form-hint {
  margin-top: 4px;
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
