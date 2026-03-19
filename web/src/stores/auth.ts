import { computed } from "vue";
import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";

export const useAuthStore = defineStore("auth", () => {
  // 使用 @vueuse/core 的 useLocalStorage，自动同步 localStorage
  const token = useLocalStorage<string | null>("admin_token", null);

  const isAuthenticated = computed(() => !!token.value);

  function setToken(newToken: string) {
    token.value = newToken;
  }

  function logout() {
    token.value = null;
  }

  return {
    token,
    isAuthenticated,
    setToken,
    logout,
  };
});