<template>
  <el-config-provider :locale="zhCn">
    <router-view v-slot="{ Component, route }">
      <transition
        :name="(route.meta.transition as string) || 'ios-page'"
        mode="out-in"
      >
        <component :is="Component" :key="route.path" />
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
/* iOS 风格页面转场动画 */
.ios-page-enter-active {
  animation: iosPushIn var(--ios-duration-modal, 0.4s) var(--ios-spring-gentle, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.ios-page-leave-active {
  animation: iosPushOut var(--ios-duration-modal, 0.4s) var(--ios-ease-in, cubic-bezier(0.42, 0, 1, 1));
}

@keyframes iosPushIn {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes iosPushOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(-20px);
  }
}

/* 模态页面动画（从底部滑入） */
.ios-modal-enter-active {
  animation: iosModalSlideIn var(--ios-duration-modal, 0.4s) var(--ios-spring-gentle, cubic-bezier(0.34, 1.56, 0.64, 1));
}

.ios-modal-leave-active {
  animation: iosModalSlideOut var(--ios-duration-modal, 0.4s) var(--ios-ease-in, cubic-bezier(0.42, 0, 1, 1));
}

@keyframes iosModalSlideIn {
  from {
    opacity: 0;
    transform: translateY(50px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes iosModalSlideOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(50px) scale(0.95);
  }
}

/* 淡入淡出动画 */
.ios-fade-enter-active,
.ios-fade-leave-active {
  transition: opacity var(--ios-duration-normal, 0.35s) var(--ios-ease, cubic-bezier(0.25, 0.1, 0.25, 1));
}

.ios-fade-enter-from,
.ios-fade-leave-to {
  opacity: 0;
}

/* 缩放淡入动画 */
.ios-scale-enter-active {
  animation: iosScaleIn var(--ios-duration-normal, 0.35s) var(--ios-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
}

.ios-scale-leave-active {
  animation: iosScaleOut var(--ios-duration-fast, 0.2s) var(--ios-ease-in, cubic-bezier(0.42, 0, 1, 1));
}

@keyframes iosScaleIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes iosScaleOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>