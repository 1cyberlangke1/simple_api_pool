function normalizeProviderIconKey(rawValue: string) {
  return rawValue.trim().toLowerCase().replace(/[\s_/.-]+/g, "-");
}

const protocolFallbackIcons: Record<string, string> = {
  anthropic: "anthropic",
  claude: "anthropic",
  deepseek: "deepseek",
  gemini: "google",
  google: "google",
  openai: "openai",
  "openai-chat": "openai",
  "openai-responses": "openai",
  responses: "openai"
};

const providerIconMatchers = [
  {
    icon: "openai",
    keywords: ["openai", "chatgpt", "dall-e", "gpt", "responses", "whisper"]
  },
  {
    icon: "anthropic",
    keywords: ["anthropic", "claude", "haiku", "opus", "sonnet"]
  },
  {
    icon: "google",
    keywords: ["gemini", "gemma", "google", "imagen", "veo", "vertex"]
  },
  {
    icon: "deepseek",
    keywords: ["deepseek", "deep-seek"]
  }
] as const;

export function resolveProviderIconName(inputValues: Array<string | null | undefined>) {
  const normalizedValues = inputValues
    .map(function toNormalizedValue(value) {
      return normalizeProviderIconKey(String(value || ""));
    })
    .filter(Boolean);

  let protocolFallbackIcon = "";
  const fuzzyCandidates: string[] = [];

  for (let index = 0; index < normalizedValues.length; index += 1) {
    const value = normalizedValues[index];
    const protocolIcon = protocolFallbackIcons[value];
    if (protocolIcon) {
      if (!protocolFallbackIcon) {
        protocolFallbackIcon = protocolIcon;
      }
      continue;
    }
    fuzzyCandidates.push(value);
  }

  for (let matcherIndex = 0; matcherIndex < providerIconMatchers.length; matcherIndex += 1) {
    const matcher = providerIconMatchers[matcherIndex];
    for (let valueIndex = 0; valueIndex < fuzzyCandidates.length; valueIndex += 1) {
      const value = fuzzyCandidates[valueIndex];
      for (let keywordIndex = 0; keywordIndex < matcher.keywords.length; keywordIndex += 1) {
        if (value.includes(matcher.keywords[keywordIndex])) {
          return matcher.icon;
        }
      }
    }
  }

  return protocolFallbackIcon;
}
