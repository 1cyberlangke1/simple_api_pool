import { describe, expect, it } from "vitest";

import { normalizeErrorMessage, shouldIgnoreRuntimeFailure } from "@/api.js";
import {
  chooseSelectedProviderName,
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

  it("会把常见供应商标识映射到 tmp/zip 同款 icon key，并支持模糊匹配与协议兜底", function () {
    expect(resolveProviderIconName(["openai_chat", "OpenAI GPT-4"])).toBe("openai");
    expect(resolveProviderIconName(["responses", "OpenAI Responses"])).toBe("openai");
    expect(resolveProviderIconName(["claude", "Anthropic Claude"])).toBe("anthropic");
    expect(resolveProviderIconName(["gemini", "Google Gemini"])).toBe("google");
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
