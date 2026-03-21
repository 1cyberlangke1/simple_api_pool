<template>
  <div class="js-tools-view">
    <!-- 示例工具卡片 -->
    <el-card v-if="examples.length > 0" class="examples-card">
      <template #header>
        <div class="card-header">
          <span>示例工具</span>
          <span class="examples-hint">点击导入快速创建工具</span>
        </div>
      </template>
      <div class="examples-grid">
        <div
          v-for="example in examples"
          :key="example.name"
          class="example-item"
          @click="showImportDialog(example)"
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

    <!-- 文件工具卡片 -->
    <el-card v-if="fileTools.length > 0">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>文件工具</span>
            <el-tag size="small" type="success">{{ fileTools.length }} 个</el-tag>
            <span class="source-hint">存放在 tools/js 目录，修改文件后自动重载</span>
          </div>
          <div class="page-header__actions">
            <el-button type="default" size="small" @click="reloadFileTools">
              <el-icon><Refresh /></el-icon>
              <span class="btn-text">重载</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="fileTools" stripe class="desktop-table">
        <el-table-column label="名称" width="180">
          <template #default="{ row }">
            <div class="tool-name">
              <span class="tool-name__text">{{ row.name }}</span>
              <el-tag v-if="row.allowNetwork" size="small" type="warning">网络</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" />
        <el-table-column label="分类" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.category" size="small">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">
            <el-tooltip :content="row.filePath" placement="top">
              <span class="file-path">{{ getFileName(row.filePath) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="warning" text size="small" @click="showTestDialog(row, 'file')">
              测试
            </el-button>
            <el-popconfirm title="确定删除此工具文件？" @confirm="handleDeleteFileTool(row.name)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 移动端卡片列表 -->
      <div class="data-card-list">
        <div v-for="tool in fileTools" :key="tool.name" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">
              <span>{{ tool.name }}</span>
              <el-tag v-if="tool.allowNetwork" size="small" type="warning">网络</el-tag>
            </div>
            <el-tag v-if="tool.category" size="small">{{ tool.category }}</el-tag>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row">{{ tool.description }}</div>
            <div class="data-card__body-row">
              <span class="data-card__label">文件: {{ getFileName(tool.filePath) }}</span>
            </div>
          </div>
          <div class="data-card__footer">
            <el-button type="warning" text size="small" @click="showTestDialog(tool, 'file')">
              测试
            </el-button>
            <el-popconfirm title="确定删除此工具文件？" @confirm="handleDeleteFileTool(tool.name)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 数据库工具卡片 -->
    <el-card>
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>数据库工具</span>
            <el-tag size="small" type="info">{{ dbTools.length }} 个</el-tag>
          </div>
          <div class="page-header__actions">
            <el-button type="primary" @click="showAddDialog">
              <el-icon><Plus /></el-icon>
              <span class="btn-text">新建工具</span>
            </el-button>
          </div>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="dbTools" stripe v-loading="loading" class="desktop-table">
        <el-table-column prop="name" label="名称" width="180" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">
              {{ row.enabled ? "启用" : "禁用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.updatedAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" text size="small" @click="showEditDialog(row)">
              编辑
            </el-button>
            <el-button type="warning" text size="small" @click="showTestDialog(row, 'db')">
              测试
            </el-button>
            <el-popconfirm title="确定删除此工具？" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <!-- 移动端卡片列表 -->
      <div class="data-card-list" v-loading="loading">
        <div v-for="tool in dbTools" :key="tool.id" class="data-card">
          <div class="data-card__header">
            <div class="data-card__title">
              <span>{{ tool.name }}</span>
              <el-tag :type="tool.enabled ? 'success' : 'info'" size="small">
                {{ tool.enabled ? "启用" : "禁用" }}
              </el-tag>
            </div>
          </div>
          <div class="data-card__body">
            <div class="data-card__body-row">{{ tool.description }}</div>
            <div class="data-card__body-row">
              <span class="data-card__label">更新于 {{ formatDate(tool.updatedAt) }}</span>
            </div>
          </div>
          <div class="data-card__footer">
            <el-button type="primary" text size="small" @click="showEditDialog(tool)">
              编辑
            </el-button>
            <el-button type="warning" text size="small" @click="showTestDialog(tool, 'db')">
              测试
            </el-button>
            <el-popconfirm title="确定删除此工具？" @confirm="handleDelete(tool.id)">
              <template #reference>
                <el-button type="danger" text size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        <div v-if="dbTools.length === 0 && !loading" class="page-empty">
          <div class="page-empty__icon">
            <el-icon :size="24"><Plus /></el-icon>
          </div>
          <p class="page-empty__title">暂无数据库工具</p>
          <p class="page-empty__desc">创建自定义 JS 工具来扩展 AI 能力</p>
          <div class="page-empty__action">
            <el-button type="primary" @click="showAddDialog">新建工具</el-button>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 导入对话框 -->
    <el-dialog v-model="importDialogVisible" title="导入工具" width="400px">
      <p>将 "{{ importingExample?.name }}" 导入到：</p>
      <el-radio-group v-model="importTarget" style="margin-top: 12px">
        <el-radio value="file">文件工具 (tools/js/*.json)</el-radio>
        <el-radio value="database">数据库工具</el-radio>
      </el-radio-group>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="doImport" :loading="importing">导入</el-button>
      </template>
    </el-dialog>

    <!-- 新建/编辑对话框 -->
    <JsToolFormDialog
      v-model:visible="dialogVisible"
      :editing-tool="editingTool"
      @submitted="fetchTools"
    />

    <!-- 测试对话框 -->
    <el-dialog v-model="testDialogVisible" title="测试工具" :width="testDialogWidth">
      <div class="test-container">
        <div class="test-params">
          <div class="test-header">测试参数（JSON）</div>
          <el-input
            v-model="testArgs"
            type="textarea"
            :rows="6"
            placeholder='{"arg1": "value1"}'
          />
        </div>
        <div class="test-result" v-if="testResult">
          <div class="test-header">执行结果</div>
          <el-tag
            :type="testResult.success ? 'success' : 'danger'"
            style="margin-bottom: 8px"
          >
            {{ testResult.success ? "成功" : "失败" }} ({{ testResult.executionTime }}ms)
          </el-tag>
          <pre class="result-content code-panel">
{{ testResult.error || JSON.stringify(testResult.result, null, 2) }}
          </pre>
        </div>
      </div>
      <template #footer>
        <el-button @click="testDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="runTest" :loading="testing">
          执行测试
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * JS 工具编辑器视图
 * @description 管理用户自定义 JS 工具，支持文件工具和数据库工具
 */
import { ref, onMounted, onActivated, computed } from "vue";
import { Plus, Refresh } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getJsTools,
  deleteJsTool,
  testJsTool,
  getJsToolExamples,
  importJsToolExample,
  deleteFileTool,
  reloadFileTools as reloadFileToolsApi,
  createFileTool,
  type JsTool,
  type FileJsTool,
  type JsToolTestResult,
  type JsToolExample,
} from "@/api/types";
import JsToolFormDialog from "@/components/JsToolFormDialog.vue";

const loading = ref(false);
const testing = ref(false);
const importing = ref(false);
const dialogVisible = ref(false);
const testDialogVisible = ref(false);
const importDialogVisible = ref(false);
const dbTools = ref<JsTool[]>([]);
const fileTools = ref<FileJsTool[]>([]);
const examples = ref<JsToolExample[]>([]);
const editingTool = ref<JsTool | null>(null);
const testResult = ref<JsToolTestResult | null>(null);
const testArgs = ref("{}");
const testingToolId = ref("");
const testingToolSource = ref<"db" | "file">("db");
const importingExample = ref<JsToolExample | null>(null);
const importTarget = ref<"file" | "database">("file");

/** 测试对话框宽度（响应式） */
const testDialogWidth = computed(() => {
  return window.innerWidth < 768 ? "95%" : "600px";
});

onMounted(() => {
  fetchTools();
  fetchExamples();
});

onActivated(() => {
  fetchTools();
});

async function fetchTools() {
  loading.value = true;
  try {
    const { data } = await getJsTools();
    dbTools.value = data.dbTools || [];
    fileTools.value = data.fileTools || [];
  } finally {
    loading.value = false;
  }
}

async function fetchExamples() {
  try {
    const { data } = await getJsToolExamples();
    examples.value = data;
  } catch {
    // 示例加载失败不影响主流程
  }
}

function showAddDialog() {
  editingTool.value = null;
  dialogVisible.value = true;
}

function showImportDialog(example: JsToolExample) {
  importingExample.value = example;
  importTarget.value = "file";
  importDialogVisible.value = true;
}

async function doImport() {
  if (!importingExample.value) return;

  importing.value = true;
  try {
    if (importTarget.value === "file") {
      // 导入到文件工具
      await createFileTool({
        name: importingExample.value.name,
        description: importingExample.value.description,
        inputSchema: importingExample.value.inputSchema,
        code: importingExample.value.code,
        category: importingExample.value.category,
        tags: importingExample.value.tags,
      });
      ElMessage.success(`工具 "${importingExample.value.name}" 已导入到文件`);
    } else {
      // 导入到数据库
      await importJsToolExample(importingExample.value.name);
      ElMessage.success(`工具 "${importingExample.value.name}" 已导入到数据库`);
    }
    importDialogVisible.value = false;
    await fetchTools();
  } finally {
    importing.value = false;
  }
}

function showEditDialog(tool: JsTool) {
  editingTool.value = tool;
  dialogVisible.value = true;
}

function showTestDialog(tool: JsTool | FileJsTool, source: "db" | "file") {
  testingToolId.value = source === "db" ? (tool as JsTool).id : tool.name;
  testingToolSource.value = source;
  testResult.value = null;
  testArgs.value = "{}";
  testDialogVisible.value = true;
}

async function handleDelete(id: string) {
  try {
    await deleteJsTool(id);
    ElMessage.success("删除成功");
    await fetchTools();
  } catch {
    // 错误已在拦截器中处理
  }
}

async function handleDeleteFileTool(name: string) {
  try {
    await deleteFileTool(name);
    ElMessage.success("删除成功");
    await fetchTools();
  } catch {
    // 错误已在拦截器中处理
  }
}

async function reloadFileTools() {
  try {
    const { data } = await reloadFileToolsApi();
    ElMessage.success(`已重载 ${data.count} 个文件工具`);
    await fetchTools();
  } catch {
    // 错误已在拦截器中处理
  }
}

async function runTest() {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(testArgs.value);
  } catch {
    ElMessage.error("参数 JSON 格式错误");
    return;
  }

  testing.value = true;
  testResult.value = null;
  try {
    const { data } = await testJsTool(testingToolId.value, args);
    testResult.value = data;
  } finally {
    testing.value = false;
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN");
}

function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}
</script>

<style scoped>
.js-tools-view {
  display: flex;
  flex-direction: column;
  gap: var(--page-gap);
}

.examples-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.examples-hint,
.source-hint {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: normal;
  margin-left: 8px;
}

.examples-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.example-item {
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.example-item:hover {
  border-color: var(--primary);
  background-color: var(--bg-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.example-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.example-item__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  font-family: monospace;
}

.example-item__desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.example-item__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tool-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name__text {
  font-family: monospace;
}

.file-path {
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.test-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.test-header {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.result-content {
  margin: 0;
  max-height: 300px;
  overflow: auto;
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .btn-text {
    display: none;
  }

  .desktop-table {
    display: none;
  }

  .examples-grid {
    grid-template-columns: 1fr;
  }
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .result-content {
    font-size: 11px;
    max-height: 200px;
  }
}
</style>