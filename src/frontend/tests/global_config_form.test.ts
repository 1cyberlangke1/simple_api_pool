import { describe, expect, it } from "vitest";

import {
  buildAdminKeyPayload,
  buildGlobalSettingsPayload,
  createGlobalDraft
} from "@/forms/global_config_form.js";

describe("global config form helpers", function () {
  it("会从完整配置快照中保留客户端密钥列表", function () {
    const draft = createGlobalDraft({
      admin_key_configured: true,
      client_keys: ["client-a", "client-b"],
      token_estimation_enabled: true
    });

    expect(draft).toMatchObject({
      admin_key: "",
      admin_key_configured: true,
      client_keys: ["client-a", "client-b"],
      token_estimation_enabled: true
    });
  });

  it("会单独构造管理员密钥保存载荷并自动裁剪空白", function () {
    expect(buildAdminKeyPayload({
      admin_key: "  next-admin  "
    })).toEqual({
      admin_key: "next-admin"
    });
  });

  it("会构造客户端密钥与 token 估算的保存载荷，并允许清空旧 key", function () {
    expect(buildGlobalSettingsPayload({
      client_keys: [" alpha ", "", "beta", "alpha"],
      token_estimation_enabled: false
    })).toEqual({
      client_keys: ["alpha", "beta"],
      token_estimation_enabled: false
    });

    expect(buildGlobalSettingsPayload({
      client_keys: [],
      token_estimation_enabled: true
    })).toEqual({
      client_keys: [],
      token_estimation_enabled: true
    });
  });
});
