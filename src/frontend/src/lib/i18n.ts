import { enMessages } from "@/messages/en.js";
import { zhMessages } from "@/messages/zh.js";

export type Language = "en" | "zh";

const languageStorageKey = "simple-api-pool.lang";

const allMessages = {
  en: enMessages,
  zh: zhMessages
};

function replaceTokens(template: string, params?: Record<string, unknown>) {
  let output = String(template || "");
  const entries = Object.entries(params || {});
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    output = output.split("{" + entry[0] + "}").join(String(entry[1]));
  }
  return output;
}

export function detectInitialLanguage(targetWindow: Window = window): Language {
  const storedLanguage = targetWindow.localStorage.getItem(languageStorageKey);
  if (storedLanguage === "en" || storedLanguage === "zh") {
    return storedLanguage;
  }
  const browserLanguage = String(targetWindow.navigator.language || "").toLowerCase();
  if (browserLanguage.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

export function persistLanguage(language: Language, targetWindow: Window = window) {
  targetWindow.localStorage.setItem(languageStorageKey, language);
}

export function createTranslator(language: Language) {
  const nextLanguage = language === "en" ? "en" : "zh";
  const activeMessages = allMessages[nextLanguage];

  return function translate(key: string, params?: Record<string, unknown>) {
    const baseMessage = activeMessages[key] || zhMessages[key] || enMessages[key] || key;
    if (!params) {
      return baseMessage;
    }
    return replaceTokens(baseMessage, params);
  };
}
