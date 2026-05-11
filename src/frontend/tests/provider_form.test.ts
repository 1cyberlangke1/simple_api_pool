import { describe, expect, it } from "vitest";

import { buildProviderPayload } from "@/forms/provider_form.js";

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
});
