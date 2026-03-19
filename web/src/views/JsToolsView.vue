<template>
  <div class="js-tools-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>JS 工具编辑器</span>
          <el-button type="primary" @click="showAddDialog">
            <el-icon><Plus /></el-icon>
            <span class="btn-text">新建工具</span>
          </el-button>
        </div>
      </template>

      <!-- 桌面端表格 -->
      <el-table :data="tools" stripe v-loading="loading" class="desktop-table">
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

      <!-- 移动端卡片列表 -->
      <div class="mobile-list" v-loading="loading">
        <div v-for="tool in tools" :key="tool.id" class="mobile-item">
          <div class="item-header">
            <div class="item-info">
              <span class="item-name">{{ tool.name }}</span>
              <el-tag :type="tool.enabled ? 'success' : 'info'" size="small">
                {{ tool.enabled ? "启用" : "禁用" }}
              </el-tag>
            </div>
            <div class="item-actions">
              <el-button type="primary" text size="small" @click="showEditDialog(tool)">
                编辑
              </el-button>
              <el-button type="warning" text size="small" @click="showTestDialog(tool)">
                测试
              </el-button>
              <el-popconfirm title="确定删除此工具？" @confirm="handleDelete(tool.id)">
                <template #reference>
                  <el-button type="danger" text size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
          <div class="item-desc">{{ tool.description }}</div>
          <div class="item-time">更新于 {{ formatDate(tool.updatedAt) }}</div>
        </div>
        <el-empty v-if="tools.length === 0 && !loading" description="暂无工具" />
      </div>
    </el-card>

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
import { ref, onMounted, onActivated, computed } from "vue";
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

/** 测试对话框宽度（响应式） */
const testDialogWidth = computed(() => {
  return window.innerWidth < 768 ? "95%" : "600px";
});

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

/* 移动端列表默认隐藏 */
.mobile-list {
  display: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .btn-text {
    display: none;
  }

  /* 显示移动端列表 */
  .mobile-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 隐藏桌面端表格 */
  .desktop-table {
    display: none;
  }
}

/* 移动端卡片样式 */
.mobile-item {
  padding: 12px;
  background: var(--border-light);
  border-radius: 8px;
  transition: background-color 0.3s;
}

.mobile-item .item-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.mobile-item .item-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mobile-item .item-name {
  font-weight: 600;
  font-size: 14px;
}

.mobile-item .item-actions {
  display: flex;
  gap: 4px;
}

.mobile-item .item-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.mobile-item .item-time {
  font-size: 12px;
  color: var(--text-muted);
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .result-content {
    font-size: 11px;
    max-height: 200px;
  }

  .mobile-item .item-actions {
    flex-direction: column;
    gap: 2px;
  }
}
</style>
