<template>
  <div class="config-view">
    <!-- 服务端点信息卡片 -->
    <el-card class="endpoint-card">
      <template #header>
        <div class="card-header">
          <span>API 服务端点</span>
          <el-button type="primary" text @click="copyEndpoint">
            <el-icon><DocumentCopy /></el-icon>
            复制端点地址
          </el-button>
        </div>
      </template>

      <el-alert
        type="success"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #title>
          <span>以下是对外提供的 OpenAI 兼容 API 端点，可直接用于任何支持 OpenAI API 的客户端</span>
        </template>
      </el-alert>

      <el-descriptions :column="1" border>
        <el-descriptions-item label="API 端点">
          <div class="endpoint-info">
            <code class="endpoint-url">{{ apiEndpoint }}</code>
            <el-button size="small" text @click="copyEndpoint">
              <el-icon><DocumentCopy /></el-icon>
            </el-button>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="认证方式">
          <span>无需认证（OpenAI 兼容接口）</span>
        </el-descriptions-item>
        <el-descriptions-item label="可用分组">
          <div class="group-tags">
            <el-tag
              v-for="group in availableGroups"
              :key="group"
              type="success"
              class="group-tag"
            >
              {{ group }}
            </el-tag>
            <span v-if="availableGroups.length === 0" class="text-muted">
              暂无分组，请先创建分组
            </span>
          </div>
        </el-descriptions-item>
      </el-descriptions>

      <el-collapse style="margin-top: 16px">
        <el-collapse-item title="使用示例" name="example">
          <div class="example-section">
            <h4>cURL</h4>
            <pre class="code-block">curl {{ apiEndpoint }} \
  -H "Content-Type: application/json" \
  -d '{
    "model": "group/{{ availableGroups[0] || 'your-group' }}",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'</pre>

            <h4>Python (OpenAI SDK)</h4>
            <pre class="code-block">from openai import OpenAI

client = OpenAI(
    base_url="{{ apiBaseUrl }}",
    api_key="not-needed"  # 本服务无需 API Key
)

