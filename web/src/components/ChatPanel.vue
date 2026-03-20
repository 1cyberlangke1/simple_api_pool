<template>
  <div class="chat-panel">
    <!-- 消息列表 -->
    <div class="messages-list" ref="messagesList">
      <div v-if="messages.length === 0" class="empty-chat">
        <el-empty>
          <template #description>
            <div class="empty-guide">
              <p class="guide-title">开始对话测试</p>
              <p class="guide-desc">在上方选择一个分组，然后输入问题开始测试</p>
              <div class="example-questions">
                <p class="example-title">试试这些问题：</p>
                <el-button
                  v-for="example in exampleQuestions"
                  :key="example"
                  type="primary"
                  text
                  size="small"
                  class="example-btn"
                  @click="useExample(example)"
                >
                  {{ example }}
                </el-button>
              </div>
            </div>
          </template>
        </el-empty>
      </div>
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message-item', msg.role]"
      >
        <div class="message-role">
          <div class="role-left">
            <el-tag :type="getRoleTagType(msg.role)" size="small">
              {{ roleLabels[msg.role] }}
            </el-tag>
          </div>
          <div class="message-actions">
            <el-button
              type="primary"
              text
              size="small"
              @click="copyMessage(msg)"
              title="复制消息"
            >
              <el-icon><DocumentCopy /></el-icon>
            </el-button>
            <el-button
              v-if="msg.role !== 'system'"
              type="danger"
              text
              size="small"
              @click="$emit('remove', index)"
              title="删除消息"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
        </div>
        <div class="message-content">
          <!-- 自适应显示额外字段（如 reasoning_content） -->
          <div v-if="msg.extraFields && Object.keys(msg.extraFields).length > 0" class="extra-fields">
            <div v-for="(value, key) in msg.extraFields" :key="key" class="extra-field">
              <div class="extra-field-label">{{ formatFieldName(key as string) }}</div>
              <pre class="extra-field-content">{{ value }}</pre>
            </div>
          </div>
          <!-- 主内容 -->
          <pre class="main-content">
{{ typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2) }}
          </pre>
        </div>
      </div>
      <div v-if="loading" class="loading-indicator">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>AI 正在思考...</span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="userInput"
        type="textarea"
        :rows="3"
        placeholder="输入您的问题，按 Ctrl+Enter 发送..."
        @keydown.enter.ctrl="send"
      />
      <div class="input-actions">
        <el-checkbox v-model="stream">
          流式输出
          <el-tooltip content="启用后，AI 会逐字显示回答，响应更快" placement="top">
            <el-icon class="help-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </el-checkbox>
        <div class="action-buttons">
          <el-button
            v-if="lastUserMessage"
            :loading="loading"
            @click="retry"
            title="重试上一条消息"
          >
            <el-icon><RefreshRight /></el-icon>
            重试
          </el-button>
          <el-button
            type="primary"
            @click="send"
            :loading="loading"
            :disabled="!userInput.trim()"
          >
            <el-icon><Promotion /></el-icon>
            发送
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 聊天面板组件
 * @description 显示消息列表和输入框
 * @emits send - 发送消息
 * @emits remove - 删除消息
 */
import { ref, nextTick, watch, computed } from "vue";
import { Close, Loading, Promotion, QuestionFilled, DocumentCopy, RefreshRight } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { Message } from "./types";

interface Props {
  messages: Message[];
  loading: boolean;
  streamMode: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "send", content: string): void;
  (e: "remove", index: number): void;
  (e: "update:streamMode", value: boolean): void;
  (e: "retry"): void;
}>();

const userInput = ref("");
const stream = ref(props.streamMode);
const messagesList = ref<HTMLElement | null>(null);

const roleLabels: Record<string, string> = {
  system: "系统",
  user: "用户",
  assistant: "助手",
  tool: "工具",
};

/** 示例问题列表 */
const exampleQuestions = [
  "你好，请自我介绍",
  "用简单的语言解释什么是 AI",
  "写一首关于春天的短诗",
  "帮我写一个 Python Hello World",
];

// 同步流式模式
watch(stream, (val) => emit("update:streamMode", val));

/**
 * 获取角色标签类型
 * @param role 消息角色
 * @returns ElTag type 属性值（undefined 表示默认 primary 样式）
 */
function getRoleTagType(
  role: string
): "success" | "warning" | "info" | "danger" | undefined {
  const types: Record<string, "success" | "warning" | "info" | "danger" | undefined> = {
    system: "info",
    user: undefined, // 使用默认样式
    assistant: "success",
    tool: "warning",
  };
  return types[role];
}

/**
 * 格式化字段名称
 * @description 将 snake_case 转换为可读的标题格式
 */
function formatFieldName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * 获取最后一条用户消息
 */
const lastUserMessage = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === "user") {
      return props.messages[i];
    }
  }
  return null;
});

/**
 * 复制消息内容
 * @param msg 消息对象
 */
function copyMessage(msg: Message) {
  let text = "";
  // 如果有额外字段，也一起复制
  if (msg.extraFields && Object.keys(msg.extraFields).length > 0) {
    for (const [key, value] of Object.entries(msg.extraFields)) {
      text += `[${formatFieldName(key)}]\n${value}\n\n`;
    }
  }
  text += typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content, null, 2);
  navigator.clipboard.writeText(text);
  ElMessage.success("已复制");
}

/**
 * 重试上一条消息
 */
function retry() {
  emit("retry");
}

/**
 * 发送消息
 */
function send() {
  if (!userInput.value.trim()) return;
  emit("send", userInput.value.trim());
  userInput.value = "";
}

/**
 * 使用示例问题
 * @param question 示例问题
 */
function useExample(question: string) {
  userInput.value = question;
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  nextTick(() => {
    if (messagesList.value) {
      messagesList.value.scrollTop = messagesList.value.scrollHeight;
    }
  });
}

// 监听消息变化自动滚动
watch(
  () => props.messages.length,
  () => scrollToBottom()
);

// 暴露滚动方法给父组件
defineExpose({ scrollToBottom });
</script>

<style scoped>
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-color);
  border-radius: 8px;
  transition: background-color 0.3s;
}

.empty-chat {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-guide {
  text-align: center;
  padding: 20px;
}

.guide-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px;
}

.guide-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px;
}

.example-questions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.example-title {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.example-btn {
  margin: 2px;
}

.message-item {
  margin-bottom: 12px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
  transition: background-color 0.3s;
}

.message-item.user {
  border-left-color: #409eff;
}

.message-item.assistant {
  border-left-color: #67c23a;
}

.message-item.system {
  border-left-color: #909399;
}

.message-item.tool {
  border-left-color: #e6a23c;
}

.message-role {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-bottom: 8px;
  gap: 8px;
}

.role-left {
  min-width: 60px;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.message-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color);
  transition: color 0.3s;
}

.extra-fields {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--border-color);
}

.extra-field {
  margin-bottom: 8px;
}

.extra-field:last-child {
  margin-bottom: 0;
}

.extra-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.extra-field-content {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-color);
  padding: 8px 12px;
  border-radius: 6px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  border-left: 2px solid var(--primary-color);
}

.main-content {
  margin: 0;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: var(--text-secondary);
  transition: color 0.3s;
}

.input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  font-size: 14px;
  color: var(--primary-color);
  cursor: help;
  vertical-align: middle;
  margin-left: 4px;
}
</style>
