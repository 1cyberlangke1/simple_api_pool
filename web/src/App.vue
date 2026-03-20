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

  /* 表面层级 */
  --surface-secondary: #f3ede4;
  --surface-accent: rgba(201, 107, 51, 0.06);
  --surface-inset: #f0ebe3;

  /* 玻璃拟态 */
  --glass-bg: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(255, 255, 255, 0.3);

  /* 移动卡片 */
  --mobile-card-radius: 14px;
  --mobile-card-padding: 16px;
  --mobile-card-gap: 12px;

  /* 空状态 */
  --empty-icon-size: 52px;
  --empty-icon-bg: rgba(201, 107, 51, 0.08);
  --empty-title-color: var(--text-color);
  --empty-desc-color: var(--text-muted);

  /* 布局语义 */
  --layout-max-width: 1440px;
  --layout-wide-max-width: 1680px;
  --page-padding-x: 28px;
  --page-padding-y: 24px;
  --page-gap: 20px;
  --page-section-gap: 24px;
  --card-radius: 16px;
  --card-radius-sm: 12px;
  --compact-gap: 12px;
  --toolbar-gap: 12px;
  --toolbar-gap-compact: 8px;
  --table-cell-padding-x: 14px;
  --table-cell-padding-y: 12px;

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

  /* 表面层级 */
  --surface-secondary: #222225;
  --surface-accent: rgba(224, 122, 58, 0.08);
  --surface-inset: #1e1e20;

  /* 玻璃拟态 */
  --glass-bg: rgba(26, 26, 28, 0.85);
  --glass-border: rgba(255, 255, 255, 0.08);

  /* 空状态 */
  --empty-icon-bg: rgba(224, 122, 58, 0.12);
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

* {
  box-sizing: border-box;
}

#app {
  min-height: 100%;
}

.page-shell {
  width: min(100%, var(--layout-max-width));
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--toolbar-gap);
  flex-wrap: wrap;
}

.page-header__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.page-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--toolbar-gap);
  flex-wrap: wrap;
  min-width: min(100%, 420px);
}

.compact-toolbar {
  display: flex;
  align-items: center;
  gap: var(--toolbar-gap-compact);
  flex-wrap: wrap;
}

.section-stack {
  display: flex;
  flex-direction: column;
  gap: var(--page-section-gap);
}

/* ============================================================
   统一移动数据卡片
   ============================================================ */
.data-card-list {
  display: none;
  flex-direction: column;
  gap: var(--mobile-card-gap);
}

.data-card {
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: var(--mobile-card-radius);
  padding: var(--mobile-card-padding);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all var(--transition-normal) ease;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:root[data-theme="dark"] .data-card {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.data-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
}

.data-card__title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.data-card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.data-card__body-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.data-card__label {
  color: var(--text-muted);
  font-size: 12px;
  flex-shrink: 0;
}

.data-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.data-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--border-light);
}

/* ============================================================
   统一空状态
   ============================================================ */
.page-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 12px;
}

.page-empty__icon {
  width: var(--empty-icon-size);
  height: var(--empty-icon-size);
  border-radius: 50%;
  background: var(--empty-icon-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
  font-size: 24px;
  margin-bottom: 4px;
}

.page-empty__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--empty-title-color);
  margin: 0;
}

.page-empty__desc {
  font-size: 13px;
  color: var(--empty-desc-color);
  max-width: 320px;
  line-height: 1.6;
  margin: 0;
}

.page-empty__action {
  margin-top: 8px;
}

/* ============================================================
   统一代码/JSON 展示面板
   ============================================================ */
.code-panel {
  background: var(--surface-inset);
  border: 1px solid var(--border-light);
  border-radius: var(--card-radius-sm);
  padding: 14px;
  font-family: "JetBrains Mono", "Consolas", "Monaco", monospace;
  font-size: 12px;
  line-height: 1.65;
  color: var(--text-color);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  transition: background-color var(--transition-normal), border-color var(--transition-normal);
}

:root[data-theme="dark"] .code-panel {
  background: #111113;
  border-color: var(--border-color);
}

/* ============================================================
   轻量信息网格
   ============================================================ */
.info-grid {
  display: grid;
  gap: 12px;
}

.info-grid--2 { grid-template-columns: repeat(2, 1fr); }
.info-grid--3 { grid-template-columns: repeat(3, 1fr); }
.info-grid--4 { grid-template-columns: repeat(4, 1fr); }

.info-grid__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--surface-secondary);
  border-radius: var(--card-radius-sm);
  transition: background-color var(--transition-normal);
}

.info-grid__value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-color);
  line-height: 1.2;
}

.info-grid__label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
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
  border-radius: var(--card-radius);
}

.el-card__header {
  padding: 18px 20px !important;
}

.el-card__body {
  padding: 20px !important;
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
  padding: var(--table-cell-padding-y) var(--table-cell-padding-x) !important;
}

/* 表头增强 */
.el-table__header-wrapper th.el-table__cell {
  font-weight: 600 !important;
  font-size: 13px;
  color: var(--text-secondary) !important;
  background: var(--surface-secondary) !important;
}

:root[data-theme="dark"] .el-table__header-wrapper th.el-table__cell {
  background: #1e1e21 !important;
}

/* ============================================================
   空状态美化
   ============================================================ */
.el-empty {
  padding: 32px 16px;
}

.el-empty__image {
  width: 96px;
  opacity: 0.7;
}

.el-empty__description p {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
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
  :root {
    --page-padding-x: 20px;
    --page-padding-y: 20px;
    --page-gap: 16px;
    --page-section-gap: 20px;
    --table-cell-padding-x: 12px;
    --table-cell-padding-y: 10px;
  }

  .page-header__actions {
    min-width: 100%;
    justify-content: flex-start;
  }

  .el-dialog {
    --el-dialog-width: 90% !important;
  }

  .el-drawer {
    --el-drawer-width: 80% !important;
  }
}

/* 移动端 (< 768px) */
@media (max-width: 768px) {
  :root {
    --page-padding-x: 14px;
    --page-padding-y: 16px;
    --page-gap: 12px;
    --page-section-gap: 16px;
    --card-radius: 14px;
    --card-radius-sm: 10px;
    --table-cell-padding-x: 10px;
    --table-cell-padding-y: 9px;
    --mobile-card-padding: 14px;
    --mobile-card-gap: 10px;
  }

  /* 显示移动数据卡片列表 */
  .data-card-list {
    display: flex;
  }

  /* 信息网格移动端降列 */
  .info-grid--3,
  .info-grid--4 {
    grid-template-columns: repeat(2, 1fr);
  }

  /* 全局字体调整 */
  body {
    font-size: 14px;
  }

  .page-header {
    gap: var(--compact-gap);
  }

  .page-header__meta,
  .page-header__actions {
    width: 100%;
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
  :root {
    --page-padding-x: 10px;
    --page-padding-y: 12px;
    --page-gap: 10px;
    --page-section-gap: 14px;
    --toolbar-gap: 8px;
    --toolbar-gap-compact: 6px;
    --table-cell-padding-x: 8px;
    --table-cell-padding-y: 8px;
    --mobile-card-padding: 12px;
    --mobile-card-gap: 8px;
    --mobile-card-radius: 12px;
  }

  body {
    font-size: 13px;
  }

  /* 信息网格小屏降列 */
  .info-grid--2,
  .info-grid--3,
  .info-grid--4 {
    grid-template-columns: 1fr;
  }

  .info-grid__value {
    font-size: 18px;
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