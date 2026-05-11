package providerapi

import (
	"net/http"
	"strings"

	"github.com/tidwall/gjson"

	"simple-api-pool/config"
)

func newClaudeCapability() Capability {
	return capability{
		providerType: config.Claude,
		cacheField:   "messages",
		authFunc: func(req *http.Request, key string) {
			req.Header.Set("x-api-key", key)
		},
		clientKeyFunc: func(req *http.Request) string {
			if req == nil {
				return ""
			}
			if key := strings.TrimSpace(req.Header.Get("x-api-key")); key != "" {
				return key
			}
			return extractAuthorizationCredential(req)
		},
		modelFunc: func(_ string, body []byte) string {
			return gjson.GetBytes(body, "model").String()
		},
		discoveryFunc: func(method, suffix string) bool {
			return method == http.MethodGet && strings.TrimSuffix(suffix, "/") == "/v1/models"
		},
		responseUsageFunc:        extractClaudeResponseUsage,
		streamUsageFunc:          extractClaudeStreamUsage,
		decorateCachedResponse:   decorateClaudeCachedResponse,
		buildCachedStreamBody:    buildClaudeCachedStream,
		decorateCachedStreamBody: decorateClaudeCachedStreamUsage,
	}
}
