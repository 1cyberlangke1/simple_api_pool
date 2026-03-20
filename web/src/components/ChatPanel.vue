<template>
  <div class="chat-panel">
    <!-- 消息列表 -->
    <div class="messages-list" ref="messagesList">
      <div v-if="messages.length === 0" class="empty-chat">
        <div class="welcome-hero">
          <div class="welcome-icon">
            <el-icon :size="28"><Promotion /></el-icon>
          </div>
          <h3 class="welcome-title">开始对话测试</h3>
          <p class="welcome-desc">在上方选择一个分组，然后输入问题开始测试</p>
          <div class="example-questions">
            <span class="example-label">试试这些：</span>
            <div class="example-pills">
              <button
                v-for="example in exampleQuestions"
                :key="example"
                class="example-pill"
                @click="useExample(example)"
              >
                {{ example }}
              </button>
            </div>
          </div>
          <p class="welcome-hint">选择模型 → 输入问题 → 查看请求/响应</p>
        </div>
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
        <!-- 图片预览（仅当 content 中没有图片时显示） -->
        <div v-if="!hasImagesInContent(msg.content) && msg.images && msg.images.length > 0" class="message-images">
          <img
            v-for="(img, imgIndex) in msg.images"
            :key="imgIndex"
            :src="img"
            class="message-image"
            @click="previewImage(img)"
          />
        </div>
        <div class="message-content">
          <!-- 自适应显示额外字段（如 reasoning_content） -->
          <div v-if="msg.extraFields && Object.keys(msg.extraFields).length > 0" class="extra-fields">
            <details v-for="(value, key) in msg.extraFields" :key="key" class="extra-field" open>
              <summary class="extra-field-label">{{ formatFieldName(key as string) }}</summary>
              <pre class="extra-field-content">{{ truncateLongStrings(value) }}</pre>
            </details>
          </div>
          <!-- 主内容：自适应解析 -->
          <template v-if="isContentArray(msg.content)">
            <!-- 多部分内容：文本 + 图片 -->
            <template v-for="(part, partIndex) in (msg.content as ContentPart[])" :key="partIndex">
              <!-- 图片部分 -->
              <div v-if="part.type === 'image_url' && part.image_url?.url" class="content-image-wrapper">
                <img
                  :src="part.image_url.url"
                  class="message-image content-image"
                  @click="previewImage(part.image_url.url)"
                />
              </div>
              <!-- 文本部分 -->
              <pre v-else-if="part.type === 'text' && part.text" class="main-content">{{ part.text }}</pre>
              <!-- 其他类型：显示 JSON（自动截断长字符串） -->
              <pre v-else class="main-content content-part-other">{{ formatContent(part) }}</pre>
            </template>
          </template>
          <!-- 字符串内容或 JSON 内容（自动截断长字符串） -->
          <pre v-else class="main-content">{{ typeof msg.content === "string" ? msg.content : formatContent(msg.content) }}</pre>
        </div>
      </div>
      <div v-if="loading" class="loading-indicator">
        <span class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
        <span>AI 正在生成回复</span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <!-- 图片预览区域 -->
      <div v-if="pendingImages.length > 0" class="pending-images">
        <div v-for="(img, index) in pendingImages" :key="index" class="pending-image-item">
          <img :src="img.preview" class="pending-image-preview" />
          <el-button
            type="danger"
            :icon="Close"
            circle
            size="small"
            class="pending-image-remove"
            @click="removePendingImage(index)"
          />
        </div>
      </div>
      
      <el-input
        v-model="userInput"
        type="textarea"
        :rows="3"
        placeholder="输入您的问题，按 Ctrl+Enter 发送..."
        @keydown.enter.ctrl="send"
      />
      <div class="input-actions">
        <div class="left-actions">
          <el-checkbox v-model="stream">
            流式输出
            <el-tooltip content="启用后，AI 会逐字显示回答，响应更快" placement="top">
              <el-icon class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </el-checkbox>
          <!-- 图片上传按钮 -->
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :show-file-list="false"
            accept="image/*"
            :on-change="handleImageSelect"
          >
            <el-button title="上传图片（支持多图）">
              <el-icon><Picture /></el-icon>
              <span class="btn-text">图片</span>
            </el-button>
          </el-upload>
        </div>
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
            :disabled="!userInput.trim() && pendingImages.length === 0"
          >
            <el-icon><Promotion /></el-icon>
            发送
          </el-button>
        </div>
      </div>
    </div>

    <!-- 图片预览对话框 -->
    <el-dialog
      v-model="imagePreviewVisible"
      title="图片预览"
      width="fit-content"
      class="image-preview-dialog"
    >
      <img :src="previewImageUrl" class="preview-image-full" />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * 聊天面板组件
 * @description 显示消息列表和输入框，支持图片上传
 * @emits send - 发送消息
 * @emits remove - 删除消息
 */
