<template>
  <el-container class="layout-container">
    <!-- 桌面端侧边栏 -->
    <el-aside width="230px" class="aside desktop-aside">
      <div class="logo">
        <div class="logo-icon">
          <el-icon :size="26"><Connection /></el-icon>
        </div>
        <span class="logo-text">API Pool</span>
      </div>

      <el-menu
        :default-active="route.path"
        router
        background-color="transparent"
        text-color="var(--text-color)"
        active-text-color="var(--primary-color)"
        class="nav-menu"
      >
        <el-tooltip content="查看系统整体状态和统计数据" placement="right" :show-after="500">
          <el-menu-item index="/" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Odometer /></el-icon>
              <span>仪表盘</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="测试对话功能，体验 AI 回答效果" placement="right" :show-after="500">
          <el-menu-item index="/playground" class="nav-item">
            <div class="nav-item-content">
              <el-icon><ChatDotRound /></el-icon>
              <span>对话测试</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="管理 API 密钥，添加或配置访问密钥" placement="right" :show-after="500">
          <el-menu-item index="/keys" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Key /></el-icon>
              <span>Key 管理</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="配置 API 服务提供商，如 OpenAI、Claude 等" placement="right" :show-after="500">
          <el-menu-item index="/providers" class="nav-item">
            <div class="nav-item-content">
              <el-icon><OfficeBuilding /></el-icon>
              <span>提供商</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="配置可用模型，设置模型参数和价格" placement="right" :show-after="500">
          <el-menu-item index="/models" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Document /></el-icon>
              <span>模型配置</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="创建模型分组，方便客户端调用多个模型" placement="right" :show-after="500">
          <el-menu-item index="/groups" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Grid /></el-icon>
              <span>分组配置</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="管理 JS 工具和 MCP 工具，扩展 AI 能力" placement="right" :show-after="500">
          <el-menu-item index="/tools" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Cpu /></el-icon>
              <span>工具管理</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="高级系统配置，修改缓存和工具设置" placement="right" :show-after="500">
          <el-menu-item index="/config" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Setting /></el-icon>
              <span>高级配置</span>
            </div>
          </el-menu-item>
        </el-tooltip>
        <el-tooltip content="查看系统运行日志，排查问题" placement="right" :show-after="500">
          <el-menu-item index="/logs" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Notebook /></el-icon>
              <span>系统日志</span>
            </div>
          </el-menu-item>
        </el-tooltip>
      </el-menu>

      <div class="aside-footer">
        <div class="version">v2.0.0</div>
      </div>
    </el-aside>

    <!-- 移动端抽屉导航 -->
    <el-drawer
      v-model="mobileMenuOpen"
      direction="ltr"
      :size="280"
      :with-header="false"
      class="mobile-drawer"
    >
      <div class="aside mobile-aside">
        <div class="logo">
          <div class="logo-icon">
            <el-icon :size="26"><Connection /></el-icon>
          </div>
          <span class="logo-text">API Pool</span>
        </div>

        <el-menu
          :default-active="route.path"
          router
          background-color="transparent"
          text-color="var(--text-color)"
          active-text-color="var(--primary-color)"
          class="nav-menu"
          @select="closeMobileMenu"
        >
          <el-menu-item index="/" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Odometer /></el-icon>
              <span>仪表盘</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/playground" class="nav-item">
            <div class="nav-item-content">
              <el-icon><ChatDotRound /></el-icon>
              <span>对话测试</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/keys" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Key /></el-icon>
              <span>Key 管理</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/providers" class="nav-item">
            <div class="nav-item-content">
              <el-icon><OfficeBuilding /></el-icon>
              <span>提供商</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/models" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Document /></el-icon>
              <span>模型配置</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/groups" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Grid /></el-icon>
              <span>分组配置</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/tools" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Cpu /></el-icon>
              <span>工具管理</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/config" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Setting /></el-icon>
              <span>高级配置</span>
            </div>
          </el-menu-item>
          <el-menu-item index="/logs" class="nav-item">
            <div class="nav-item-content">
              <el-icon><Notebook /></el-icon>
              <span>系统日志</span>
            </div>
          </el-menu-item>
        </el-menu>

        <div class="aside-footer">
          <div class="version">v2.0.0</div>
        </div>
      </div>
    </el-drawer>

    <el-container class="layout-main-shell">
      <el-header class="header">
        <div class="header-left">
          <!-- 移动端汉堡菜单按钮 -->
          <el-button
            class="hamburger-btn"
            @click="toggleMobileMenu"
          >
            <el-icon :size="20"><Fold v-if="mobileMenuOpen" /><Expand v-else /></el-icon>
          </el-button>
          <h3>{{ pageTitle }}</h3>
        </div>
        <div class="header-right">
          <el-tooltip :content="themeTooltip" placement="bottom">
            <el-button circle class="theme-btn" @click="toggleTheme">
              <el-icon v-if="themeStore.mode === 'light'"><Sunny /></el-icon>
              <el-icon v-else-if="themeStore.mode === 'dark'"><Moon /></el-icon>
              <el-icon v-else><Monitor /></el-icon>
            </el-button>
          </el-tooltip>
          <el-button type="danger" text class="logout-btn" @click="handleLogout">
            <el-icon><SwitchButton /></el-icon>
            <span class="logout-text">退出</span>
          </el-button>
        </div>
      </el-header>

      <el-main class="main">
        <div class="page-shell app-page-shell">
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <keep-alive>
                <component :is="Component" />
              </keep-alive>
            </transition>
          </router-view>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
