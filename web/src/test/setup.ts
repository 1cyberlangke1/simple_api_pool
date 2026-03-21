/**
 * Vitest Setup File
 * @description Mock CSS and other assets for component tests
 */
import { vi } from "vitest";

// Mock CSS imports
vi.mock("*.css", () => ({}));
vi.mock("*.scss", () => ({}));
vi.mock("*.sass", () => ({}));
vi.mock("*.less", () => ({}));

// Mock static assets
vi.mock("*.svg", () => "");
vi.mock("*.png", () => "");
vi.mock("*.jpg", () => "");
vi.mock("*.jpeg", () => "");
vi.mock("*.gif", () => "");
vi.mock("*.webp", () => "");
vi.mock("*.ico", () => "");

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollTo
window.scrollTo = vi.fn();

// Mock localStorage - 使用真实的 localStorage 以支持测试
// 注意：测试中直接使用 localStorage.setItem/getItem

/**
 * withSetup 辅助函数
 * @description 在组件上下文中执行 composable，解决生命周期钩子警告
 * @param composable 要测试的 composable 函数
 * @returns composable 返回值和 app 实例
 */
import { createApp, defineComponent, h } from "vue";

export function withSetup<T>(composable: () => T): { result: T; app: ReturnType<typeof createApp> } {
  let result!: T;
  const App = defineComponent({
    setup() {
      result = composable();
      return () => h("div");
    },
  });
  const app = createApp(App);
  const root = document.createElement("div");
  app.mount(root);
  return { result, app };
}