import { ref, nextTick, watch, computed } from "vue";
import { Close, Promotion, QuestionFilled, DocumentCopy, RefreshRight, Picture } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { Message } from "./types";

interface PendingImage {
  preview: string;
  base64: string;
}

/**
 * 内容部分的类型定义
 * @description 用于解析消息内容数组中的各个部分
 */
interface ContentPart {
  type: "text" | "image_url" | string;
  text?: string;
  image_url?: { url: string };
}

/**
 * 检查消息内容是否为数组格式
 * @param content 消息内容
 * @returns 是否为数组
 */
function isContentArray(content: unknown): content is ContentPart[] {
  return Array.isArray(content);
}

/**
 * 检查消息内容数组中是否包含图片
 * @param content 消息内容
 * @returns 是否包含图片
 */
function hasImagesInContent(content: unknown): boolean {
  if (!isContentArray(content)) return false;
  return content.some(
    (part) => part.type === "image_url" && part.image_url?.url
  );
}

/** 字符串截断阈值（超过此长度则截断） */
const TRUNCATE_THRESHOLD = 200;
/** 截断后显示的长度 */
const TRUNCATE_SHOW_LENGTH = 50;

/**
 * 智能截断 JSON 中的长字符串值
 * @description 递归遍历对象，对超过阈值的长字符串进行截断
 * @param value 要处理的值
 * @returns 处理后的值
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
 * 格式化内容为显示字符串（自动截断长字符串）
 * @param content 消息内容
 * @returns 格式化后的字符串
 */
function formatContent(content: unknown): string {
  const truncated = truncateLongStrings(content);
  return JSON.stringify(truncated, null, 2);
}

interface Props {
  messages: Message[];
  loading: boolean;
  streamMode: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "send", content: string, images?: string[]): void;
  (e: "remove", index: number): void;
  (e: "update:streamMode", value: boolean): void;
  (e: "retry"): void;
}>();

const userInput = ref("");
const stream = ref(props.streamMode);
const messagesList = ref<HTMLElement | null>(null);
const uploadRef = ref();
const pendingImages = ref<PendingImage[]>([]);
const imagePreviewVisible = ref(false);
const previewImageUrl = ref("");

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
 * 处理图片选择
 * @param file 上传的文件
 */
function handleImageSelect(file: { raw: File }) {
  const rawFile = file.raw;
  if (!rawFile) return;

  // 检查文件类型
  if (!rawFile.type.startsWith("image/")) {
    ElMessage.warning("请选择图片文件");
    return;
  }

  // 读取文件为 base64
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target?.result as string;
    pendingImages.value.push({
      preview: base64,
      base64: base64,
    });
  };
  reader.readAsDataURL(rawFile);

  // 清空 upload 组件，允许重复选择同一文件
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
}

/**
 * 移除待发送的图片
 * @param index 图片索引
 */
function removePendingImage(index: number) {
  pendingImages.value.splice(index, 1);
}

/**
 * 预览图片
 * @param url 图片 URL
 */
function previewImage(url: string) {
  previewImageUrl.value = url;
  imagePreviewVisible.value = true;
}

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
  const hasText = userInput.value.trim();
  const hasImages = pendingImages.value.length > 0;

  if (!hasText && !hasImages) return;

  // 发送消息，包含图片
  emit(
    "send",
    userInput.value.trim(),
    pendingImages.value.length > 0 ? pendingImages.value.map((img) => img.base64) : undefined
  );

  // 清空输入
  userInput.value = "";
  pendingImages.value = [];
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
  padding: 16px;
  background: var(--surface-secondary);
  border-radius: var(--card-radius-sm);
  border: 1px solid var(--border-light);
  transition: background-color 0.3s;
}