/**
 * 主布局组件
 * @description 提供响应式侧边栏导航和主内容区域
 * @behavior 桌面端显示固定侧边栏，移动端使用抽屉式导航
 */
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Connection,
  Odometer,
  Key,
  OfficeBuilding,
  Document,
  Grid,
  Setting,
  SwitchButton,
  Notebook,
  Sunny,
  Moon,
  Monitor,
  ChatDotRound,
  Cpu,
  Fold,
  Expand,
} from "@element-plus/icons-vue";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();

/** 移动端菜单展开状态 */
const mobileMenuOpen = ref(false);

const pageTitle = computed(() => {
  const titles: Record<string, string> = {
    "/": "仪表盘",
    "/playground": "对话测试",
    "/keys": "Key 管理",
    "/providers": "提供商配置",
    "/models": "模型配置",
    "/groups": "分组配置",
    "/tools": "工具管理",
    "/config": "高级配置",
    "/logs": "系统日志",
  };
  return titles[route.path] || "管理面板";
});

const themeTooltip = computed(() => {
  const tips = {
    light: "当前：浅色模式（点击切换深色）",
    dark: "当前：深色模式（点击切换跟随系统）",
    system: "当前：跟随系统（点击切换浅色）",
  };
  return tips[themeStore.mode];
});

function toggleTheme() {
  themeStore.toggleTheme();
}

function handleLogout() {
  authStore.logout();
  router.push("/login");
}

/** 切换移动端菜单 */
function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value;
}

/** 关闭移动端菜单 */
function closeMobileMenu() {
  mobileMenuOpen.value = false;
}
</script>

<style scoped>
.layout-container {
  min-height: 100vh;
  background: var(--bg-gradient);
}

.layout-main-shell {
  min-width: 0;
}

/* ============================================================
   侧边栏样式
   ============================================================ */
.aside {
  background: var(--aside-gradient);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(12px);
}

.aside::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c96b33' fill-opacity='0.03'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  pointer-events: none;
}

/* Logo 样式 */
.logo {
  height: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-bottom: 1px solid var(--border-light);
  position: relative;
  z-index: 1;
}

.logo-icon {
  width: 42px;
  height: 42px;
  background: var(--gradient-orange);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 4px 12px rgba(201, 107, 51, 0.3);
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
}

.logo:hover .logo-icon {
  transform: scale(1.05) rotate(-3deg);
  box-shadow: 0 6px 16px rgba(201, 107, 51, 0.4);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color);
  letter-spacing: -0.5px;
}

