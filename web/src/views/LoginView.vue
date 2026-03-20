<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <div class="card-header">
          <el-icon :size="32" color="#c96b33"><Key /></el-icon>
          <h2>Simple API Pool</h2>
          <p>管理面板登录</p>
        </div>
      </template>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <el-form-item prop="token">
          <el-input
            v-model="form.token"
            type="password"
            placeholder="请输入 Admin Token"
            size="large"
            show-password
            :prefix-icon="Lock"
          />
        </el-form-item>

        <!-- Token 获取帮助说明 -->
        <el-collapse class="help-collapse">
          <el-collapse-item title="如何获取 Token？" name="help">
            <div class="help-content">
              <p><strong>Token 是什么？</strong></p>
              <p>Token 是管理员密码，用于保护您的 API 池不被他人访问。</p>
              <el-divider />
              <p><strong>如何找到 Token？</strong></p>
              <ol>
                <li>找到项目配置文件 <code>setting.json</code> 或 <code>setting.ts</code></li>
                <li>查找 <code>adminToken</code> 字段，其中的值就是您的 Token</li>
              </ol>
              <el-alert
                type="warning"
                :closable="false"
                show-icon
                class="help-alert"
              >
                <template #title>
                  <span>如果忘记 Token，请查看服务器启动时的配置文件</span>
                </template>
              </el-alert>
            </div>
          </el-collapse-item>
        </el-collapse>

        <el-form-item>
          <el-button type="primary" size="large" :loading="loading" native-type="submit" style="width: 100%">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { Lock, Key } from "@element-plus/icons-vue";
import { useAuthStore } from "@/stores/auth";
import { getConfig } from "@/api/types";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const formRef = ref();
const loading = ref(false);

const form = reactive({
  token: "",
});

const rules = {
  token: [{ required: true, message: "请输入 Admin Token", trigger: "blur" }],
};

async function handleLogin() {
  await formRef.value?.validate();

  loading.value = true;
  try {
    // 先设置 token 到 Pinia store（会自动同步到 localStorage）
    authStore.setToken(form.token);
    // 额外确保 token 已写入 localStorage，避免 axios 拦截器读取时机问题
    localStorage.setItem("admin_token", form.token);
    // 验证 token 是否有效
    await getConfig();

    ElMessage.success("登录成功");
    const redirect = route.query.redirect as string;
    router.push(redirect || "/");
  } catch {
    authStore.logout();
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(201, 107, 51, 0.12), transparent 34%),
    linear-gradient(135deg, var(--bg-color) 0%, color-mix(in srgb, var(--bg-color) 70%, var(--border-color) 30%) 100%);
  transition: background 0.3s;
}

.login-card {
  width: min(100%, 480px);
  border-radius: var(--card-radius);
  overflow: hidden;
  position: relative;
}

.login-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 4px;
  background: linear-gradient(90deg, var(--primary-color), var(--primary-light), var(--primary-color));
  background-size: 200% 100%;
  animation: shimmer 3s ease infinite;
}

.card-header {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.card-header .el-icon {
  filter: drop-shadow(0 0 12px rgba(201, 107, 51, 0.3));
}

.card-header h2 {
  margin: 12px 0 4px;
  color: var(--text-color);
  font-weight: 600;
}

.card-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 帮助说明样式 */
.help-collapse {
  margin-bottom: 16px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
}

.help-collapse :deep(.el-collapse-item__header) {
  background: var(--border-light);
  padding: 0 16px;
  font-size: 13px;
  color: var(--primary-color);
  font-weight: 500;
}

.help-collapse :deep(.el-collapse-item__content) {
  padding: 16px;
}

.help-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.help-content p {
  margin: 0 0 8px;
}

.help-content ol {
  margin: 8px 0;
  padding-left: 20px;
}

.help-content li {
  margin: 6px 0;
}

.help-content code {
  background: var(--border-color);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  color: var(--primary-color);
}

.help-alert {
  margin-top: 12px;
}
</style>
