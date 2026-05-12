import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { NotificationCenter } from "@/components/ui/notification-center";
import { useAppStore } from "@/store/appStore";

let testContainer: HTMLDivElement | null = null;
let testRoot: ReturnType<typeof createRoot> | null = null;

beforeAll(function enableReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(function disableReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

afterEach(function cleanupNotificationCenterRender() {
  vi.useRealTimers();
  act(function resetNotifications() {
    useAppStore.setState(function resetState(previousState) {
      return {
        ...previousState,
        notifications: [],
        runtimeError: ""
      };
    });
  });
  if (testRoot) {
    act(function unmountNotificationCenter() {
      testRoot?.unmount();
    });
    testRoot = null;
  }
  if (!testContainer) {
    return;
  }
  testContainer.remove();
  testContainer = null;
});

function renderNotificationCenter() {
  testContainer = document.createElement("div");
  document.body.appendChild(testContainer);
  testRoot = createRoot(testContainer);
  act(function mountNotificationCenter() {
    testRoot?.render(<NotificationCenter />);
  });
  return {
    viewport: testContainer.querySelector("[data-notification-viewport]"),
    queryMessage(message: string) {
      return testContainer?.textContent?.includes(message) || false;
    }
  };
}

describe("NotificationCenter", function () {
  it("会在右上角渲染通知，并在超时后自动移除", function () {
    vi.useFakeTimers();
    const view = renderNotificationCenter();

    act(function pushNotification() {
      useAppStore.getState().notify("error", "保存提供商失败", { durationMs: 2000 });
    });

    expect(view.viewport?.className).toContain("top-20");
    expect(view.viewport?.className).toContain("right-4");
    expect(view.queryMessage("保存提供商失败")).toBe(true);

    act(function elapseDismissTimer() {
      vi.advanceTimersByTime(2100);
    });

    expect(useAppStore.getState().notifications).toHaveLength(0);
  });
});
