package providerapi

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/tidwall/gjson"

	"simple-api-pool/config"
)

func newGeminiCapability() Capability {
	return capability{
		providerType: config.Gemini,
		cacheField:   "contents",
		sanitizeFunc: func(values url.Values) {
			values.Del("key")
		},
		clientKeyFunc: func(req *http.Request) string {
			if req == nil {
				return ""
			}
			if key := strings.TrimSpace(req.Header.Get("x-goog-api-key")); key != "" {
				return key
			}
			if key := strings.TrimSpace(req.URL.Query().Get("key")); key != "" {
				return key
			}
			return extractAuthorizationCredential(req)
		},
		authFunc: func(req *http.Request, key string) {
			req.Header.Set("x-goog-api-key", key)
		},
		modelFunc: func(suffix string, body []byte) string {
			model := gjson.GetBytes(body, "model").String()
			if model != "" {
				return model
			}
			return ExtractGeminiModelFromSuffix(suffix)
		},
		discoveryFunc: func(method, suffix string) bool {
			if method != http.MethodGet {
				return false
			}
			switch strings.TrimSuffix(suffix, "/") {
			case "/v1/models", "/v1beta/models":
				return true
			default:
				return false
			}
		},
		responseUsageFunc:        extractGeminiResponseUsage,
		streamUsageFunc:          extractGeminiStreamUsage,
		decorateCachedResponse:   decorateGeminiCachedResponse,
		buildCachedStreamBody:    buildGenericCachedStreamBody,
		decorateCachedStreamBody: decorateGeminiCachedStreamUsage,
	}
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
