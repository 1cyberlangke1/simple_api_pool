<template>
  <div class="logs-view">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>系统日志</span>
          <div class="header-right">
            <el-select v-model="selectedDate" placeholder="选择日期" style="width: 150px" @change="fetchLogContent">
              <el-option v-for="item in logFiles" :key="item.date" :label="item.date" :value="item.date">
                <span>{{ item.date }}</span>
                <span class="log-size">{{ formatSize(item.size) }}</span>
              </el-option>
            </el-select>
            <el-select v-model="levelFilter" placeholder="日志级别" clearable style="width: 120px">
              <el-option label="全部" value="" />
              <el-option label="INFO" value="info" />
              <el-option label="WARN" value="warn" />
              <el-option label="ERROR" value="error" />
              <el-option label="DEBUG" value="debug" />
              <el-option label="TRACE" value="trace" />
            </el-select>
            <el-button @click="refresh" :loading="loading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <div v-if="!selectedDate" class="empty-hint">
        <el-empty description="请选择日期查看日志" />
      </div>

      <div v-else v-loading="loading" class="log-container">
        <div class="log-info">
          <span>共 {{ totalLines }} 行日志</span>
          <span v-if="logEntries.length < totalLines" class="text-muted">
            (显示最近 {{ logEntries.length }} 行)
          </span>
        </div>
        <div class="log-content">
          <div
            v-for="(entry, index) in logEntries"
            :key="index"
            :class="['log-line', `log-level-${entry.level}`]"
          >
            <span class="log-time">{{ entry.time }}</span>
            <span :class="['log-level', `level-${entry.level}`]">{{ entry.level.toUpperCase() }}</span>
            <span v-if="entry.module" class="log-module">[{{ entry.module }}]</span>
            <span v-if="entry.plugin" class="log-plugin">[{{ entry.plugin }}]</span>
            <span class="log-msg">{{ entry.msg }}</span>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 日志查看视图
 * @description 查看系统运行日志
 */
import { ref, onMounted, computed } from "vue";
import { Refresh } from "@element-plus/icons-vue";
import { getLogList, getLogContent, type LogEntry, type LogFileInfo } from "@/api/types";

const loading = ref(false);
const logFiles = ref<LogFileInfo[]>([]);
const selectedDate = ref("");
const levelFilter = ref("");
const rawLogEntries = ref<LogEntry[]>([]); // 原始解析后的日志
const totalLines = ref(0);

// 根据级别过滤后的日志
const logEntries = computed(() => {
  if (!levelFilter.value) return rawLogEntries.value;
  return rawLogEntries.value.filter(entry => entry.level === levelFilter.value);
});

onMounted(() => {
  fetchLogList();
});

async function fetchLogList() {
  try {
    const { data } = await getLogList();
    logFiles.value = data.files || [];
    
    // 默认选择今天（最新的）日志
    if (logFiles.value.length > 0 && !selectedDate.value) {
      selectedDate.value = logFiles.value[0].date;
      await fetchLogContent();
    }
  } catch {
    // 错误已在拦截器中处理
  }
}

/**
 * 解析原始 JSON 日志行
 */
function parseLogLine(line: string): LogEntry | null {
  try {
    const parsed = JSON.parse(line);
    // Pino 日志格式：{ time, level, msg, module?, plugin? }
    // level 是数字：10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
    const levelMap: Record<number, string> = {
      10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal"
    };
    const levelNum = typeof parsed.level === "number" ? parsed.level : 30;
    const levelStr = levelMap[levelNum] || "info";
    
    // 格式化时间
    let timeStr = "";
    if (parsed.time) {
      const time = new Date(parsed.time);
      timeStr = time.toLocaleTimeString("zh-CN", { hour12: false });
    }

    // 构建详细消息（包含 LLM 请求相关信息）
    let msg = parsed.msg || "";
    const details: string[] = [];
    
    // 添加 LLM 请求相关字段
    if (parsed.requestId) details.push(`请求ID: ${parsed.requestId}`);
    if (parsed.model) details.push(`模型: ${parsed.model}`);
    if (parsed.targetModel && parsed.targetModel !== parsed.model) {
      details.push(`实际模型: ${parsed.targetModel}`);
    }
    if (parsed.provider) details.push(`提供商: ${parsed.provider}`);
    if (parsed.keyAlias) details.push(`Key: ${parsed.keyAlias}`);
    if (parsed.group) details.push(`分组: ${parsed.group}`);
    if (parsed.duration) details.push(`耗时: ${parsed.duration}`);
    if (parsed.stream !== undefined) details.push(`流式: ${parsed.stream ? '是' : '否'}`);
    if (parsed.cached !== undefined) details.push(`缓存: ${parsed.cached ? '命中' : '未命中'}`);
    if (parsed.messages) details.push(`消息数: ${parsed.messages}`);
    if (parsed.tools) details.push(`工具数: ${parsed.tools}`);
    if (parsed.usage) {
      const u = parsed.usage;
      details.push(`Token: prompt=${u.prompt || u.prompt_tokens}, completion=${u.completion || u.completion_tokens}`);
    }
    if (parsed.error) details.push(`错误: ${parsed.error}`);
    if (parsed.status) details.push(`状态码: ${parsed.status}`);
    
    // 如果有详细信息，附加到消息后面
    if (details.length > 0) {
      msg = msg + " | " + details.join(", ");
    }
    
    return {
      time: timeStr,
      level: levelStr,
      msg,
      module: parsed.module,
      plugin: parsed.plugin,
    };
  } catch {
    return null;
  }
}

async function fetchLogContent() {
  if (!selectedDate.value) return;

  loading.value = true;
  try {
    const { data } = await getLogContent(
      selectedDate.value,
      undefined, // 不在后端过滤，前端过滤
      500 // 限制显示最近 500 行
    );
    
    // 解析原始 JSON 日志行
    const entries: LogEntry[] = [];
    for (const line of (data.logs || [])) {
      const entry = parseLogLine(line);
      if (entry) entries.push(entry);
    }
    
    rawLogEntries.value = entries.reverse(); // 最新的在前面
    totalLines.value = data.total || 0;
  } catch {
    // 错误已在拦截器中处理
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  await fetchLogList();
  if (selectedDate.value) {
    await fetchLogContent();
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
</script>

<style scoped>
.logs-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.log-size {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.empty-hint {
  padding: 40px;
  text-align: center;
}

.log-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-info {
  font-size: 14px;
  color: var(--text-secondary);
}

.text-muted {
  color: var(--text-muted);
  font-size: 12px;
  margin-left: 8px;
}

.log-content {
  background: #1e1e1e;
  border-radius: 8px;
  padding: 16px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  max-height: 600px;
  overflow-y: auto;
}

.log-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 0;
}

.log-time {
  color: #6a9955;
  flex-shrink: 0;
}

.log-level {
  font-weight: bold;
  flex-shrink: 0;
  min-width: 50px;
}

.level-info {
  color: #3776ab;
}

.level-warn {
  color: #d19a66;
}

.level-error {
  color: #e06c75;
}

.level-debug {
  color: #98c379;
}

.level-trace {
  color: #56b6c2;
}

.log-module,
.log-plugin {
  color: #c678dd;
  flex-shrink: 0;
}

.log-msg {
  color: #abb2bf;
  word-break: break-all;
}

.log-level-error {
  background: rgba(224, 108, 117, 0.1);
}

.log-level-warn {
  background: rgba(209, 154, 102, 0.1);
}
</style>
