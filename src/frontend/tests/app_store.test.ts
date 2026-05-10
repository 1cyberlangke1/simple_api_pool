import { describe, expect, it } from "vitest";

import { persistThemeMode, readStoredThemeMode, resolveThemeMode } from "@/store/appStore";

function createWindowLike(options?: {
  storedTheme?: string | null;
  systemDark?: boolean;
}) {
  const store = new Map<string, string>();
  if (options?.storedTheme) {
    store.set("simple-api-pool.theme", options.storedTheme);
  }

  return {
    localStorage: {
      getItem(key: string) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key: string, value: string) {
        store.set(key, String(value));
      }
    },
    matchMedia() {
      return {
        matches: Boolean(options?.systemDark)
      };
    }
  } as unknown as Window;
}

describe("appStore helpers", function () {
  it("读取主题模式时优先使用已存储值", function () {
    const targetWindow = createWindowLike({ storedTheme: "dark", systemDark: false });
    expect(readStoredThemeMode(targetWindow)).toBe("dark");
  });

  it("未存储主题模式时默认回退到 system", function () {
    const targetWindow = createWindowLike({ systemDark: true });
    expect(readStoredThemeMode(targetWindow)).toBe("system");
  });

  it("持久化主题模式会写入本地存储", function () {
    const targetWindow = createWindowLike();
    persistThemeMode("light", targetWindow);
    expect(targetWindow.localStorage.getItem("simple-api-pool.theme")).toBe("light");
  });

  it("system 模式会根据系统深浅色偏好解析结果主题", function () {
    expect(resolveThemeMode("system", createWindowLike({ systemDark: true }))).toBe("dark");
    expect(resolveThemeMode("system", createWindowLike({ systemDark: false }))).toBe("light");
  });

  it("显式 light 和 dark 模式不会受系统偏好影响", function () {
    const darkWindow = createWindowLike({ systemDark: false });
    expect(resolveThemeMode("dark", darkWindow)).toBe("dark");
    expect(resolveThemeMode("light", darkWindow)).toBe("light");
  });
});
