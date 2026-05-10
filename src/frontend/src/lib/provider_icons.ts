import { ModelProvider } from "@lobehub/icons/es/features/providerEnum";

function normalizeProviderIconKey(rawValue: string) {
  return rawValue.trim().toLowerCase().replace(/[\s_/.-]+/g, "-");
}

function squashProviderIconKey(rawValue: string) {
  return normalizeProviderIconKey(rawValue).replace(/-/g, "");
}

function canonicalizeResolvedProviderKey(providerKey: string) {
  return protocolAliasIcons[providerKey] || providerKey;
}

const protocolAliasIcons: Record<string, string> = {
  "openai-chat": "openai",
  "openai-responses": "openai",
  responses: "openai",
  claude: "anthropic",
  gemini: "google"
};

const familyFuzzyIcons = [
  { icon: "anthropic", keywords: ["anthropic", "claude", "haiku", "opus", "sonnet"] },
  { icon: "google", keywords: ["google", "gemini", "gemma", "imagen", "veo", "vertex"] },
  { icon: "openai", keywords: ["openai", "chatgpt", "gpt", "responses", "dall-e", "whisper"] },
  { icon: "deepseek", keywords: ["deepseek", "deep-seek"] }
] as const;

const supportedProviderKeys = Object.values(ModelProvider).map(function toSupportedProviderKey(providerKey) {
  return normalizeProviderIconKey(String(providerKey || ""));
});

const supportedProviderKeySet = new Set(supportedProviderKeys);

function findExactSupportedProviderIcon(candidateValues: string[]) {
  for (let index = 0; index < candidateValues.length; index += 1) {
    const value = candidateValues[index];
    if (supportedProviderKeySet.has(value)) {
      return canonicalizeResolvedProviderKey(value);
    }
  }

  return "";
}

function findFuzzySupportedProviderIcon(candidateValues: string[]) {
  for (let valueIndex = 0; valueIndex < candidateValues.length; valueIndex += 1) {
    const value = candidateValues[valueIndex];
    const squashedValue = squashProviderIconKey(value);

    for (let providerIndex = 0; providerIndex < supportedProviderKeys.length; providerIndex += 1) {
      const providerKey = supportedProviderKeys[providerIndex];
      const squashedProviderKey = squashProviderIconKey(providerKey);

      if (
        value.includes(providerKey) ||
        providerKey.includes(value) ||
        squashedValue.includes(squashedProviderKey) ||
        squashedProviderKey.includes(squashedValue)
      ) {
        return canonicalizeResolvedProviderKey(providerKey);
      }
    }
  }

  return "";
}

function findFamilyFuzzyProviderIcon(candidateValues: string[]) {
  for (let valueIndex = 0; valueIndex < candidateValues.length; valueIndex += 1) {
    const value = candidateValues[valueIndex];

    for (let familyIndex = 0; familyIndex < familyFuzzyIcons.length; familyIndex += 1) {
      const family = familyFuzzyIcons[familyIndex];

      for (let keywordIndex = 0; keywordIndex < family.keywords.length; keywordIndex += 1) {
        if (value.includes(family.keywords[keywordIndex])) {
          return family.icon;
        }
      }
    }
  }

  return "";
}

export function resolveProviderIconName(inputValues: Array<string | null | undefined>) {
  const normalizedValues = inputValues
    .map(function toNormalizedValue(value) {
      return normalizeProviderIconKey(String(value || ""));
    })
    .filter(Boolean);

  const preferredCandidateValues = normalizedValues.filter(function excludeProtocolFallbackValue(value) {
    return !protocolAliasIcons[value];
  });

  const candidateValues = preferredCandidateValues.length > 0 ? preferredCandidateValues : normalizedValues;

  const exactSupportedIcon = findExactSupportedProviderIcon(candidateValues);
  if (exactSupportedIcon) {
    return exactSupportedIcon;
  }

  const fuzzySupportedIcon = findFuzzySupportedProviderIcon(candidateValues);
  if (fuzzySupportedIcon) {
    return fuzzySupportedIcon;
  }

  const familyFuzzyIcon = findFamilyFuzzyProviderIcon(candidateValues);
  if (familyFuzzyIcon) {
    return familyFuzzyIcon;
  }

  for (let index = 0; index < normalizedValues.length; index += 1) {
    const protocolFallbackIcon = protocolAliasIcons[normalizedValues[index]];
    if (protocolFallbackIcon) {
      return protocolFallbackIcon;
    }
  }

  return "";
}
