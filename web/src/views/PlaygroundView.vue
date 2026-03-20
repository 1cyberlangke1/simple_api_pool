<template>
  <div class="playground-view">
    <el-card class="chat-card">
      <template #header>
        <div class="card-header page-header">
          <div class="page-header__meta">
            <span>对话测试</span>
          </div>
          <div class="header-actions page-header__actions">
            <el-button @click="fetchModels" :loading="isLoadingModels" title="刷新模型列表">
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-select
              v-model="selectedModel"
              placeholder="选择模型"
              class="model-select"
              :loading="isLoadingModels"
              filterable
            >
              <template #empty>
                <div class="empty-group">
                  <el-icon><Warning /></el-icon>
                  <span>无可用模型</span>
                </div>
              </template>
              <el-option
                v-for="model in availableModels"
                :key="model.id"
                :label="model.id"
                :value="model.id"
              >
                <div class="group-option">
                  <span>{{ model.id }}</span>
                </div>
              </el-option>
            </el-select>
            <el-button @click="clearMessages" :disabled="messages.length === 0">
              <el-icon><Delete /></el-icon>
              <span class="btn-text">清空对话</span>
            </el-button>
            <!-- 移动端调试信息按钮 -->
            <el-button
              v-if="isMobile"
              class="mobile-debug-btn"
              @click="showMobileDebug = true"
            >
              <el-icon><Document /></el-icon>
              <span class="btn-text">请求响应</span>
            </el-button>
            <!-- 移动端设置按钮 -->
            <el-button class="mobile-settings-btn" @click="showMobileSettings = true">
              <el-icon><Setting /></el-icon>
              <span class="btn-text">设置</span>
            </el-button>
          </div>
        </div>
      </template>

      <ChatPanel
        ref="chatPanelRef"
        :messages="messages"
        :loading="isLoading"
        v-model:stream-mode="useStream"
        @send="handleSend"
        @remove="removeMessage"
        @retry="handleRetry"
      />
    </el-card>

    <!-- 桌面端右侧面板 -->
    <div class="side-panel desktop-panel">
      <div class="settings-panel-wrap">
        <ChatSettingsPanel
          ref="settingsRef"
          :messages="messages"
          :available-tools="availableTools"
          @update:messages="messages = $event"
        />
      </div>

      <div class="debug-cards">
      <el-card v-if="lastRequestBody" class="json-card">
        <template #header>
          <div class="card-header">
            <span>请求体 (Request Body)</span>
            <el-button text size="small" @click="copyRequestBody">复制</el-button>
          </div>
        </template>
        <pre class="json-content code-panel">{{ lastRequestBody }}</pre>
      </el-card>

      <!-- 上游响应 JSON -->
      <el-card v-if="lastResponse" class="json-card">
        <template #header>
          <div class="card-header">
            <span>上游响应 (Response)</span>
            <div class="card-actions">
              <el-button text size="small" @click="copyResponse">复制</el-button>
              <el-button text size="small" @click="downloadResponse">下载</el-button>
            </div>
          </div>
        </template>
        <pre class="json-content code-panel">{{ lastResponse }}</pre>
      </el-card>
      </div>
    </div>

    <!-- 移动端设置抽屉 -->
    <el-drawer
      v-model="showMobileSettings"
      direction="rtl"
      :size="320"
      title="请求设置"
      class="mobile-settings-drawer"
    >
      <ChatSettingsPanel
        ref="mobileSettingsRef"
        :messages="messages"
        :available-tools="availableTools"
        @update:messages="messages = $event"
      />
    </el-drawer>

    <!-- 移动端调试信息抽屉 -->
    <el-drawer
      v-model="showMobileDebug"
      direction="rtl"
      :size="360"
      title="调试信息"
      class="mobile-debug-drawer"
    >
      <!-- 请求体 JSON -->
      <el-card v-if="lastRequestBody" class="json-card">
        <template #header>
          <div class="card-header">
            <span>请求体</span>
            <el-button text size="small" @click="copyRequestBody">复制</el-button>
          </div>
        </template>
        <pre class="json-content code-panel">{{ lastRequestBody }}</pre>
      </el-card>

      <!-- 上游响应 JSON -->
      <el-card v-if="lastResponse" class="json-card">
        <template #header>
          <div class="card-header">
            <span>响应</span>
            <div class="card-actions">
              <el-button text size="small" @click="copyResponse">复制</el-button>
              <el-button text size="small" @click="downloadResponse">下载</el-button>
            </div>
          </div>
        </template>
        <pre class="json-content code-panel">{{ lastResponse }}</pre>
      </el-card>

      <el-empty v-if="!lastRequestBody && !lastResponse" description="暂无调试信息" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话测试视图
 * @description 提供对话测试界面，支持多轮对话和工具调用
 * @behavior 桌面端显示右侧设置面板，移动端使用抽屉式设置
 */
