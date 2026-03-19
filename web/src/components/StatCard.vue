<template>
  <el-card shadow="hover" class="stat-card">
    <div class="stat-icon" :class="iconClass">
      <el-icon :size="20"><component :is="icon" /></el-icon>
    </div>
    <div class="stat-info">
      <div class="stat-value">{{ value }}</div>
      <div class="stat-label">{{ label }}</div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import type { Component } from "vue";

/**
 * 统计卡片组件
 * @description 显示单个统计指标的卡片，带有悬浮动画和渐变图标
 * @param icon 图标组件
 * @param iconClass 图标样式类名
 * @param value 数值
 * @param label 标签
 */

defineProps<{
  icon: Component;
  iconClass: string;
  value: number;
  label: string;
}>();
</script>

<style scoped>
.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: 16px;
  transition: all var(--transition-normal);
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, transparent 0%, rgba(255, 255, 255, 0.03) 100%);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--transition-normal);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
}

.stat-card:hover::before {
  opacity: 1;
}

:root[data-theme="dark"] .stat-card:hover {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
}

.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 20px;
  width: 100%;
  box-sizing: border-box;
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  position: relative;
  transition: transform var(--transition-normal), box-shadow var(--transition-normal);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.stat-icon::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, transparent 50%);
}

.stat-card:hover .stat-icon {
  transform: scale(1.08) rotate(-3deg);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.stat-icon.providers {
  background: var(--gradient-purple);
}

.stat-icon.models {
  background: var(--gradient-pink);
}

.stat-icon.keys {
  background: var(--gradient-blue);
}

.stat-icon.groups {
  background: var(--gradient-green);
}

.stat-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-color);
  line-height: 1.2;
  letter-spacing: -0.5px;
  transition: color var(--transition-normal);
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
  font-weight: 500;
}
</style>
