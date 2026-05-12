import { describe, expect, it } from "vitest";

import { buildProviderPayload, normalizeProviderSaveErrorMessage } from "@/forms/provider_form.js";

describe("provider form helpers", function () {
  it("编辑密钥时会把完整 keys 列表写入 provider 保存载荷", function () {
    expect(buildProviderPayload({
      base_url: "https://api.openai.com/v1",
      cache_enabled: true,
      cache_max_entries: 120,
      fail_threshold: 4,
      key_strategy: "round_robin",
      keys: ["sk-live-updated", "sk-live-backup"],
      max_disable_secs: 7200,
      min_disable_secs: 30,
      name: "openai-main",
      type: "openai_chat"
    })).toMatchObject({
      keys: ["sk-live-updated", "sk-live-backup"],
      name: "openai-main"
    });
  });

  it("会为本地上游地址自动补全 http 协议", function () {
    expect(buildProviderPayload({
      base_url: "127.0.0.1:6011",
      cache_enabled: false,
      cache_max_entries: 1000,
      fail_threshold: 3,
      key_strategy: "round_robin",
      max_disable_secs: 43200,
      min_disable_secs: 30,
      name: "local-openai",
      type: "openai_chat"
    }).base_url).toBe("http://127.0.0.1:6011");
  });

  it("会把本地上游被拒绝的配置错误翻译成明确引导", function () {
    const translate = function translate(key: string) {
      return key === "provider.privateUpstreamBlocked"
        ? "本地或私网提供商默认被拒绝；如果这是本机开发环境，请在服务端设置 ALLOW_PRIVATE_UPSTREAMS=true 后重试。"
        : key;
    };

    expect(normalizeProviderSaveErrorMessage(
      new Error("提供商配置无效"),
      "保存提供商失败",
      {
        base_url: "127.0.0.1:6011"
      },
      translate
    )).toBe("本地或私网提供商默认被拒绝；如果这是本机开发环境，请在服务端设置 ALLOW_PRIVATE_UPSTREAMS=true 后重试。");
  });
});
