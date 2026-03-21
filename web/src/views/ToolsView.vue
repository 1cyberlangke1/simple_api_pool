<template>
  <div class="tools-view">
    <!-- 示例工具卡片 -->
    <el-card v-if="jsExamples.length > 0 && jsTools.length === 0" class="examples-card">
      <template #header>
        <div class="card-header">
          <span>示例工具</span>
          <span class="examples-hint">点击导入快速创建工具</span>
        </div>
      </template>
      <div class="examples-grid">
        <div
          v-for="example in jsExamples"
          :key="example.name"
          class="example-item"
          @click="importExample(example)"
        >
          <div class="example-item__header">
            <span class="example-item__name">{{ example.name }}</span>
            <el-tag size="small" type="info">{{ example.category }}</el-tag>
          </div>
          <p class="example-item__desc">{{ example.description }}</p>
          <div class="example-item__tags">
            <el-tag
              v-for="tag in example.tags"
              :key="tag"
              size="small"
              type="info"
              effect="plain"
            >
              {{ tag }}
            </el-tag>
          </div>
        </div>
      </div>
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>工具管理</span>
          </div>
          <div class="page-header__actions">
            <el-button type="primary" @click="showAddJsToolDialog">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新建 JS 工具</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 工具类型标签页 -->
      <el-tabs v-model="activeTab" class="tools-tabs">
        <el-tab-pane label="全部工具" name="all">
          <ToolsTable
            :tools="allTools"
            :loading="loading"
            @edit-js="showEditJsToolDialog"
            @test-js="showTestJsToolDialog"
            @delete-js="handleDeleteJsTool"
          />
        </el-tab-pane>
        <el-tab-pane label="JS 工具" name="js">
          <ToolsTable
            :tools="jsToolsWithMeta"
            :loading="loading"
            @edit-js="showEditJsToolDialog"
            @test-js="showTestJsToolDialog"
            @delete-js="handleDeleteJsTool"
          />
        </el-tab-pane>
        <el-tab-pane label="MCP 工具" name="mcp">
          <div style="margin-bottom: 16px">
            <el-button type="primary" @click="showAddMcpToolDialog">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新建 MCP 工具</span>
            </el-button>
          </div>
          <McpToolsTable
            :tools="mcpTools"
            :loading="loading"
            @edit="showEditMcpToolDialog"
            @delete="handleDeleteMcpTool"
          />
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- JS 工具表单对话框 -->
    <JsToolFormDialog
      v-model:visible="jsToolDialogVisible"
      :editing-tool="editingJsTool"
      @submitted="fetchJsTools"
    />

    <!-- JS 工具测试对话框 -->
    <el-dialog
      v-model="testDialogVisible"
      title="测试工具"
      width="650px"
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="工具名称">
          <el-input :model-value="testingTool?.name" disabled />
        </el-form-item>
        <el-form-item label="工具描述">
          <div class="tool-description">{{ testingTool?.description }}</div>
        </el-form-item>
        
        <!-- 参数说明 -->
        <el-form-item v-if="toolParams.length > 0" label="参数说明">
          <div class="params-hint">
            <div v-for="param in toolParams" :key="param.name" class="param-item">
              <span class="param-name">{{ param.name }}</span>
              <el-tag v-if="param.required" type="danger" size="small">必填</el-tag>
              <el-tag size="small" type="info">{{ param.type }}</el-tag>
              <span class="param-desc">{{ param.description }}</span>
              <span v-if="param.enum" class="param-enum">
                可选值: {{ param.enum.join(', ') }}
              </span>
            </div>
          </div>
        </el-form-item>
        
        <el-form-item label="参数 JSON">
          <el-input
            v-model="testArgs"
            type="textarea"
            :rows="8"
            placeholder='{"key": "value"}'
          />
        </el-form-item>
        <el-form-item label="执行结果">
          <pre class="test-result">{{ testResult }}</pre>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="testing" @click="runTest">
          执行
        </el-button>
      </template>
    </el-dialog>

    <!-- MCP 工具表单对话框 -->
    <McpToolDialog
      v-model:visible="mcpToolDialogVisible"
      :edit-index="editingMcpToolIndex"
      :tool="editingMcpTool"
      @save="handleMcpToolSave"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * 统一工具管理视图
 * @description 整合 JS 工具和 MCP 工具的管理界面
 */
