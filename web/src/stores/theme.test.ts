/**
 * Theme Store 测试
 * @description 测试主题状态管理
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useThemeStore } from "./theme";

// Mock matchMedia
const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", {
  value: matchMediaMock,
});

// Mock document.documentElement
const documentElementMock = {
  setAttribute: vi.fn(),
  classList: {
    add: vi.fn(),
    remove: vi.fn(),
  },
};

Object.defineProperty(document, "documentElement", {
  value: documentElementMock,
  writable: true,
});

describe("Theme Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe("初始状态", () => {
    it("初始模式应为 system", () => {
      const store = useThemeStore();
      expect(store.mode).toBe("system");
    });
  });

  describe("updateTheme", () => {
    it("应该更新主题模式为 dark", () => {
      const store = useThemeStore();
      store.updateTheme("dark");

      expect(store.mode).toBe("dark");
    });

    it("应该更新主题模式为 light", () => {
      const store = useThemeStore();
      store.updateTheme("light");

      expect(store.mode).toBe("light");
    });
  });

  describe("toggleTheme", () => {
    it("应该从 light 切换到 dark", () => {
      const store = useThemeStore();
      store.updateTheme("light");
      store.toggleTheme();

      expect(store.mode).toBe("dark");
    });

    it("应该从 dark 切换到 system", () => {
      const store = useThemeStore();
      store.updateTheme("dark");
      store.toggleTheme();

      expect(store.mode).toBe("system");
    });

    it("应该从 system 切换到 light", () => {
      const store = useThemeStore();
      store.updateTheme("system");
      store.toggleTheme();

      expect(store.mode).toBe("light");
    });
  });
});