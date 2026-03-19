<template>
  <el-config-provider :locale="zhCn">
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import { useThemeStore } from "@/stores/theme";

const themeStore = useThemeStore();

onMounted(() => {
  themeStore.init();
});
</script>

<style>
/* ============================================================
   CSS 变量定义 - 浅色模式
   ============================================================ */
:root {
  /* 主色调 */
  --primary-color: #c96b33;
  --primary-light: #d97a42;
  --primary-dark: #a85a28;
  
  /* 背景色 */
  --bg-color: #f7f2ea;
  --bg-gradient: linear-gradient(135deg, #f7f2ea 0%, #efe5d5 100%);
  --card-bg: #fff;
  --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  --card-shadow-hover: 0 8px 30px rgba(0, 0, 0, 0.1);
  
  /* 文字色 */
  --text-color: #2e2b26;
  --text-secondary: #606266;
  --text-muted: #909399;
  
  /* 边框 */
  --border-color: #e5d9c9;
  --border-light: #f0e6d8;
  
  /* 侧边栏 */
  --aside-bg: #fff7ec;
  --aside-gradient: linear-gradient(180deg, #fff7ec 0%, #fef3e5 100%);
  
  /* 玻璃拟态 */
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(255, 255, 255, 0.3);
  
  /* 渐变色 */
  --gradient-purple: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --gradient-pink: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  --gradient-blue: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
  --gradient-green: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
  --gradient-orange: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
  
  /* 动画时间 */
  --transition-fast: 0.15s;
  --transition-normal: 0.3s;
  --transition-slow: 0.5s;
}

/* ============================================================
   CSS 变量定义 - 深色模式
   ============================================================ */
:root[data-theme="dark"] {
  /* 主色调 */
  --primary-color: #e07a3a;
  --primary-light: #f08a4a;
  --primary-dark: #c06a2a;
  
  /* 背景色 */
  --bg-color: #0f0f10;
  --bg-gradient: linear-gradient(135deg, #0f0f10 0%, #1a1a1c 100%);
  --card-bg: #1a1a1c;
  --card-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  --card-shadow-hover: 0 8px 30px rgba(0, 0, 0, 0.4);
  
  /* 文字色 */
  --text-color: #e8e6e3;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  
  /* 边框 */
  --border-color: #2d2d30;
  --border-light: #3d3d40;
  
  /* 侧边栏 */
  --aside-bg: #161618;
  --aside-gradient: linear-gradient(180deg, #161618 0%, #1a1a1c 100%);
  
  /* 玻璃拟态 */
  --glass-bg: rgba(26, 26, 28, 0.85);
  --glass-border: rgba(255, 255, 255, 0.08);
}

/* ============================================================
   全局样式
   ============================================================ */
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Inter", "Noto Sans SC", system-ui, -apple-system, sans-serif;
  background: var(--bg-gradient);
  color: var(--text-color);
  transition: background var(--transition-normal), color var(--transition-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ============================================================
   自定义滚动条
   ============================================================ */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--text-muted);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

/* ============================================================
   Element Plus 主题覆盖
   ============================================================ */
.el-button--primary {
  --el-button-bg-color: var(--primary-color);
  --el-button-border-color: var(--primary-color);
  --el-button-hover-bg-color: var(--primary-light);
  --el-button-hover-border-color: var(--primary-light);
  --el-button-active-bg-color: var(--primary-dark);
  --el-button-active-border-color: var(--primary-dark);
  transition: all var(--transition-normal) ease;
}

.el-button--primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(201, 107, 51, 0.35);
}

.el-link--primary {
  --el-link-text-color: var(--primary-color);
  --el-link-hover-text-color: var(--primary-light);
}

/* 卡片样式增强 */
.el-card {
  border: 1px solid var(--border-color);
  box-shadow: var(--card-shadow);
  transition: all var(--transition-normal) ease;
  border-radius: 12px;
}

.el-card:hover {
  box-shadow: var(--card-shadow-hover);
}

/* ============================================================
   深色模式 Element Plus 覆盖
   ============================================================ */
:root[data-theme="dark"] .el-card {
  --el-card-bg-color: var(--card-bg);
  --el-card-border-color: var(--border-color);
  background: var(--card-bg);
}

:root[data-theme="dark"] .el-table {
  --el-table-bg-color: var(--card-bg);
  --el-table-tr-bg-color: var(--card-bg);
  --el-table-header-bg-color: #222225;
  --el-table-row-hover-bg-color: #252528;
  --el-table-border-color: var(--border-color);
  --el-table-text-color: var(--text-color);
}

:root[data-theme="dark"] .el-dialog {
  --el-dialog-bg-color: var(--card-bg);
  background: var(--card-bg);
}

:root[data-theme="dark"] .el-form-item__label {
  color: var(--text-secondary);
}

:root[data-theme="dark"] .el-input__wrapper {
  background-color: #222225;
  box-shadow: 0 0 0 1px var(--border-color) inset;
  transition: all var(--transition-normal) ease;
}

:root[data-theme="dark"] .el-input__wrapper:hover {
  box-shadow: 0 0 0 1px var(--text-muted) inset;
}

:root[data-theme="dark"] .el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--primary-color) inset;
}

:root[data-theme="dark"] .el-select__wrapper {
  background-color: #222225;
  box-shadow: 0 0 0 1px var(--border-color) inset;
}

:root[data-theme="dark"] .el-menu {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--text-color);
  --el-menu-hover-bg-color: rgba(224, 122, 58, 0.12);
}

