/**
 * 主题状态管理
 * @description 管理深色/浅色模式切换，支持跟随系统
 */
import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type ThemeMode = "light" | "dark" | "system";

export const useThemeStore = defineStore("theme", () => {
  /** 当前主题模式 */
  const mode = ref<ThemeMode>((localStorage.getItem("theme-mode") as ThemeMode) || "system");

  /** 实际应用的主题（light 或 dark） */
  const appliedTheme = ref<"light" | "dark">("light");

  /**
   * 获取系统主题偏好
   */
  function getSystemTheme(): "light" | "dark" {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  /**
   * 应用主题到 DOM
   */
  function applyTheme(theme: "light" | "dark") {
    appliedTheme.value = theme;
    document.documentElement.setAttribute("data-theme", theme);

    // 同时设置 Element Plus 的暗黑模式
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  /**
   * 更新主题
   */
  function updateTheme(newMode: ThemeMode) {
    mode.value = newMode;
    localStorage.setItem("theme-mode", newMode);

    if (newMode === "system") {
      applyTheme(getSystemTheme());
    } else {
      applyTheme(newMode);
    }
  }

  /**
   * 切换主题（light -> dark -> system -> light）
   */
  function toggleTheme() {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const currentIndex = order.indexOf(mode.value);
    const nextIndex = (currentIndex + 1) % order.length;
    updateTheme(order[nextIndex]);
  }

  // 监听系统主题变化
  function setupSystemThemeListener() {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      if (mode.value === "system") {
        applyTheme(getSystemTheme());
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }

  // 初始化主题
  function init() {
    if (mode.value === "system") {
      applyTheme(getSystemTheme());
    } else {
      applyTheme(mode.value);
    }
    setupSystemThemeListener();
  }

  // 监听 mode 变化
  watch(mode, (newMode) => {
    if (newMode === "system") {
      applyTheme(getSystemTheme());
    } else {
      applyTheme(newMode);
    }
  });

  return {
    mode,
    appliedTheme,
    updateTheme,
    toggleTheme,
    init,
  };
});
