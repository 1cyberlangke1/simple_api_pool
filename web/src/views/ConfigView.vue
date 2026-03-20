<template>
  <div class="config-view">
    <!-- 服务端点信息卡片 -->
    <el-card class="endpoint-card">
      <template #header>
        <div class="card-header">
          <span>API 服务端点</span>
          <el-button type="primary" text @click="copyEndpoint">
            <el-icon><DocumentCopy /></el-icon>
            <span class="btn-text">复制端点</span>
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

      <el-descriptions :column="descColumn" border>
        <el-descriptions-item label="API 端点">
          <div class="endpoint-info">
            <code class="endpoint-url">{{ apiEndpoint }}</code>
            <el-button size="small" text @click="copyEndpoint">
              <el-icon><DocumentCopy /></el-icon>
            </el-button>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="认证方式">
          <template v-if="config.server.apiAuth?.enabled">
            <el-tag type="warning">
              {{ config.server.apiAuth.type === 'api-key' ? 'API Key (X-API-Key)' : 'Bearer Token' }}
            </el-tag>
            <span style="margin-left: 8px; color: var(--text-secondary);">需要认证</span>
          </template>
          <template v-else>
            <el-tag type="success">无需认证</el-tag>
            <span style="margin-left: 8px; color: var(--text-secondary);">对外暴露时建议启用</span>
          </template>
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
            <pre class="code-block code-panel">curl {{ apiEndpoint }} \
  -H "Content-Type: application/json" \
  -d '{
    "model": "group/{{ availableGroups[0] || 'your-group' }}",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'</pre>

            <h4>Python (OpenAI SDK)</h4>
            <pre class="code-block code-panel">from openai import OpenAI

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
            <pre class="code-block code-panel">const response = await fetch("{{ apiEndpoint }}", {
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
            <span class="btn-text">保存配置</span>
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="服务器设置" name="server">
          <el-form label-width="120px" class="config-form">
            <el-form-item label="监听地址">
              <el-radio-group v-model="config.server.host" @change="saveConfig">
                <el-radio-button value="127.0.0.1">
                  本地 (127.0.0.1)
                </el-radio-button>
                <el-radio-button value="0.0.0.0">
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
                @change="saveConfig"
              />
              <span class="form-hint" style="margin-left: 8px">
                默认 3000，修改后需重启服务
              </span>
            </el-form-item>

            <el-divider content-position="left">管理后台认证</el-divider>

            <el-form-item label="管理员令牌">
              <el-input
                v-model="config.server.admin.adminToken"
                type="password"
                show-password
                placeholder="请输入管理员令牌"
                style="width: 300px"
              />
              <el-button type="primary" text @click="generateAdminToken" style="margin-left: 8px">
                随机生成
              </el-button>
            </el-form-item>

            <el-divider content-position="left">API 认证</el-divider>

            <el-form-item label="启用认证">
              <el-switch
                v-model="apiAuthEnabled"
                @change="handleApiAuthEnabledChange"
              />
              <span class="form-hint" style="margin-left: 8px">
                启用后访问 /v1/* 接口需要提供认证令牌
              </span>
            </el-form-item>

            <template v-if="apiAuthEnabled">
              <el-form-item label="认证方式">
                <el-radio-group v-model="apiAuthType">
                  <el-radio-button value="bearer">
                    Bearer Token
                  </el-radio-button>
                  <el-radio-button value="api-key">
                    API Key (X-API-Key)
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="访问令牌">
                <div style="display: flex; flex-direction: column; gap: 8px; width: 100%">
                  <div style="display: flex; gap: 8px">
                    <el-input
                      v-model="newApiToken"
                      placeholder="输入令牌或点击随机生成"
                      style="width: 300px"
                      @keyup.enter="addApiToken"
                    />
                    <el-button type="primary" text @click="generateNewApiToken">
                      随机生成
                    </el-button>
                    <el-button type="primary" @click="addApiToken">添加</el-button>
                  </div>
                  <div v-if="apiAuthTokens.length > 0" class="token-tags">
                    <el-tag
                      v-for="(token, index) in apiAuthTokens"
                      :key="index"
                      closable
                      type="info"
                      @close="removeApiToken(index)"
                      style="margin-right: 8px; margin-bottom: 8px"
                    >
                      {{ token.substring(0, 8) + '...' + token.substring(token.length - 4) }}
                    </el-tag>
                  </div>
                  <div class="form-hint">
                    共 {{ apiAuthTokens.length }} 个令牌，可分发给不同用户使用
                  </div>
                </div>
              </el-form-item>

              <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 16px">
                <template #title>
                  <span>请妥善保管访问令牌，启用认证后客户端需在请求头中携带令牌</span>
                </template>
              </el-alert>
            </template>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="缓存" name="cache">
          <el-form label-width="120px" class="config-form">
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

        <el-tab-pane label="日志" name="log">
          <el-form label-width="120px" class="config-form">
            <el-form-item label="启用日志">
              <el-switch v-model="logEnabled" />
              <span class="form-hint">
                启用后会将日志记录到文件，可在系统日志页面查看
              </span>
            </el-form-item>

            <template v-if="logEnabled">
              <el-form-item label="单文件上限">
                <el-input-number
                  v-model="logMaxSizeMB"
                  :min="1"
                  :max="1000"
                  :step="1"
                />
                <span class="form-hint" style="margin-left: 8px">
                  MB（单个日志文件最大大小，超过后停止写入当天日志）
                </span>
              </el-form-item>

              <el-form-item label="保留天数">
                <el-input-number
                  v-model="logKeepDays"
                  :min="1"
                  :max="365"
                  :step="1"
                />
                <span class="form-hint" style="margin-left: 8px">
                  天（超过此天数的日志将被自动清理）
                </span>
              </el-form-item>

              <el-alert type="info" :closable="false" show-icon>
                <template #title>
                  <span>日志文件存储在 <code>./logs/</code> 目录下，按日期命名（如 2024-01-15.log）</span>
                </template>
              </el-alert>
            </template>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="原始配置" name="raw">
          <div class="raw-config-container">
            <el-input
              v-model="rawConfig"
              type="textarea"
              :rows="10"
              class="raw-textarea"
            />
            <el-button type="primary" style="margin-top: 12px" @click="applyRawConfig">
              应用配置
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * 高级配置视图
 * @description 管理服务器配置、缓存配置等
 */
import { ref, reactive, onMounted, watch, computed } from "vue";
import { Check, DocumentCopy } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import {
  getConfig,
  updateConfig,
  type AppConfig,
} from "@/api/types";

const activeTab = ref("server");
const saving = ref(false);
const rawConfig = ref("");

/** API 认证配置（响应式计算属性） */
const apiAuthEnabled = computed({
  get: () => config.server.apiAuth?.enabled ?? false,
  set: (val: boolean) => {
    if (!config.server.apiAuth) {
      config.server.apiAuth = { enabled: false, type: "bearer", tokens: [] };
    }
    config.server.apiAuth.enabled = val;
  },
});

const apiAuthType = computed({
  get: () => config.server.apiAuth?.type ?? "bearer",
  set: (val: "bearer" | "api-key") => {
    if (!config.server.apiAuth) {
      config.server.apiAuth = { enabled: false, type: val, tokens: [] };
    }
    config.server.apiAuth.type = val;
  },
});

/** API 认证令牌列表 */
const apiAuthTokens = computed({
  get: () => config.server.apiAuth?.tokens ?? [],
  set: (val: string[]) => {
    if (!config.server.apiAuth) {
      config.server.apiAuth = { enabled: false, type: "bearer", tokens: val };
    } else {
      config.server.apiAuth.tokens = val;
    }
  },
});

/** 新令牌输入 */
const newApiToken = ref("");

/**
 * 生成随机 API 令牌
 * @description 生成 sk- 前缀的 32 位随机字符串
 */
function generateNewApiToken(): void {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "sk-";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  newApiToken.value = token;
}

/**
 * 添加 API 令牌
 * @description 将输入的令牌添加到列表中
 */
function addApiToken(): void {
  const token = newApiToken.value.trim();
  if (!token) {
    ElMessage.warning("请输入令牌");
    return;
  }
  if (apiAuthTokens.value.includes(token)) {
    ElMessage.warning("该令牌已存在");
    return;
  }
  apiAuthTokens.value = [...apiAuthTokens.value, token];
  newApiToken.value = "";
  ElMessage.success("已添加令牌");
}

/**
 * 移除 API 令牌
 * @param index 要移除的令牌索引
 */
function removeApiToken(index: number): void {
  apiAuthTokens.value = apiAuthTokens.value.filter((_, i) => i !== index);
  ElMessage.success("已移除令牌");
}

/** 日志配置（响应式计算属性） */
const logEnabled = computed({
  get: () => config.log?.enabled ?? true,
  set: (val: boolean) => {
    if (!config.log) {
      config.log = { enabled: val, maxSizeMB: 10, keepDays: 30 };
    } else {
      config.log.enabled = val;
    }
  },
});

const logMaxSizeMB = computed({
  get: () => config.log?.maxSizeMB ?? 10,
  set: (val: number) => {
    if (!config.log) {
      config.log = { enabled: true, maxSizeMB: val, keepDays: 30 };
    } else {
      config.log.maxSizeMB = val;
    }
  },
});

const logKeepDays = computed({
  get: () => config.log?.keepDays ?? 30,
  set: (val: number) => {
    if (!config.log) {
      config.log = { enabled: true, maxSizeMB: 10, keepDays: val };
    } else {
      config.log.keepDays = val;
    }
  },
});

/**
 * 生成随机管理员令牌
 * @description 生成 32 位随机字符串作为管理员令牌
 */
function generateAdminToken(): void {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  config.server.admin.adminToken = token;
  ElMessage.success("已生成随机管理员令牌");
}

function handleApiAuthEnabledChange(val: boolean) {
  if (val && !config.server.apiAuth) {
    config.server.apiAuth = { enabled: true, type: "bearer", tokens: [] };
  }
}

/** 描述列表列数（响应式） */
const descColumn = ref(1);

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

/**
 * 更新响应式变量（根据窗口宽度）
 */
function updateResponsive(): void {
  const width = window.innerWidth;
  descColumn.value = width < 768 ? 1 : 2;
}

onMounted(async () => {
  updateResponsive();
  window.addEventListener("resize", updateResponsive);
  
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

/* 令牌标签样式 */
.token-tags {
  display: flex;
  flex-wrap: wrap;
  padding: 8px;
  background: var(--bg-color);
  border-radius: 6px;
  border: 1px solid var(--border-color);
  min-height: 40px;
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
  margin: 0;
}

/* 移动端列表默认隐藏 */
.mobile-list {
  display: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .config-form :deep(.el-form-item__label) {
    width: 100px !important;
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .btn-text {
    display: none;
  }

  .config-form :deep(.el-form-item__label) {
    width: 100% !important;
    text-align: left;
    margin-bottom: 8px;
  }

  .config-form :deep(.el-form-item) {
    flex-direction: column;
    align-items: flex-start;
  }

  .endpoint-url {
    font-size: 12px;
    word-break: break-all;
  }

  .code-block {
    font-size: 11px;
    padding: 8px;
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
  align-items: center;
  margin-bottom: 8px;
}

.mobile-item .item-name {
  font-weight: 600;
  font-size: 14px;
}

.mobile-item .item-config {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: monospace;
  margin-bottom: 8px;
  word-break: break-all;
}

.mobile-item .item-actions {
  display: flex;
  gap: 8px;
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .endpoint-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .endpoint-url {
    font-size: 11px;
  }

  .code-block {
    font-size: 10px;
    padding: 6px;
  }

  .mobile-item {
    padding: 10px;
  }

  .mobile-item .item-name {
    font-size: 13px;
  }

  .mobile-item .item-config {
    font-size: 11px;
  }

  :deep(.el-tabs__item) {
    font-size: 13px;
    padding: 0 10px;
  }
}

/* 原始配置区域 */
.raw-config-container {
  display: flex;
  flex-direction: column;
}

.raw-textarea :deep(.el-textarea__inner) {
  font-family: "JetBrains Mono", "Consolas", monospace;
  min-height: 200px;
  max-height: 50vh;
}

/* Tab 内容区域响应式 */
@media (max-width: 768px) {
  :deep(.el-tabs__content) {
    max-height: calc(100vh - 350px);
    overflow-y: auto;
  }

  .raw-textarea :deep(.el-textarea__inner) {
    min-height: 150px;
    max-height: 40vh;
  }
}
</style>