:root[data-theme="dark"] .el-empty__description {
  color: var(--text-secondary);
}

:root[data-theme="dark"] .el-divider {
  --el-border-color: var(--border-color);
}

/* ============================================================
   动画关键帧
   ============================================================ */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 动画工具类 */
.fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

.pulse {
  animation: pulse 2s ease-in-out infinite;
}

.float {
  animation: float 3s ease-in-out infinite;
}

.scale-in {
  animation: scaleIn 0.3s ease-out forwards;
}

.slide-in-right {
  animation: slideInRight 0.3s ease-out forwards;
}

.slide-in-up {
  animation: slideInUp 0.3s ease-out forwards;
}

/* ============================================================
   表格美化
   ============================================================ */
.el-table__row {
  transition: all var(--transition-fast) ease;
}

.el-table__row:hover td {
  background: linear-gradient(90deg, rgba(201, 107, 51, 0.04) 0%, transparent 100%) !important;
}

:root[data-theme="dark"] .el-table__row:hover td {
  background: linear-gradient(90deg, rgba(224, 122, 58, 0.08) 0%, transparent 100%) !important;
}

/* 表格单元格动画 */
.el-table__cell {
  transition: background var(--transition-fast) ease;
}

/* ============================================================
   进度条美化
   ============================================================ */
.el-progress-bar__outer {
  background-color: var(--border-light) !important;
  border-radius: 6px !important;
}

.el-progress-bar__inner {
  border-radius: 6px !important;
  transition: width var(--transition-normal) ease !important;
}

/* ============================================================
   标签美化
   ============================================================ */
.el-tag {
  border-radius: 6px;
  font-weight: 500;
  transition: all var(--transition-fast) ease;
}

