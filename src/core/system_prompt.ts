import { Solar } from "lunar-typescript";
import type { PromptInjectConfig } from "./types.js";

/**
 * 生成系统提示词前缀
 * @param config 注入配置
 * @returns 前缀字符串
 */
export async function buildSystemPrefix(config: PromptInjectConfig): Promise<string> {
  const parts: string[] = [];

  if (config.enableTimestamp) {
    const now = new Date();
    parts.push(
      `system timestamp: ${now.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        weekday: "long",
      })}`
    );
  }

  if (config.enableLunar) {
    const solar = Solar.fromDate(new Date());
    const lunar = solar.getLunar();
    parts.push(`lunar date: ${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`);
  }

  if (config.enableWeather && config.weather?.provider === "open-meteo") {
    const { latitude, longitude } = config.weather;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = (await res.json()) as { current_weather?: { temperature: number; windspeed: number } };
      if (data.current_weather) {
        parts.push(
          `weather: temperature ${data.current_weather.temperature}°C, windspeed ${data.current_weather.windspeed} km/h`
        );
      }
    } catch {
      // 天气获取失败，忽略
    }
  }

  return parts.join("\n");
}

/**
 * 注入系统提示词
 * @param messages 原始消息数组
 * @param config 注入配置
 * @returns 更新后的消息数组
 */
export async function injectSystemPrompt(
  messages: Array<{ role: string; content: unknown }>,
  config: PromptInjectConfig
): Promise<Array<{ role: string; content: string }>> {
  if (!messages.length) return [];

  const prefix = await buildSystemPrefix(config);
  if (!prefix) {
    return messages.map((msg) => ({
      ...msg,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
    }));
  }

  const first = messages[0];
  const firstContent = typeof first.content === "string" ? first.content : JSON.stringify(first.content ?? "");

  // 如果第一条不是 system 消息，插入一条
  if (first.role !== "system") {
    return [
      { role: "system", content: prefix },
      ...messages.map((msg) => ({
        ...msg,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
      })),
    ];
  }

  // 否则追加到现有 system 消息
  const next = { ...first, content: `${prefix}\n${firstContent}` };
  const rest = messages.slice(1).map((msg) => ({
    ...msg,
    content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? ""),
  }));

  return [next, ...rest];
}