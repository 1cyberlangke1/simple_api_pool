import { describe, expect, it } from "vitest";

import { normalizeErrorMessage, shouldIgnoreRuntimeFailure } from "@/api.js";
import {
  buildBulkDisableRequest,
  chooseSelectedProviderName,
  collectProviderRecentErrors,
  filterSelectedRefs,
  getDisableBounds,
  isPanelRequestLog,
  normalizeBulkSeconds
} from "@/lib/admin";
import { resolveProviderIconName } from "@/lib/provider_icons";
import { buildProviderCards, collectStatusSummary } from "@/lib/status";

describe("status helpers", function () {
  it("会累计所有提供商的请求和 token 统计", function () {
    const summary = collectStatusSummary({
      health: { status: "ok" },
      provider_stats: {
        alpha: {
          cache_hits: 3,
          cache_tokens: 12,
          error_count: 2,
          input_tokens: 100,
          output_tokens: 50,
          success_count: 8
        },
        beta: {
          cache_hits: 5,
          cache_tokens: 20,
          error_count: 1,
          input_tokens: 30,
          output_tokens: 10,
          success_count: 9
        }
      }
    });

    expect(summary.providerCount).toBe(2);
    expect(summary.successCount).toBe(17);
    expect(summary.errorCount).toBe(3);
    expect(summary.inputTokens).toBe(130);
    expect(summary.outputTokens).toBe(60);
    expect(summary.cacheHits).toBe(8);
    expect(summary.cacheTokens).toBe(32);
  });

  it("会按名称排序生成提供商卡片", function () {
    const cards = buildProviderCards({
      health: { status: "warning" },
      provider_types: {
        alpha: "claude",
        middle: "gemini",
        zebra: "openai_chat"
      },
      provider_stats: {
        zebra: { success_count: 1 },
        alpha: { success_count: 2 },
        middle: { success_count: 3 }
      }
    });

    expect(cards.map(function mapCard(card) {
      return card.name;
    })).toEqual(["alpha", "middle", "zebra"]);
    expect(cards[0].status).toBe("warning");
    expect(cards[0].type).toBe("claude");
  });

  it("会优先按 @lobehub/icons 支持集匹配供应商 icon，再做模糊匹配与协议兜底", function () {
    expect(resolveProviderIconName(["openai_chat", "OpenAI GPT-4"])).toBe("openai");
    expect(resolveProviderIconName(["responses", "OpenAI Responses"])).toBe("openai");
    expect(resolveProviderIconName(["claude", "Anthropic Claude"])).toBe("anthropic");
    expect(resolveProviderIconName(["gemini", "Google Gemini"])).toBe("google");
    expect(resolveProviderIconName(["custom", "longcat"])).toBe("longcat");
    expect(resolveProviderIconName(["custom", "Long Cat Mirror"])).toBe("longcat");
    expect(resolveProviderIconName(["custom", "Claude Sonnet 4 Mirror"])).toBe("anthropic");
    expect(resolveProviderIconName(["openai_responses", "Acme Router"])).toBe("openai");
  });
});

describe("error helpers", function () {
  it("会把浏览器原始网络错误收敛为调用方提供的兜底文案", function () {
    expect(normalizeErrorMessage(new TypeError("Failed to fetch"), "读取状态总览失败")).toBe("读取状态总览失败");
    expect(
      normalizeErrorMessage(
        { message: "NetworkError when attempting to fetch resource." },
        "管理员登录失败"
      )
    ).toBe("管理员登录失败");
  });

  it("只忽略浏览器层的网络异常和中止异常，不吞掉真实运行时错误", function () {
    expect(shouldIgnoreRuntimeFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldIgnoreRuntimeFailure({ message: "Load failed" })).toBe(true);
    expect(shouldIgnoreRuntimeFailure({ message: "The user aborted a request.", name: "AbortError" })).toBe(true);
    expect(shouldIgnoreRuntimeFailure(new Error("boom"))).toBe(false);
  });
});

describe("admin helpers", function () {
  it("会优先保留仍然存在的选中 provider", function () {
    const providerName = chooseSelectedProviderName("beta", [
      { keys: [], name: "alpha" },
      { keys: [], name: "beta" }
    ] as never);
    expect(providerName).toBe("beta");
  });

  it("会过滤掉当前 provider 中已不存在的 key 选择", function () {
    const filtered = filterSelectedRefs(["k1", "k3"], {
      keys: [
        { ref: "k1", value: "sk-1" },
        { ref: "k2", value: "sk-2" }
      ]
    } as never);
    expect(filtered).toEqual(["k1"]);
  });

  it("会按 provider 配置限制批量禁用秒数", function () {
    const bounds = getDisableBounds({
      max_disable_secs: 120,
      min_disable_secs: 30
    } as never);
    expect(bounds).toEqual({ max: 120, min: 30 });
    expect(normalizeBulkSeconds(999, {
      max_disable_secs: 120,
      min_disable_secs: 30
    } as never)).toBe(120);
    expect(normalizeBulkSeconds(1, {
      max_disable_secs: 120,
      min_disable_secs: 30
    } as never)).toBe(30);
  });

  it("会为永久、时长和指定时间三种禁用方式构造请求载荷", function () {
    expect(buildBulkDisableRequest({
      mode: "forever"
    }, {
      max_disable_secs: 3600,
      min_disable_secs: 60
    } as never, Date.UTC(2026, 4, 10, 12, 0, 0))).toEqual({
      action: "disable_forever"
    });

    expect(buildBulkDisableRequest({
      mode: "duration",
      seconds: 99999
    }, {
      max_disable_secs: 3600,
      min_disable_secs: 60
    } as never, Date.UTC(2026, 4, 10, 12, 0, 0))).toEqual({
      action: "disable_until",
      disable_seconds: 3600
    });

    expect(buildBulkDisableRequest({
      mode: "until",
      until: "2026-05-10T12:45"
    }, {
      max_disable_secs: 7200,
      min_disable_secs: 60
    } as never, new Date("2026-05-10T12:00:00").getTime())).toEqual({
      action: "disable_until",
      disable_seconds: 2700
    });
  });

  it("会按提供商提取最近错误记录", function () {
    const errors = collectProviderRecentErrors([
      {
        attrs: {
          error: "quota exceeded",
          path: "/openai/v1/chat/completions",
          provider: "openai",
          upstream_status: 429
        },
        level: "ERROR",
        msg: "proxy_request",
        time: "2026-05-10T12:02:00Z"
      },
      {
        attrs: {
          provider: "gemini"
        },
        level: "INFO",
        msg: "proxy_request",
        time: "2026-05-10T12:01:00Z"
      },
      {
        attrs: {
          error: "upstream timeout",
          path: "/openai/v1/models",
          provider: "openai",
          status: 504
        },
        level: "ERROR",
        msg: "proxy_request",
        time: "2026-05-10T12:00:00Z"
      }
    ], "openai", 2);

    expect(errors).toEqual([
      {
        message: "quota exceeded",
        path: "/openai/v1/chat/completions",
        status: 429,
        time: "2026-05-10T12:02:00Z"
      },
      {
        message: "upstream timeout",
        path: "/openai/v1/models",
        status: 504,
        time: "2026-05-10T12:00:00Z"
      }
    ]);
  });

  it("会识别面板自身请求日志", function () {
    expect(isPanelRequestLog({
      attrs: { path: "/api/admin/overview" },
      msg: "http_request"
    })).toBe(true);
    expect(isPanelRequestLog({
      attrs: { path: "/v1/chat/completions" },
      msg: "http_request"
    })).toBe(false);
  });
});
