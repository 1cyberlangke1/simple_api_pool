package providerapi

import (
	"net/http"
	"strings"

	"github.com/tidwall/gjson"

	"simple-api-pool/config"
)

func newOpenAIChatCapability() Capability {
	return capability{
		providerType: config.OpenAIChat,
		cacheField:   "messages",
		authFunc: func(req *http.Request, key string) {
			req.Header.Set("Authorization", "Bearer "+key)
		},
		clientKeyFunc: extractAuthorizationCredential,
		modelFunc: func(_ string, body []byte) string {
			return gjson.GetBytes(body, "model").String()
		},
		discoveryFunc: func(method, suffix string) bool {
			return method == http.MethodGet && strings.TrimSuffix(suffix, "/") == "/v1/models"
		},
		responseUsageFunc:        extractOpenAIResponseUsage,
		streamUsageFunc:          extractOpenAIStreamUsage,
		decorateCachedResponse:   decorateOpenAICachedResponse,
		buildCachedStreamBody:    buildOpenAIChatCachedStream,
		decorateCachedStreamBody: decorateOpenAIChatCachedStreamUsage,
	}
}

func newOpenAIResponsesCapability() Capability {
	return capability{
		providerType: config.OpenAIResponses,
		cacheField:   "input",
		authFunc: func(req *http.Request, key string) {
			req.Header.Set("Authorization", "Bearer "+key)
		},
		clientKeyFunc: extractAuthorizationCredential,
		modelFunc: func(_ string, body []byte) string {
			return gjson.GetBytes(body, "model").String()
		},
		discoveryFunc: func(method, suffix string) bool {
			return method == http.MethodGet && strings.TrimSuffix(suffix, "/") == "/v1/models"
		},
		responseUsageFunc:        extractOpenAIResponseUsage,
		streamUsageFunc:          extractOpenAIStreamUsage,
		decorateCachedResponse:   decorateOpenAIResponsesCachedResponse,
		buildCachedStreamBody:    buildOpenAIResponsesCachedStream,
		decorateCachedStreamBody: decorateOpenAIResponsesCachedStreamUsage,
	}
}
