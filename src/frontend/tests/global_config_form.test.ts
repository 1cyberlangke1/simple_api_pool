import { describe, expect, it } from "vitest";

import {
  buildAdminKeyPayload,
  buildClientKeysPayload,
  buildTokenEstimationPayload,
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

  it("会单独构造客户端密钥保存载荷，并允许清空旧 key", function () {
    expect(buildClientKeysPayload({
      client_keys: [" alpha ", "", "beta", "alpha"],
    })).toEqual({
      client_keys: ["alpha", "beta"]
    });

    expect(buildClientKeysPayload({
      client_keys: []
    })).toEqual({
      client_keys: []
    });
  });

  it("会单独构造 token 估算开关保存载荷", function () {
    expect(buildTokenEstimationPayload({
      token_estimation_enabled: true
    })).toEqual({
      token_estimation_enabled: true
    });
  });
});
