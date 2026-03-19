<template>
  <div class="playground-view">
    <el-card class="chat-card">
      <template #header>
        <div class="card-header">
          <span>对话测试</span>
          <div class="header-actions">
            <el-button @click="fetchModels" :loading="isLoadingModels" title="刷新模型列表">
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-select
              v-model="selectedModel"
              placeholder="选择模型"
              style="width: 220px"
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
              清空对话
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

    <!-- 右侧面板 -->
    <div class="side-panel">
      <ChatSettingsPanel
        ref="settingsRef"
        :messages="messages"
        :available-tools="availableTools"
        @update:messages="messages = $event"
      />

      <!-- 请求体 JSON -->
      <el-card v-if="lastRequestBody" class="json-card">
        <template #header>
          <div class="card-header">
            <span>请求体 (Request Body)</span>
            <el-button text size="small" @click="copyRequestBody">复制</el-button>
          </div>
        </template>
        <pre class="json-content">{{ lastRequestBody }}</pre>
      </el-card>

      <!-- 上游响应 JSON -->
      <el-card v-if="lastResponse" class="json-card">
        <template #header>
          <div class="card-header">
            <span>上游响应 (Response)</span>
            <el-button text size="small" @click="copyResponse">复制</el-button>
          </div>
        </template>
        <pre class="json-content">{{ lastResponse }}</pre>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 对话测试视图
 * @description 提供对话测试界面，支持多轮对话和工具调用
 */
import { ref, onMounted, onActivated } from "vue";
import { Delete, Warning, Refresh } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { getTools, type ToolInfo } from "@/api/types";
import { sendChatRequest, sendChatStreamRequest, getModels, type ModelInfo } from "@/api/index";
import ChatPanel from "@/components/ChatPanel.vue";
import ChatSettingsPanel from "@/components/ChatSettingsPanel.vue";
import type { Message, ChatSettings } from "@/components/types";

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

onMounted(() => {
  fetchModels();
  fetchTools();
});

// 页面激活时刷新模型列表（解决分组修改后不更新的问题）
onActivated(() => {
  fetchModels();
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
    availableTools.value = data;
  } catch {
    // 错误已在拦截器中处理
  }
}

/**
 * 处理发送消息
 * @param content 用户输入内容
 */
async function handleSend(content: string) {
  if (!selectedModel.value) return;

  const userMessage: Message = { role: "user", content };
  messages.value.push(userMessage);

  isLoading.value = true;

  try {
    const settings = settingsRef.value?.settings;
    
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
        if (config.enabled && config.value !== undefined && config.value !== "") {
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

    // 保存请求体 JSON
    lastRequestBody.value = JSON.stringify(requestBody, null, 2);

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
    
    // 保存完整的错误响应体
    lastResponse.value = JSON.stringify(errorResponse, null, 2);
    
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

  messages.value.push({ role: "assistant", content: "", extraFields: {} });

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

  // 保存完整的响应数据
  lastResponse.value = JSON.stringify({
    stream: true,
    content: assistantContent,
    extraFields: Object.keys(extraFields).length > 0 ? extraFields : undefined,
    rawChunks: rawChunks.length,
    raw: rawChunks.join("\n")
  }, null, 2);
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

  lastResponse.value = JSON.stringify(data, null, 2);
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
  if (lastUserMsg && typeof lastUserMsg.content === "string") {
    // 删除该用户消息（会重新添加）
    const userIndex = messages.value.lastIndexOf(lastUserMsg);
    if (userIndex > -1) {
      messages.value.splice(userIndex, 1);
    }
    // 重新发送
    handleSend(lastUserMsg.content);
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
</script>

<style scoped>
.playground-view {
  display: flex;
  gap: 20px;
  height: calc(100vh - 120px);
}

.chat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.side-panel {
  width: 480px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  max-height: calc(100vh - 120px);
}

.json-card {
  flex-shrink: 0;
}

.json-content {
  margin: 0;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 8px;
  font-size: 11px;
  max-height: 250px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  transition: background-color 0.3s;
  font-family: "JetBrains Mono", "Consolas", monospace;
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
</style>