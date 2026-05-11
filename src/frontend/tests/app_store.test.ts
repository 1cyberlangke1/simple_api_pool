import { describe, expect, it } from "vitest";

import { persistThemeMode, readStoredThemeMode, resolveAutomaticThemeForHour, resolveThemeMode } from "@/store/appStore";

function createWindowLike(options?: {
  storedTheme?: string | null;
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
    }
  } as unknown as Window;
}

describe("appStore helpers", function () {
  it("读取主题模式时优先使用已存储值", function () {
    const targetWindow = createWindowLike({ storedTheme: "dark" });
    expect(readStoredThemeMode(targetWindow)).toBe("dark");
  });

  it("未存储主题模式时默认回退到 auto", function () {
    const targetWindow = createWindowLike();
    expect(readStoredThemeMode(targetWindow)).toBe("auto");
  });

  it("会把旧的 system 存储值兼容映射到 auto", function () {
    const targetWindow = createWindowLike({ storedTheme: "system" });
    expect(readStoredThemeMode(targetWindow)).toBe("auto");
  });

  it("持久化主题模式会写入本地存储", function () {
    const targetWindow = createWindowLike();
    persistThemeMode("light", targetWindow);
    expect(targetWindow.localStorage.getItem("simple-api-pool.theme")).toBe("light");
  });

  it("auto 模式会根据本地小时切换浅色和深色", function () {
    expect(resolveAutomaticThemeForHour(6)).toBe("dark");
    expect(resolveAutomaticThemeForHour(7)).toBe("light");
    expect(resolveAutomaticThemeForHour(18)).toBe("light");
    expect(resolveAutomaticThemeForHour(19)).toBe("dark");
  });

  it("显式 light 和 dark 模式不会受自动模式影响", function () {
    const targetWindow = createWindowLike();
    expect(resolveThemeMode("dark", targetWindow)).toBe("dark");
    expect(resolveThemeMode("light", targetWindow)).toBe("light");
  });
});