/* 导航菜单样式 */
.nav-menu {
  border-right: none;
  padding: 12px;
  position: relative;
  z-index: 1;
  flex: 1;
}

.nav-item {
  border-radius: 10px;
  margin: 4px 0;
  height: 48px;
  line-height: 48px;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
}

.nav-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--primary-color);
  border-radius: 0 3px 3px 0;
  transform: scaleY(0);
  transition: transform var(--transition-normal);
}

.nav-item:hover {
  background: linear-gradient(90deg, rgba(201, 107, 51, 0.08) 0%, transparent 100%);
}

.nav-item:hover::before {
  transform: scaleY(1);
}

.nav-item.is-active {
  background: linear-gradient(90deg, rgba(201, 107, 51, 0.12) 0%, rgba(201, 107, 51, 0.04) 100%);
}

.nav-item.is-active::before {
  transform: scaleY(1);
}

.nav-item-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-item-content .el-icon {
  font-size: 18px;
  transition: transform var(--transition-normal);
}

.nav-item:hover .nav-item-content .el-icon {
  transform: scale(1.1);
}

/* 侧边栏底部 */
.aside-footer {
  padding: 16px;
  border-top: 1px solid var(--border-light);
  position: relative;
  z-index: 1;
}

.version {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}

/* ============================================================
   头部样式
   ============================================================ */
.header {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 var(--page-padding-x);
  height: 68px;
  transition: all var(--transition-normal);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.header-left h3 {
  margin: 0;
  font-weight: 600;
  font-size: 18px;
  color: var(--text-color);
  position: relative;
  padding-left: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-left h3::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 20px;
  background: var(--gradient-orange);
  border-radius: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.theme-btn {
  transition: all var(--transition-normal);
}

.theme-btn:hover {
  transform: rotate(15deg) scale(1.1);
  background: var(--border-light);
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-normal);
}

.logout-btn:hover {
  transform: translateX(-4px);
}

/* 汉堡菜单按钮 */
.hamburger-btn {
  display: none;
  padding: 8px;
  border: none;
  background: transparent;
}

/* ============================================================
   主内容区样式
   ============================================================ */
.main {
  background: transparent;
  padding: var(--page-padding-y) var(--page-padding-x);
  transition: all var(--transition-normal);
  overflow-y: auto;
}

.app-page-shell {
  min-height: 100%;
}

/* 页面切换动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(12px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

/* ============================================================
   移动端抽屉样式
   ============================================================ */
.mobile-drawer :deep(.el-drawer__body) {
  padding: 0;
}

.mobile-aside {
  height: 100%;
  border-right: none;
}

/* ============================================================
   响应式媒体查询
   ============================================================ */

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .desktop-aside {
    width: 208px !important;
  }

  .header {
    height: 64px;
  }

  .header-right {
    gap: 10px;
  }

  .main {
    padding: var(--page-padding-y) var(--page-padding-x);
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  /* 隐藏桌面端侧边栏 */
  .desktop-aside {
    display: none;
  }

  /* 显示汉堡菜单 */
  .hamburger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-left {
    flex: 1;
  }

  .header-left h3 {
    font-size: 16px;
    padding-left: 8px;
  }

  .header-left h3::before {
    width: 3px;
    height: 16px;
  }

  .header {
    height: 60px;
  }

  .main {
    padding: var(--page-padding-y) var(--page-padding-x);
  }

  .logout-text {
    display: none;
  }

  .header-right {
    gap: 8px;
  }
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  .header-left h3 {
    font-size: 14px;
  }

  .main {
    padding: var(--page-padding-y) var(--page-padding-x);
  }

  .theme-btn {
    width: 32px;
    height: 32px;
    padding: 0;
  }
}

/* ============================================================
   深色模式特殊处理
   ============================================================ */
:root[data-theme="dark"] .aside::before {
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e07a3a' fill-opacity='0.02'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}

:root[data-theme="dark"] .header {
  background: rgba(26, 26, 28, 0.9);
  border-bottom-color: rgba(255, 255, 255, 0.05);
}
</style>