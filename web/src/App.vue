<template>
  <el-config-provider :locale="zhCn">
    <router-view v-slot="{ Component }">
      <transition name="page-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
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
/* 简洁的页面淡入淡出动画 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.page-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.page-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>