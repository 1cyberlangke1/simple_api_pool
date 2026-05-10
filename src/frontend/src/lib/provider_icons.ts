function normalizeProviderIconKey(rawValue: string) {
  return rawValue.trim().toLowerCase().replace(/[\s_/.-]+/g, "-");
}

export function resolveProviderIconName(inputValues: Array<string | null | undefined>) {
  const normalizedValues = inputValues
    .map(function toNormalizedValue(value) {
      return normalizeProviderIconKey(String(value || ""));
    })
    .filter(Boolean);

  for (let index = 0; index < normalizedValues.length; index += 1) {
    const value = normalizedValues[index];
    if (value.includes("openai") || value.includes("gpt") || value.includes("responses")) {
      return "openai";
    }
    if (value.includes("anthropic") || value.includes("claude")) {
      return "anthropic";
    }
    if (value.includes("gemini") || value.includes("google")) {
      return "google";
    }
    if (value.includes("deepseek")) {
      return "deepseek";
    }
  }

  return normalizedValues[0] || "";
}