import { ref, onMounted, onActivated, computed, onUnmounted, watch } from "vue";
import { Delete, Warning, Refresh, Setting, Document } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { getTools, type ToolInfo } from "@/api/types";
import { sendChatRequest, sendChatStreamRequest, getModels, type ModelInfo } from "@/api/index";
import ChatPanel from "@/components/ChatPanel.vue";
import ChatSettingsPanel from "@/components/ChatSettingsPanel.vue";
import type { Message, MessageContent } from "@/components/types";

const availableModels = ref<ModelInfo[]>([]);
const availableTools = ref<ToolInfo[]>([]);
const selectedModel = ref("");
const isLoadingModels = ref(false);
const messages = ref<Message[]>([]);
const isLoading = ref(false);
const useStream = ref(true);
const lastRequestBody = ref("");
const lastResponse = ref("");
const chatPanelRef = ref<InstanceType<typeof ChatPanel> | null>(null);
const settingsRef = ref<InstanceType<typeof ChatSettingsPanel> | null>(null);
const mobileSettingsRef = ref<InstanceType<typeof ChatSettingsPanel> | null>(null);

/** 字符串截断阈值（超过此长度则截断） */
const TRUNCATE_THRESHOLD = 200;
/** 截断后显示的长度 */
const TRUNCATE_SHOW_LENGTH = 50;

/**
 * 智能截断 JSON 中的长字符串值
 * @description 递归遍历对象，对超过阈值的长字符串进行截断，避免大数据渲染卡顿
 * @param value 要处理的值
 * @returns 处理后的值（原始值不变，返回截断后的副本）
 */
function truncateLongStrings(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > TRUNCATE_THRESHOLD) {
      const truncated = value.slice(0, TRUNCATE_SHOW_LENGTH);
      const remaining = value.length - TRUNCATE_SHOW_LENGTH;
      return `${truncated}... [已截断 ${remaining} 字符，共 ${value.length} 字符]`;
    }
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map((item) => truncateLongStrings(item));
  }
  
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = truncateLongStrings(val);
    }
    return result;
  }
  
  return value;
}

/**
 * 格式化 JSON 并截断长字符串
 * @param data JSON 数据
 * @returns 格式化后的字符串
 */
function formatJsonWithTruncate(data: unknown): string {
  const truncated = truncateLongStrings(data);
  return JSON.stringify(truncated, null, 2);
}

/** 移动端设置抽屉显示状态 */
const showMobileSettings = ref(false);

/** 移动端调试信息抽屉显示状态 */
const showMobileDebug = ref(false);

/** 是否为移动端 */
const windowWidth = ref(window.innerWidth);
const isMobile = computed(() => windowWidth.value < 768);
const isCompactLayout = computed(() => windowWidth.value < 1024);

function updateWindowWidth() {
  windowWidth.value = window.innerWidth;
}

onMounted(() => {
  updateWindowWidth();
  window.addEventListener("resize", updateWindowWidth);
  fetchModels();
  fetchTools();
});

// 页面激活时刷新模型列表（解决分组修改后不更新的问题）
onActivated(() => {
  fetchModels();
});

onUnmounted(() => {
  window.removeEventListener("resize", updateWindowWidth);
});

