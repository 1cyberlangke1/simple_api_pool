<template>
  <div class="js-tools-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>JS 工具编辑器</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            新建工具
          </el-button>
        </div>
      </template>

      <el-table :data="tools" stripe v-loading="loading">
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
            <el-button type="warning" text size="small" @click="showTestDialog(row)">
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
    </el-card>

    <!-- 新建/编辑对话框 -->
    <JsToolFormDialog
      v-model:visible="dialogVisible"
      :editing-tool="editingTool"
      @submitted="fetchTools"
    />

    <!-- 测试对话框 -->
    <el-dialog v-model="testDialogVisible" title="测试工具" width="600px">
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
          <pre class="result-content">
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
 * @description 管理用户自定义 JS 工具
 */
import { ref, onMounted, onActivated } from "vue";
import { Plus } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getJsTools,
  deleteJsTool,
  testJsTool,
  type JsTool,
  type JsToolTestResult,
} from "@/api/types";
import JsToolFormDialog from "@/components/JsToolFormDialog.vue";

const loading = ref(false);
const testing = ref(false);
const dialogVisible = ref(false);
const testDialogVisible = ref(false);
const tools = ref<JsTool[]>([]);
const editingTool = ref<JsTool | null>(null);
const testResult = ref<JsToolTestResult | null>(null);
const testArgs = ref("{}");
const testingToolId = ref("");

onMounted(() => {
  fetchTools();
});

onActivated(() => {
  fetchTools();
});

async function fetchTools() {
  loading.value = true;
  try {
    const { data } = await getJsTools();
    tools.value = data;
  } finally {
    loading.value = false;
  }
}

function showAddDialog() {
  editingTool.value = null;
  dialogVisible.value = true;
}

function showEditDialog(tool: JsTool) {
  editingTool.value = tool;
  dialogVisible.value = true;
}

function showTestDialog(tool: JsTool) {
  testingToolId.value = tool.id;
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
</script>

<style scoped>
.js-tools-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.test-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.test-header {
  font-weight: 500;
  margin-bottom: 8px;
}

.result-content {
  margin: 0;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 8px;
  font-size: 13px;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  transition: background-color 0.3s;
}
</style>