/* ============================================================
   欢迎空状态
   ============================================================ */
.empty-chat {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px;
  max-width: 400px;
}

.welcome-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--empty-icon-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  margin-bottom: 16px;
  animation: float 3s ease-in-out infinite;
}

.welcome-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-color);
  margin: 0 0 6px;
}

.welcome-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 20px;
  line-height: 1.5;
}

.example-questions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.example-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

.example-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.example-pill {
  padding: 7px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-normal) ease;
  font-family: inherit;
}

.example-pill:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--surface-accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.welcome-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 18px 0 0;
  opacity: 0.7;
}

/* ============================================================
   消息项
   ============================================================ */
.message-item {
  margin-bottom: 14px;
  padding: 14px 16px;
  background: var(--card-bg);
  border-radius: var(--card-radius-sm);
  border: 1px solid var(--border-light);
  transition: background-color 0.3s, border-color 0.3s;
  position: relative;
}

.message-item.user {
  border-left: 3px solid #409eff;
  background: color-mix(in srgb, var(--card-bg) 95%, #409eff 5%);
}

.message-item.assistant {
  border-left: 3px solid #67c23a;
}

.message-item.system {
  border-left: 3px solid #909399;
  opacity: 0.85;
}

.message-item.tool {
  border-left: 3px solid #e6a23c;
}

.message-role {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 8px;
}

.role-left {
  min-width: 60px;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0.5;
  transition: opacity var(--transition-fast);
}

.message-item:hover .message-actions {
  opacity: 1;
}

/* 消息中的图片 */
.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.message-image {
  max-width: 200px;
  max-height: 150px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.message-image:hover {
  transform: scale(1.02);
}

/* 内容中的图片包装器 */
.content-image-wrapper {
  margin: 8px 0;
}

.content-image {
  display: block;
  max-width: 300px;
  max-height: 200px;
}

/* 其他类型的内容部分 */
.content-part-other {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--surface-secondary);
  padding: 8px;
  border-radius: 6px;
}

.message-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 14px;
  font-family: inherit;
  color: var(--text-color);
  line-height: 1.65;
  transition: color 0.3s;
}

/* ============================================================
   额外字段（reasoning 等）
   ============================================================ */
.extra-fields {
  margin-bottom: 12px;
}

.extra-field {
  margin-bottom: 8px;
  background: var(--surface-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-light);
  overflow: hidden;
}

.extra-field:last-child {
  margin-bottom: 0;
}

.extra-field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  padding: 8px 12px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.extra-field-label::before {
  content: "▸";
  font-size: 10px;
  transition: transform var(--transition-fast);
}

.extra-field[open] > .extra-field-label::before {
  transform: rotate(90deg);
}

.extra-field-content {
  font-size: 13px;
  color: var(--text-secondary);
  padding: 10px 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  border-top: 1px solid var(--border-light);
}

.main-content {
  margin: 0;
}

/* ============================================================
   Loading 指示器
   ============================================================ */
.loading-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: 13px;
  background: var(--card-bg);
  border-radius: var(--card-radius-sm);
  border: 1px solid var(--border-light);
  border-left: 3px solid var(--primary-color);
}

.loading-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary-color);
  animation: dotPulse 1.4s ease-in-out infinite;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* ============================================================
   输入区域
   ============================================================ */
.input-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 待发送图片预览 */
.pending-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: var(--surface-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-light);
}

.pending-image-item {
  position: relative;
}

.pending-image-preview {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}

.pending-image-remove {
  position: absolute;
  top: -8px;
  right: -8px;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 16px;
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

/* 图片预览对话框 */
.image-preview-dialog :deep(.el-dialog__body) {
  padding: 16px;
}

.preview-image-full {
  max-width: 80vw;
  max-height: 70vh;
  border-radius: 8px;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .btn-text {
    display: none;
  }

  .message-image {
    max-width: 150px;
    max-height: 120px;
  }

  .pending-image-preview {
    width: 60px;
    height: 60px;
  }

  .left-actions {
    gap: 12px;
  }
}
</style>