import { ref, computed, onMounted, onActivated } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  getJsTools,
  getJsToolExamples,
  importJsToolExample,
  deleteJsTool,
  testJsTool,
  getConfig,
  updateConfig,
  type JsTool,
  type FileJsTool,
  type JsToolExample,
  type McpStdioConfig,
  type McpSseConfig,
  type McpHttpConfig,
  type AppConfig,
} from "@/api/types";
import JsToolFormDialog from "@/components/JsToolFormDialog.vue";
import McpToolDialog from "@/components/McpToolDialog.vue";
import ToolsTable from "@/components/ToolsTable.vue";
import McpToolsTable from "@/components/McpToolsTable.vue";

// MCP 工具类型
type McpTool = McpStdioConfig | McpSseConfig | McpHttpConfig;

// 统一工具类型（数据库工具 + 文件工具）
type UnifiedJsTool = (JsTool & { source: "database" }) | (FileJsTool & { source: "file" });

// 状态
const loading = ref(false);
const activeTab = ref("all");
const jsTools = ref<UnifiedJsTool[]>([]);
const jsExamples = ref<JsToolExample[]>([]);
const mcpTools = ref<McpTool[]>([]);
const fullConfig = ref<AppConfig | null>(null);

// JS 工具对话框
const jsToolDialogVisible = ref(false);
const editingJsTool = ref<((JsTool & { source: "database" }) | (FileJsTool & { source: "file" })) | null>(null);

// 测试对话框
const testDialogVisible = ref(false);
const testingTool = ref<JsTool | null>(null);
const testArgs = ref("{}");
const testResult = ref("");
const testing = ref(false);

// MCP 工具对话框
const mcpToolDialogVisible = ref(false);
const editingMcpToolIndex = ref(-1);
const editingMcpTool = ref<McpTool | null>(null);

// 计算属性：JS 工具带类型标识
const jsToolsWithMeta = computed(() =>
  jsTools.value.map((tool) => ({ ...tool, toolType: "js" as const }))
);

// 计算属性：MCP 工具带类型标识
const mcpToolsWithMeta = computed(() =>
  mcpTools.value.map((tool) => ({ ...tool, toolType: "mcp" as const, enabled: true }))
);

// 计算属性：所有工具合并
const allTools = computed(() => [...jsToolsWithMeta.value, ...mcpToolsWithMeta.value]);

// 计算属性：测试工具的参数说明
const toolParams = computed(() => {
  if (!testingTool.value?.inputSchema) return [];
  const schema = testingTool.value.inputSchema as Record<string, unknown>;
  if (schema.type !== "object" || !schema.properties) return [];

  const props = schema.properties as Record<string, Record<string, unknown>>;
  const required = new Set((schema.required as string[]) ?? []);

  return Object.entries(props).map(([name, prop]) => ({
    name,
    type: Array.isArray(prop.type) ? prop.type.join(' | ') : (prop.type as string) ?? 'any',
    description: prop.description as string ?? '',
    required: required.has(name),
    enum: prop.enum as string[] | undefined,
  }));
});

onMounted(() => {
  fetchAll();
});

onActivated(() => {
  fetchAll();
});

async function fetchAll() {
  loading.value = true;
  try {
    await Promise.all([fetchJsTools(), fetchJsExamples(), fetchMcpTools()]);
  } finally {
    loading.value = false;
  }
}

async function fetchJsTools() {
  try {
    const { data } = await getJsTools();
    // 合并 dbTools 和 fileTools 为统一数组
    jsTools.value = [...(data.dbTools || []), ...(data.fileTools || [])];
  } catch {
    // 获取 JS 工具列表失败，保持空列表
  }
}

async function fetchJsExamples() {
  try {
    const { data } = await getJsToolExamples();
    jsExamples.value = data;
  } catch {
    // 获取工具示例失败，保持空列表
  }
}

async function fetchMcpTools() {
  try {
    const { data } = await getConfig();
    fullConfig.value = data;
    mcpTools.value = data.tools?.mcpTools ?? [];
  } catch {
    // 获取 MCP 工具列表失败，保持空列表
  }
}

