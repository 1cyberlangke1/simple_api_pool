package tests

import (
	"strings"
	"testing"

	"simple-api-pool/config"
	"simple-api-pool/providerapi"
)

func TestProviderAPIExtractResponseUsageCoversAllProviders(t *testing.T) {
	testCases := []struct {
		name         string
		providerType config.ProviderType
		body         string
		expected     providerapi.Usage
	}{
		{
			name:         "openai_chat",
			providerType: config.OpenAIChat,
			body:         `{"usage":{"prompt_tokens":12,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":5}}}`,
			expected:     providerapi.Usage{InputTokens: 12, OutputTokens: 7, CacheTokens: 5},
		},
		{
			name:         "openai_responses",
			providerType: config.OpenAIResponses,
			body:         `{"usage":{"input_tokens":18,"output_tokens":9,"input_tokens_details":{"cached_tokens":8}}}`,
			expected:     providerapi.Usage{InputTokens: 18, OutputTokens: 9, CacheTokens: 8},
		},
		{
			name:         "claude",
			providerType: config.Claude,
			body:         `{"usage":{"input_tokens":20,"output_tokens":6,"cache_creation_input_tokens":4,"cache_read_input_tokens":9}}`,
			expected:     providerapi.Usage{InputTokens: 20, OutputTokens: 6, CacheTokens: 13},
		},
		{
			name:         "gemini",
			providerType: config.Gemini,
			body:         `{"usageMetadata":{"promptTokenCount":14,"candidatesTokenCount":5,"totalTokenCount":19,"cachedContentTokenCount":7}}`,
			expected:     providerapi.Usage{InputTokens: 14, OutputTokens: 5, CacheTokens: 19},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			actual := providerapi.ExtractResponseUsage(tc.providerType, []byte(tc.body))
			if actual != tc.expected {
				t.Fatalf("期望 usage=%+v，实际是 %+v", tc.expected, actual)
			}
		})
	}
}

func TestProviderAPIDecorateCachedResponseUsesOfficialFields(t *testing.T) {
	testCases := []struct {
		name         string
		providerType config.ProviderType
		body         string
		fragments    []string
	}{
		{
			name:         "openai_chat",
			providerType: config.OpenAIChat,
			body:         `{"usage":{"prompt_tokens":4,"completion_tokens":6,"total_tokens":10}}`,
			fragments:    []string{`"total_tokens":10`, `"prompt_tokens_details":{"cached_tokens":10}`},
		},
		{
			name:         "openai_responses",
			providerType: config.OpenAIResponses,
			body:         `{"usage":{"input_tokens":4,"output_tokens":6,"total_tokens":10}}`,
			fragments:    []string{`"total_tokens":10`, `"input_tokens_details":{"cached_tokens":10}`},
		},
		{
			name:         "claude",
			providerType: config.Claude,
			body:         `{"usage":{"input_tokens":4,"output_tokens":6}}`,
			fragments:    []string{`"cache_read_input_tokens":10`},
		},
		{
			name:         "gemini",
			providerType: config.Gemini,
			body:         `{"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":6}}`,
			fragments:    []string{`"totalTokenCount":10`, `"cachedContentTokenCount":10`},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			decorated := string(providerapi.DecorateCachedResponse(tc.providerType, []byte(tc.body), 4, 6))
			for _, fragment := range tc.fragments {
				if !strings.Contains(decorated, fragment) {
					t.Fatalf("期望缓存响应包含 %q，实际是 %s", fragment, decorated)
				}
			}
		})
	}
}
