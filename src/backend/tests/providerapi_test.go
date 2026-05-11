package tests

import (
	"net/http"
	"net/url"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/providerapi"
)

func TestProviderAPICacheFieldMatchesProviderType(t *testing.T) {
	testCases := []struct {
		name         string
		providerType config.ProviderType
		expected     string
	}{
		{name: "openai_chat", providerType: config.OpenAIChat, expected: "messages"},
		{name: "openai_responses", providerType: config.OpenAIResponses, expected: "input"},
		{name: "claude", providerType: config.Claude, expected: "messages"},
		{name: "gemini", providerType: config.Gemini, expected: "contents"},
		{name: "unknown", providerType: config.ProviderType("unknown"), expected: ""},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if actual := providerapi.CapabilityForType(tc.providerType).CacheField(); actual != tc.expected {
				t.Fatalf("期望缓存核心字段为 %q，实际是 %q", tc.expected, actual)
			}
		})
	}
}

func TestProviderAPISanitizeClientAuthQueryOnlyRemovesGeminiKey(t *testing.T) {
	geminiQuery := url.Values{
		"key": {"client-key"},
		"alt": {"sse"},
	}
	providerapi.CapabilityForType(config.Gemini).SanitizeClientAuthQuery(geminiQuery)
	if geminiQuery.Get("key") != "" {
		t.Fatal("期望 Gemini 请求清理客户端 query key")
	}
	if geminiQuery.Get("alt") != "sse" {
		t.Fatalf("期望保留 Gemini 其他查询参数，实际是 %q", geminiQuery.Encode())
	}

	openAIQuery := url.Values{
		"key": {"client-key"},
	}
	providerapi.CapabilityForType(config.OpenAIChat).SanitizeClientAuthQuery(openAIQuery)
	if openAIQuery.Get("key") != "client-key" {
		t.Fatal("期望非 Gemini 请求保留原始 query key")
	}
}

func TestProviderAPIApplyUpstreamAuthUsesProviderSpecificHeader(t *testing.T) {
	testCases := []struct {
		name         string
		providerType config.ProviderType
		expectedKey  string
		expectedVal  string
	}{
		{name: "openai_chat", providerType: config.OpenAIChat, expectedKey: "Authorization", expectedVal: "Bearer upstream-key"},
		{name: "openai_responses", providerType: config.OpenAIResponses, expectedKey: "Authorization", expectedVal: "Bearer upstream-key"},
		{name: "claude", providerType: config.Claude, expectedKey: "x-api-key", expectedVal: "upstream-key"},
		{name: "gemini", providerType: config.Gemini, expectedKey: "x-goog-api-key", expectedVal: "upstream-key"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptestNewRequest(t)
			providerapi.CapabilityForType(tc.providerType).ApplyUpstreamAuth(req, "upstream-key")
			if got := req.Header.Get(tc.expectedKey); got != tc.expectedVal {
				t.Fatalf("期望上游鉴权头 %s=%q，实际是 %q", tc.expectedKey, tc.expectedVal, got)
			}
		})
	}
}

func TestProviderAPIExtractRequestModelUsesBodyOrGeminiPath(t *testing.T) {
	openAIBody := []byte(`{"model":"gpt-4.1","messages":[{"role":"user","content":"hello"}]}`)
	if model := providerapi.CapabilityForType(config.OpenAIChat).ExtractRequestModel("/v1/chat/completions", openAIBody); model != "gpt-4.1" {
		t.Fatalf("期望从 OpenAI 请求体提取模型 gpt-4.1，实际是 %q", model)
	}

	geminiBodyWithoutModel := []byte(`{"contents":[{"role":"user","parts":[{"text":"hello"}]}]}`)
	if model := providerapi.CapabilityForType(config.Gemini).ExtractRequestModel("/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse", geminiBodyWithoutModel); model != "gemini-2.5-flash" {
		t.Fatalf("期望从 Gemini 路径提取模型 gemini-2.5-flash，实际是 %q", model)
	}
}

func TestProviderAPIExtractGeminiModelFromSuffix(t *testing.T) {
	testCases := []struct {
		name     string
		suffix   string
		expected string
	}{
		{name: "generate", suffix: "/v1beta/models/gemini-2.5-flash:generateContent", expected: "gemini-2.5-flash"},
		{name: "stream", suffix: "/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse", expected: "gemini-2.5-pro"},
		{name: "list_models", suffix: "/v1beta/models", expected: ""},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if model := providerapi.ExtractGeminiModelFromSuffix(tc.suffix); model != tc.expected {
				t.Fatalf("期望模型名为 %q，实际是 %q", tc.expected, model)
			}
		})
	}
}

func TestProviderAPIIsModelDiscoveryRequest(t *testing.T) {
	testCases := []struct {
		name     string
		method   string
		suffix   string
		expected bool
	}{
		{name: "openai_models", method: http.MethodGet, suffix: "/v1/models", expected: true},
		{name: "claude_models", method: http.MethodGet, suffix: "/v1/models/", expected: true},
		{name: "v1_models", method: http.MethodGet, suffix: "/v1/models", expected: true},
		{name: "v1beta_models_with_trailing_slash", method: http.MethodGet, suffix: "/v1beta/models/", expected: true},
		{name: "post_is_not_discovery", method: http.MethodPost, suffix: "/v1beta/models", expected: false},
		{name: "generate_is_not_discovery", method: http.MethodGet, suffix: "/v1beta/models/gemini-2.5-flash:generateContent", expected: false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			if actual := providerapi.IsModelDiscoveryRequest(tc.method, tc.suffix); actual != tc.expected {
				t.Fatalf("期望 discovery=%v，实际是 %v", tc.expected, actual)
			}
		})
	}
}

func TestProviderAPICapabilityRegistryReturnsDistinctCapabilities(t *testing.T) {
	testCases := []config.ProviderType{
		config.OpenAIChat,
		config.OpenAIResponses,
		config.Claude,
		config.Gemini,
	}

	for _, providerType := range testCases {
		capability := providerapi.CapabilityForType(providerType)
		if capability == nil {
			t.Fatalf("期望 provider %q 存在 capability 注册项", providerType)
		}
		if capability.ProviderType() != providerType {
			t.Fatalf("期望 capability 返回 providerType=%q，实际是 %q", providerType, capability.ProviderType())
		}
	}
}

func httptestNewRequest(t *testing.T) *http.Request {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, "https://example.com", nil)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	return req
}
