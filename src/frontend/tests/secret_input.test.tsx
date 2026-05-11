import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SecretInput } from "@/components/ui/secret-input";

let testContainer: HTMLDivElement | null = null;
let testRoot: ReturnType<typeof createRoot> | null = null;

beforeAll(function enableReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(function disableReactActEnvironment() {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

afterEach(function cleanupSecretInputRender() {
  if (testRoot) {
    act(function unmountSecretInput() {
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

function renderSecretInput() {
  testContainer = document.createElement("div");
  document.body.appendChild(testContainer);
  testRoot = createRoot(testContainer);
  act(function mountSecretInput() {
    testRoot?.render(
      <SecretInput
        aria-label="secret-input"
        onChange={function noop() {}}
        value="super-secret"
      />
    );
  });
  return {
    input: testContainer.querySelector("input"),
    toggleButton: testContainer.querySelector("button"),
  };
}

describe("SecretInput", function () {
  it("默认隐藏密钥，并允许点击切换显示", function () {
    const view = renderSecretInput();

    expect(view.input?.getAttribute("type")).toBe("password");

    act(function clickToReveal() {
      view.toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(view.input?.getAttribute("type")).toBe("text");

    act(function clickToHide() {
      view.toggleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(view.input?.getAttribute("type")).toBe("password");

  });
});
