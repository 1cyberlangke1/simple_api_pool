/**
 * Auth Store 测试
 * @description 测试认证状态管理
 */
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAuthStore } from "./auth";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// 注意：实际 store 使用 @vueuse/core 的 useLocalStorage
// 其 key 为 "admin_token"（下划线）

describe("Auth Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
  });

  describe("初始状态", () => {
    it("初始时无 token", () => {
      const store = useAuthStore();
      expect(store.token).toBe(null);
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe("setToken", () => {
    it("应该设置 token", () => {
      const store = useAuthStore();
      store.setToken("test-token");

      expect(store.token).toBe("test-token");
      expect(store.isAuthenticated).toBe(true);
    });
  });

  describe("logout", () => {
    it("应该清除 token", () => {
      const store = useAuthStore();
      store.setToken("to-be-cleared");
      store.logout();

      expect(store.token).toBe(null);
      expect(store.isAuthenticated).toBe(false);
    });
  });
});
