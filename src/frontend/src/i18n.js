import { enMessages } from "./messages/en.js";
import { zhMessages } from "./messages/zh.js";

const allMessages = {
  en: enMessages,
  zh: zhMessages
};

function replaceTokens(template, params) {
  let output = String(template);
  const entries = Object.entries(params || {});
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    output = output.split("{" + entry[0] + "}").join(String(entry[1]));
  }
  return output;
}

export function detectInitialLanguage() {
  const storedLanguage = window.localStorage.getItem("simple-api-pool.lang");
  if (storedLanguage === "en" || storedLanguage === "zh") {
    return storedLanguage;
  }
  const language = String(window.navigator.language || "").toLowerCase();
  if (language.indexOf("zh") === 0) {
    return "zh";
  }
  return "en";
}

export function persistLanguage(language) {
  window.localStorage.setItem("simple-api-pool.lang", language);
}

export function createTranslator(language) {
  const nextLanguage = language === "en" ? "en" : "zh";
  const activeMessages = allMessages[nextLanguage];
  return function translate(key, params) {
    const baseMessage = activeMessages[key] || zhMessages[key] || enMessages[key] || key;
    if (!params) {
      return baseMessage;
    }
    return replaceTokens(baseMessage, params);
  };
}