async function fetchModels() {
  isLoadingModels.value = true;
  try {
    const data = await getModels();
    availableModels.value = data.data || [];
    if (data.data?.length > 0 && !selectedModel.value) {
      selectedModel.value = data.data[0].id;
    }
  } catch (error) {
    console.error("Failed to fetch models:", error);
  } finally {
    isLoadingModels.value = false;
  }
}

async function fetchTools() {
  try {
    const { data } = await getTools();
    availableTools.value = data.tools;
  } catch {
    // 错误已在拦截器中处理
  }
}

/**
 * 获取当前设置（兼容桌面端和移动端）
 */
function getCurrentSettings() {
  return settingsRef.value?.settings || mobileSettingsRef.value?.settings;
}

/**
 * 处理发送消息
 * @param content 用户输入内容
 * @param images 图片 base64 数组（可选）
 */
async function handleSend(content: string, images?: string[]) {
  if (!selectedModel.value) return;

  // 构建消息内容
  let messageContent: string | MessageContent[];
  if (images && images.length > 0) {
    // 多模态消息：文本 + 图片
    messageContent = [];
    if (content) {
      messageContent.push({ type: "text", text: content });
    }
    for (const img of images) {
      messageContent.push({
        type: "image_url",
        image_url: { url: img },
      });
    }
  } else {
    // 纯文本消息
    messageContent = content;
  }

  const userMessage: Message = {
    role: "user",
    content: messageContent,
    images: images, // 保存图片用于前端预览
  };
  messages.value.push(userMessage);

  isLoading.value = true;

  try {
    const settings = getCurrentSettings();
    
    // 构建请求体
    const requestBody: Record<string, unknown> = {
      model: selectedModel.value,
      messages: messages.value.map((m) => ({
        role: m.role,
        content: m.content,
        name: m.name,
        tool_call_id: m.tool_call_id,
      })),
      stream: useStream.value,
    };

    // 添加启用的标准参数
    if (settings) {
      // 处理 OpenAI 标准参数
      for (const [key, config] of Object.entries(settings.params)) {
        if (config.enabled && config.value !== undefined) {
          // 跳过空字符串
          if (typeof config.value === "string" && config.value === "") continue;
          // 跳过空数组
          if (Array.isArray(config.value) && config.value.length === 0) continue;
          requestBody[key] = config.value;
        }
      }

      // 处理自定义参数
      for (const param of settings.customParams) {
        if (param.enabled && param.key.trim()) {
          requestBody[param.key] = param.value;
        }
      }

      // 添加工具
      if (settings.tools && settings.tools.length > 0) {
        requestBody.tools = settings.tools.map((name) => ({
          type: "function",
          function: { name },
        }));
      }

      // 合并 extraBody（放在最后，可覆盖前面的字段）
      if (settings.extraBody && Object.keys(settings.extraBody).length > 0) {
        Object.assign(requestBody, settings.extraBody);
      }
    }

    // 保存请求体 JSON（自动截断长字符串）
    lastRequestBody.value = formatJsonWithTruncate(requestBody);

    if (useStream.value) {
      await sendStreamRequest(requestBody);
    } else {
      await sendNonStreamRequest(requestBody);
    }
  } catch (error) {
    const err = error as { message?: string; response?: unknown; body?: unknown; stack?: string };
    
    // 构建完整的错误响应对象
    const errorResponse: Record<string, unknown> = {
      error: true,
      message: err.message || "请求失败",
    };
    
    // 尝试提取更多错误信息
    if (err.response) {
      errorResponse.response = err.response;
    }
    if (err.body) {
      errorResponse.body = err.body;
    }
    
    // 保存完整的错误响应体（自动截断长字符串）
    lastResponse.value = formatJsonWithTruncate(errorResponse);
    
    // 在消息列表中显示错误（方便用户查看）
    messages.value.push({
      role: "assistant",
      content: `❌ 请求失败: ${err.message || "未知错误"}\n\n请查看右侧"上游响应"获取详细错误信息。`,
    });
    
    ElMessage.error(err.message || "请求失败");
    console.error(error);
  } finally {
    isLoading.value = false;
  }
}

