import { describe, expect, it } from "vitest";

import { normalizeErrorMessage, shouldIgnoreRuntimeFailure } from "@/api.js";
import { createMessage, resolveMessageText } from "@/hooks/useAdminOverview";
import {
  buildProviderModelDiscoveryPath,
  buildBulkDisableRequest,
  countAvailableProviderKeys,
  chooseSelectedProviderName,
  extractProviderModelNames,
  filterSelectedRefs,
  findNearestDisabledUntilMs,
  getDisableBounds,
  isPanelRequestLog,
  isKeyDisabledAt,
  normalizeBulkSeconds,
  replaceProviderKeysInOverview,
  syncProviderKeyAvailability
} from "@/lib/admin";
import { formatDisabledUntil } from "@/lib/format";
import { resolveProviderIconName } from "@/lib/provider_icons";
import {
  buildErrorTypeSummaries,
  buildErrorTypeSummaryClassName,
  buildProviderCards,
  buildStatusErrorCountClassName,
  collectStatusSummary,
  computeStatusRefreshCountdownSeconds,
  formatStatusRefreshCountdownLabel
} from "@/lib/status";

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
    expect(cards[1].snapshot.cache_enabled).toBeUndefined();
  });

  it("会优先按 @lobehub/icons 支持集匹配供应商 icon，再做模糊匹配与协议兜底", function () {
    expect(resolveProviderIconName(["openai_chat", "OpenAI GPT-4"])).toBe("openai");
    expect(resolveProviderIconName(["responses", "OpenAI Responses"])).toBe("openai");
    expect(resolveProviderIconName(["claude", "Anthropic Claude"])).toBe("anthropic");
    expect(resolveProviderIconName(["gemini", "Google Gemini"])).toBe("google");
    expect(resolveProviderIconName(["openai_chat", "longcat"])).toBe("longcat");
    expect(resolveProviderIconName(["openai_chat", "Long Cat Mirror"])).toBe("longcat");
    expect(resolveProviderIconName(["custom", "longcat"])).toBe("longcat");
    expect(resolveProviderIconName(["custom", "Long Cat Mirror"])).toBe("longcat");
    expect(resolveProviderIconName(["custom", "Claude Sonnet 4 Mirror"])).toBe("anthropic");
    expect(resolveProviderIconName(["openai_responses", "Acme Router"])).toBe("openai");
  });

  it("会把错误类型计数整理成状态页可直接展示的摘要", function () {
    expect(buildErrorTypeSummaries({
      error_types: {
        "500": 1,
        "429": 3,
        "404": 2
      }
    })).toEqual(["429 × 3", "404 × 2", "500 × 1"]);
  });

  it("会给错误类型计数提供更适合深色模式的高对比度样式", function () {
    const className = buildErrorTypeSummaryClassName();

    expect(className).toContain("text-destructive");
    expect(className).toContain("dark:text-red-200");
    expect(className).toContain("dark:bg-red-500/20");
  });

  it("会给状态页错误总数提供浅色模式也清晰的高对比度样式", function () {
    const className = buildStatusErrorCountClassName();

    expect(className).toContain("text-red-700");
    expect(className).toContain("bg-red-100");
    expect(className).toContain("dark:text-red-200");
  });

  it("会把下次更新时间换算成向上取整的秒级倒计时", function () {
    expect(computeStatusRefreshCountdownSeconds(15_000, 10_001)).toBe(5);
    expect(computeStatusRefreshCountdownSeconds(15_000, 15_000)).toBe(0);
    expect(computeStatusRefreshCountdownSeconds(15_000, 15_001)).toBe(0);
  });

  it("会把倒计时格式化成语言无关的 Xs 文案", function () {
    expect(formatStatusRefreshCountdownLabel(5)).toBe("5s");
    expect(formatStatusRefreshCountdownLabel(0)).toBe("0s");
    expect(formatStatusRefreshCountdownLabel(-3)).toBe("0s");
  });

  it("会按协议生成模型发现路径，并提取模型名列表", function () {
    expect(buildProviderModelDiscoveryPath("openai-router", "openai_chat")).toBe("/openai-router/v1/models");
    expect(buildProviderModelDiscoveryPath("gemini-router", "gemini")).toBe("/gemini-router/v1beta/models");

    expect(extractProviderModelNames("openai_chat", {
      data: [
        { id: "gpt-4.1" },
        { id: "gpt-4.1-mini" },
        { id: "gpt-4.1" }
      ]
    })).toEqual(["gpt-4.1", "gpt-4.1-mini"]);

    expect(extractProviderModelNames("gemini", {
      models: [
        { name: "models/gemini-2.5-flash" },
        { name: "models/gemini-2.5-pro" }
      ]
    })).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
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
  it("会优先用翻译 key 解析未登录提示，并保留普通错误原文", function () {
    const translate = function translate(key: string) {
      return key === "admin.unauthorized" ? "当前未登录，请先输入管理员密钥。" : key;
    };

    expect(resolveMessageText(createMessage("error", "", "admin.unauthorized"), translate)).toBe("当前未登录，请先输入管理员密钥。");
    expect(resolveMessageText(createMessage("error", "管理员登录失败"), translate)).toBe("管理员登录失败");
  });

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

  it("会把已过期的 disabled_until 当成未禁用", function () {
    const nowUnix = 1_746_892_800;
    const translate = function translate(key: string) {
      return key === "provider.notDisabled" ? "未禁用" : key;
    };

    expect(isKeyDisabledAt(nowUnix - 10, nowUnix)).toBe(false);
    expect(isKeyDisabledAt(nowUnix + 10, nowUnix)).toBe(true);
    expect(formatDisabledUntil(nowUnix - 10, "zh", translate, nowUnix * 1000)).toBe("未禁用");
  });

  it("会按当前时间统计可用 key，并忽略已过期禁用", function () {
    const nowUnix = 1_746_892_800;

    expect(countAvailableProviderKeys([
      { disabled_until: 0, ref: "k1", value: "sk-1" },
      { disabled_until: nowUnix - 5, ref: "k2", value: "sk-2" },
      { disabled_until: nowUnix + 30, ref: "k3", value: "sk-3" }
    ] as never, nowUnix)).toBe(2);
  });

  it("会找到最近一个未来禁用到期时间，并忽略永久禁用与已过期禁用", function () {
    const nowMs = new Date("2026-05-10T23:17:38+08:00").getTime();

    expect(findNearestDisabledUntilMs([
      {
        keys: [
          { disabled_until: Math.floor(nowMs / 1000) - 10, ref: "expired", value: "sk-expired" },
          { disabled_until: 32503680000, ref: "forever", value: "sk-forever" },
          { disabled_until: Math.floor(nowMs / 1000) + 60, ref: "later", value: "sk-later" }
        ],
        name: "alpha"
      },
      {
        keys: [
          { disabled_until: Math.floor(nowMs / 1000) + 15, ref: "soon", value: "sk-soon" }
        ],
        name: "beta"
      }
    ] as never, nowMs)).toBe((Math.floor(nowMs / 1000) + 15) * 1000);
  });

  it("会在本地替换 provider 的 key 列表时同步更新可用 key 统计", function () {
    const nowUnix = 1_746_892_800;
    const overview = replaceProviderKeysInOverview({
      global_config: {
        admin_key_configured: false,
        client_key_count: 0,
        client_keys: [],
        token_estimation_enabled: false
      },
      health: { status: "ok" },
      provider_stats: {
        alpha: {
          available_keys: 0,
          total_keys: 0
        }
      },
      providers: [{
        keys: [],
        name: "alpha",
        type: "openai_chat"
      }]
    } as never, "alpha", [
      { disabled_until: 0, ref: "k1", value: "sk-1" },
      { disabled_until: nowUnix + 30, ref: "k2", value: "sk-2" }
    ] as never, nowUnix);

    expect(overview.providers[0].keys).toHaveLength(2);
    expect(overview.provider_stats.alpha.available_keys).toBe(1);
    expect(overview.provider_stats.alpha.total_keys).toBe(2);
  });

  it("会在时间流逝后重算 provider 可用 key 统计", function () {
    const nowUnix = 1_746_892_800;
    const overview = syncProviderKeyAvailability({
      global_config: {
        admin_key_configured: false,
        client_key_count: 0,
        client_keys: [],
        token_estimation_enabled: false
      },
      health: { status: "ok" },
      provider_stats: {
        alpha: {
          available_keys: 0,
          total_keys: 99
        }
      },
      providers: [{
        keys: [
          { disabled_until: nowUnix - 1, ref: "expired", value: "sk-expired" },
          { disabled_until: nowUnix + 60, ref: "future", value: "sk-future" }
        ],
        name: "alpha",
        type: "openai_chat"
      }]
    } as never, nowUnix);

    expect(overview.provider_stats.alpha.available_keys).toBe(1);
    expect(overview.provider_stats.alpha.total_keys).toBe(2);
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