// JS 工具操作
function showAddJsToolDialog() {
  editingJsTool.value = null;
  jsToolDialogVisible.value = true;
}

function showEditJsToolDialog(tool: { name: string; id?: string; source?: "database" | "file" }) {
  // 从 jsTools 中找到完整的工具对象
  // 注意：同名的数据库工具和文件工具可能同时存在，需要精确匹配
  let fullTool: UnifiedJsTool | undefined;
  
  if (tool.source === "database" || tool.id) {
    // 数据库工具：优先通过 id 匹配，其次通过 name + source 匹配
    fullTool = jsTools.value.find(t => 'id' in t && (t.id === tool.id || (t.name === tool.name && tool.source === "database")));
  } else if (tool.source === "file") {
    // 文件工具：通过 name 匹配，且必须是文件工具
    fullTool = jsTools.value.find(t => !('id' in t) && t.name === tool.name);
  } else {
    // 没有明确 source，尝试智能匹配
    if (tool.id) {
      fullTool = jsTools.value.find(t => 'id' in t && t.id === tool.id);
    } else {
      fullTool = jsTools.value.find(t => !('id' in t) && t.name === tool.name);
    }
  }
  
  if (fullTool) {
    if ('id' in fullTool) {
      // 数据库工具
      editingJsTool.value = { ...fullTool, source: "database" } as JsTool & { source: "database" };
    } else {
      // 文件工具
      editingJsTool.value = { ...fullTool, source: "file" } as FileJsTool & { source: "file" };
    }
    jsToolDialogVisible.value = true;
  }
}

/**
 * 从 JSON Schema 生成示例参数
 * @description 根据工具的 inputSchema 自动生成示例参数值
 */
function generateExampleFromSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || schema.type !== "object" || !schema.properties) {
    return {};
  }

  const result: Record<string, unknown> = {};
  const props = schema.properties as Record<string, Record<string, unknown>>;
  const required = new Set(schema.required as string[] ?? []);

  for (const [key, prop] of Object.entries(props)) {
    // 只填充必需字段或提供示例值
    if (required.has(key) || prop.example !== undefined || prop.default !== undefined) {
      result[key] = getExampleValue(prop);
    }
  }

  return result;
}

/**
 * 根据属性定义获取示例值
 */
function getExampleValue(prop: Record<string, unknown>): unknown {
  // 优先使用定义的示例值或默认值
  if (prop.example !== undefined) return prop.example;
  if (prop.default !== undefined) return prop.default;

  const type = prop.type as string;
  const enumValues = prop.enum as unknown[] | undefined;

  // 枚举类型取第一个值
  if (enumValues && enumValues.length > 0) {
    return enumValues[0];
  }

  // 根据类型生成默认示例
  switch (type) {
    case "string":
      // 根据 description 或 key 猜测示例
      const desc = (prop.description as string)?.toLowerCase() ?? "";
      const key = (prop as Record<string, unknown>)._key as string ?? "";
      if (desc.includes("城市") || key.includes("city")) return "Beijing";
      if (desc.includes("名字") || desc.includes("名称")) return "example";
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return null;
  }
}

function showTestJsToolDialog(tool: { name: string; id?: string }) {
  // 测试功能仅支持数据库工具（需要 id）
  if (!tool.id) {
    ElMessage.warning("文件工具暂不支持在线测试");
    return;
  }
  // 从 jsTools 中找到完整的工具对象
  const fullTool = jsTools.value.find(t => 'id' in t && t.id === tool.id);
  if (fullTool && 'id' in fullTool) {
    testingTool.value = fullTool as JsTool;
    // 根据 inputSchema 自动生成示例参数
    const exampleArgs = generateExampleFromSchema(fullTool.inputSchema as Record<string, unknown>);
    testArgs.value = JSON.stringify(exampleArgs, null, 2);
    testResult.value = "";
    testDialogVisible.value = true;
  }
}