/**
 * 发送流式请求
 * @description 自适应处理所有 delta 字段，不特判任何提供商
 */
async function sendStreamRequest(body: Record<string, unknown>) {
  const reader = await sendChatStreamRequest(body as Parameters<typeof sendChatStreamRequest>[0]);
  const decoder = new TextDecoder();
  let assistantContent = "";
  const rawChunks: string[] = [];
  // 收集所有非标准字段
  const extraFields: Record<string, string> = {};
  // 收集 usage 字段
  let streamUsage: Record<string, unknown> | undefined;

  messages.value.push({ role: "assistant", content: "", extraFields: {} });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      rawChunks.push(chunk);
      const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          
          // 收集 usage 字段（缓存命中时会有）
          if (parsed.usage) {
            streamUsage = parsed.usage as Record<string, unknown>;
          }
          
          const delta = parsed.choices?.[0]?.delta;
          if (delta) {
            let hasUpdate = false;

            // 处理 content 字段
            if (delta.content) {
              assistantContent += delta.content;
              hasUpdate = true;
            }
            // 自适应处理所有其他字符串类型的字段（排除 role、content、tool_calls）
            for (const [key, value] of Object.entries(delta)) {
              if (key === "role" || key === "content" || key === "tool_calls") continue;
              if (typeof value === "string") {
                if (!extraFields[key]) extraFields[key] = "";
                extraFields[key] += value;
                hasUpdate = true;
              }
            }

            // 统一触发响应式更新
            if (hasUpdate) {
              const lastIndex = messages.value.length - 1;
              messages.value[lastIndex] = {
                ...messages.value[lastIndex],
                content: assistantContent,
                extraFields: Object.keys(extraFields).length > 0 ? { ...extraFields } : undefined
              };
              chatPanelRef.value?.scrollToBottom();
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  } finally {
    // 确保释放 reader 资源
    reader.releaseLock();
  }

  // 保存完整的响应数据（自动截断长字符串）
  lastResponse.value = formatJsonWithTruncate({
    stream: true,
    content: assistantContent,
    extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
    usage: streamUsage,
    rawChunks: rawChunks.length,
    raw: rawChunks.join("\n")
  });
}

/**
 * 发送非流式请求
 * @description 自适应处理所有响应字段，不特判任何提供商
 */
async function sendNonStreamRequest(body: Record<string, unknown>) {
  const data = await sendChatRequest(body as Parameters<typeof sendChatRequest>[0]);

  const assistantMessage = data.choices?.[0]?.message;
  if (assistantMessage) {
    // 自适应提取 message 中的所有非标准字段
    const extraFields: Record<string, unknown> = {};
    const standardFields = ["role", "content", "tool_calls", "function_call"];
    
    for (const [key, value] of Object.entries(assistantMessage)) {
      if (!standardFields.includes(key)) {
        extraFields[key] = value;
      }
    }

    messages.value.push({
      role: "assistant",
      content: assistantMessage.content || "",
      extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
    });
  }

  lastResponse.value = formatJsonWithTruncate(data);
  chatPanelRef.value?.scrollToBottom();
}

function clearMessages() {
  messages.value = [];
  lastRequestBody.value = "";
  lastResponse.value = "";
}

function removeMessage(index: number) {
  messages.value.splice(index, 1);
}

/**
 * 处理重试
 * @description 删除最后的助手回复，重新发送最后一条用户消息
 */
function handleRetry() {
  // 删除最后的助手消息（如果有）
  if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === "assistant") {
    messages.value.pop();
  }
  // 找到最后一条用户消息并重新发送
  const lastUserMsg = [...messages.value].reverse().find(m => m.role === "user");
  if (!lastUserMsg) return;

  // 删除该用户消息（会重新添加）
  const userIndex = messages.value.lastIndexOf(lastUserMsg);
  if (userIndex > -1) {
    messages.value.splice(userIndex, 1);
  }

  // 根据内容类型提取文本和图片
  if (typeof lastUserMsg.content === "string") {
    // 纯文本消息
    handleSend(lastUserMsg.content);
  } else if (Array.isArray(lastUserMsg.content)) {
    // 多模态消息：提取文本和图片
    let textContent = "";
    const images: string[] = [];

    for (const part of lastUserMsg.content) {
      if (part.type === "text" && part.text) {
        textContent += part.text;
      } else if (part.type === "image_url" && part.image_url?.url) {
        images.push(part.image_url.url);
      }
    }

    handleSend(textContent, images.length > 0 ? images : undefined);
  }
}