response = client.chat.completions.create(
    model="group/{{ availableGroups[0] || 'your-group' }}",
    messages=[{"role": "user", "content": "你好"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")</pre>

            <h4>JavaScript / TypeScript</h4>
            <pre class="code-block">const response = await fetch("{{ apiEndpoint }}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "group/{{ availableGroups[0] || 'your-group' }}",
    messages: [{ role: "user", content: "你好" }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}</pre>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header">
          <span>高级配置</span>
          <el-button type="primary" @click="saveConfig" :loading="saving">
            <el-icon><Check /></el-icon>
            保存配置
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="服务器设置" name="server">
          <el-form label-width="120px">
            <el-form-item label="监听地址">
              <el-radio-group v-model="config.server.host">
                <el-radio-button label="127.0.0.1">
                  本地 (127.0.0.1)
                </el-radio-button>
                <el-radio-button label="0.0.0.0">
                  所有网卡 (0.0.0.0)
                </el-radio-button>
              </el-radio-group>
              <div class="form-hint">
                <code>127.0.0.1</code> 仅允许本机访问；
                <code>0.0.0.0</code> 允许局域网/外网访问（注意安全）
              </div>
            </el-form-item>
            <el-form-item label="端口">
              <el-input-number
                v-model="config.server.port"
                :min="1"
                :max="65535"
              />
              <span class="form-hint" style="margin-left: 8px">
                默认 3000，修改后需重启服务
              </span>
            </el-form-item>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="MCP 工具池" name="tools">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          >
            <template #title>
              <span>全局 MCP 工具池，可在分组配置中选择要注入的工具</span>
            </template>
          </el-alert>

          <el-table :data="config.tools.mcpTools" stripe>
            <el-table-column label="名称" width="150" prop="name" />
            <el-table-column label="传输方式" width="100">
              <template #default="{ row }">
                <el-tag
                  :type="getTransportTagType(row.transport)"
                  size="small"
                >
                  {{ row.transport?.toUpperCase() }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="配置">
              <template #default="{ row }">
                <template v-if="row.transport === 'stdio'">
                  <span class="config-path">
                    {{ row.command }} {{ row.args?.join(" ") || "" }}
                  </span>
                </template>
                <template v-else>
                  <span class="config-path">{{ row.endpoint }}</span>
                </template>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ $index }">
                <el-button type="primary" text size="small" @click="editTool($index)">
                  编辑
                </el-button>
                <el-button type="danger" text size="small" @click="removeTool($index)">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-button type="primary" style="margin-top: 16px" @click="showAddToolDialog">
            <el-icon><Plus /></el-icon>
            添加 MCP 工具
          </el-button>
        </el-tab-pane>

        <el-tab-pane label="缓存" name="cache">
          <el-form label-width="120px">
            <el-form-item label="启用缓存">
              <el-switch v-model="config.cache.enable" />
              <span class="form-hint">
                启用后，下游可通过分组名后缀 <code>-cache</code> 使用缓存
              </span>
            </el-form-item>
            <el-form-item label="最大条目数">
              <el-input-number
                v-model="config.cache.maxEntries"
                :min="100"
                :step="100"
              />
            </el-form-item>
            <el-form-item label="数据库路径">
              <el-input v-model="config.cache.dbPath" />
            </el-form-item>
            <el-form-item label="过期时间">
              <el-input-number v-model="config.cache.ttl" :min="0" :step="3600" />
              <span class="form-hint" style="margin-left: 8px">
                秒（0 表示永不过期）
              </span>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="原始配置" name="raw">
          <el-input
            v-model="rawConfig"
            type="textarea"
            :rows="20"
            font-family="monospace"
          />
          <el-button type="primary" style="margin-top: 12px" @click="applyRawConfig">
            应用配置
          </el-button>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 工具编辑对话框 -->
    <McpToolDialog
      v-model:visible="toolDialogVisible"
      :edit-index="editingToolIndex"
      :tool="editingTool"
      @save="handleToolSave"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 高级配置视图
 * @description 管理 MCP 工具池、缓存配置等
 */
import { ref, reactive, onMounted, watch, computed } from "vue";
import { Check, Plus, DocumentCopy } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getConfig,
  updateConfig,
  type AppConfig,
  type McpStdioConfig,
  type McpSseConfig,
  type McpHttpConfig,
} from "@/api/types";
import McpToolDialog from "@/components/McpToolDialog.vue";

type McpTool = McpStdioConfig | McpSseConfig | McpHttpConfig;

const activeTab = ref("tools");
const saving = ref(false);
const rawConfig = ref("");
const toolDialogVisible = ref(false);
const editingToolIndex = ref(-1);
const editingTool = ref<McpTool | null>(null);

const config = reactive<AppConfig>({
  server: {
    host: "127.0.0.1",
    port: 3000,
    admin: { adminToken: "" },
  },
  providers: [],
  models: [],
  groups: [],
  keys: [],
  tools: { mcpTools: [] },
  cache: { enable: true, maxEntries: 5000, dbPath: "./config/cache.sqlite" },
});

/** API 端点地址 */
const apiEndpoint = computed(() => {
  const host = config.server.host || "localhost";
  const port = config.server.port || 3000;
  return `http://${host}:${port}/v1/chat/completions`;
});

/** API 基础地址 */
const apiBaseUrl = computed(() => {
  const host = config.server.host || "localhost";
  const port = config.server.port || 3000;
  return `http://${host}:${port}/v1`;
});

/** 可用的分组列表 */
const availableGroups = computed(() => {
  return config.groups.map((g) => g.name).filter(Boolean);
});

/** 复制端点地址到剪贴板 */
async function copyEndpoint() {
  try {
    await navigator.clipboard.writeText(apiEndpoint.value);
    ElMessage.success("已复制到剪贴板");
  } catch {
    ElMessage.error("复制失败，请手动复制");
  }
}

onMounted(async () => {
  try {
    const { data } = await getConfig();
    Object.assign(config, data);
    if (config.cache.ttl === undefined) {
      config.cache.ttl = 0;
    }
    updateRawConfig();
  } catch {
    // ignore
  }
});

watch(
  () => config,
  () => updateRawConfig(),
  { deep: true }
);

function updateRawConfig() {
  rawConfig.value = JSON.stringify(config, null, 2);
}

async function saveConfig() {
  saving.value = true;
  try {
    await updateConfig(config);
    ElMessage.success("配置已保存");
  } finally {
    saving.value = false;
  }
}

function applyRawConfig() {
  try {
    const parsed = JSON.parse(rawConfig.value);
    Object.assign(config, parsed);
    ElMessage.success("配置已应用");
  } catch {
    ElMessage.error("JSON 格式错误");
  }
}

function getTransportTagType(
  transport?: string
): "success" | "warning" | "info" | "danger" {
  switch (transport) {
    case "stdio":
      return "success";
    case "sse":
      return "warning";
    case "http":
      return "info";
    default:
      return "info";
  }
}

function showAddToolDialog() {
  editingToolIndex.value = -1;
  editingTool.value = null;
  toolDialogVisible.value = true;
}

function editTool(index: number) {
  editingToolIndex.value = index;
  editingTool.value = config.tools.mcpTools[index];
  toolDialogVisible.value = true;
}

function removeTool(index: number) {
  config.tools.mcpTools.splice(index, 1);
}

function handleToolSave(tool: McpTool) {
  if (editingToolIndex.value === -1) {
    config.tools.mcpTools.push(tool);
    ElMessage.success("工具已添加");
  } else {
    config.tools.mcpTools[editingToolIndex.value] = tool;
    ElMessage.success("工具已更新");
  }
}
</script>

<style scoped>
.config-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.form-hint code {
  background: var(--border-color);
  padding: 2px 4px;
  border-radius: 3px;
  transition: background-color 0.3s;
}

.config-path {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-color);
  padding: 2px 6px;
  border-radius: 3px;
  transition: background-color 0.3s, color 0.3s;
}

/* 端点卡片样式 */
.endpoint-card {
  background: linear-gradient(135deg, var(--el-color-success-light-9) 0%, var(--el-bg-color) 100%);
}

.endpoint-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.endpoint-url {
  font-family: monospace;
  font-size: 14px;
  background: var(--bg-color);
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--el-color-success);
  transition: background-color 0.3s;
}

.group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.group-tag {
  font-family: monospace;
}

.text-muted {
  color: var(--text-secondary);
  font-size: 12px;
}

/* 代码示例样式 */
.example-section {
  padding: 8px 0;
}

.example-section h4 {
  margin: 16px 0 8px 0;
  color: var(--text-primary);
}

.example-section h4:first-child {
  margin-top: 0;
}

.code-block {
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
  transition: background-color 0.3s, border-color 0.3s;
}
</style>