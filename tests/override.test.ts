import { describe, expect, it } from "vitest";
import { applyOverrides } from "../src/core/openai_proxy";

/**
 * 覆写优先级测试
 * 输入: provider/model/request
 * 输出: 合并后的请求体
 * 行为: model 覆写优先于 provider
 */
describe("applyOverrides", () => {
  it("model overrides provider overrides", () => {
    const body = { temperature: 0.5 };
    const provider = { name: "p", baseUrl: "x", requestOverrides: { temperature: 0.7 } } as any;
    const model = { name: "m", provider: "p", model: "m", requestOverrides: { temperature: 0.2 } } as any;
    const result = applyOverrides(body, provider, model, {});
    expect(result.temperature).toBe(0.2);
  });
});