.el-tag--success {
  background: linear-gradient(135deg, #22c55e20 0%, #16a34a20 100%);
  border-color: #22c55e40;
}

.el-tag--warning {
  background: linear-gradient(135deg, #f59e0b20 0%, #d9770620 100%);
  border-color: #f59e0b40;
}

.el-tag--danger {
  background: linear-gradient(135deg, #ef444420 0%, #dc262620 100%);
  border-color: #ef444440;
}

.el-tag--info {
  background: linear-gradient(135deg, #6366f120 0%, #4f46e520 100%);
  border-color: #6366f140;
}

/* ============================================================
   对话框美化
   ============================================================ */
.el-dialog {
  border-radius: 16px !important;
  overflow: hidden;
}

.el-dialog__header {
  border-bottom: 1px solid var(--border-light);
  padding: 20px 24px !important;
}

.el-dialog__body {
  padding: 24px !important;
}

.el-dialog__footer {
  border-top: 1px solid var(--border-light);
  padding: 16px 24px !important;
}

/* ============================================================
   下拉菜单美化
   ============================================================ */
.el-select-dropdown {
  border-radius: 10px !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: var(--card-shadow-hover) !important;
}

.el-select-dropdown__item {
  transition: all var(--transition-fast) ease;
}

.el-select-dropdown__item:hover {
  background: linear-gradient(90deg, transparent 0%, rgba(201, 107, 51, 0.08) 100%);
}

/* ============================================================
   全局响应式媒体查询
   ============================================================ */

/* 平板端 (< 1024px) */
@media (max-width: 1024px) {
  .el-dialog {
    --el-dialog-width: 90% !important;
  }
  
  .el-drawer {
    --el-drawer-width: 80% !important;
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  /* 全局字体调整 */
  body {
    font-size: 14px;
  }
  
  /* 对话框适配 */
  .el-dialog {
    --el-dialog-width: 95% !important;
    --el-dialog-margin-top: 5vh !important;
    margin: 0 auto !important;
  }
  
  .el-dialog__header {
    padding: 16px !important;
  }
  
  .el-dialog__body {
    padding: 16px !important;
    max-height: 60vh;
    overflow-y: auto;
  }
  
  .el-dialog__footer {
    padding: 12px 16px !important;
  }
  
  /* 抽屉适配 */
  .el-drawer {
    --el-drawer-width: 90% !important;
  }
  
  /* 卡片内边距 */
  .el-card__body {
    padding: 16px !important;
  }
  
  .el-card__header {
    padding: 12px 16px !important;
  }
  
  /* 表单适配 */
  .el-form-item__label {
    float: none !important;
    text-align: left !important;
    margin-bottom: 8px !important;
    line-height: 1.5 !important;
  }
  
  .el-form-item__content {
    margin-left: 0 !important;
  }
  
  /* 描述列表适配 */
  .el-descriptions {
    --el-descriptions-table-border: 1px solid var(--border-color);
  }
  
  .el-descriptions__label {
    width: 100px !important;
  }
  
  /* 标签组适配 */
  .el-tag {
    margin: 2px;
  }
  
  /* 按钮组适配 */
  .el-button + .el-button {
    margin-left: 8px;
  }
}

/* 小屏手机 (< 480px) */
@media (max-width: 480px) {
  body {
    font-size: 13px;
  }
  
  .el-card__body {
    padding: 12px !important;
  }
  
  .el-card__header {
    padding: 10px 12px !important;
  }
  
  .el-dialog {
    --el-dialog-width: 100% !important;
    --el-dialog-margin-top: 0 !important;
    border-radius: 0 0 16px 16px !important;
    max-height: 90vh;
  }
  
  .el-dialog__header {
    padding: 12px !important;
  }
  
  .el-dialog__body {
    padding: 12px !important;
    max-height: 50vh;
  }
  
  /* 按钮更紧凑 */
  .el-button {
    padding: 8px 12px;
  }
  
  .el-button--small {
    padding: 6px 10px;
  }
  
  /* 输入框更紧凑 */
  .el-input__inner {
    font-size: 14px;
  }
  
  /* 标签更紧凑 */
  .el-tag {
    padding: 0 6px;
    font-size: 11px;
  }
}

/* ============================================================
   响应式工具类
   ============================================================ */

/* 仅桌面端显示 */
.desktop-only {
  display: block;
}

/* 仅移动端显示 */
.mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .desktop-only {
    display: none !important;
  }
  
  .mobile-only {
    display: block !important;
  }
  
  .mobile-only.inline {
    display: inline !important;
  }
  
  .mobile-only.flex {
    display: flex !important;
  }
}

/* ============================================================
   触摸设备优化
   ============================================================ */
@media (hover: none) and (pointer: coarse) {
  /* 增大点击区域 */
  .el-button {
    min-height: 36px;
  }
  
  .el-menu-item {
    min-height: 48px;
  }
  
  /* 禁用 hover 效果避免粘滞 */
  .el-button:hover {
    transform: none;
  }
  
  .el-card:hover {
    box-shadow: var(--card-shadow);
  }
}

/* ============================================================
   安全区域适配 (iOS 刘海屏等)
   ============================================================ */
@supports (padding-top: env(safe-area-inset-top)) {
  .layout-container {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
</style>