async function handleDeleteJsTool(id: string, name?: string) {
  try {
    await ElMessageBox.confirm("确定删除此工具？", "确认删除", {
      type: "warning",
    });
    
    if (id) {
      // 删除数据库工具
      await deleteJsTool(id);
    } else if (name) {
      // 删除文件工具
      const { deleteFileTool } = await import("@/api/types");
      await deleteFileTool(name);
    }
    
    ElMessage.success("删除成功");
    await fetchJsTools();
  } catch (error) {
    // 用户取消不显示错误
    if (error !== "cancel" && error !== "close") {
      ElMessage.error("删除失败");
    }
  }
}

async function importExample(example: JsToolExample) {
  try {
    await importJsToolExample(example.name);
    ElMessage.success(`工具 "${example.name}" 导入成功`);
    await fetchJsTools();
  } catch (err) {
    const error = err as { response?: { data?: { error?: string } } };
    ElMessage.error(error.response?.data?.error || "导入失败");
  }
}

async function runTest() {
  if (!testingTool.value) return;

  testing.value = true;
  testResult.value = "执行中...";

  try {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(testArgs.value);
    } catch {
      testResult.value = "错误: 参数不是有效的 JSON";
      return;
    }

    const { data } = await testJsTool(testingTool.value.id, args);
    testResult.value = JSON.stringify(data, null, 2);
  } catch (err) {
    const error = err as { response?: { data?: { error?: string } } };
    testResult.value = `错误: ${error.response?.data?.error || "执行失败"}`;
  } finally {
    testing.value = false;
  }
}

// ==================== MCP 工具管理 ====================

function showAddMcpToolDialog() {
  editingMcpToolIndex.value = -1;
  editingMcpTool.value = null;
  mcpToolDialogVisible.value = true;
}

function showEditMcpToolDialog(index: number) {
  editingMcpToolIndex.value = index;
  editingMcpTool.value = mcpTools.value[index];
  mcpToolDialogVisible.value = true;
}

async function handleDeleteMcpTool(index: number) {
  try {
    await ElMessageBox.confirm("确定删除此 MCP 工具？", "确认删除", { type: "warning" });
    mcpTools.value.splice(index, 1);
    await saveMcpTools();
    ElMessage.success("删除成功");
  } catch (error) {
    // 用户取消不显示错误
    if (error !== "cancel" && error !== "close") {
      ElMessage.error("删除失败");
    }
  }
}

async function handleMcpToolSave(tool: McpTool) {
  if (editingMcpToolIndex.value === -1) {
    // 检查名称是否重复
    if (mcpTools.value.some(t => t.name === tool.name)) {
      ElMessage.error(`工具名称 "${tool.name}" 已存在`);
      return;
    }
    mcpTools.value.push(tool);
    ElMessage.success("MCP 工具已添加");
  } else {
    mcpTools.value[editingMcpToolIndex.value] = tool;
    ElMessage.success("MCP 工具已更新");
  }
  await saveMcpTools();
}

async function saveMcpTools() {
  if (!fullConfig.value) {
    const { data } = await getConfig();
    fullConfig.value = data;
  }
  fullConfig.value.tools.mcpTools = mcpTools.value;
  await updateConfig(fullConfig.value);
}
</script>

<style scoped>
.tools-view {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
}

.examples-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.examples-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.examples-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.example-item {
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.example-item:hover {
  border-color: var(--primary);
  background: var(--surface-secondary);
}

.example-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.example-item__name {
  font-weight: 500;
}

.example-item__desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 8px;
  line-height: 1.4;
}

.example-item__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tools-tabs {
  margin-top: 8px;
}

.tool-description {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.params-hint {
  background: var(--surface-secondary);
  border-radius: 8px;
  padding: 12px;
  width: 100%;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-lighter);
  flex-wrap: wrap;
}

.param-item:last-child {
  border-bottom: none;
}

.param-name {
  font-weight: 600;
  font-family: monospace;
  color: var(--primary-color);
}

.param-desc {
  color: var(--text-secondary);
  font-size: 12px;
  flex: 1;
  min-width: 100px;
}

.param-enum {
  color: var(--text-muted);
  font-size: 11px;
  font-style: italic;
  width: 100%;
  margin-top: 2px;
}

.test-result {
  background: var(--surface-secondary);
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 768px) {
  .btn-text {
    display: none;
  }

  .examples-grid {
    grid-template-columns: 1fr;
  }
}
</style>
