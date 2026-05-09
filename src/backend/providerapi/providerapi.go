package providerapi

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/tidwall/gjson"

	"simple-api-pool/config"
)

func CacheField(providerType config.ProviderType) string {
	switch providerType {
	case config.OpenAIChat, config.Claude:
		return "messages"
	case config.OpenAIResponses:
		return "input"
	case config.Gemini:
		return "contents"
	default:
		return ""
	}
}

func SanitizeClientAuthQuery(values url.Values, providerType config.ProviderType) {
	switch providerType {
	case config.Gemini:
		values.Del("key")
	}
}

func ApplyUpstreamAuth(req *http.Request, providerType config.ProviderType, key string) {
	switch providerType {
	case config.OpenAIChat, config.OpenAIResponses:
		req.Header.Set("Authorization", "Bearer "+key)
	case config.Claude:
		req.Header.Set("x-api-key", key)
	case config.Gemini:
		req.Header.Set("x-goog-api-key", key)
	}
}

func ExtractRequestModel(providerType config.ProviderType, suffix string, body []byte) string {
	model := gjson.GetBytes(body, "model").String()
	if model != "" {
		return model
	}
	if providerType != config.Gemini {
		return ""
	}
	return ExtractGeminiModelFromSuffix(suffix)
}

func ExtractGeminiModelFromSuffix(suffix string) string {
	const marker = "/models/"

	index := strings.Index(suffix, marker)
	if index == -1 {
		return ""
	}

	modelPath := suffix[index+len(marker):]
	if modelPath == "" {
		return ""
	}
	if slashIndex := strings.Index(modelPath, "/"); slashIndex >= 0 {
		modelPath = modelPath[:slashIndex]
	}
	if colonIndex := strings.Index(modelPath, ":"); colonIndex >= 0 {
		modelPath = modelPath[:colonIndex]
	}
	return strings.TrimSpace(modelPath)
}

func IsModelDiscoveryRequest(method, suffix string) bool {
	if method != http.MethodGet {
		return false
	}
	switch strings.TrimSuffix(suffix, "/") {
	case "/v1/models", "/v1beta/models":
		return true
	default:
		return false
	}
}