function copyRequestBody() {
  if (lastRequestBody.value) {
    navigator.clipboard.writeText(lastRequestBody.value);
    ElMessage.success("已复制");
  }
}

function copyResponse() {
  if (lastResponse.value) {
    navigator.clipboard.writeText(lastResponse.value);
    ElMessage.success("已复制");
  }
}

/**
 * 下载响应 JSON 文件
 */
function downloadResponse() {
  if (!lastResponse.value) return;
  
  // 创建 Blob 对象
  const blob = new Blob([lastResponse.value], { type: "application/json" });
  
  // 创建下载链接
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  
  // 生成文件名（包含时间戳）
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.download = `response-${timestamp}.json`;
  
  // 触发下载
  document.body.appendChild(link);
  link.click();
  
  // 清理
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  ElMessage.success("已下载");
}

watch(isCompactLayout, (compact) => {
  if (compact) {
    showMobileSettings.value = false;
    showMobileDebug.value = false;
  }
});
</script>

<style scoped>
.playground-view {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  align-items: start;
  gap: var(--page-gap);
  min-height: min(780px, calc(100vh - 150px));
}

.chat-card {
  min-width: 0;
  min-height: min(780px, calc(100vh - 150px));
  display: flex;
  flex-direction: column;
}

.chat-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 14px;
  min-height: 0;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.model-select {
  width: 220px;
}

.side-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 84px;
}

.settings-panel-wrap {
  min-width: 0;
}

.debug-cards {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.json-card {
  flex-shrink: 0;
}

.json-content {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  font-size: 11px;
}

.group-option {
  display: flex;
  align-items: center;
  width: 100%;
}

.empty-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  color: var(--text-muted);
  font-size: 13px;
}

/* 移动端设置按钮默认隐藏 */
.mobile-settings-btn {
  display: none;
}

/* 移动端调试按钮默认隐藏 */
.mobile-debug-btn {
  display: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

@media (max-width: 1280px) {
  .playground-view {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  }

  .model-select {
    width: 200px;
  }
}

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .playground-view {
    grid-template-columns: minmax(0, 1fr);
    min-height: auto;
  }

  .desktop-panel {
    display: none;
  }

  .mobile-settings-btn,
  .mobile-debug-btn {
    display: inline-flex;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .model-select {
    width: min(240px, 100%);
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .playground-view {
    gap: var(--page-gap);
  }

  .header-actions {
    gap: 8px;
  }

  .model-select {
    width: min(100%, 180px);
  }

  .btn-text {
    display: none;
  }

  .chat-card {
    min-height: min(620px, calc(100vh - 132px));
  }

  .chat-card :deep(.el-card__header) {
    padding: 12px;
  }
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .playground-view {
    gap: 12px;
  }

  .header-actions {
    gap: 6px;
  }

  .model-select {
    width: 100%;
  }

  .json-content {
    font-size: 10px;
    max-height: 180px;
  }
}

/* 移动端抽屉内的 JSON 卡片样式 */
.mobile-settings-drawer :deep(.el-drawer__body) {
  overflow-y: auto;
  max-height: calc(100vh - 60px);
  padding: 16px;
}

/* 移动端调试抽屉样式 */
.mobile-debug-drawer :deep(.el-drawer__body) {
  overflow-y: auto;
  max-height: calc(100vh - 60px);
  padding: 16px;
}

.mobile-debug-drawer .json-card {
  margin-bottom: 16px;
}

.mobile-debug-drawer .json-content {
  font-size: 11px;
  max-height: 300px;
  overflow: auto;
}
</style>
